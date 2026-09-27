import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * A car model prepared for telemetry: +z is forward, +x is the car's left,
 * the tyres touch y = 0 and every wheel sits in its own steer/spin pivots.
 */
export interface CarRig {
  root: THREE.Group;
  /** everything except the wheels; receives body roll/pitch */
  body: THREE.Group;
  wheels: {
    /** positioned at the wheel centre; steer (y) and suspension (position.y) */
    steer: THREE.Group;
    /** spins around x */
    spin: THREE.Group;
    baseY: number;
    radius: number;
    width: number;
  }[];
  /** FL FR RL RR contact points */
  wheelPos: { x: number; z: number }[];
  length: number;
  width: number;
  wheelbase: number;
  track: number;
  rearZ: number;
  paintMaterials: THREE.MeshPhysicalMaterial[];
  brakeMaterials: THREE.MeshStandardMaterial[][];
  tailMaterials: THREE.MeshStandardMaterial[];
  headMaterials: THREE.MeshStandardMaterial[];
  /** front bumper z, for headlight beams */
  frontZ: number;
  bodyMaterials: THREE.Material[];
  tireMaterials: THREE.MeshStandardMaterial[][];
}

export interface ModelOptions {
  /** force a 180° turn when auto detection gets the front wrong */
  flip?: boolean;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<THREE.Group>>();

export function loadModel(key: string, source: string | ArrayBuffer): Promise<THREE.Group> {
  let p = cache.get(key);
  if (!p) {
    p = (typeof source === 'string' ? loader.loadAsync(source) : loader.parseAsync(source, '')).then((g) => g.scene);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

// 'rim' only as its own word: "Trim_Carbon" is a spoiler, not a wheel
const WHEEL_RE = /wheel|tire|tyre|(^|[^a-z])rims?([^a-z]|$)|reifen|felge|rad\b/i;
const NOT_WHEEL_RE = /steer|spare|interior|dash|cockpit|arch|well|fender|cover|house/i;
const PAINT_RE = /body|paint|carpaint|color1|colour1|exterior|shell|panel/i;
const NOT_PAINT_RE = /interior|underside|under|glass|window|rim|tire|tyre|wheel|light|lamp|grill|chrome|trim|rubber|seat|carbon|plate|gasket|black|color2|colour2/i;
const GLASS_RE = /glass|window|windshield|windscreen/i;
const NOT_GLASS_RE = /gasket|wiper|base|frame|seal|trim/i;
const HEAD_RE = /head.?light|headlamp|projector|head_lamp|front.?light|drl/i;
const TAIL_RE = /tail.?light|lights?_red|brake.?light|rear.?light|taillight/i;
const BRAKE_RE = /brake|disc|rotor/i;
const NOT_BRAKE_RE = /pad|caliper|light|pedal/i;
const TIRE_RE = /tire|tyre|rubber|reifen/i;

const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();

function worldBox(o: THREE.Object3D) {
  return new THREE.Box3().setFromObject(o);
}

/** Finds one wheel node per corner: by name first, then by shape and position. */
function findWheels(scene: THREE.Object3D, box: THREE.Box3): (THREE.Object3D | null)[] {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const byName = findWheelsByName(scene, center, size.z);
  if (byName.every(Boolean)) return byName;
  const byShape = findWheelsByShape(scene, box, byName);
  return byName.map((w, i) => w ?? byShape[i]);
}

/**
 * Many downloaded models have generic node names ("Object_42"). A wheel is a
 * roughly round (y ≈ z), narrow (x small) part sitting low in a corner.
 */
function findWheelsByShape(scene: THREE.Object3D, box: THREE.Box3, known: (THREE.Object3D | null)[]): (THREE.Object3D | null)[] {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const taken = new Set<THREE.Object3D>();
  for (const k of known) k?.traverse((o) => taken.add(o));
  const meshes: { m: THREE.Mesh; c: THREE.Vector3; s: THREE.Vector3 }[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || taken.has(m)) return;
    const b = new THREE.Box3().setFromObject(m);
    if (b.isEmpty()) return;
    meshes.push({ m, c: b.getCenter(new THREE.Vector3()), s: b.getSize(new THREE.Vector3()) });
  });
  const corner = (c: THREE.Vector3) => (c.z > center.z ? 0 : 2) + (c.x > center.x ? 0 : 1);
  const out: (THREE.Object3D | null)[] = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    if (known[i]) continue;
    // the tyre: biggest round, low, outboard part in this corner
    let tyre: (typeof meshes)[number] | null = null;
    for (const k of meshes) {
      if (corner(k.c) !== i) continue;
      const d = Math.max(k.s.y, k.s.z);
      const round = Math.abs(k.s.y - k.s.z) < d * 0.25;
      const narrow = k.s.x < d * 0.75;
      const low = k.c.y - box.min.y < size.y * 0.45;
      const outboard = Math.abs(k.c.x - center.x) > size.x * 0.2 && Math.abs(k.c.z - center.z) > size.z * 0.15;
      if (round && narrow && low && outboard && d > size.z * 0.08 && d < size.z * 0.3 && (!tyre || d > Math.max(tyre.s.y, tyre.s.z))) tyre = k;
    }
    if (!tyre) continue;
    // everything concentric with it (rim, spokes, disc, bolts) belongs to the wheel
    const r = Math.max(tyre.s.y, tyre.s.z) / 2;
    const group = new THREE.Group();
    group.name = `wheel_auto_${i}`;
    scene.add(group);
    scene.updateMatrixWorld(true);
    for (const k of meshes) {
      if (corner(k.c) !== i || taken.has(k.m)) continue;
      const concentric = Math.hypot(k.c.y - tyre.c.y, k.c.z - tyre.c.z) < r * 0.35 && Math.abs(k.c.x - tyre.c.x) < r && Math.max(k.s.y, k.s.z) <= r * 2.05;
      if (!concentric) continue;
      group.attach(k.m);
      taken.add(k.m);
    }
    out[i] = group;
  }
  return out;
}

