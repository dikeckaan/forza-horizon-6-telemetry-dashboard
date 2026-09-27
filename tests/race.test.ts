import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RaceTracker } from '../src/shared/race';
import { LapTracker } from '../src/shared/laps';
import { decodeFhs } from '../src/shared/fhs';
import { parsePacket, type Frame } from '../src/shared/packet';

const base = parsePacket(new ArrayBuffer(324))!;
const fr = (p: Partial<Frame>): Frame => ({ ...base, isRaceOn: true, ...p });

function sprint(rt: RaceTracker, length: number, speed: number, startX = 100) {
  for (let t = 0; t * speed <= length; t += 0.1) {
    rt.push(fr({ racePosition: 1, currentRaceTime: t, distanceTraveled: t * speed, positionX: startX + t * speed, positionZ: 0, speed }));
  }
  // back to free roam
  rt.push(fr({ racePosition: 0, currentRaceTime: 0.2 }));
}

describe('RaceTracker', () => {
  it('learns a sprint route and then reports progress and delta', () => {
    const rt = new RaceTracker();
    sprint(rt, 3000, 30);
    const key = Object.keys(rt.routes)[0];
    expect(rt.routes[key].distance).toBeGreaterThan(2950);
    expect(rt.routes[key].bestTime).toBeCloseTo(100, 0);

    // second run, 25 m/s: at 1500 m we are 60 s in vs 50 s best
    for (let t = 0; t * 25 <= 1500; t += 0.1) {
      rt.push(fr({ racePosition: 2, currentRaceTime: t, distanceTraveled: t * 25, positionX: 100 + t * 25, speed: 25 }));
    }
    expect(rt.event!.kind).toBe('sprint');
    expect(rt.progress()!).toBeCloseTo(0.5, 1);
    expect(rt.delta()).toBeCloseTo(10, 0);
  });

  it('an abandoned first run does not become the best run', () => {
    const rt = new RaceTracker();
    sprint(rt, 1000, 40); // quit early
    sprint(rt, 3000, 30); // full run
    const r = Object.values(rt.routes)[0];
    expect(r.distance).toBeGreaterThan(2950);
    expect(r.bestTime).toBeGreaterThan(90);
    expect(r.runs).toBe(2);
  });

  it('handles the real FH6 sprint capture with a rewind', () => {
    const rt = new RaceTracker();
    const lt = new LapTracker();
    for (const r of decodeFhs(readFileSync(join(__dirname, 'fixtures/fh6-sprint-rewind.fhs'))).records) {
      const f = parsePacket(r.packet)!;
      rt.push(f);
      lt.push(f);
    }
    const e = rt.event!;
    expect(e.kind).toBe('sprint');
    expect(e.rewinds).toBe(1);
    expect(e.position).toBe(1);
    expect(e.distance).toBeGreaterThan(2600);
    // samples stay monotonic after the rewind trimmed the undone part
    for (let i = 1; i < e.samples.length; i++) expect(e.samples[i].t).toBeGreaterThan(e.samples[i - 1].t);
    // the rewind must not have been treated as a new race
    expect(lt.current!.samples.length).toBeGreaterThan(800);
  });
});

describe('LapTracker rewind', () => {
  it('rewinding across the line restores the previous lap', () => {
    const lt = new LapTracker();
    for (let i = 0; i <= 100; i++) lt.push(fr({ lapNumber: 0, distanceTraveled: i * 10, currentLap: i * 0.1, currentRaceTime: i * 0.1 }));
    for (let i = 1; i <= 20; i++) lt.push(fr({ lapNumber: 1, distanceTraveled: 1000 + i * 10, currentLap: i * 0.1, lastLap: 10, currentRaceTime: 10 + i * 0.1 }));
    expect(lt.laps).toHaveLength(1);
    // rewind 3 s → back in lap 0 at 9 s
    lt.push(fr({ lapNumber: 0, distanceTraveled: 900, currentLap: 9, currentRaceTime: 9 }));
    expect(lt.laps).toHaveLength(0);
    expect(lt.current!.number).toBe(0);
    expect(lt.current!.samples.at(-1)!.t).toBeLessThanOrEqual(9);
  });
});
