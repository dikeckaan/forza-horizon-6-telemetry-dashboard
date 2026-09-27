import { useMemo, useRef } from 'react';
import { Canvas, useFrame as useR3FFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { store } from '../store';
import { fToC } from '../../shared/units';
import { tireTempColor } from './colors';

const WHEELBASE = 2.7;
const TRACK = 1.62;
const WHEEL_R = 0.34;
const WHEEL_W = 0.27;
const RIDE = 0.12; // max visual suspension travel (m)

function bodyShape() {
  // side profile in (length, height), front of the car at +x
  const s = new THREE.Shape();
  s.moveTo(-2.25, 0.28);
  s.lineTo(-2.28, 0.62);
  s.quadraticCurveTo(-2.25, 0.8, -2.0, 0.84); // rear deck
  s.lineTo(-1.35, 0.9);
  s.quadraticCurveTo(-0.7, 1.32, -0.25, 1.33); // roof rear
  s.quadraticCurveTo(0.25, 1.32, 0.75, 0.96); // windshield
  s.lineTo(1.55, 0.8); // hood
  s.quadraticCurveTo(2.2, 0.74, 2.3, 0.55);
  s.lineTo(2.28, 0.3);
  s.quadraticCurveTo(2.2, 0.2, 1.9, 0.2);
  // front wheel arch
  s.lineTo(1.35 + WHEEL_R + 0.1, 0.2);
  s.absarc(1.35, 0.3, WHEEL_R + 0.1, 0, Math.PI, false);
  s.lineTo(-1.35 + WHEEL_R + 0.1, 0.2);
  s.absarc(-1.35, 0.3, WHEEL_R + 0.1, 0, Math.PI, false);
  s.lineTo(-2.0, 0.2);
  s.quadraticCurveTo(-2.22, 0.2, -2.25, 0.28);
  return s;
}

function glassShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.28, 0.92);
  s.quadraticCurveTo(-0.7, 1.28, -0.25, 1.29);
  s.quadraticCurveTo(0.22, 1.28, 0.68, 0.96);
  s.lineTo(-1.28, 0.92);
  return s;
}

