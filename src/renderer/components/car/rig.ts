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

const WHEEL_RE = /wheel|tire|tyre|rim|reifen|felge|rad\b/i;
const NOT_WHEEL_RE = /steer|spare|interior|dash|cockpit|arch|well|fender|cover|house/i;
const PAINT_RE = /body|paint|carpaint|color1|colour1|exterior|shell|panel/i;
const NOT_PAINT_RE = /interior|underside|under|glass|window|rim|tire|tyre|wheel|light|lamp|grill|chrome|trim|rubber|seat|carbon|plate|gasket|black|color2|colour2/i;
const GLASS_RE = /glass|window|windshield|windscreen/i;
const NOT_GLASS_RE = /gasket|wiper|base|frame|seal|trim/i;
const TAIL_RE = /tail.?light|lights?_red|brake.?light|rear.?light|taillight/i;
const BRAKE_RE = /brake|disc|rotor/i;
const NOT_BRAKE_RE = /pad|caliper|light|pedal/i;
const TIRE_RE = /tire|tyre|rubber|reifen/i;

const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();

function worldBox(o: THREE.Object3D) {
  return new THREE.Box3().setFromObject(o);
}

/** Finds one wheel node per corner (by name first, position second). */
function findWheels(scene: THREE.Object3D, center: THREE.Vector3, carLength: number): (THREE.Object3D | null)[] {
  const cands: { o: THREE.Object3D; c: THREE.Vector3; size: number }[] = [];
  scene.traverse((o) => {
    if (o === scene || !WHEEL_RE.test(o.name) || NOT_WHEEL_RE.test(o.name)) return;
    tmpBox.setFromObject(o);
    if (tmpBox.isEmpty()) return;
    const s = tmpBox.getSize(tmpV);
    const size = Math.max(s.x, s.y, s.z);
    // a group holding several wheels (or the whole car) is not a wheel
    if (size > Math.min(1.4, carLength * 0.3)) return;
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
  let wheelNodes = findWheels(holder, center, size.z);
  const negFront = frontIsNegativeZ(wheelNodes, center);
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
  wheelNodes = findWheels(holder, center, size.z);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(holder);

  // 5) materials: clone everything we will animate or recolour
  const paintMaterials: THREE.MeshPhysicalMaterial[] = [];
  const tailMaterials: THREE.MeshStandardMaterial[] = [];
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
        const t = new THREE.MeshStandardMaterial({ color: '#ff1a3c', emissive: '#ff1a3c', emissiveIntensity: 0.6, roughness: 0.2 });
        tailMaterials.push(t);
        bodyMaterials.push(t);
        return t;
      }
      if (GLASS_RE.test(name) && !NOT_GLASS_RE.test(name)) {
        const g = new THREE.MeshPhysicalMaterial({ color: '#0d1118', metalness: 0.25, roughness: 0.02, transparent: true, opacity: 0.55, clearcoat: 1 });
        bodyMaterials.push(g);
        return g;
      }
      if (PAINT_RE.test(name) && !NOT_PAINT_RE.test(name)) {
        const src = mat as THREE.MeshStandardMaterial;
        const p = new THREE.MeshPhysicalMaterial({
          color: paint,
          metalness: 0.75,
          roughness: 0.32,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
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
      root.updateMatrixWorld(true);
      spin.attach(node);
      // calipers/pads are fixed to the upright: steer with the wheel but never spin
      const fixed: THREE.Object3D[] = [];
      node.traverse((o) => {
        if (o !== node && /caliper|brake.?pad|pad\b/i.test(o.name)) fixed.push(o);
      });
      for (const o of fixed) steer.attach(o);
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
    bodyMaterials,
    tireMaterials,
  };
}