function findWheelsByName(scene: THREE.Object3D, center: THREE.Vector3, carLength: number): (THREE.Object3D | null)[] {
  const cands: { o: THREE.Object3D; c: THREE.Vector3; size: number }[] = [];
  scene.traverse((o) => {
    if (o === scene || !WHEEL_RE.test(o.name) || NOT_WHEEL_RE.test(o.name)) return;
    tmpBox.setFromObject(o);
    if (tmpBox.isEmpty()) return;
    const s = tmpBox.getSize(tmpV);
    const size = Math.max(s.x, s.y, s.z);
    // a group holding several wheels (or the whole car) is not a wheel
    if (size > Math.min(1.4, carLength * 0.3)) return;
    // and it has to look like one: round side profile, narrower than tall
    if (Math.abs(s.y - s.z) > size * 0.3 || s.x > size * 0.85) return;
    cands.push({ o, c: tmpBox.getCenter(new THREE.Vector3()), size });
  });
  if (!cands.length) return [null, null, null, null];
  const maxSize = Math.max(...cands.map((c) => c.size));
  const corner = (c: THREE.Vector3) => (c.z > center.z ? 0 : 2) + (c.x > center.x ? 0 : 1);
  const best: ({ o: THREE.Object3D; size: number } | null)[] = [null, null, null, null];
  for (const k of cands) {
    // wheel-sized: at least half the largest wheel-ish thing, never the whole car
    if (k.size < maxSize * 0.5) continue;
    const i = corner(k.c);
    // prefer the outermost node that still only holds one wheel (largest bbox)
    if (!best[i] || k.size > best[i]!.size + 1e-4 || (Math.abs(k.size - best[i]!.size) < 1e-4 && isAncestor(k.o, best[i]!.o))) best[i] = k;
  }
  return best.map((b) => b?.o ?? null);
}

/**
 * Yaw (around y) that makes a wheel's tyre thinnest along x, i.e. puts its axle
 * on the x axis. Works on the vertices, so it does not trust node transforms.
 */
function axleYaw(node: THREE.Object3D, center: THREE.Vector3): { yaw: number; width: number } {
  const pts: number[] = [];
  const v = new THREE.Vector3();
  node.updateMatrixWorld(true);
  node.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(center);
      pts.push(v.x, v.z);
    }
  });
  if (!pts.length) return { yaw: 0, width: 0.25 };
  const extent = (th: number) => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * c + pts[i + 1] * s;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    return hi - lo;
  };
  let best = 0;
  let bestW = extent(0);
  for (let th = -0.8; th <= 0.8; th += 0.01) {
    const w = extent(th);
    if (w < bestW - 1e-4) {
      bestW = w;
      best = th;
    }
  }
  // refine around the coarse minimum
  for (let th = best - 0.01; th <= best + 0.01; th += 0.0005) {
    const w = extent(th);
    if (w < bestW) {
      bestW = w;
      best = th;
    }
  }
  return { yaw: Math.abs(best) < 0.004 ? 0 : best, width: bestW };
}

