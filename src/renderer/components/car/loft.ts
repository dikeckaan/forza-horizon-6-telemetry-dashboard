import * as THREE from 'three';
import type { Keys } from './archetypes';

/** Monotone cubic (Fritsch–Carlson) interpolation through keyframes. */
export function curve(keys: Keys): (u: number) => number {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (u: number) => {
    if (u <= xs[0]) return ys[0];
    if (u >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (u > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (u - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export interface LoftSpec {
  /** z range, rear → front */
  z0: number;
  z1: number;
  halfWidth: (u: number) => number;
  bottom: (u: number) => number;
  top: (u: number) => number;
  /** superellipse exponent (2 = ellipse, higher = boxier) */
  roundness: number;
  /** narrowing of the upper half (tumblehome), 0..1 */
  taper: number;
  /** fraction of the length over which each end is rounded off */
  endRound?: number;
  slices?: number;
  ring?: number;
  /**
   * Optional carving: returns the minimum y allowed at (|x|, z), e.g. wheel
   * wells on the outer sides. Carved vertices are darkened via vertex colors.
   */
  carve?: (ax: number, z: number) => number;
}

/**
 * Sweeps a superellipse cross-section along z. Produces smooth, car-like
 * volumes from a handful of profile curves.
 */
export function loft(s: LoftSpec): THREE.BufferGeometry {
  const N = s.slices ?? 90;
  const M = s.ring ?? 44;
  const er = s.endRound ?? 0.06;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const pow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const z = s.z0 + (s.z1 - s.z0) * u;
    // round both ends so noses and tails are not flat caps
    const edge = Math.min(u, 1 - u);
    const e = edge < er ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - edge / er, 2))) : 1;
    let w = s.halfWidth(u);
    const yb = s.bottom(u);
    const yt = s.top(u);
    const yc = (yb + yt) / 2;
    let h = (yt - yb) / 2;
    w *= 0.25 + 0.75 * e;
    h *= 0.45 + 0.55 * e;
    for (let j = 0; j < M; j++) {
      const th = (j / M) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      // flatter floor, rounder shoulders
      const expY = sn < 0 ? 2 / (s.roundness * 1.8) : 2 / s.roundness;
      const ny = pow(sn, expY);
      let x = w * pow(c, 2 / s.roundness);
      x *= 1 - s.taper * Math.max(0, ny) * Math.max(0, ny);
      let y = yc + h * ny;
      let shade = 1;
      if (s.carve) {
        const minY = s.carve(Math.abs(x), z);
        if (y < minY) {
          y = minY;
          shade = 0.06;
        }
      }
      pos.push(x, y, z);
      col.push(shade, shade, shade);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j;
      const b = i * M + ((j + 1) % M);
      const c = (i + 1) * M + j;
      const d = (i + 1) * M + ((j + 1) % M);
      // counter-clockwise ring + increasing z → these windings face outward
      idx.push(a, b, c, b, d, c);
    }
  }
  // end caps
  const cap = (ring: number, flip: boolean) => {
    const base = ring * M;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < M; j++) {
      cx += pos[(base + j) * 3];
      cy += pos[(base + j) * 3 + 1];
      cz += pos[(base + j) * 3 + 2];
    }
    const ci = pos.length / 3;
    pos.push(cx / M, cy / M, cz / M);
    col.push(1, 1, 1);
    for (let j = 0; j < M; j++) {
      const a = base + j;
      const b = base + ((j + 1) % M);
      if (flip) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  };
  cap(0, false); // rear cap faces -z
  cap(N, true); // front cap faces +z

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Coil spring along +y, height 1 (scale it to compress). */
export function springGeometry(radius = 0.07, turns = 7, tube = 0.012): THREE.BufferGeometry {
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
