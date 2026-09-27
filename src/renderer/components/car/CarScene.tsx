import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { store } from '../../store';
import { fToC } from '../../../shared/units';
import { tireTempColor } from '../colors';
import { loadModel, prepareRig, type CarRig } from './rig';
import type { ModelDef } from './models';

export type CameraMode = 'chase' | 'orbit' | 'top';

/**
 * Shared per-frame motion state. The scene lives in the "travel frame": the
 * road scrolls along -z at the car's speed and the car itself is yawed by its
 * slip (drift) angle, so slides read instantly.
 */
interface Motion {
  beta: number;
  speed: number;
  gLat: number;
}

const RIDE = 0.1;

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
  }, [model.id, model.url, flip]);
  useEffect(() => {
    rig?.paintMaterials.forEach((m) => m.color.set(paint));
  }, [rig, paint]);
  return { rig, error };
}

// ---------- the car ----------

function Car({ rig, xray, exaggerate, motion }: { rig: CarRig; xray: boolean; exaggerate: number; motion: React.MutableRefObject<Motion> }) {
  const yawG = useRef<THREE.Group>(null);
  const angles = useRef([0, 0, 0, 0]);
  const heat = useRef([0, 0, 0, 0]);
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
    const m = motion.current;
    const d = Math.min(dt, 0.05);
    const sp = Math.hypot(f.velocityX, f.velocityZ);
    const target = sp > 2.5 ? Math.max(-1.3, Math.min(1.3, Math.atan2(f.velocityX, Math.max(0.5, f.velocityZ)))) : 0;
    m.beta += (target - m.beta) * Math.min(1, d * 10);
    m.speed = f.velocityZ < -0.5 ? -sp : sp;
    m.gLat += (f.accelerationX / 9.81 - m.gLat) * Math.min(1, d * 6);
    if (yawG.current) yawG.current.rotation.y = m.beta;

    const k = Math.min(exaggerate, 6);
    const [fl, fr, rl, rr] = f.normalizedSuspensionTravel;
    rig.body.rotation.z = -Math.atan2(((fl + rl - fr - rr) / 2) * RIDE, rig.track) * k;
    rig.body.rotation.x = Math.atan2(((fl + fr - rl - rr) / 2) * RIDE, rig.wheelbase) * k;
    rig.body.position.y = -((fl + fr + rl + rr) / 4 - 0.5) * RIDE * 0.6;

    for (let i = 0; i < 4; i++) {
      const w = rig.wheels[i];
      angles.current[i] += f.wheelRotationSpeed[i] * d;
      w.spin.rotation.x = angles.current[i];
      if (i < 2) w.steer.rotation.y = (-f.steer / 127) * 0.5;
      const travel = (f.normalizedSuspensionTravel[i] - 0.5) * RIDE * Math.min(k, 3) * 0.5;
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
    <group ref={yawG}>
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

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d0f14';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 14 + Math.random() * 16;
    g.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,46,136,0.10)';
  g.beginPath();
  g.moveTo(256, 0);
  g.lineTo(256, 512);
  g.moveTo(0, 256);
  g.lineTo(512, 256);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(28, 28);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Road({ motion }: { motion: React.MutableRefObject<Motion> }) {
  const tex = useMemo(roadTexture, []);
  const SIZE = 160;
  useFrame((_, dt) => {
    // plane local +v points to world -z; lowering offset.y moves the pattern towards -z (backwards)
    tex.offset.y -= (motion.current.speed * Math.min(dt, 0.05)) / (SIZE / tex.repeat.y);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[SIZE, SIZE]} />
      <meshStandardMaterial map={tex} color="#3c404b" roughness={1} metalness={0} envMapIntensity={0.15} />
    </mesh>
  );
}

// ---------- tire smoke ----------

const SMOKE = 260;

function Smoke({ rig, motion }: { rig: CarRig; motion: React.MutableRefObject<Motion> }) {
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
        uniforms: { scale: { value: 420 } },
        vertexShader: `attribute float alpha; attribute float size; varying float vA; uniform float scale;
          void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float s = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(0.78,0.8,0.85), vA * s * 0.55); }`,
      }),
    [],
  );
  const parts = useRef(Array.from({ length: SMOKE }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0 })));
  const next = useRef(0);
  const acc = useRef(0);

  useFrame((_, dt) => {
    const f = store.frame;
    const d = Math.min(dt, 0.05);
    const m = motion.current;
    const P = parts.current;
    if (f && f.isRaceOn) {
      const cb = Math.cos(m.beta);
      const sb = Math.sin(m.beta);
      for (let w = 0; w < 4; w++) {
        const slip = Math.abs(f.tireCombinedSlip[w]);
        if (slip < 1.1 || f.speed < 3) continue;
        acc.current += d * Math.min(60, (slip - 1) * 45);
        while (acc.current > 1) {
          acc.current -= 1;
          const p = P[next.current];
          next.current = (next.current + 1) % SMOKE;
          const { x: lx, z: lz } = rig.wheelPos[w];
          p.x = lx * cb + lz * sb + (Math.random() - 0.5) * 0.3;
          p.z = -lx * sb + lz * cb + (Math.random() - 0.5) * 0.3;
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
      p.z -= m.speed * 0.8 * d; // smoke hangs in the air while the car moves on
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

function SkidMarks({ rig, motion }: { rig: CarRig; motion: React.MutableRefObject<Motion> }) {
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
  const markW = Math.min(0.3, rig.wheels[0].width || 0.25) * 0.8;

  useFrame((_, dt) => {
    const f = store.frame;
    const d = Math.min(dt, 0.05);
    const m = motion.current;
    const D = data.current;
    const shift = m.speed * d;
    for (const s of D) s.z -= shift;
    for (const p of prev.current) if (p) p.z -= shift;
    const cb = Math.cos(m.beta);
    const sb = Math.sin(m.beta);
    for (let w = 0; w < 4; w++) {
      const sliding = !!f && f.isRaceOn && f.speed > 2 && Math.abs(f.tireCombinedSlip[w]) >= 1.2;
      if (!sliding) {
        prev.current[w] = null;
        continue;
      }
      const { x: lx, z: lz } = rig.wheelPos[w];
      const cur = { x: lx * cb + lz * sb, z: -lx * sb + lz * cb };
      const p = prev.current[w];
      if (p) {
        const dx = cur.x - p.x;
        const dz = cur.z - p.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.15) continue;
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
      const visible = s.z > -45 && s.z < 45;
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
  useFrame((_, dt) => {
    if (mode === 'orbit') return;
    const m = motion.current;
    const k = Math.min(1, Math.min(dt, 0.05) * 4);
    const target = new THREE.Vector3();
    let fov = 40;
    if (mode === 'chase') {
      // slightly off-centre so the car reads in three quarters, swaying with lateral g
      target.set(-m.gLat * 0.5 + 1.1, 2.0, -length * 1.35);
      fov = Math.min(62, 38 + Math.abs(m.speed) * 0.15);
    } else {
      target.set(0, length * 2.6, -0.01);
    }
    cam.position.lerp(target, k);
    cam.fov += (fov - cam.fov) * k;
    cam.updateProjectionMatrix();
    cam.lookAt(0, mode === 'top' ? 0 : 0.6, mode === 'top' ? 0 : length * 0.25);
  });
  return mode === 'orbit' ? <OrbitControls makeDefault target={[0, 0.55, 0]} enablePan={false} minDistance={3.5} maxDistance={16} maxPolarAngle={Math.PI / 2.05} /> : null;
}

export function CarScene({ model, paint, flip, xray, exaggerate, camera }: { model: ModelDef; paint: string; flip: boolean; xray: boolean; exaggerate: number; camera: CameraMode }) {
  const { rig, error } = useRig(model, paint, flip);
  const motion = useRef<Motion>({ beta: 0, speed: 0, gLat: 0 });
  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [1.1, 2.0, -6.1], fov: 40 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <color attach="background" args={['#0a0c11']} />
        <fog attach="fog" args={['#0a0c11', 10, 34]} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 9, 4]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
        {rig && (
          <>
            <Car rig={rig} xray={xray} exaggerate={exaggerate} motion={motion} />
            <SkidMarks rig={rig} motion={motion} />
            <Smoke rig={rig} motion={motion} />
          </>
        )}
        <Road motion={motion} />
        <ContactShadows position={[0, 0.003, 0]} opacity={0.85} scale={12} blur={2} far={2} />
        <Environment resolution={512}>
          <Lightformer form="rect" intensity={4} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 6, 1]} />
          <Lightformer form="rect" intensity={1.6} position={[0, 2, 9]} scale={[12, 3, 1]} />
          <Lightformer form="rect" intensity={2.4} color="#ff2e88" position={[-8, 1.5, 0]} rotation-y={Math.PI / 2} scale={[12, 2.5, 1]} />
          <Lightformer form="rect" intensity={2.4} color="#2de2e6" position={[8, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[12, 2.5, 1]} />
          <Lightformer form="ring" intensity={2} position={[0, 3, -9]} scale={4} />
        </Environment>
        <CameraRig mode={camera} motion={motion} length={rig?.length ?? 4.5} />
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
