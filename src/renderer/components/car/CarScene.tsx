import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, MeshReflectorMaterial, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { store } from '../../store';
import { fToC } from '../../../shared/units';
import { tireTempColor } from '../colors';
import { loadModel, prepareRig, type CarRig } from './rig';
import type { ModelDef } from './models';
import { GROUNDS, type GroundId } from './grounds';

export type CameraMode = 'chase' | 'orbit' | 'top';

/**
 * Shared per-frame motion state. The car stays at the origin facing +z; the
 * ground (road, skid marks, smoke) is placed in real world coordinates and
 * moved by the inverse of the car's pose, so turns and slides look exactly
 * like they happened in the game.
 *
 * World mapping: three.x = −ForzaX, three.z = ForzaZ (Forza is left-handed),
 * so the car's world rotation about y is −yaw.
 */
interface Motion {
  /** direction of travel in the car frame (0 = straight ahead, + = towards the car's left) */
  travel: number;
  speed: number;
  gLat: number;
  x: number;
  z: number;
  rot: number;
  /** bumps when the car jumped (rewind, fast travel, replay seek) */
  epoch: number;
}

const newMotion = (): Motion => ({ travel: 0, speed: 0, gLat: 0, x: 0, z: 0, rot: 0, epoch: 0 });

/** car-frame point → world (three) coordinates */
function toWorld(m: Motion, lx: number, lz: number): [number, number] {
  const c = Math.cos(m.rot);
  const s = Math.sin(m.rot);
  return [lx * c + lz * s + m.x, -lx * s + lz * c + m.z];
}

/** Extrapolates the pose between 60 Hz packets so the ground glides instead of stepping. */
function PoseTracker({ motion }: { motion: React.MutableRefObject<Motion> }) {
  useFrame((_, dt) => {
    const f = store.frame;
    if (!f) return;
    const m = motion.current;
    const d = Math.min(dt, 0.05);
    const age = f.isRaceOn ? Math.min(0.05, (performance.now() - store.lastIngestAt) / 1000) : 0;
    const yaw = f.yaw + f.angularVelocityY * age;
    // local → world velocity (Forza: forward = (sin yaw, cos yaw), right = (cos yaw, −sin yaw))
    const vX = f.velocityZ * Math.sin(f.yaw) + f.velocityX * Math.cos(f.yaw);
    const vZ = f.velocityZ * Math.cos(f.yaw) - f.velocityX * Math.sin(f.yaw);
    const x = -(f.positionX + vX * age);
    const z = f.positionZ + vZ * age;
    if (Math.hypot(x - m.x, z - m.z) > 40) m.epoch++;
    m.x = x;
    m.z = z;
    m.rot = -yaw;
    const sp = Math.hypot(f.velocityX, f.velocityZ);
    const travel = sp > 2.5 && f.velocityZ > -0.5 ? Math.max(-1.3, Math.min(1.3, Math.atan2(-f.velocityX, Math.max(0.5, f.velocityZ)))) : 0;
    m.travel += (travel - m.travel) * Math.min(1, d * 6);
    m.speed = f.velocityZ < -0.5 ? -sp : sp;
    m.gLat += (f.accelerationX / 9.81 - m.gLat) * Math.min(1, d * 6);
  }, -1);
  return null;
}

/** Holds world-space things; its transform is the inverse of the car pose. */
function Ground({ motion, children }: { motion: React.MutableRefObject<Motion>; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const pose = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const m = motion.current;
    q.setFromAxisAngle(axis, m.rot);
    p.set(m.x, 0, m.z);
    pose.compose(p, q, one).invert();
    g.matrix.copy(pose);
    g.matrixWorldNeedsUpdate = true;
  });
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

const RIDE = 0.1;

export type SceneId = 'day' | 'sunset' | 'night';

interface ScenePreset {
  hdr: string;
  sun: { position: [number, number, number]; color: string; intensity: number };
  fog: [string, number, number];
  env: number;
  background: number;
  road: string;
  /** how mirror-like the wet asphalt is */
  wet: number;
  bloom: number;
  exposure: number;
  lights: boolean;
  /** turns the sky so its sun sits where we want it */
  skyYaw: number;
}

