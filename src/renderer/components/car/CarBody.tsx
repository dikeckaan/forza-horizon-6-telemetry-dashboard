import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { store } from '../../store';
import { fToC } from '../../../shared/units';
import { tireTempColor } from '../colors';
import { curve, loft, springGeometry } from './loft';
import type { Archetype, RimKind } from './archetypes';

export interface BodyLayout {
  a: Archetype;
  z0: number;
  z1: number;
  zFront: number;
  zRear: number;
  /** z of each wheel, FL FR RL RR */
  wheelZ: number[];
  /** x of each wheel (left side is +x in model space) */
  wheelX: number[];
  top: (u: number) => number;
  /** actual top surface of the lower body, including the rounded ends */
  deck: (u: number) => number;
  zToU: (z: number) => number;
  uToZ: (u: number) => number;
}

export function layoutOf(a: Archetype): BodyLayout {
  const z0 = -a.length / 2;
  const z1 = a.length / 2;
  const zFront = a.wheelbase / 2 + a.axleShift;
  const zRear = -a.wheelbase / 2 + a.axleShift;
  const rawTop = curve(a.top);
  const uToZ = (u: number) => z0 + (z1 - z0) * u;
  const zToU = (z: number) => (z - z0) / (z1 - z0);
  const archR = a.wheelR + 0.07;
  // body must clear the wheel arches → fenders bulge where needed
  const top = (u: number) => {
    const z = uToZ(u);
    let t = rawTop(u);
    for (const az of [zFront, zRear]) {
      const dz = Math.abs(z - az);
      if (dz < archR + 0.3) {
        const need = a.wheelR + Math.sqrt(Math.max(0, archR * archR - Math.min(dz, archR) ** 2)) + 0.07;
        const k = Math.max(0, 1 - Math.max(0, dz - archR) / 0.3);
        t = Math.max(t, t + (need - t) * k * (need > t ? 1 : 0));
      }
    }
    return t;
  };
  const END = 0.05; // must match the lower body's endRound
  const deck = (u: number) => {
    const edge = Math.min(u, 1 - u);
    const e = edge < END ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - edge / END, 2))) : 1;
    const yb = a.ride;
    const yt = top(u);
    return (yb + yt) / 2 + ((yt - yb) / 2) * (0.45 + 0.55 * e);
  };
  return {
    a,
    deck,
    z0,
    z1,
    zFront,
    zRear,
    wheelZ: [zFront, zFront, zRear, zRear],
    wheelX: [a.track / 2, -a.track / 2, a.track / 2, -a.track / 2],
    top,
    zToU,
    uToZ,
  };
}

// ---------- materials ----------

function usePaint(color: string, xray: boolean) {
  return useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.55,
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        transparent: xray,
        opacity: xray ? 0.1 : 1,
        depthWrite: !xray,
      }),
    [color, xray],
  );
}

const MAT = {
  glass: (xray: boolean) =>
    new THREE.MeshPhysicalMaterial({ color: '#0a0d14', metalness: 0.4, roughness: 0.04, clearcoat: 1, transparent: true, opacity: xray ? 0.08 : 0.92, depthWrite: !xray }),
  trim: new THREE.MeshStandardMaterial({ color: '#0d0f14', roughness: 0.55, metalness: 0.3 }),
  carbon: new THREE.MeshStandardMaterial({ color: '#15171d', roughness: 0.35, metalness: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#dfe5ef', roughness: 0.08, metalness: 1 }),
  head: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e6f6ff', emissiveIntensity: 2.6 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#15161b', roughness: 0.9 }),
};

// ---------- body ----------

