import type { Frame } from '../../../shared/packet';

export type Keys = [number, number][];

export type BodyStyle = 'hyper' | 'sports' | 'muscle' | 'sedan' | 'hatch' | 'rally' | 'suv' | 'pickup' | 'classic';

export const STYLE_LABELS: Record<BodyStyle, string> = {
  hyper: 'Hiper',
  sports: 'Spor',
  muscle: 'Muscle',
  sedan: 'Sedan',
  hatch: 'Hatchback',
  rally: 'Ralli',
  suv: 'SUV / Arazi',
  pickup: 'Pickup',
  classic: 'Klasik',
};

export type WingKind = 'none' | 'lip' | 'gt' | 'swan' | 'roof';
export type RimKind = 'spoke5' | 'mesh' | 'steel' | 'turbine';

/**
 * Everything the body generator needs. Profiles are keyed by u ∈ [0,1] from the
 * rear bumper (0) to the front bumper (1); heights in meters from the ground.
 */
export interface Archetype {
  length: number;
  width: number;
  wheelbase: number;
  /** front axle offset from the body center (positive = forward) */
  axleShift: number;
  track: number;
  wheelR: number;
  wheelW: number;
  ride: number;
  /** top of the lower body (hood / deck line) */
  top: Keys;
  /** plan-view width factor */
  plan: Keys;
  /** superellipse exponent of the lower body cross-section */
  roundness: number;
  cabin: {
    from: number;
    to: number;
    /** roof height within the cabin, keyed 0..1 across the cabin */
    roof: Keys;
    /** width factor relative to body width, keyed across the cabin */
    width: Keys;
    taper: number;
  };
  wing: WingKind;
  rim: RimKind;
  extras: {
    scoop?: boolean;
    roofRack?: boolean;
    bed?: boolean;
    spare?: boolean;
    mudflaps?: boolean;
    chrome?: boolean;
    diffuser?: boolean;
    sideExhaust?: boolean;
  };
  /** exhaust tips: x offsets (model space, symmetric pairs allowed) */
  exhaust: number[];
}