function Wheel({ index, tireMat }: { index: number; tireMat: THREE.MeshStandardMaterial }) {
  const spin = useRef<THREE.Group>(null);
  const steerG = useRef<THREE.Group>(null);
  const hop = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const front = index < 2;
  const left = index % 2 === 0;
  // three.js camera-right is -x when facing +z, so the car's left side is +x
  const x = (left ? 1 : -1) * (TRACK / 2);
  const z = (front ? 1 : -1) * (WHEELBASE / 2);

  useR3FFrame((_, dt) => {
    const f = store.frame;
    if (!f) return;
    angle.current += f.wheelRotationSpeed[index] * Math.min(dt, 0.05);
    if (spin.current) spin.current.rotation.x = angle.current;
    if (steerG.current && front) steerG.current.rotation.y = (-f.steer / 127) * 0.55;
    if (hop.current) hop.current.position.y = (f.normalizedSuspensionTravel[index] - 0.5) * RIDE;
  });

  return (
    <group position={[x, WHEEL_R, z]}>
      <group ref={hop}>
        <group ref={steerG}>
          <group ref={spin}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={tireMat}>
              <cylinderGeometry args={[WHEEL_R, WHEEL_R, WHEEL_W, 40, 1]} />
            </mesh>
            {/* rim */}
            <mesh rotation={[0, 0, Math.PI / 2]} position={[left ? WHEEL_W / 2 + 0.001 : -WHEEL_W / 2 - 0.001, 0, 0]}>
              <cylinderGeometry args={[WHEEL_R * 0.68, WHEEL_R * 0.68, 0.02, 32]} />
              <meshStandardMaterial color="#9aa3b5" metalness={0.95} roughness={0.25} />
            </mesh>
            {Array.from({ length: 5 }, (_, i) => (
              <mesh key={i} position={[left ? WHEEL_W / 2 + 0.012 : -WHEEL_W / 2 - 0.012, 0, 0]} rotation={[(i / 5) * Math.PI * 2, 0, 0]}>
                <boxGeometry args={[0.02, WHEEL_R * 1.25, 0.05]} />
                <meshStandardMaterial color="#2a2f3d" metalness={0.8} roughness={0.35} />
              </mesh>
            ))}
            <mesh rotation={[0, 0, Math.PI / 2]} position={[left ? WHEEL_W / 2 + 0.02 : -WHEEL_W / 2 - 0.02, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
              <meshStandardMaterial color="#ff2e88" emissive="#ff2e88" emissiveIntensity={0.6} />
            </mesh>
          </group>
          {/* brake caliper (does not spin) */}
          <mesh position={[left ? WHEEL_W / 2 - 0.02 : -WHEEL_W / 2 + 0.02, 0.12, front ? -0.1 : 0.1]}>
            <boxGeometry args={[0.05, 0.12, 0.16]} />
            <meshStandardMaterial color="#ff2e88" roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function SlipRing({ index }: { index: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const front = index < 2;
  const left = index % 2 === 0;
  useR3FFrame(() => {
    const f = store.frame;
    if (!f || !mat.current || !ref.current) return;
    const s = Math.abs(f.tireCombinedSlip[index]);
    const k = Math.max(0, Math.min(1, (s - 0.4) / 1.2));
    mat.current.opacity = k * 0.85;
    ref.current.scale.setScalar(0.8 + k * 0.6);
  });
  return (
    <mesh ref={ref} position={[(left ? 1 : -1) * (TRACK / 2), 0.005, (front ? 1 : -1) * (WHEELBASE / 2)]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.35, 0.5, 40]} />
      <meshBasicMaterial ref={mat} color="#ff4d5e" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function VelocityArrow() {
  const g = useRef<THREE.Group>(null);
  const shaft = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  useR3FFrame(() => {
    const f = store.frame;
    if (!f || !g.current || !shaft.current || !head.current) return;
    const vx = f.velocityX;
    const vz = f.velocityZ;
    const len = Math.min(4, Math.hypot(vx, vz) / 12);
    g.current.visible = len > 0.15;
    // telemetry +X is the car's right, which is -x in model space
    g.current.rotation.y = Math.atan2(-vx, vz);
    shaft.current.scale.set(1, 1, len);
    shaft.current.position.z = len / 2;
    head.current.position.z = len + 0.12;
  });
  return (
    <group ref={g} position={[0, 0.02, 0]}>
      <mesh ref={shaft} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.07, 1]} />
        <meshBasicMaterial color="#2de2e6" transparent opacity={0.8} />
      </mesh>
      <mesh ref={head} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 3]} />
        <meshBasicMaterial color="#2de2e6" />
      </mesh>
    </group>
  );
}

function CarModel({ exaggerate }: { exaggerate: number }) {
  const body = useRef<THREE.Group>(null);
  const tireMats = useMemo(() => [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: '#16181f', roughness: 0.85, emissive: new THREE.Color('#000'), emissiveIntensity: 0.12 })), []);
  const bodyGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(bodyShape(), { depth: 1.8, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 5, curveSegments: 24 });
    g.translate(0, 0, -0.9);
    g.rotateY(-Math.PI / 2); // length along +z (front)
    return g;
  }, []);
  const glassGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(glassShape(), { depth: 1.98, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 20 });
    // slightly wider than the body so the side windows show through the paint
    g.translate(0, 0.02, -0.99);
    g.rotateY(-Math.PI / 2);
    return g;
  }, []);

  useR3FFrame(() => {
    const f = store.frame;
    if (!f) return;
    const avgSusp = f.normalizedSuspensionTravel.reduce((a, b) => a + b, 0) / 4;
    // Body pitch/roll relative to the wheels, derived from suspension compression
    const [fl, fr, rl, rr] = f.normalizedSuspensionTravel;
    const rollS = ((fl + rl - fr - rr) / 2) * RIDE;
    const pitchS = ((fl + fr - rl - rr) / 2) * RIDE;
    if (body.current) {
      // left side (+x) compressed → left side sinks
      body.current.rotation.z = -Math.atan2(rollS, TRACK) * exaggerate;
      body.current.rotation.x = Math.atan2(pitchS, WHEELBASE) * exaggerate;
      body.current.position.y = -(avgSusp - 0.5) * RIDE * 0.6;
    }
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Color(tireTempColor(fToC(f.tireTemp[i])));
      tireMats[i].emissive.copy(c);
    }
  });

  return (
    <group>
      <group ref={body}>
        <mesh geometry={bodyGeo} castShadow>
          <meshPhysicalMaterial color="#e0145f" metalness={0.6} roughness={0.28} clearcoat={1} clearcoatRoughness={0.08} />
        </mesh>
        <mesh geometry={glassGeo}>
          <meshPhysicalMaterial color="#0b0e16" metalness={0.2} roughness={0.05} clearcoat={1} />
        </mesh>
        {/* windshield & rear window (thin panels laid on the roof slopes) */}
        <mesh position={[0, 1.2, 0.45]} rotation={[0.56, 0, 0]}>
          <boxGeometry args={[1.5, 0.012, 0.56]} />
          <meshPhysicalMaterial color="#0b0e16" metalness={0.3} roughness={0.05} clearcoat={1} />
        </mesh>
        <mesh position={[0, 1.17, -1.0]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[1.4, 0.012, 0.55]} />
          <meshPhysicalMaterial color="#0b0e16" metalness={0.3} roughness={0.05} clearcoat={1} />
        </mesh>
        {/* lights */}
        <mesh position={[0.62, 0.66, 2.33]}>
          <boxGeometry args={[0.42, 0.06, 0.04]} />
          <meshStandardMaterial color="#fff" emissive="#dff6ff" emissiveIntensity={3} />
        </mesh>
        <mesh position={[-0.62, 0.66, 2.33]}>
          <boxGeometry args={[0.42, 0.06, 0.04]} />
          <meshStandardMaterial color="#fff" emissive="#dff6ff" emissiveIntensity={3} />
        </mesh>
        <BrakeLight />
        {/* rear wing */}
        <mesh position={[0, 1.02, -2.02]} castShadow>
          <boxGeometry args={[1.7, 0.03, 0.3]} />
          <meshStandardMaterial color="#111318" roughness={0.5} />
        </mesh>
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, 0.93, -2.0]}>
            <boxGeometry args={[0.03, 0.16, 0.12]} />
            <meshStandardMaterial color="#111318" />
          </mesh>
        ))}
      </group>
      {[0, 1, 2, 3].map((i) => (
        <Wheel key={i} index={i} tireMat={tireMats[i]} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <SlipRing key={i} index={i} />
      ))}
      <VelocityArrow />
    </group>
  );
}

function BrakeLight() {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useR3FFrame(() => {
    const f = store.frame;
    if (mat.current) mat.current.emissiveIntensity = f && f.brake > 10 ? 4 : 0.5;
  });
  return (
    <mesh position={[0, 0.72, -2.31]}>
      <boxGeometry args={[1.5, 0.05, 0.04]} />
      <meshStandardMaterial ref={mat} color="#ff1a3c" emissive="#ff1a3c" emissiveIntensity={0.5} />
    </mesh>
  );
}

export function Car3D({ exaggerate = 1 }: { exaggerate?: number }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [4.3, 2.5, -5.1], fov: 36 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
      <color attach="background" args={['#0a0c11']} />
      <fog attach="fog" args={['#0a0c11', 12, 30]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 8, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <CarModel exaggerate={exaggerate} />
      <gridHelper args={[40, 40, '#262b3a', '#161a23']} position={[0, 0.001, 0]} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.7} scale={10} blur={2.2} far={2} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={2} color="#ff2e88" position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={2} color="#2de2e6" position={[6, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="ring" intensity={2} position={[0, 2, -8]} scale={3} />
      </Environment>
      <OrbitControls target={[0, 0.6, 0]} enablePan={false} minDistance={4} maxDistance={16} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