const SCENES: Record<SceneId, ScenePreset> = {
  day: { hdr: './env/day.hdr', sun: { position: [-6, 12, 5], color: '#fff4e2', intensity: 2.6 }, fog: ['#b9c6d3', 40, 160], env: 1, background: 1, road: '#4a4c52', wet: 0.35, bloom: 0.25, exposure: 0.95, lights: false, skyYaw: 0 },
  sunset: { hdr: './env/sunset.hdr', sun: { position: [6, 4, 22], color: '#ffae6b', intensity: 2.2 }, fog: ['#d9a07c', 30, 140], env: 1.1, background: 1, road: '#3f3b3a', wet: 0.7, bloom: 0.55, exposure: 1.0, lights: true, skyYaw: Math.PI },
  night: { hdr: './env/night.hdr', sun: { position: [-4, 14, -6], color: '#a9bcff', intensity: 1.1 }, fog: ['#0a0d16', 30, 130], env: 0.55, background: 0.45, road: '#2a2d35', wet: 1, bloom: 0.8, exposure: 1.1, lights: true, skyYaw: 0 },
};

// ---------- model loading ----------

function useRig(model: ModelDef, paint: string, flip: boolean) {
  const [rig, setRig] = useState<CarRig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    const source: Promise<string | ArrayBuffer> = model.url
      ? Promise.resolve(model.url)
      : window.fh
        ? window.fh.readModel(model.id).then((b) => b.slice().buffer as ArrayBuffer)
        : Promise.reject(new Error('Özel modeller yalnızca masaüstü uygulamasında açılır'));
    source
      .then((src) => loadModel(model.id, src))
      .then((scene) => {
        if (alive) setRig(prepareRig(scene, paint, { flip }));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // paint is applied separately below so recolouring does not rebuild the rig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id, model.url, flip, paint === 'original']);
  useEffect(() => {
    if (paint !== 'original') rig?.paintMaterials.forEach((m) => m.color.set(paint));
  }, [rig, paint]);
  return { rig, error };
}

// ---------- the car ----------

function Car({ rig, xray, exaggerate }: { rig: CarRig; xray: boolean; exaggerate: number }) {
  const angles = useRef([0, 0, 0, 0]);
  const heat = useRef([0, 0, 0, 0]);
  // low-passed visual state: raw telemetry (keyboard steering, suspension noise) is too jumpy to show 1:1
  const smooth = useRef({ steer: 0, susp: [0.5, 0.5, 0.5, 0.5], roll: 0, pitch: 0, heave: 0 });
  const springGeo = useMemo(() => springGeometry(), []);
  const springs = useRef<(THREE.Mesh | null)[]>([]);

  // x-ray: see-through body, glowing tyres
  useEffect(() => {
    for (const m of rig.bodyMaterials) {
      const saved = (m.userData.orig ??= [m.transparent, m.opacity, m.depthWrite]) as [boolean, number, boolean];
      m.transparent = xray ? true : saved[0];
      m.opacity = xray ? 0.1 : saved[1];
      m.depthWrite = xray ? false : saved[2];
      m.needsUpdate = true;
    }
  }, [rig, xray]);

  useFrame((_, dt) => {
    const f = store.frame;
    if (!f) return;
    const d = Math.min(dt, 0.05);

    const sm = smooth.current;
    const ease = (rate: number) => 1 - Math.exp(-rate * d);
    for (let i = 0; i < 4; i++) sm.susp[i] += (f.normalizedSuspensionTravel[i] - sm.susp[i]) * ease(12);
    const [fl, fr, rl, rr] = sm.susp;
    // body motion is where the suspension shows; the multiplier only exaggerates it
    const k = Math.min(exaggerate, 6);
    sm.roll += (-Math.atan2(((fl + rl - fr - rr) / 2) * RIDE, rig.track) * k - sm.roll) * ease(10);
    sm.pitch += (Math.atan2(((fl + fr - rl - rr) / 2) * RIDE, rig.wheelbase) * k - sm.pitch) * ease(10);
    sm.heave += (-((fl + fr + rl + rr) / 4 - 0.5) * RIDE * 0.5 - sm.heave) * ease(10);
    rig.body.rotation.z = sm.roll;
    rig.body.rotation.x = sm.pitch;
    rig.body.position.y = sm.heave;
    // steering wheel input → road wheel angle, eased so keyboard taps don't snap the tyres
    sm.steer += ((-f.steer / 127) * 0.42 - sm.steer) * ease(9);

    for (let i = 0; i < 4; i++) {
      const w = rig.wheels[i];
      // cap the visual spin rate: past ~15 rad/s the rim strobes and seems to wobble or run backwards
      const rate = f.wheelRotationSpeed[i];
      angles.current[i] += Math.sign(rate) * Math.min(Math.abs(rate), 15) * d;
      w.spin.rotation.x = angles.current[i];
      if (i < 2) w.steer.rotation.y = sm.steer;
      // wheels follow real travel (no exaggeration) so they stay in their arches
      const travel = (sm.susp[i] - 0.5) * RIDE * 0.4;
      w.steer.position.y = w.baseY + travel;
      // brake discs heat up with brake × speed and cool down slowly
      heat.current[i] = Math.max(0, Math.min(1, heat.current[i] + (f.brake / 255) * Math.min(1, f.speed / 30) * d * 0.9 - d * 0.12));
      for (const bm of rig.brakeMaterials[i]) bm.emissiveIntensity = heat.current[i] ** 2 * 3;
      const tc = tireTempColor(fToC(f.tireTemp[i]));
      for (const tm of rig.tireMaterials[i]) {
        tm.emissive.set(tc);
        tm.emissiveIntensity = xray ? 0.6 : 0;
      }
      const sEl = springs.current[i];
      if (sEl) {
        const top = w.baseY + w.radius + 0.25;
        const bottom = w.baseY + travel;
        sEl.position.y = bottom;
        sEl.scale.y = Math.max(0.1, top - bottom);
      }
    }
    const braking = f.brake > 10;
    for (const t of rig.tailMaterials) t.emissiveIntensity = braking ? 6 : 0.8;
  });

  return (
    <group>
      <primitive object={rig.root} />
      <Exhaust rig={rig} />
      {xray &&
        rig.wheelPos.map((p, i) => (
          <mesh
            key={i}
            ref={(el) => {
              springs.current[i] = el;
            }}
            geometry={springGeo}
            position={[p.x * 0.72, 0, p.z]}
          >
            <meshStandardMaterial color="#ffc53d" emissive="#ffc53d" emissiveIntensity={0.7} metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
    </group>
  );
}

/** Coil spring along +y, height 1 (scale y to compress). */
function springGeometry(radius = 0.075, turns = 7, tube = 0.013): THREE.BufferGeometry {
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    getPoint(t: number, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2 * turns;
      return target.set(Math.cos(a) * radius, t, Math.sin(a) * radius);
    }
  }
  return new THREE.TubeGeometry(new Helix(), turns * 24, tube, 6, false);
}

function Exhaust({ rig }: { rig: CarRig }) {
  const flames = useRef<THREE.Group>(null);
  const st = useRef({ t: 0, prevAccel: 0, prevGear: 0 });
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const coreMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7fb4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  useFrame((_, dt) => {
    const f = store.frame;
    const s = st.current;
    if (!f || !flames.current) return;
    const high = f.currentEngineRpm > (f.engineMaxRpm || 8000) * 0.62;
    // lift-off at high rpm or an upshift under throttle → backfire
    if ((high && s.prevAccel > 180 && f.accel < 40) || (f.gear > s.prevGear && s.prevGear > 0 && f.accel > 150)) s.t = 0.16 + Math.random() * 0.12;
    s.prevAccel = f.accel;
    s.prevGear = f.gear;
    s.t = Math.max(0, s.t - dt);
    const k = Math.min(1, s.t / 0.12);
    flameMat.opacity = k * 0.9;
    coreMat.opacity = k * 0.8;
    flames.current.scale.set(1, 1, 0.5 + k * (0.8 + Math.random() * 0.6));
  });
  const xs = [rig.width * 0.18, -rig.width * 0.18];
  return (
    <group ref={flames} position={[0, 0.32, rig.rearZ + 0.08]}>
      {xs.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.2]} material={flameMat}>
            <coneGeometry args={[0.07, 0.4, 12, 1, true]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.12]} material={coreMat}>
            <coneGeometry args={[0.035, 0.22, 10, 1, true]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------- road ----------

const ROAD = 240;
/** the road mesh jumps in steps of this size, so every texture stays fixed to the world */
const SNAP = 60;

function Road({ motion, preset, ground }: { motion: React.MutableRefObject<Motion>; preset: ScenePreset; ground: GroundId }) {
  const look = GROUNDS[ground];
  const tex = useMemo(() => {
    const rep = (t: THREE.Texture, metres: number) => {
      t.repeat.set(ROAD / metres, ROAD / metres);
      return t;
    };
    return {
      map: rep(look.map(), look.tile),
      roughnessMap: look.roughnessMap ? rep(look.roughnessMap(), 30) : null,
      emissiveMap: look.emissiveMap ? rep(look.emissiveMap(), look.tile) : null,
    };
  }, [look]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = motion.current;
    ref.current?.position.set(Math.round(m.x / SNAP) * SNAP, 0, Math.round(m.z / SNAP) * SNAP);
  });
  // wet looks: darker in daylight, mirror-like at night
  const wet = look.reflect * (ground === 'wet' ? preset.wet : 1);
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[ROAD, ROAD]} />
      {wet > 0.05 ? (
        <MeshReflectorMaterial
          key={ground}
          map={tex.map}
          roughnessMap={tex.roughnessMap}
          emissiveMap={tex.emissiveMap}
          emissive={look.emissive ?? '#000'}
          emissiveIntensity={look.emissive ? 2.2 : 0}
          color={ground === 'wet' ? preset.road : look.color}
          roughness={look.roughness}
          metalness={look.metalness}
          blur={[500, 200]}
          resolution={1536}
          mixBlur={1}
          mixStrength={wet * 3}
          mixContrast={1}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          mirror={0}
        />
      ) : (
        <meshStandardMaterial key={ground} map={tex.map} roughnessMap={tex.roughnessMap} color={look.color} roughness={look.roughness} metalness={look.metalness} envMapIntensity={0.5} />
      )}
    </mesh>
  );
}

// ---------- night lighting ----------

/** Night needs light the camera can see: a street-lamp fill from behind and a neon underglow. */
function NightLights({ rig }: { rig: CarRig }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <group>
      <primitive object={target} position={[0, 0.5, 0]} />
      <spotLight position={[3, 9, -9]} target={target} angle={0.55} penumbra={0.8} intensity={140} distance={30} decay={1.6} color="#ffd9a8" />
      <pointLight position={[0, 0.18, 0]} intensity={14} distance={rig.length * 0.9} decay={1.5} color="#ff2e88" />
      <pointLight position={[0, 0.18, rig.length * 0.3]} intensity={8} distance={rig.length * 0.7} decay={1.5} color="#2de2e6" />
    </group>
  );
}

// ---------- headlights ----------

function Headlights({ rig, on }: { rig: CarRig; on: boolean }) {
  const targets = useMemo(() => [new THREE.Object3D(), new THREE.Object3D()], []);
  const xs = [rig.width * 0.32, -rig.width * 0.32];
  useFrame(() => {
    for (const h of rig.headMaterials) h.emissiveIntensity = on ? 1.6 : 0.1;
  });
  return (
    <group>
      {xs.map((x, i) => (
        <group key={x}>
          <primitive object={targets[i]} position={[x * 1.4, 0, rig.frontZ + 18]} />
          {on && (
            <spotLight
              position={[x, 0.65, rig.frontZ - 0.1]}
              target={targets[i]}
              angle={0.42}
              penumbra={0.6}
              intensity={28}
              distance={45}
              decay={1.4}
              color="#fff3df"
              castShadow={false}
            />
          )}
        </group>
      ))}
    </group>
  );
}

// ---------- tire smoke ----------

const SMOKE = 260;

function Smoke({ rig, motion, tint }: { rig: CarRig; motion: React.MutableRefObject<Motion>; tint: [number, number, number] }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE * 3), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(SMOKE), 1));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(SMOKE), 1));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { scale: { value: 420 }, tint: { value: new THREE.Vector3(0.78, 0.8, 0.85) } },
        vertexShader: `attribute float alpha; attribute float size; varying float vA; uniform float scale;
          void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; uniform vec3 tint; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float s = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(tint, vA * s * 0.55); }`,
      }),
    [],
  );
  useEffect(() => {
    mat.uniforms.tint.value.set(...tint);
  }, [mat, tint]);
  const parts = useRef(Array.from({ length: SMOKE }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0 })));
  const next = useRef(0);
  const acc = useRef(0);

  useFrame((_, dt) => {
    const f = store.frame;
    const d = Math.min(dt, 0.05);
    const m = motion.current;
    const P = parts.current;
    if (f && f.isRaceOn) {
      for (let w = 0; w < 4; w++) {
        const slip = Math.abs(f.tireCombinedSlip[w]);
        if (slip < 1.1 || f.speed < 3) continue;
        acc.current += d * Math.min(60, (slip - 1) * 45);
        while (acc.current > 1) {
          acc.current -= 1;
          const p = P[next.current];
          next.current = (next.current + 1) % SMOKE;
          const [wx, wz] = toWorld(m, rig.wheelPos[w].x, rig.wheelPos[w].z);
          p.x = wx + (Math.random() - 0.5) * 0.3;
          p.z = wz + (Math.random() - 0.5) * 0.3;
          p.y = 0.15;
          p.vx = (Math.random() - 0.5) * 1.2;
          p.vy = 0.4 + Math.random() * 0.6;
          p.max = 0.9 + Math.random() * 0.8;
          p.life = p.max;
        }
      }
    }
    const pos = geo.attributes.position.array as Float32Array;
    const al = geo.attributes.alpha.array as Float32Array;
    const sz = geo.attributes.size.array as Float32Array;
    for (let i = 0; i < SMOKE; i++) {
      const p = P[i];
      if (p.life <= 0) {
        al[i] = 0;
        continue;
      }
      p.life -= d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      const t = 1 - p.life / p.max;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      al[i] = Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) * (1 - t);
      sz[i] = 0.5 + t * 2.4;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

// ---------- skid marks ----------

const MARKS = 1400;

function SkidMarks({ rig, motion, color, opacity }: { rig: CarRig; motion: React.MutableRefObject<Motion>; color: string; opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // each mark is a segment joining two consecutive contact points of one wheel
  const data = useRef(Array.from({ length: MARKS }, () => ({ x: 0, z: -999, len: 0, rot: 0 })));
  const next = useRef(0);
  const prev = useRef<({ x: number; z: number } | null)[]>([null, null, null, null]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.5, depthWrite: false }), []);
  useEffect(() => {
    mat.color.set(color);
    mat.opacity = opacity;
  }, [mat, color, opacity]);
  const markW = Math.min(0.3, rig.wheels[0].width || 0.25) * 0.8;
  const epoch = useRef(0);

  useFrame(() => {
    const f = store.frame;
    const m = motion.current;
    const D = data.current;
    if (m.epoch !== epoch.current) {
      // the car teleported: old marks and open segments no longer connect
      epoch.current = m.epoch;
      for (const s of D) s.len = 0;
      prev.current = [null, null, null, null];
    }
    for (let w = 0; w < 4; w++) {
      const sliding = !!f && f.isRaceOn && f.speed > 2 && Math.abs(f.tireCombinedSlip[w]) >= 1.2;
      if (!sliding) {
        prev.current[w] = null;
        continue;
      }
      const [cx, cz] = toWorld(m, rig.wheelPos[w].x, rig.wheelPos[w].z);
      const cur = { x: cx, z: cz };
      const p = prev.current[w];
      if (p) {
        const dx = cur.x - p.x;
        const dz = cur.z - p.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.15) continue;
        if (len > 4) {
          prev.current[w] = cur;
          continue;
        }
        const s = D[next.current];
        next.current = (next.current + 1) % MARKS;
        s.x = (cur.x + p.x) / 2;
        s.z = (cur.z + p.z) / 2;
        s.len = len + 0.04;
        s.rot = Math.atan2(dx, dz);
      }
      prev.current[w] = cur;
    }
    const inst = ref.current;
    if (!inst) return;
    for (let i = 0; i < MARKS; i++) {
      const s = D[i];
      const visible = s.len > 0 && Math.abs(s.x - m.x) < 70 && Math.abs(s.z - m.z) < 70;
      dummy.position.set(s.x, 0.004, s.z);
      dummy.rotation.set(0, s.rot, 0);
      dummy.scale.set(visible ? markW : 0, 1, visible ? s.len : 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, MARKS]} frustumCulled={false} />;
}

// ---------- camera ----------

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function CameraRig({ mode, motion, length }: { mode: CameraMode; motion: React.MutableRefObject<Motion>; length: number }) {
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  useEffect(() => {
    if (mode === 'orbit') {
      cam.position.set(4.4, 1.9, 5.2);
      cam.fov = 34;
      cam.updateProjectionMatrix();
    }
  }, [mode, cam]);
  const off = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (mode === 'orbit') return;
    const m = motion.current;
    const k = Math.min(1, Math.min(dt, 0.05) * 4);
    let fov = 40;
    if (mode === 'chase') {
      // sit behind the direction of travel, so a drift shows the car sideways
      off.set(1.1 - m.gLat * 0.5, 2.0, -length * 1.35).applyAxisAngle(Y_AXIS, m.travel * 0.75);
      look.set(0, 0.6, length * 0.25).applyAxisAngle(Y_AXIS, m.travel * 0.75);
      fov = Math.min(62, 38 + Math.abs(m.speed) * 0.15);
    } else {
      // straight down, nose up: turns and slides read from the skid marks
      off.set(0, length * 2.6, -0.01);
      look.set(0, 0, 0);
    }
    cam.position.lerp(off, k);
    cam.fov += (fov - cam.fov) * k;
    cam.updateProjectionMatrix();
    cam.lookAt(look);
  });
  return mode === 'orbit' ? <OrbitControls makeDefault target={[0, 0.55, 0]} enablePan={false} minDistance={3.5} maxDistance={16} maxPolarAngle={Math.PI / 2.05} /> : null;
}