export function buildBodyGeometry(L: BodyLayout) {
  const a = L.a;
  const plan = curve(a.plan);
  const archR = a.wheelR + 0.07;
  // wheel wells: carve only the outer sides so the body stays full between the wheels
  const xCut = a.track / 2 - a.wheelW / 2 - 0.06;
  const carve = (ax: number, z: number) => {
    if (ax < xCut) return -Infinity;
    let m = -Infinity;
    for (const az of [L.zFront, L.zRear]) {
      const dz = Math.abs(z - az);
      if (dz < archR) m = Math.max(m, a.wheelR + Math.sqrt(archR * archR - dz * dz));
    }
    return m;
  };
  const lower = loft({ z0: L.z0, z1: L.z1, halfWidth: (u) => (a.width / 2) * plan(u), bottom: () => a.ride, top: L.top, roundness: a.roundness, taper: 0.14, slices: 200, ring: 96, endRound: 0.05, carve });

  const c = a.cabin;
  const roof = curve(c.roof);
  const cw = curve(c.width);
  const cz0 = L.uToZ(c.from);
  const cz1 = L.uToZ(c.to);
  const belt = (v: number) => L.top(c.from + (c.to - c.from) * v) - 0.05;
  const cabin = loft({
    z0: cz0,
    z1: cz1,
    halfWidth: (v) => (a.width / 2) * cw(v),
    bottom: belt,
    top: (v) => Math.max(roof(v), belt(v) + 0.03),
    roundness: 3,
    taper: c.taper,
    slices: 80,
    endRound: 0.16,
  });

  // painted roof: the top slice of the glass volume, slightly inflated so it sits on the glass
  const maxRoof = Math.max(...c.roof.map((k) => k[1]));
  const cut = maxRoof - (maxRoof - L.top((c.from + c.to) / 2)) * 0.22;
  let r0 = 1;
  let r1 = 0;
  for (let v = 0; v <= 1; v += 0.005) {
    if (roof(v) > cut) {
      r0 = Math.min(r0, v);
      r1 = Math.max(r1, v);
    }
  }
  const vOf = (w: number) => r0 + (r1 - r0) * w;
  // reproduce the glass loft's end rounding so the panel hugs it exactly
  const endK = (v: number) => {
    const edge = Math.min(v, 1 - v);
    return edge < 0.16 ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - edge / 0.16, 2))) : 1;
  };
  const gTop = (v: number) => Math.max(roof(v), belt(v) + 0.03);
  const gMid = (v: number) => (belt(v) + gTop(v)) / 2;
  const gHalfH = (v: number) => ((gTop(v) - belt(v)) / 2) * (0.45 + 0.55 * endK(v));
  const roofPanel = loft({
    z0: cz0 + (cz1 - cz0) * r0,
    z1: cz0 + (cz1 - cz0) * r1,
    halfWidth: (w) => (a.width / 2) * cw(vOf(w)) * (0.25 + 0.75 * endK(vOf(w))) * 1.012,
    bottom: (w) => gMid(vOf(w)) - gHalfH(vOf(w)),
    top: (w) => gMid(vOf(w)) + gHalfH(vOf(w)) + 0.008,
    roundness: 3,
    taper: c.taper,
    slices: 60,
    endRound: 0.02,
    carve: () => cut,
  });
  return { lower, cabin, roofPanel, roof, cw, cz0, cz1, belt };
}


