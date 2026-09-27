import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { store } from '../../store';
import { ARCHETYPES, type BodyStyle } from './archetypes';
import { Body, Exhaust, Wheel, layoutOf, type BodyLayout } from './CarBody';

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

const RIDE = 0.12;

function CarRig({ L, paint, xray, exaggerate, motion }: { L: BodyLayout; paint: string; xray: boolean; exaggerate: number; motion: React.MutableRefObject<Motion> }) {
  const yawG = useRef<THREE.Group>(null);
  const bodyG = useRef<THREE.Group>(null);
  const a = L.a;

  useFrame((_, dt) => {
    const f = store.frame;
    if (!f) return;
    const m = motion.current;
    const d = Math.min(dt, 0.05);
    const sp = Math.hypot(f.velocityX, f.velocityZ);
    // slip angle, only meaningful when actually moving; clamp spins
    const target = sp > 2.5 ? Math.max(-1.3, Math.min(1.3, Math.atan2(f.velocityX, Math.max(0.5, f.velocityZ)))) : 0;
    m.beta += (target - m.beta) * Math.min(1, d * 10);
    m.speed = f.velocityZ < -0.5 ? -sp : sp;
    m.gLat += (f.accelerationX / 9.81 - m.gLat) * Math.min(1, d * 6);
    if (yawG.current) yawG.current.rotation.y = m.beta;

    const [fl, fr, rl, rr] = f.normalizedSuspensionTravel;
    const k = Math.min(exaggerate, 6);
    if (bodyG.current) {
      bodyG.current.rotation.z = -Math.atan2(((fl + rl - fr - rr) / 2) * RIDE, a.track) * k;
      bodyG.current.rotation.x = Math.atan2(((fl + fr - rl - rr) / 2) * RIDE, a.wheelbase) * k;
      bodyG.current.position.y = -((fl + fr + rl + rr) / 4 - 0.5) * RIDE * 0.6;
    }
  });

  return (
    <group ref={yawG}>
      <group ref={bodyG}>
        <Body L={L} paint={paint} xray={xray} />
        <Exhaust L={L} />
      </group>
      {[0, 1, 2, 3].map((i) => (
        <Wheel key={i} L={L} index={i} xray={xray} exaggerate={exaggerate} />
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
  // asphalt grain
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

function Smoke({ L, motion }: { L: BodyLayout; motion: React.MutableRefObject<Motion> }) {
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
          const lx = L.wheelX[w];
          const lz = L.wheelZ[w];
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

function SkidMarks({ L, motion }: { L: BodyLayout; motion: React.MutableRefObject<Motion> }) {
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
      const lx = L.wheelX[w];
      const lz = L.wheelZ[w];
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
      dummy.scale.set(visible ? L.a.wheelW * 0.8 : 0, 1, visible ? s.len : 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, MARKS]} frustumCulled={false} />;
}

// ---------- camera ----------

function CameraRig({ mode, motion }: { mode: CameraMode; motion: React.MutableRefObject<Motion> }) {
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  useEffect(() => {
    if (mode === 'orbit') {
      cam.position.set(4.6, 2.3, -5.4);
      cam.fov = 36;
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
      target.set(-m.gLat * 0.5, 2.5, -6.6);
      fov = Math.min(64, 42 + Math.abs(m.speed) * 0.16);
    } else {
      target.set(0, 13, -0.01);
    }
    cam.position.lerp(target, k);
    cam.fov += (fov - cam.fov) * k;
    cam.updateProjectionMatrix();
    cam.lookAt(0, mode === 'top' ? 0 : 0.55, mode === 'top' ? 0 : 1.6);
  });
  return mode === 'orbit' ? <OrbitControls makeDefault target={[0, 0.6, 0]} enablePan={false} minDistance={4} maxDistance={16} maxPolarAngle={Math.PI / 2.05} /> : null;
}

export function CarScene({ style, paint, xray, exaggerate, camera }: { style: BodyStyle; paint: string; xray: boolean; exaggerate: number; camera: CameraMode }) {
  const L = useMemo(() => layoutOf(ARCHETYPES[style]), [style]);
  const motion = useRef<Motion>({ beta: 0, speed: 0, gLat: 0 });
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2.1, -6.6], fov: 42 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
      <color attach="background" args={['#0a0c11']} />
      <fog attach="fog" args={['#0a0c11', 10, 34]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 9, 4]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <CarRig L={L} paint={paint} xray={xray} exaggerate={exaggerate} motion={motion} />
      <Road motion={motion} />
      <SkidMarks L={L} motion={motion} />
      <Smoke L={L} motion={motion} />
      <ContactShadows position={[0, 0.003, 0]} opacity={0.75} scale={12} blur={2.2} far={2.2} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ff2e88" position={[-7, 1.5, 0]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#2de2e6" position={[7, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="ring" intensity={2} position={[0, 2, -9]} scale={3} />
      </Environment>
      <CameraRig mode={camera} motion={motion} />
    </Canvas>
  );
}