function isAncestor(a: THREE.Object3D, b: THREE.Object3D) {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

function frontIsNegativeZ(wheels: (THREE.Object3D | null)[], center: THREE.Vector3): boolean | null {
  // names like wheel_fl / WheelFrontL / FR_Wheel tell us which axle is the front one
  let votes = 0;
  for (const w of wheels) {
    if (!w) continue;
    const n = w.name.toLowerCase();
    const front = /front|(^|[^a-z])f[lr]([^a-z]|$)|_f[lr]|f[lr]_|vorne/.test(n);
    const rear = /rear|back|(^|[^a-z])[rb][lr]([^a-z]|$)|_r[lr]|r[lr]_|hinten/.test(n);
    if (front === rear) continue;
    const z = worldBox(w).getCenter(tmpV).z - center.z;
    votes += front ? Math.sign(z) : -Math.sign(z);
  }
  if (votes !== 0) return votes < 0;
  return null;
}

const FRONT_PART_RE = /head.?l|headlamp|grill|grille|bonnet|hood|windshield|windscreen|wiper|splitter|radiator|front/i;
const REAR_PART_RE = /tail|rear|exhaust|muffler|trunk|\bboot\b|diffuser|spoiler|brake.?light|back.?light/i;

/** Fallback: which end holds headlights/grille vs. tail lights/exhausts. */
function frontFromParts(scene: THREE.Object3D, center: THREE.Vector3): boolean | null {
  let votes = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const name = `${m.name} ${m.parent?.name ?? ''} ${mats.map((x) => x.name).join(' ')}`;
    const f = FRONT_PART_RE.test(name);
    const r = REAR_PART_RE.test(name);
    if (f === r) return;
    const z = worldBox(m).getCenter(tmpV).z - center.z;
    if (Math.abs(z) < 0.3) return;
    votes += (f ? 1 : -1) * Math.sign(z);
  });
  if (votes === 0) return null;
  return votes < 0;
}

