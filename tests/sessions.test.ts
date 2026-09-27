import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Recorder, listSessions, sessionToCsv, deleteSession } from '../src/main/sessions';
import { decodeFhs } from '../src/shared/fhs';
import { parsePacket } from '../src/shared/packet';

const fixture = readFileSync(join(__dirname, 'fixtures/fh6-freeroam.fhs'));

describe('real FH6 capture', () => {
  it('parses every packet with plausible values', () => {
    const { records } = decodeFhs(fixture);
    expect(records.length).toBeGreaterThan(1000);
    const frames = records.map((r) => parsePacket(r.packet)!);
    const on = frames.filter((f) => f.isRaceOn);
    expect(on.length).toBeGreaterThan(500);
    for (const f of on) {
      expect(f.format).toBe('FH');
      expect(f.engineMaxRpm).toBeGreaterThan(1000);
      expect(f.speed).toBeGreaterThanOrEqual(0);
      expect(f.speed).toBeLessThan(150);
      expect(f.gear).toBeLessThanOrEqual(11);
      expect(f.accel).toBeLessThanOrEqual(255);
    }
    expect(Math.max(...on.map((f) => f.speed * 3.6))).toBeGreaterThan(100);
  });
});

describe('Recorder', () => {
  it('records race-on packets, closes after idle and lists with metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fhs-'));
    const rec = new Recorder(dir);
    const { records } = decodeFhs(fixture);
    let now = 1_000_000;
    for (const r of records) {
      now += 16;
      rec.push(r.packet, parsePacket(r.packet)!, now);
    }
    expect(rec.active).toBe(true);
    rec.tick(now + 21000);
    expect(rec.active).toBe(false);
    const list = listSessions(dir);
    expect(list).toHaveLength(1);
    expect(list[0].carOrdinal).toBe(3413);
    expect(list[0].maxSpeed * 3.6).toBeGreaterThan(100);
    expect(list[0].distance).toBeGreaterThan(100);

    const csv = sessionToCsv(readFileSync(join(dir, list[0].name)));
    const lines = csv.split('\n');
    expect(lines[0]).toContain('currentEngineRpm');
    expect(lines[0]).toContain('tireTempFL');
    expect(lines.length).toBe(list[0].packets + 1);

    deleteSession(dir, list[0].name);
    expect(listSessions(dir)).toHaveLength(0);
  });
});
