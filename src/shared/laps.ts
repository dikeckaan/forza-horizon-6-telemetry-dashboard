import type { Frame } from './packet';

export interface LapSample {
  /** meters from lap start */
  d: number;
  /** seconds from lap start */
  t: number;
  speed: number;
  accel: number;
  brake: number;
  steer: number;
  gear: number;
  rpm: number;
  x: number;
  z: number;
}

export interface Lap {
  number: number;
  /** seconds */
  time: number;
  samples: LapSample[];
  maxSpeed: number;
  carOrdinal: number;
}

/**
 * Splits a frame stream into laps using the game's LapNumber, and computes a
 * distance-based live delta against the best completed lap.
 */
export class LapTracker {
  laps: Lap[] = [];
  current: Lap | null = null;
  private lapStartDist = 0;
  private lastRaceTime = 0;
  /** incremented on every structural change so UIs can cheaply detect updates */
  version = 0;

  reset() {
    this.laps = [];
    this.current = null;
    this.lastRaceTime = 0;
    this.version++;
  }

  get best(): Lap | null {
    let b: Lap | null = null;
    for (const l of this.laps) if (l.time > 0 && (!b || l.time < b.time)) b = l;
    return b;
  }

  push(f: Frame) {
    if (!f.isRaceOn) return;
    // New race detected: race clock went backwards.
    if (f.currentRaceTime + 0.5 < this.lastRaceTime) this.reset();
    this.lastRaceTime = f.currentRaceTime;

    if (!this.current || f.lapNumber !== this.current.number) {
      if (this.current && f.lapNumber === this.current.number + 1) {
        const done = this.current;
        done.time = f.lastLap > 0 ? f.lastLap : (done.samples.at(-1)?.t ?? 0);
        if (done.samples.length > 10) this.laps.push(done);
      } else if (this.current && f.lapNumber < this.current.number) {
        this.reset();
      }
      this.current = { number: f.lapNumber, time: 0, samples: [], maxSpeed: 0, carOrdinal: f.carOrdinal };
      this.lapStartDist = f.distanceTraveled;
      this.version++;
    }

    const c = this.current;
    const d = f.distanceTraveled - this.lapStartDist;
    const last = c.samples.at(-1);
    // Keep samples monotonic in distance so interpolation stays valid.
    if (last && d < last.d) return;
    c.samples.push({
      d,
      t: f.currentLap,
      speed: f.speed,
      accel: f.accel,
      brake: f.brake,
      steer: f.steer,
      gear: f.gear,
      rpm: f.currentEngineRpm,
      x: f.positionX,
      z: f.positionZ,
    });
    if (f.speed > c.maxSpeed) c.maxSpeed = f.speed;
  }

  /** seconds; positive = slower than best. NaN when no reference. */
  delta(): number {
    const best = this.best;
    const cur = this.current;
    if (!best || !cur || cur === best) return NaN;
    const s = cur.samples.at(-1);
    if (!s) return NaN;
    const ref = timeAtDistance(best.samples, s.d);
    return isNaN(ref) ? NaN : s.t - ref;
  }
}

export function timeAtDistance(samples: LapSample[], d: number): number {
  if (samples.length < 2) return NaN;
  if (d <= samples[0].d) return samples[0].t;
  if (d >= samples[samples.length - 1].d) return NaN;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const k = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
  return a.t + (b.t - a.t) * k;
}