export function prepareRig(source: THREE.Group, paint: string, opts: ModelOptions = {}): CarRig {
  const model = source.clone(true);
  const holder = new THREE.Group();
  holder.add(model);

  // 1) lay the car along z
  let box = worldBox(holder);
  let size = box.getSize(new THREE.Vector3());
  if (size.x > size.z * 1.15) {
    model.rotation.y = -Math.PI / 2;
    holder.updateMatrixWorld(true);
    box = worldBox(holder);
    size = box.getSize(new THREE.Vector3());
  }
  // 2) metres: most car models are 3.5–6 m long; fix cm/mm or unit-cube exports
  const len = size.z;
  if (len > 12 || len < 1.5) {
    model.scale.multiplyScalar(4.5 / len);
    holder.updateMatrixWorld(true);
    box = worldBox(holder);
    size = box.getSize(new THREE.Vector3());
  }
  // 3) front towards +z
  let center = box.getCenter(new THREE.Vector3());
  const namedWheels = findWheelsByName(holder, center, size.z);
  const negFront = frontIsNegativeZ(namedWheels, center) ?? frontFromParts(holder, center);
  if (negFront !== !!opts.flip && (negFront !== null || opts.flip)) {
    model.rotation.y += Math.PI;
    holder.updateMatrixWorld(true);
    box = worldBox(holder);
  }
  // 4) centre on x/z, tyres on the ground
  center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  holder.updateMatrixWorld(true);
  box = worldBox(holder);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  const wheelNodes = findWheels(holder, box);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(holder);

  // 5) materials: clone everything we will animate or recolour
  const paintMaterials: THREE.MeshPhysicalMaterial[] = [];
  const tailMaterials: THREE.MeshStandardMaterial[] = [];
  const headMaterials: THREE.MeshStandardMaterial[] = [];
  const bodyMaterials: THREE.Material[] = [];
  const wheelSet = new Set<THREE.Object3D>();
  for (const w of wheelNodes) w?.traverse((o) => wheelSet.add(o));
  holder.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map((mat) => {
      const name = `${m.name} ${mat.name}`;
      if (wheelSet.has(m)) return mat;
      if (TAIL_RE.test(name)) {
        // keep the model's own lens texture when it has one, just drive its glow
        const src = mat as THREE.MeshStandardMaterial;
        const t = src.isMeshStandardMaterial ? src.clone() : new THREE.MeshStandardMaterial({ color: '#ff1a3c', roughness: 0.2 });
        if (!t.emissive || t.emissive.getHex() === 0) t.emissive = new THREE.Color('#ff1a3c');
        t.emissiveIntensity = 0.6;
        tailMaterials.push(t);
        bodyMaterials.push(t);
        return t;
      }
      if (HEAD_RE.test(name) && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const h = (mat as THREE.MeshStandardMaterial).clone();
        h.emissive = new THREE.Color('#fff6e8');
        h.emissiveIntensity = 0;
        headMaterials.push(h);
        bodyMaterials.push(h);
        return h;
      }
      const alreadyGlass = mat.transparent || ((mat as THREE.MeshPhysicalMaterial).transmission ?? 0) > 0;
      if (GLASS_RE.test(name) && !NOT_GLASS_RE.test(name) && !alreadyGlass) {
        const g = new THREE.MeshPhysicalMaterial({ color: '#0d1118', metalness: 0.25, roughness: 0.02, transparent: true, opacity: 0.55, clearcoat: 1 });
        bodyMaterials.push(g);
        return g;
      }
      if (paint !== 'original' && PAINT_RE.test(name) && !NOT_PAINT_RE.test(name)) {
        const src = mat as THREE.MeshStandardMaterial;
        const p = new THREE.MeshPhysicalMaterial({
          // automotive paint: coloured base coat under a glossy clear coat
          color: paint,
          metalness: 0.45,
          roughness: 0.38,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          // keep a hint of metallic flake without the sparkle noise
          normalMap: src.normalMap ?? null,
          normalScale: new THREE.Vector2(0.12, 0.12),
          aoMap: src.aoMap ?? null,
        });
        paintMaterials.push(p);
        bodyMaterials.push(p);
        return p;
      }
      const c = mat.clone();
      bodyMaterials.push(c);
      return c;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });

  // 6) wheels into steer/spin pivots, outside the body so body roll is relative
  const wheels: CarRig['wheels'] = [];
  const wheelPos: CarRig['wheelPos'] = [];
  const brakeMaterials: THREE.MeshStandardMaterial[][] = [];
  const tireMaterials: THREE.MeshStandardMaterial[][] = [];
  const fallbackX = size.x * 0.42;
  const fallbackZ = size.z * 0.32;
  for (let i = 0; i < 4; i++) {
    const node = wheelNodes[i];
    const steer = new THREE.Group();
    const spin = new THREE.Group();
    steer.add(spin);
    root.add(steer);
    const brakes: THREE.MeshStandardMaterial[] = [];
    const tires: THREE.MeshStandardMaterial[] = [];
    if (node) {
      const wb = worldBox(node);
      const wc = wb.getCenter(new THREE.Vector3());
      const ws = wb.getSize(new THREE.Vector3());
      steer.position.copy(wc);
      const align = new THREE.Group(); // straightens pre-steered wheels, then spins
      const alignFixed = new THREE.Group(); // same correction for parts that must not spin
      spin.add(align);
      steer.add(alignFixed);
      root.updateMatrixWorld(true);
      align.attach(node);
      // calipers/pads are fixed to the upright: steer with the wheel but never spin
      const fixed: THREE.Object3D[] = [];
      node.traverse((o) => {
        if (o !== node && /caliper|brake.?pad|pad\b/i.test(o.name)) fixed.push(o);
      });
      for (const o of fixed) alignFixed.attach(o);
      // showroom models often ship with the front wheels turned; measure the axle and undo it
      const { yaw, width } = axleYaw(node, wc);
      align.rotation.y = yaw;
      alignFixed.rotation.y = yaw;
      ws.x = width;
      node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const next = mats.map((mat) => {
          const c = (mat as THREE.MeshStandardMaterial).clone();
          const name = `${m.name} ${mat.name}`;
          if (BRAKE_RE.test(name) && !NOT_BRAKE_RE.test(name) && c.emissive) {
            c.emissive = new THREE.Color('#ff4a12');
            c.emissiveIntensity = 0;
            brakes.push(c);
          } else if (TIRE_RE.test(name) && c.emissive) {
            tires.push(c);
          }
          return c;
        });
        m.material = Array.isArray(m.material) ? next : next[0];
      });
      wheels.push({ steer, spin, baseY: wc.y, radius: Math.max(ws.y, ws.z) / 2, width: ws.x });
      wheelPos.push({ x: wc.x, z: wc.z });
    } else {
      const x = (i % 2 === 0 ? 1 : -1) * fallbackX;
      const z = (i < 2 ? 1 : -1) * fallbackZ;
      steer.position.set(x, 0.34, z);
      wheels.push({ steer, spin, baseY: 0.34, radius: 0.34, width: 0.25 });
      wheelPos.push({ x, z });
    }
    brakeMaterials.push(brakes);
    tireMaterials.push(tires);
  }

  const wheelbase = Math.abs(wheelPos[0].z - wheelPos[2].z) || size.z * 0.6;
  const track = Math.abs(wheelPos[0].x - wheelPos[1].x) || size.x * 0.85;
  return {
    root,
    body,
    wheels,
    wheelPos,
    length: size.z,
    width: size.x,
    wheelbase,
    track,
    rearZ: box.min.z,
    paintMaterials,
    brakeMaterials,
    tailMaterials,
    headMaterials,
    frontZ: box.max.z,
    bodyMaterials,
    tireMaterials,
  };
}