export const ARCHETYPES: Record<BodyStyle, Archetype> = {
  hyper: {
    length: 4.6, width: 2.04, wheelbase: 2.72, axleShift: 0.1, track: 1.74, wheelR: 0.35, wheelW: 0.32, ride: 0.1,
    top: [[0, 0.62], [0.06, 0.8], [0.22, 0.84], [0.42, 0.78], [0.72, 0.7], [0.9, 0.6], [1, 0.36]],
    plan: [[0, 0.86], [0.12, 1], [0.35, 0.93], [0.55, 0.9], [0.8, 1], [1, 0.78]],
    roundness: 3.2,
    cabin: { from: 0.34, to: 0.72, roof: [[0, 0.8], [0.3, 1.08], [0.55, 1.12], [1, 0.72]], width: [[0, 0.62], [0.45, 0.72], [1, 0.58]], taper: 0.35 },
    wing: 'swan', rim: 'turbine', extras: { diffuser: true }, exhaust: [0],
  },
  sports: {
    length: 4.45, width: 1.92, wheelbase: 2.6, axleShift: 0.05, track: 1.64, wheelR: 0.34, wheelW: 0.28, ride: 0.13,
    top: [[0, 0.66], [0.05, 0.84], [0.2, 0.86], [0.45, 0.83], [0.75, 0.78], [0.92, 0.66], [1, 0.46]],
    plan: [[0, 0.84], [0.12, 1], [0.5, 0.95], [0.85, 0.98], [1, 0.76]],
    roundness: 3,
    cabin: { from: 0.26, to: 0.68, roof: [[0, 0.84], [0.35, 1.25], [0.6, 1.27], [1, 0.84]], width: [[0, 0.68], [0.5, 0.76], [1, 0.66]], taper: 0.3 },
    wing: 'lip', rim: 'spoke5', extras: { diffuser: true }, exhaust: [0.35, -0.35],
  },
  muscle: {
    length: 4.85, width: 1.95, wheelbase: 2.85, axleShift: 0.05, track: 1.62, wheelR: 0.35, wheelW: 0.3, ride: 0.15,
    top: [[0, 0.8], [0.04, 0.92], [0.25, 0.94], [0.6, 0.93], [0.9, 0.9], [0.97, 0.82], [1, 0.6]],
    plan: [[0, 0.93], [0.1, 1], [0.9, 1], [1, 0.9]],
    roundness: 5,
    cabin: { from: 0.22, to: 0.58, roof: [[0, 0.93], [0.35, 1.33], [0.7, 1.35], [1, 0.93]], width: [[0, 0.72], [0.5, 0.78], [1, 0.7]], taper: 0.22 },
    wing: 'lip', rim: 'steel', extras: { scoop: true, chrome: true }, exhaust: [0.5, -0.5],
  },
  sedan: {
    length: 4.8, width: 1.86, wheelbase: 2.85, axleShift: 0.02, track: 1.6, wheelR: 0.33, wheelW: 0.24, ride: 0.16,
    top: [[0, 0.84], [0.05, 0.96], [0.2, 0.98], [0.5, 0.96], [0.82, 0.92], [0.95, 0.82], [1, 0.62]],
    plan: [[0, 0.88], [0.1, 1], [0.9, 1], [1, 0.86]],
    roundness: 3.4,
    cabin: { from: 0.2, to: 0.7, roof: [[0, 0.96], [0.28, 1.42], [0.65, 1.44], [1, 0.95]], width: [[0, 0.74], [0.5, 0.8], [1, 0.72]], taper: 0.22 },
    wing: 'none', rim: 'spoke5', extras: {}, exhaust: [0.45, -0.45],
  },
  hatch: {
    length: 4.0, width: 1.8, wheelbase: 2.5, axleShift: 0.08, track: 1.56, wheelR: 0.32, wheelW: 0.23, ride: 0.15,
    top: [[0, 0.86], [0.04, 0.98], [0.3, 1.0], [0.7, 0.95], [0.92, 0.84], [1, 0.62]],
    plan: [[0, 0.9], [0.1, 1], [0.9, 0.98], [1, 0.86]],
    roundness: 3.2,
    cabin: { from: 0.05, to: 0.66, roof: [[0, 1.2], [0.08, 1.42], [0.7, 1.46], [1, 0.97]], width: [[0, 0.74], [0.5, 0.8], [1, 0.72]], taper: 0.2 },
    wing: 'roof', rim: 'spoke5', extras: {}, exhaust: [0.4],
  },
  rally: {
    length: 4.1, width: 1.88, wheelbase: 2.55, axleShift: 0.06, track: 1.62, wheelR: 0.33, wheelW: 0.25, ride: 0.2,
    top: [[0, 0.9], [0.04, 1.02], [0.3, 1.04], [0.7, 0.99], [0.92, 0.88], [1, 0.66]],
    plan: [[0, 0.92], [0.1, 1], [0.9, 1], [1, 0.88]],
    roundness: 3.6,
    cabin: { from: 0.1, to: 0.66, roof: [[0, 1.2], [0.1, 1.48], [0.7, 1.5], [1, 1.01]], width: [[0, 0.74], [0.5, 0.8], [1, 0.72]], taper: 0.2 },
    wing: 'gt', rim: 'steel', extras: { scoop: true, mudflaps: true }, exhaust: [0.5],
  },
  suv: {
    length: 4.75, width: 1.98, wheelbase: 2.8, axleShift: 0.04, track: 1.7, wheelR: 0.42, wheelW: 0.3, ride: 0.3,
    top: [[0, 1.12], [0.04, 1.2], [0.3, 1.22], [0.75, 1.2], [0.94, 1.12], [1, 0.9]],
    plan: [[0, 0.95], [0.08, 1], [0.92, 1], [1, 0.93]],
    roundness: 6,
    cabin: { from: 0.04, to: 0.72, roof: [[0, 1.78], [0.06, 1.86], [0.8, 1.86], [1, 1.24]], width: [[0, 0.84], [0.5, 0.86], [1, 0.82]], taper: 0.12 },
    wing: 'none', rim: 'steel', extras: { roofRack: true, spare: true }, exhaust: [0.6],
  },
  pickup: {
    length: 5.4, width: 2.02, wheelbase: 3.3, axleShift: 0.2, track: 1.74, wheelR: 0.42, wheelW: 0.3, ride: 0.3,
    top: [[0, 1.18], [0.03, 1.24], [0.4, 1.24], [0.45, 1.22], [0.8, 1.2], [0.95, 1.14], [1, 0.95]],
    plan: [[0, 0.97], [0.06, 1], [0.94, 1], [1, 0.93]],
    roundness: 7,
    cabin: { from: 0.42, to: 0.76, roof: [[0, 1.9], [0.08, 1.96], [0.72, 1.96], [1, 1.28]], width: [[0, 0.86], [0.5, 0.88], [1, 0.84]], taper: 0.1 },
    wing: 'none', rim: 'steel', extras: { bed: true, roofRack: true }, exhaust: [0.65],
  },
  classic: {
    length: 4.3, width: 1.72, wheelbase: 2.45, axleShift: 0.0, track: 1.42, wheelR: 0.33, wheelW: 0.2, ride: 0.18,
    top: [[0, 0.74], [0.05, 0.86], [0.2, 0.9], [0.5, 0.86], [0.8, 0.88], [0.95, 0.8], [1, 0.6]],
    plan: [[0, 0.8], [0.12, 1], [0.5, 0.9], [0.88, 1], [1, 0.8]],
    roundness: 2.4,
    cabin: { from: 0.28, to: 0.65, roof: [[0, 0.88], [0.3, 1.28], [0.65, 1.3], [1, 0.88]], width: [[0, 0.7], [0.5, 0.78], [1, 0.7]], taper: 0.28 },
    wing: 'none', rim: 'mesh', extras: { chrome: true }, exhaust: [0.35],
  },
};

