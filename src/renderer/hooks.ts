import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { store } from './store';
import type { Frame } from '../shared/packet';
import type { Settings, Status } from '../shared/ipc';
import { DEFAULT_UNITS } from '../shared/units';

// One rAF loop for the whole app: components re-render at most once per
// display frame, and only when a new packet arrived.
const subs = new Set<() => void>();
let lastVersion = -1;
let running = false;
function loop() {
  if (store.version !== lastVersion) {
    lastVersion = store.version;
    for (const s of subs) s();
  }
  requestAnimationFrame(loop);
}
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
  return () => subs.delete(cb);
}

/** Re-renders the caller whenever a new frame is available (throttled to rAF). */
export function useLive(): number {
  return useSyncExternalStore(subscribe, () => store.version);
}

let zero: Frame | null = null;
export function useFrame(): Frame {
  useLive();
  if (store.frame) return store.frame;
  if (!zero) {
    zero = {
      format: 'FH', size: 324, isRaceOn: false, timestampMs: 0, engineMaxRpm: 8000, engineIdleRpm: 800, currentEngineRpm: 0,
      accelerationX: 0, accelerationY: 0, accelerationZ: 0, velocityX: 0, velocityY: 0, velocityZ: 0,
      angularVelocityX: 0, angularVelocityY: 0, angularVelocityZ: 0, yaw: 0, pitch: 0, roll: 0,
      normalizedSuspensionTravel: [0, 0, 0, 0], tireSlipRatio: [0, 0, 0, 0], wheelRotationSpeed: [0, 0, 0, 0],
      wheelOnRumbleStrip: [0, 0, 0, 0], wheelInPuddleDepth: [0, 0, 0, 0], surfaceRumble: [0, 0, 0, 0],
      tireSlipAngle: [0, 0, 0, 0], tireCombinedSlip: [0, 0, 0, 0], suspensionTravelMeters: [0, 0, 0, 0],
      carOrdinal: 0, carClass: 0, carPerformanceIndex: 0, drivetrainType: 0, numCylinders: 0,
      horizonCarCategory: 0, horizonUnknown1: 0, horizonUnknown2: 0, positionX: 0, positionY: 0, positionZ: 0,
      speed: 0, power: 0, torque: 0, tireTemp: [0, 0, 0, 0], boost: 0, fuel: 0, distanceTraveled: 0,
      bestLap: 0, lastLap: 0, currentLap: 0, currentRaceTime: 0, lapNumber: 0, racePosition: 0,
      accel: 0, brake: 0, clutch: 0, handBrake: 0, gear: 0, steer: 0, normalizedDrivingLine: 0,
      normalizedAIBrakeDifference: 0, tireWear: null, trackOrdinal: null,
    };
  }
  return zero;
}

// ---- settings & status ----

export const FALLBACK_SETTINGS: Settings = {
  port: 20440,
  units: DEFAULT_UNITS,
  forward: { enabled: false, host: '127.0.0.1', port: 20441 },
  demo: false,
  record: true,
  carNames: {},
  carStyles: {},
  categoryStyles: {},
  carPaints: {},
};

export interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}
export const SettingsContext = createContext<SettingsCtx>({ settings: FALLBACK_SETTINGS, update: () => {} });
export const useSettings = () => useContext(SettingsContext);
export const useUnits = () => useContext(SettingsContext).settings.units;

export const StatusContext = createContext<Status | null>(null);
export const useStatus = () => useContext(StatusContext);

/** true when no packet arrived for a while */
export function useStale(ms = 2000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  return performance.now() - store.lastIngestAt > ms;
}