export function Body({ L, paint, xray }: { L: BodyLayout; paint: string; xray: boolean }) {
  const a = L.a;
  const paintMat = usePaint(paint, xray);
  // loft meshes carry vertex colors (dark wheel wells); primitives do not
  const shellMat = useMemo(() => {
    const m = paintMat.clone();
    m.vertexColors = true;
    return m;
  }, [paintMat]);
  const glassMat = useMemo(() => MAT.glass(xray), [xray]);
  const trimMat = useMemo(() => {
    const m = MAT.trim.clone();
    if (xray) {
      m.transparent = true;
      m.opacity = 0.12;
      m.depthWrite = false;
    }
    return m;
  }, [xray]);

  const geo = useMemo(() => buildBodyGeometry(L), [L]);

  const nose = L.deck(0.955);
  const tail = L.deck(0.03);
  const modernTail = !a.extras.chrome;
  const mirrorV = 0.85;
  const mirrorZ = geo.cz0 + (geo.cz1 - geo.cz0) * mirrorV;
  const mirrorX = (a.width / 2) * geo.cw(mirrorV) + 0.1;
  const mirrorY = geo.belt(mirrorV) + 0.1;

  return (
    <group>
      <mesh geometry={geo.lower} material={shellMat} castShadow />
      <mesh geometry={geo.cabin} material={glassMat} />
      <mesh geometry={geo.roofPanel} material={shellMat} castShadow />

      {/* inner chassis fills the view through the wheel arches */}
      <mesh position={[0, a.ride + (a.wheelR * 2 - a.ride) / 2, a.axleShift]} material={trimMat}>
        <boxGeometry args={[a.track - a.wheelW - 0.14, a.wheelR * 2 - a.ride, a.length * 0.86]} />
      </mesh>

      {/* headlights */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * a.width * 0.28, nose - 0.09, L.uToZ(0.955)]} rotation={[-0.5, 0, 0]} material={MAT.head}>
          <boxGeometry args={[a.width * 0.2, 0.04, 0.16]} />
        </mesh>
      ))}
      <TailLights L={L} y={tail - 0.08} modern={modernTail} />

      {/* mirrors */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * mirrorX, mirrorY, mirrorZ]} material={paintMat}>
          <boxGeometry args={[0.1, 0.09, 0.16]} />
        </mesh>
      ))}

      <Wing L={L} xray={xray} roof={geo.roof} cz0={geo.cz0} />
      <Extras L={L} />
    </group>
  );
}

function TailLights({ L, y, modern }: { L: BodyLayout; y: number; modern: boolean }) {
  const a = L.a;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff1a3c', emissive: '#ff1a3c', emissiveIntensity: 0.6 }), []);
  useFrame(() => {
    const f = store.frame;
    mat.emissiveIntensity = f && f.brake > 10 ? 5 : 0.6;
  });
  const z = L.uToZ(0.025);
  return modern ? (
    <mesh position={[0, y, z]} material={mat}>
      <boxGeometry args={[a.width * 0.66, 0.045, 0.06]} />
    </mesh>
  ) : (
    <>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * a.width * 0.34, y, z]} rotation={[Math.PI / 2, 0, 0]} material={mat}>
          <cylinderGeometry args={[0.075, 0.075, 0.06, 20]} />
        </mesh>
      ))}
    </>
  );
}

