import { describe, expect, it } from 'vitest';
import { LapTracker, timeAtDistance } from '../src/shared/laps';
import { decodeFhs, encodeHeader, encodeRecord } from '../src/shared/fhs';
import { DEFAULT_UNITS, fmtLap, fmtDelta, speedOf, tempOf, gearLabel } from '../src/shared/units';
import { parsePacket, type Frame } from '../src/shared/packet';
import { DemoSim } from '../src/shared/demo';

function frame(p: Partial<Frame>): Frame {
  return { ...parsePacket(new ArrayBuffer(324))!, isRaceOn: true, ...p };
}

describe('LapTracker', () => {
  it('closes laps on lap number change and computes delta vs best', () => {
    const lt = new LapTracker();
    // lap 0: 100 m at 10 m/s → 10 s
    for (let i = 0; i <= 100; i++) lt.push(frame({ lapNumber: 0, distanceTraveled: i * 10, currentLap: i * 0.1, currentRaceTime: i * 0.1 }));
    lt.push(frame({ lapNumber: 1, distanceTraveled: 1000, currentLap: 0, lastLap: 10, currentRaceTime: 10.1 }));
    expect(lt.laps).toHaveLength(1);
    expect(lt.best!.time).toBe(10);
    // lap 1 slower: at 500 m we are at 6 s (best was 5 s)
    for (let i = 1; i <= 50; i++) lt.push(frame({ lapNumber: 1, distanceTraveled: 1000 + i * 10, currentLap: i * 0.12, currentRaceTime: 10 + i * 0.12 }));
    expect(lt.delta()).toBeCloseTo(1.0, 5);
  });

  it('resets when the race clock goes backwards', () => {
    const lt = new LapTracker();
    for (let i = 0; i < 20; i++) lt.push(frame({ lapNumber: 0, distanceTraveled: i, currentLap: i, currentRaceTime: i }));
    lt.push(frame({ lapNumber: 1, distanceTraveled: 20, currentLap: 0, lastLap: 20, currentRaceTime: 20 }));
    expect(lt.laps).toHaveLength(1);
    lt.push(frame({ lapNumber: 0, distanceTraveled: 0, currentLap: 0, currentRaceTime: 0 }));
    expect(lt.laps).toHaveLength(0);
  });

  it('ignores frames when race is off', () => {
    const lt = new LapTracker();
    lt.push(frame({ isRaceOn: false }));
    expect(lt.current).toBeNull();
  });

  it('interpolates time at distance', () => {
    const s = [0, 1, 2].map((i) => ({ d: i * 10, t: i, speed: 0, accel: 0, brake: 0, steer: 0, gear: 0, rpm: 0, x: 0, z: 0 }));
    expect(timeAtDistance(s, 15)).toBeCloseTo(1.5);
    expect(timeAtDistance(s, 25)).toBeNaN();
  });
});

describe('fhs format', () => {
  it('round-trips and tolerates truncation', () => {
    const p = new Uint8Array([1, 2, 3, 4, 5]);
    const parts = [encodeHeader(1700000000000), encodeRecord(0, p), encodeRecord(16, p)];
    const total = parts.reduce((n, x) => n + x.byteLength, 0);
    const all = new Uint8Array(total);
    let o = 0;
    for (const x of parts) {
      all.set(x, o);
      o += x.byteLength;
    }
    const f = decodeFhs(all);
    expect(f.startEpochMs).toBe(1700000000000);
    expect(f.records).toHaveLength(2);
    expect(f.records[1].t).toBe(16);
    expect(Array.from(f.records[1].packet)).toEqual([1, 2, 3, 4, 5]);
    const cut = decodeFhs(all.subarray(0, all.byteLength - 2));
    expect(cut.records).toHaveLength(1);
    expect(cut.truncated).toBe(true);
    expect(() => decodeFhs(new Uint8Array(20))).toThrow();
  });
});

describe('units', () => {
  it('converts', () => {
    expect(speedOf(10, DEFAULT_UNITS)).toBeCloseTo(36);
    expect(speedOf(10, { ...DEFAULT_UNITS, speed: 'mph' })).toBeCloseTo(22.369);
    expect(tempOf(212, DEFAULT_UNITS)).toBeCloseTo(100);
    expect(fmtLap(83.456)).toBe('1:23.456');
    expect(fmtDelta(-0.25)).toBe('−0.250');
    expect(gearLabel(0)).toBe('R');
    expect(gearLabel(3)).toBe('3');
  });
});

describe('DemoSim', () => {
  it('produces parseable, plausible packets and completes laps', () => {
    const sim = new DemoSim();
    const lt = new LapTracker();
    let f!: Frame;
    for (let i = 0; i < 60 * 400; i++) {
      f = parsePacket(sim.stepPacket(1 / 60))!;
      lt.push(f);
    }
    expect(f.isRaceOn).toBe(true);
    expect(f.currentEngineRpm).toBeGreaterThan(800);
    expect(f.currentEngineRpm).toBeLessThanOrEqual(8200);
    expect(f.gear).toBeGreaterThanOrEqual(1);
    expect(lt.laps.length).toBeGreaterThanOrEqual(1);
  });
});