/** Curated paints; the auto paint is picked from the car id so each car keeps its color. */
export const PAINTS = ['#e0145f', '#d91a1a', '#ff6a13', '#f4c20d', '#7ac70c', '#0fb5c4', '#1f5fd6', '#23233a', '#e8e8ea', '#9aa3b5', '#101014', '#6b2bd9'];

export function autoPaint(carOrdinal: number): string {
  // integer hash so neighbouring ids get different colors
  let h = carOrdinal * 2654435761;
  h ^= h >>> 15;
  return PAINTS[Math.abs(h) % PAINTS.length];
}

/**
 * Best guess from what the packet tells us. The game does not send the model,
 * so this is a heuristic the user can correct (and the correction is learned
 * per game-reported car category).
 */
export function guessStyle(f: Pick<Frame, 'carClass' | 'carPerformanceIndex' | 'drivetrainType' | 'numCylinders'>): BodyStyle {
  const { carClass: c, carPerformanceIndex: pi, drivetrainType: dt, numCylinders: cyl } = f;
  const FWD = 0, RWD = 1, AWD = 2;
  if (c >= 5 || pi >= 900) return cyl <= 4 ? 'sports' : 'hyper';
  if (c === 4) return dt === FWD ? 'hatch' : 'sports';
  if (dt === FWD) return 'hatch';
  if (dt === RWD && cyl >= 8) return c <= 1 ? 'classic' : 'muscle';
  if (dt === AWD && cyl <= 5) return 'rally';
  if (dt === AWD && cyl >= 8 && c <= 2) return 'suv';
  if (c === 0) return 'classic';
  return dt === RWD ? 'sports' : 'sedan';
}