function Wing({ L, xray, roof, cz0 }: { L: BodyLayout; xray: boolean; roof: (v: number) => number; cz0: number }) {
  const a = L.a;
  const mat = xray ? MAT.trim : MAT.carbon;
  const deck = L.deck(0.08);
  const zw = L.z0 + 0.28;
  if (a.wing === 'none') return null;
  if (a.wing === 'lip')
    return (
      <mesh position={[0, L.deck(0.06) + 0.01, L.uToZ(0.06)]} rotation={[0.3, 0, 0]} material={mat}>
        <boxGeometry args={[a.width * 0.7, 0.02, 0.14]} />
      </mesh>
    );
  if (a.wing === 'roof')
    return (
      <mesh position={[0, roof(0.04) + 0.02, cz0 - 0.02]} rotation={[0.2, 0, 0]} material={mat}>
        <boxGeometry args={[a.width * 0.7, 0.025, 0.24]} />
      </mesh>
    );
  const h = a.wing === 'swan' ? 0.2 : 0.28;
  const span = a.width * (a.wing === 'swan' ? 0.84 : 0.92);
  return (
    <group position={[0, deck + h, zw]}>
      <mesh rotation={[0.14, 0, 0]} material={mat} castShadow>
        <boxGeometry args={[span, 0.025, 0.3]} />
      </mesh>
      {[1, -1].map((s) => (
        <group key={s}>
          {/* endplate */}
          <mesh position={[s * span / 2, -0.02, 0]} material={mat}>
            <boxGeometry args={[0.015, 0.11, 0.34]} />
          </mesh>
          {/* pylon down to the deck */}
          <mesh position={[s * span * 0.26, -h / 2, 0.03]} material={mat}>
            <boxGeometry args={[0.025, h, 0.09]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Extras({ L }: { L: BodyLayout }) {
  const a = L.a;
  const e = a.extras;
  const c = a.cabin;
  const roofY = Math.max(...c.roof.map((k) => k[1]));
  const cz0 = L.uToZ(c.from);
  const cz1 = L.uToZ(c.to);
  return (
    <group>
      {e.scoop && (
        <mesh position={[0, L.top(0.8) + 0.02, L.uToZ(0.8)]} material={MAT.carbon}>
          <boxGeometry args={[0.42, 0.07, 0.46]} />
        </mesh>
      )}
      {e.roofRack && (
        <group position={[0, roofY + 0.07, (cz0 + cz1) / 2 + 0.1]}>
          {[1, -1].map((s) => (
            <mesh key={s} position={[s * a.width * 0.36, 0, 0]} material={MAT.trim}>
              <boxGeometry args={[0.04, 0.05, (cz1 - cz0) * 0.7]} />
            </mesh>
          ))}
          <mesh position={[0, 0.06, (cz1 - cz0) * 0.33]} material={MAT.trim}>
            <boxGeometry args={[a.width * 0.78, 0.09, 0.08]} />
          </mesh>
          {[-0.3, -0.1, 0.1, 0.3].map((x) => (
            <mesh key={x} position={[x * a.width, 0.06, (cz1 - cz0) * 0.33 + 0.045]} material={MAT.head}>
              <boxGeometry args={[0.13, 0.06, 0.01]} />
            </mesh>
          ))}
        </group>
      )}
      {e.bed && (
        <mesh position={[0, L.top(0.2) - 0.2, (L.uToZ(0.02) + cz0) / 2]} material={MAT.trim}>
          <boxGeometry args={[a.width * 0.84, 0.4, cz0 - L.uToZ(0.02) - 0.12]} />
        </mesh>
      )}
      {e.spare && (
        <mesh position={[0, L.top(0.1) - 0.35, L.z0 - 0.1]} rotation={[Math.PI / 2, 0, 0]} material={MAT.rubber}>
          <cylinderGeometry args={[a.wheelR * 0.95, a.wheelR * 0.95, a.wheelW * 0.9, 28]} />
        </mesh>
      )}
      {e.mudflaps &&
        L.wheelZ.map((z, i) => (
          <mesh key={i} position={[L.wheelX[i] * 0.98, a.ride + 0.1, z - a.wheelR - 0.1]} material={MAT.rubber}>
            <boxGeometry args={[a.wheelW, 0.26, 0.02]} />
          </mesh>
        ))}
      {e.chrome &&
        [L.z0 + 0.1, L.z1 - 0.1].map((z) => (
          <mesh key={z} position={[0, a.ride + 0.22, z]} material={MAT.chrome}>
            <boxGeometry args={[a.width * 0.7, 0.06, 0.06]} />
          </mesh>
        ))}
      {e.diffuser &&
        [-0.3, -0.1, 0.1, 0.3].map((x) => (
          <mesh key={x} position={[x * a.width, a.ride + 0.07, L.z0 + 0.2]} material={MAT.carbon}>
            <boxGeometry args={[0.015, 0.12, 0.4]} />
          </mesh>
        ))}
      {/* front splitter */}
      <mesh position={[0, a.ride + 0.02, L.z1 - 0.2]} material={MAT.carbon}>
        <boxGeometry args={[a.width * 0.8, 0.02, 0.3]} />
      </mesh>
    </group>
  );
}

// ---------- exhaust & flames ----------

export function Exhaust({ L }: { L: BodyLayout }) {
  const a = L.a;
  const flames = useRef<THREE.Group>(null);
  const st = useRef({ t: 0, prevAccel: 0, prevGear: 0 });
  const flameMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  const coreMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#7fb4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  useFrame((_, dt) => {
    const f = store.frame;
    const s = st.current;
    if (!f || !flames.current) return;
    const high = f.currentEngineRpm > (f.engineMaxRpm || 8000) * 0.62;
    // lift-off at high rpm or an upshift → backfire
    if ((high && s.prevAccel > 180 && f.accel < 40) || (f.gear > s.prevGear && s.prevGear > 0 && f.accel > 150)) {
      s.t = 0.16 + Math.random() * 0.12;
    }
    s.prevAccel = f.accel;
    s.prevGear = f.gear;
    s.t = Math.max(0, s.t - dt);
    const k = Math.min(1, s.t / 0.12);
    flameMat.opacity = k * 0.9;
    coreMat.opacity = k * 0.8;
    flames.current.scale.set(1, 1, 0.5 + k * (0.8 + Math.random() * 0.6));
  });
  const y = a.ride + 0.12;
  const z = L.z0 - 0.02;
  const xs = a.exhaust.flatMap((x) => (x === 0 ? [0.08, -0.08] : [x * (a.width / 2)]));
  return (
    <group>
      {xs.map((x) => (
        <mesh key={x} position={[x, y, z + 0.06]} rotation={[Math.PI / 2, 0, 0]} material={MAT.chrome}>
          <cylinderGeometry args={[0.045, 0.05, 0.14, 18, 1, true]} />
        </mesh>
      ))}
      <group ref={flames} position={[0, y, z]}>
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
    </group>
  );
}

// ---------- wheels ----------

function tireGeometry(R: number, W: number) {
  // rounded sidewall profile revolved around the axle
  const pts: THREE.Vector2[] = [];
  const rimR = R * 0.66;
  const shoulder = Math.min(0.05, W * 0.2);
  pts.push(new THREE.Vector2(rimR, -W / 2));
  pts.push(new THREE.Vector2(R - shoulder, -W / 2));
  for (let i = 0; i <= 6; i++) {
    const t = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - shoulder + Math.sin(t) * shoulder, -W / 2 + shoulder - Math.cos(t) * shoulder));
  }
  for (let i = 0; i <= 6; i++) {
    const t = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - shoulder + Math.cos(t) * shoulder, W / 2 - shoulder + Math.sin(t) * shoulder));
  }
  pts.push(new THREE.Vector2(rimR, W / 2));
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateZ(Math.PI / 2); // axle along x
  return g;
}

