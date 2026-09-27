import type { Frame } from './packet';
import { timeAtDistance, type LapSample } from './laps';

export type EventKind = 'freeroam' | 'circuit' | 'sprint';

export interface RouteRecord {
  /** longest distance ever reached on this route (≈ finish distance) */
  distance: number;
  /** best finishing time in seconds, 0 if never finished */
  bestTime: number;
  /** samples of the best run, decimated to ~5 m */
  bestSamples: LapSample[];
  runs: number;
}

export interface RaceEvent {
  kind: EventKind;
  /** route key from the start position; null when joined mid-race */
  routeKey: string | null;
  startedAt: number;
  distance: number;
  time: number;
  position: number;
  bestPosition: number;
  rewinds: number;
  samples: LapSample[];
}

/** a new event starts when the race clock restarts from ~0 */
const isRestart = (prevTime: number, t: number) => t < 1.5 && prevTime > 3;
/** fraction of the known route distance that counts as a finish */
const FINISH_RATIO = 0.97;

export const routeKeyOf = (x: number, z: number) => `${Math.round(x / 25)}:${Math.round(z / 25)}`;

/**
 * Tracks the current event (free roam, circuit or sprint), handles rewinds and
 * learns route lengths so sprint progress (%) and a best-run delta can be shown.
 */
export class RaceTracker {
  event: RaceEvent | null = null;
  routes: Record<string, RouteRecord>;
  version = 0;
  private lastTime = 0;
  private onRoutesChange?: (routes: Record<string, RouteRecord>) => void;

  constructor(routes: Record<string, RouteRecord> = {}, onRoutesChange?: (r: Record<string, RouteRecord>) => void) {
    this.routes = routes;
    this.onRoutesChange = onRoutesChange;
  }

  reset() {
    this.event = null;
    this.lastTime = 0;
    this.version++;
  }

  get route(): RouteRecord | null {
    const k = this.event?.routeKey;
    return k ? (this.routes[k] ?? null) : null;
  }

  /** 0..1 when the route length is known */
  progress(): number | null {
    const r = this.route;
    const e = this.event;
    if (!r || !e || e.kind !== 'sprint' || r.distance < 100) return null;
    return Math.min(1, e.distance / r.distance);
  }

  /** seconds vs the best finished run on this route; NaN without reference */
  delta(): number {
    const r = this.route;
    const s = this.event?.samples.at(-1);
    if (!r || !s || !r.bestSamples.length) return NaN;
    const ref = timeAtDistance(r.bestSamples, s.d);
    return isNaN(ref) ? NaN : s.t - ref;
  }

  push(f: Frame) {
    if (!f.isRaceOn) return;
    const t = f.currentRaceTime;
    const inRace = f.racePosition > 0;

    if (this.event && isRestart(this.lastTime, t)) this.finish();
    else if (this.event && (this.event.kind === 'freeroam') !== !inRace) this.finish();

    if (!this.event) {
      this.event = {
        kind: !inRace ? 'freeroam' : f.lapNumber > 0 ? 'circuit' : 'sprint',
        routeKey: inRace && t < 2 ? routeKeyOf(f.positionX, f.positionZ) : null,
        startedAt: t,
        distance: 0,
        time: 0,
        position: f.racePosition,
        bestPosition: f.racePosition || 99,
        rewinds: 0,
        samples: [],
      };
      this.version++;
    }
    const e = this.event;

    // Rewind: clock jumps back a little within the same event → drop the future.
    if (t + 0.05 < this.lastTime && !isRestart(this.lastTime, t)) {
      e.rewinds++;
      while (e.samples.length && e.samples[e.samples.length - 1].t > t) e.samples.pop();
      this.version++;
    }
    this.lastTime = t;

    if (e.kind === 'sprint' && f.lapNumber > 0) e.kind = 'circuit';
    e.time = t;
    e.distance = f.distanceTraveled;
    e.position = f.racePosition;
    if (f.racePosition > 0 && f.racePosition < e.bestPosition) e.bestPosition = f.racePosition;

    if (e.kind !== 'freeroam') {
      const last = e.samples.at(-1);
      if (!last || f.distanceTraveled - last.d >= 5) {
        e.samples.push({
          d: f.distanceTraveled,
          t,
          speed: f.speed,
          accel: f.accel,
          brake: f.brake,
          steer: f.steer,
          gear: f.gear,
          rpm: f.currentEngineRpm,
          x: f.positionX,
          z: f.positionZ,
        });
      }
    }
  }

  /** closes the current event and learns from it (route length, best run) */
  finish() {
    const e = this.event;
    this.event = null;
    this.version++;
    if (!e || e.kind !== 'sprint' || !e.routeKey || e.distance < 200) return;
    const prev = this.routes[e.routeKey];
    const known = prev?.distance ?? 0;
    const rec: RouteRecord = prev ? { ...prev } : { distance: 0, bestTime: 0, bestSamples: [], runs: 0 };
    // A run clearly longer than anything before means earlier "finishes" were abandoned runs.
    if (known > 0 && e.distance * FINISH_RATIO > known) {
      rec.bestTime = 0;
      rec.bestSamples = [];
    }
    const finished = e.distance >= Math.max(known, e.distance) * FINISH_RATIO;
    rec.runs++;
    rec.distance = Math.max(rec.distance, e.distance);
    if (finished && (!rec.bestTime || e.time < rec.bestTime)) {
      rec.bestTime = e.time;
      rec.bestSamples = e.samples;
    }
    this.routes = { ...this.routes, [e.routeKey]: rec };
    this.onRoutesChange?.(this.routes);
  }
}
