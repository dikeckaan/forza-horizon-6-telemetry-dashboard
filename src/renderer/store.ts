import { parsePacket, type Frame } from '../shared/packet';
import { LapTracker } from '../shared/laps';
import { RaceTracker, type RouteRecord } from '../shared/race';
import { G } from '../shared/units';

/** Channels kept in the rolling history buffer (for charts). */
export const CHANNELS = [
  'speed',
  'rpm',
  'throttle',
  'brake',
  'clutch',
  'handbrake',
  'steer',
  'gear',
  'gLat',
  'gLong',
  'power',
  'torque',
  'boost',
  'tempFL',
  'tempFR',
  'tempRL',
  'tempRR',
  'suspFL',
  'suspFR',
  'suspRL',
  'suspRR',
  'slipFL',
  'slipFR',
  'slipRL',
  'slipRR',
] as const;
export type Channel = (typeof CHANNELS)[number];

const ROUTES_KEY = 'fh.routes.v1';
function loadRoutes(): Record<string, RouteRecord> {
  try {
    return JSON.parse(localStorage.getItem(ROUTES_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const HIST_CAP = 60 * 130; // ~2 min at 60 Hz

export interface TrailPoint {
  x: number;
  z: number;
  speed: number;
  throttle: number;
  brake: number;
}

export type Source = 'live' | 'replay';

class Ring {
  readonly t = new Float64Array(HIST_CAP);
  readonly ch: Record<Channel, Float32Array>;
  len = 0;
  head = 0; // next write index
  constructor() {
    this.ch = Object.fromEntries(CHANNELS.map((c) => [c, new Float32Array(HIST_CAP)])) as Record<Channel, Float32Array>;
  }
  clear() {
    this.len = 0;
    this.head = 0;
  }
  push(t: number, vals: Record<Channel, number>) {
    this.t[this.head] = t;
    for (const c of CHANNELS) this.ch[c][this.head] = vals[c];
    this.head = (this.head + 1) % HIST_CAP;
    if (this.len < HIST_CAP) this.len++;
  }
  /** returns chronologically ordered copies of the last `seconds` of data */
  window(seconds: number, channels: Channel[]): { t: number[]; data: Record<string, number[]> } {
    const t: number[] = [];
    const data: Record<string, number[]> = Object.fromEntries(channels.map((c) => [c, []]));
    if (!this.len) return { t, data };
    const newest = this.t[(this.head - 1 + HIST_CAP) % HIST_CAP];
    const start = (this.head - this.len + HIST_CAP) % HIST_CAP;
    for (let i = 0; i < this.len; i++) {
      const idx = (start + i) % HIST_CAP;
      const ti = this.t[idx];
      if (newest - ti > seconds) continue;
      t.push(ti - newest);
      for (const c of channels) data[c].push(this.ch[c][idx]);
    }
    return { t, data };
  }
}

export class TelemetryStore {
  /** latest frame; while the game is in a menu this stays on the last driving frame */
  frame: Frame | null = null;
  /** whether the most recent packet was race-on */
  raceOn = false;
  source: Source = 'live';
  /** increments on every ingested packet */
  version = 0;
  /** stream time of the last frame in seconds */
  time = 0;
  lastIngestAt = 0;

  hist = new Ring();
  trail: TrailPoint[] = [];
  gTrail: { lat: number; long: number }[] = [];
  laps = new LapTracker();
  /** current event + learned sprint routes (persisted only from live data) */
  race = new RaceTracker(loadRoutes(), (routes) => {
    if (this.source !== 'live') return;
    try {
      localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
    } catch {
      /* storage full or unavailable: progress still works this session */
    }
  });

  odometer = 0;
  maxSpeed = 0;
  peakG = { lat: 0, long: 0, total: 0 };
  maxPower = 0;
  maxTorque = 0;
  /** true once we have seen at least one race-on frame */
  everRaceOn = false;

  private lastPos: [number, number, number] | null = null;
  private gSmooth: { lat: number; long: number } | null = null;
  private listeners = new Set<() => void>();

  reset() {
    this.frame = null;
    this.raceOn = false;
    this.version++;
    this.time = 0;
    this.hist.clear();
    this.trail = [];
    this.gTrail = [];
    this.laps.reset();
    this.race.reset();
    this.race.routes = loadRoutes();
    this.odometer = 0;
    this.maxSpeed = 0;
    this.peakG = { lat: 0, long: 0, total: 0 };
    this.maxPower = 0;
    this.maxTorque = 0;
    this.everRaceOn = false;
    this.lastPos = null;
    this.gSmooth = null;
    this.emit();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const l of this.listeners) l();
  }

  /** t: stream time in seconds (wall-clock for live, recording offset for replay) */
  ingest(packet: Uint8Array | ArrayBuffer, t: number, quiet = false) {
    const f = parsePacket(packet);
    if (!f) return;
    this.time = t;
    this.version++;
    this.lastIngestAt = performance.now();
    this.raceOn = f.isRaceOn;
    if (!f.isRaceOn) {
      // Menu/pause packets are all zeros; keep showing the last driving frame.
      if (!this.frame) this.frame = f;
      if (!quiet) this.emit();
      return;
    }
    this.frame = f;
    this.everRaceOn = true;

    // Light EMA: raw accelerations spike on impacts/landings, which would dominate peaks.
    const rawLat = f.accelerationX / G;
    const rawLong = f.accelerationZ / G;
    const s = this.gSmooth ?? (this.gSmooth = { lat: rawLat, long: rawLong });
    s.lat += (rawLat - s.lat) * 0.35;
    s.long += (rawLong - s.long) * 0.35;
    const gLat = s.lat;
    const gLong = s.long;
    this.hist.push(t, {
      speed: f.speed,
      rpm: f.currentEngineRpm,
      throttle: f.accel / 2.55,
      brake: f.brake / 2.55,
      clutch: f.clutch / 2.55,
      handbrake: f.handBrake / 2.55,
      steer: (f.steer / 127) * 100,
      gear: f.gear,
      gLat,
      gLong,
      power: f.power,
      torque: f.torque,
      boost: f.boost,
      tempFL: f.tireTemp[0],
      tempFR: f.tireTemp[1],
      tempRL: f.tireTemp[2],
      tempRR: f.tireTemp[3],
      suspFL: f.normalizedSuspensionTravel[0],
      suspFR: f.normalizedSuspensionTravel[1],
      suspRL: f.normalizedSuspensionTravel[2],
      suspRR: f.normalizedSuspensionTravel[3],
      slipFL: f.tireCombinedSlip[0],
      slipFR: f.tireCombinedSlip[1],
      slipRL: f.tireCombinedSlip[2],
      slipRR: f.tireCombinedSlip[3],
    });

    // odometer + trail (game reports distance only in events, so integrate ourselves)
    const p: [number, number, number] = [f.positionX, f.positionY, f.positionZ];
    if (this.lastPos) {
      const step = Math.hypot(p[0] - this.lastPos[0], p[1] - this.lastPos[1], p[2] - this.lastPos[2]);
      if (step < 50) this.odometer += step;
    }
    this.lastPos = p;
    const lastTrail = this.trail.at(-1);
    if (!lastTrail || Math.hypot(lastTrail.x - p[0], lastTrail.z - p[2]) > 1.5) {
      this.trail.push({ x: p[0], z: p[2], speed: f.speed, throttle: f.accel / 255, brake: f.brake / 255 });
      if (this.trail.length > 400_000) this.trail.splice(0, 100_000);
    }

    this.gTrail.push({ lat: gLat, long: gLong });
    if (this.gTrail.length > 90) this.gTrail.shift();

    if (f.speed > this.maxSpeed) this.maxSpeed = f.speed;
    if (f.power > this.maxPower) this.maxPower = f.power;
    if (f.torque > this.maxTorque) this.maxTorque = f.torque;
    const tot = Math.hypot(gLat, gLong);
    if (Math.abs(gLat) > this.peakG.lat) this.peakG.lat = Math.abs(gLat);
    if (Math.abs(gLong) > this.peakG.long) this.peakG.long = Math.abs(gLong);
    if (tot > this.peakG.total) this.peakG.total = tot;

    this.laps.push(f);
    this.race.push(f);
    if (!quiet) this.emit();
  }
}

export const store = new TelemetryStore();