function Rim({ kind, R, W, side }: { kind: RimKind; R: number; W: number; side: number }) {
  const rr = R * 0.66;
  const face = side * (W / 2 - 0.02);
  const spokeMat = kind === 'steel' ? MAT.trim : MAT.chrome;
  const spokes =
    kind === 'spoke5'
      ? Array.from({ length: 5 }, (_, i) => ({ a: (i / 5) * Math.PI * 2, w: 0.07 }))
      : kind === 'mesh'
        ? Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2, w: 0.02 }))
        : kind === 'turbine'
          ? Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2, w: 0.035 }))
          : [];
  return (
    <group>
      {/* barrel */}
      <mesh rotation={[0, 0, Math.PI / 2]} material={MAT.trim}>
        <cylinderGeometry args={[rr, rr, W * 0.9, 32, 1, true]} />
      </mesh>
      {/* face disc (steel wheels) or dark backing */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[face - side * 0.03, 0, 0]} material={kind === 'steel' ? spokeMat : MAT.trim}>
        <cylinderGeometry args={[rr * 0.98, rr * 0.98, 0.01, 32]} />
      </mesh>
      {spokes.map((s, i) => (
        <mesh key={i} position={[face, 0, 0]} rotation={[s.a, 0, 0]} material={spokeMat}>
          <boxGeometry args={[0.03, rr * 1.9, s.w]} />
        </mesh>
      ))}
      {kind === 'steel' &&
        Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[face + side * 0.004, Math.sin((i / 6) * Math.PI * 2) * rr * 0.62, Math.cos((i / 6) * Math.PI * 2) * rr * 0.62]} rotation={[0, 0, Math.PI / 2]} material={MAT.rubber}>
            <cylinderGeometry args={[0.035, 0.035, 0.012, 12]} />
          </mesh>
        ))}
      {/* outer lip + center cap */}
      <mesh position={[face, 0, 0]} rotation={[0, side * Math.PI / 2, 0]} material={MAT.chrome}>
        <torusGeometry args={[rr, 0.012, 8, 40]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[face + side * 0.01, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
        <meshStandardMaterial color="#ff2e88" emissive="#ff2e88" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

export function Wheel({ L, index, xray, exaggerate }: { L: BodyLayout; index: number; xray: boolean; exaggerate: number }) {
  const a = L.a;
  const R = a.wheelR;
  const W = a.wheelW;
  const front = index < 2;
  const side = index % 2 === 0 ? 1 : -1;
  const spin = useRef<THREE.Group>(null);
  const steer = useRef<THREE.Group>(null);
  const hop = useRef<THREE.Group>(null);
  const spring = useRef<THREE.Mesh>(null);
  const angle = useRef(0);
  const heat = useRef(0);
  const tireGeo = useMemo(() => tireGeometry(R, W), [R, W]);
  const tireMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#16171c', roughness: 0.92, emissive: new THREE.Color('#000'), emissiveIntensity: 0 }), []);
  const discMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4f5c', metalness: 0.9, roughness: 0.35, emissive: new THREE.Color('#ff4a12'), emissiveIntensity: 0 }), []);
  const springGeo = useMemo(() => springGeometry(0.075, 7, 0.013), []);
  const mount = R * 2 + 0.12; // spring top, fixed to the body

  useFrame((_, dt) => {
    const f = store.frame;
    if (!f) return;
    const d = Math.min(dt, 0.05);
    angle.current += f.wheelRotationSpeed[index] * d;
    if (spin.current) spin.current.rotation.x = angle.current;
    if (steer.current && front) steer.current.rotation.y = (-f.steer / 127) * 0.52;
    const travel = (f.normalizedSuspensionTravel[index] - 0.5) * 0.12 * Math.min(exaggerate, 3);
    if (hop.current) hop.current.position.y = travel;
    // brake disc heat: builds with brake × speed, cools over time
    heat.current = Math.max(0, Math.min(1, heat.current + (f.brake / 255) * Math.min(1, f.speed / 30) * d * 0.9 - d * 0.12));
    discMat.emissiveIntensity = heat.current * heat.current * 3;
    tireMat.emissive.set(tireTempColor(fToC(f.tireTemp[index])));
    tireMat.emissiveIntensity = xray ? 0.55 : 0;
    if (spring.current) {
      const len = mount - (R + travel);
      spring.current.scale.y = Math.max(0.1, len);
      spring.current.position.y = R + travel;
    }
  });

  return (
    <group position={[L.wheelX[index], 0, L.wheelZ[index]]}>
      {xray && (
        <mesh ref={spring} geometry={springGeo} position={[-side * 0.25, R, 0]}>
          <meshStandardMaterial color="#ffc53d" emissive="#ffc53d" emissiveIntensity={0.6} metalness={0.6} roughness={0.3} />
        </mesh>
      )}
      <group ref={hop}>
        <group position={[0, R, 0]} ref={steer}>
          <group ref={spin}>
            <mesh geometry={tireGeo} material={tireMat} castShadow />
            <Rim kind={a.rim} R={R} W={W} side={side} />
          </group>
          {/* brake disc + caliper do not spin */}
          <mesh rotation={[0, 0, Math.PI / 2]} position={[side * (W / 2 - 0.13), 0, 0]} material={discMat}>
            <cylinderGeometry args={[R * 0.58, R * 0.58, 0.028, 32]} />
          </mesh>
          <mesh position={[side * (W / 2 - 0.13), R * 0.34, front ? -0.08 : 0.08]}>
            <boxGeometry args={[0.05, 0.13, 0.2]} />
            <meshStandardMaterial color="#ff2e88" roughness={0.35} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