function PostFX({ preset }: { preset: ScenePreset }) {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.6} intensity={2.2} distanceFalloff={0.6} quality="medium" halfRes />
      <Bloom mipmapBlur intensity={preset.bloom} luminanceThreshold={0.92} luminanceSmoothing={0.15} />
      <Vignette offset={0.28} darkness={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

export function CarScene({
  model,
  paint,
  flip,
  xray,
  exaggerate,
  camera,
  scene = 'day',
  fx = true,
  ground = 'wet',
}: {
  model: ModelDef;
  paint: string;
  flip: boolean;
  xray: boolean;
  exaggerate: number;
  camera: CameraMode;
  scene?: SceneId;
  fx?: boolean;
  ground?: GroundId;
}) {
  const { rig, error } = useRig(model, paint, flip);
  const motion = useRef<Motion>(newMotion());
  const preset = SCENES[scene];
  return (
    <>
      <Canvas
        key={fx ? 'fx' : 'plain'}
        shadows="soft"
        dpr={[1, 2]}
        camera={{ position: [1.1, 2.0, -6.1], fov: 40, far: 2000 }}
        gl={{ antialias: !fx, toneMapping: fx ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping, toneMappingExposure: preset.exposure }}
      >
        <fog attach="fog" args={preset.fog} />
        <Suspense fallback={null}>
          <Environment
            key={scene}
            files={preset.hdr}
            background
            backgroundBlurriness={0.02}
            environmentIntensity={preset.env}
            backgroundIntensity={preset.background}
            environmentRotation={[0, preset.skyYaw, 0]}
            backgroundRotation={[0, preset.skyYaw, 0]}
          />
        </Suspense>
        <directionalLight
          position={preset.sun.position}
          intensity={preset.sun.intensity}
          color={preset.sun.color}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
        />
        <PoseTracker motion={motion} />
        {rig && (
          <>
            <Car rig={rig} xray={xray} exaggerate={exaggerate} />
            <Headlights rig={rig} on={preset.lights} />
            {scene === 'night' && <NightLights rig={rig} />}
          </>
        )}
        <Ground motion={motion}>
          <Road motion={motion} preset={preset} ground={ground} />
          {rig && (
            <>
              <SkidMarks rig={rig} motion={motion} color={GROUNDS[ground].mark.color} opacity={GROUNDS[ground].mark.opacity} />
              <Smoke rig={rig} motion={motion} tint={GROUNDS[ground].smoke} />
            </>
          )}
        </Ground>
        <ContactShadows position={[0, 0.004, 0]} opacity={0.8} scale={10} blur={2.4} far={1.6} color="#000" />
        <CameraRig mode={camera} motion={motion} length={rig?.length ?? 4.5} />
        {fx && <PostFX preset={preset} />}
      </Canvas>
      {!rig && !error && (
        <div className="empty" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          Model yükleniyor…
        </div>
      )}
      {error && (
        <div className="empty" style={{ position: 'absolute', inset: 0 }}>
          <div>
            <h3>Model açılamadı</h3>
            {error}
          </div>
        </div>
      )}
    </>
  );
}
