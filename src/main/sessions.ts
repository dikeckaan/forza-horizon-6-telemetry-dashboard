import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { decodeFhs, encodeHeader, encodeRecord } from '../shared/fhs';
import { parsePacket, type Frame } from '../shared/packet';
import type { SessionMeta } from '../shared/ipc';

// long enough to survive rewind menus and short pauses
const IDLE_CLOSE_MS = 20000;

/** Records race-on packets into .fhs files, one file per continuous drive. */
export class Recorder {
  private fd: number | null = null;
  private start = 0;
  private lastRaceOn = 0;
  private meta: SessionMeta | null = null;
  private lastPos: [number, number, number] | null = null;
  private lastRaceTime = 0;

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  get active() {
    return this.fd !== null;
  }
  get name() {
    return this.meta?.name ?? null;
  }
  get packets() {
    return this.meta?.packets ?? 0;
  }

  push(packet: Uint8Array, f: Frame, now = Date.now()) {
    if (!f.isRaceOn) {
      this.tick(now);
      return;
    }
    // race clock restarted → a new event gets its own file
    if (this.fd !== null && f.currentRaceTime < 1.5 && this.lastRaceTime > 3) this.close();
    this.lastRaceTime = f.currentRaceTime;
    if (this.fd === null) this.open(now);
    this.lastRaceOn = now;
    writeSync(this.fd!, encodeRecord(now - this.start, packet));
    const m = this.meta!;
    m.packets++;
    m.bytes += packet.byteLength + 6;
    m.durationMs = now - this.start;
    m.carOrdinal = f.carOrdinal;
    m.carClass = f.carClass;
    m.pi = f.carPerformanceIndex;
    if (f.speed > m.maxSpeed) m.maxSpeed = f.speed;
    const p: [number, number, number] = [f.positionX, f.positionY, f.positionZ];
    if (this.lastPos) {
      const step = Math.hypot(p[0] - this.lastPos[0], p[1] - this.lastPos[1], p[2] - this.lastPos[2]);
      // ignore teleports (e.g. fast travel / rewind)
      if (step < 50) m.distance += step;
    }
    this.lastPos = p;
  }

  /** closes the session after a period without race-on packets */
  tick(now = Date.now()) {
    if (this.fd !== null && now - this.lastRaceOn > IDLE_CLOSE_MS) this.close();
  }

  private open(now: number) {
    const d = new Date(now);
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.fhs`;
    this.start = now;
    this.fd = openSync(join(this.dir, name), 'w');
    writeSync(this.fd, encodeHeader(now));
    this.lastPos = null;
    this.meta = { name, startEpochMs: now, durationMs: 0, packets: 0, bytes: 16, carOrdinal: 0, carClass: 0, pi: 0, maxSpeed: 0, distance: 0 };
  }

  close() {
    if (this.fd === null || !this.meta) return;
    closeSync(this.fd);
    const m = this.meta;
    // Very short drives (e.g. a few seconds in a menu transition) are discarded.
    if (m.durationMs < 3000) unlinkSync(join(this.dir, m.name));
    else writeFileSync(join(this.dir, m.name + '.json'), JSON.stringify(m));
    this.fd = null;
    this.meta = null;
  }
}

export function listSessions(dir: string): SessionMeta[] {
  mkdirSync(dir, { recursive: true });
  const out: SessionMeta[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.fhs')) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, f + '.json'), 'utf8')));
    } catch {
      // sidecar missing (e.g. crash while recording) → rebuild it
      try {
        const m = metaFromFile(dir, f);
        writeFileSync(join(dir, f + '.json'), JSON.stringify(m));
        out.push(m);
      } catch {
        /* unreadable file, skip */
      }
    }
  }
  return out.sort((a, b) => b.startEpochMs - a.startEpochMs);
}

function metaFromFile(dir: string, name: string): SessionMeta {
  const data = readFileSync(join(dir, name));
  const fhs = decodeFhs(data);
  const m: SessionMeta = { name, startEpochMs: fhs.startEpochMs, durationMs: fhs.records.at(-1)?.t ?? 0, packets: fhs.records.length, bytes: statSync(join(dir, name)).size, carOrdinal: 0, carClass: 0, pi: 0, maxSpeed: 0, distance: 0 };
  let last: Frame | null = null;
  for (const r of fhs.records) {
    const f = parsePacket(r.packet);
    if (!f) continue;
    m.carOrdinal = f.carOrdinal;
    m.carClass = f.carClass;
    m.pi = f.carPerformanceIndex;
    m.maxSpeed = Math.max(m.maxSpeed, f.speed);
    if (last) {
      const step = Math.hypot(f.positionX - last.positionX, f.positionY - last.positionY, f.positionZ - last.positionZ);
      if (step < 50) m.distance += step;
    }
    last = f;
  }
  return m;
}

export function deleteSession(dir: string, name: string) {
  if (name.includes('/') || name.includes('\\')) throw new Error('bad name');
  for (const p of [name, name + '.json']) {
    try {
      unlinkSync(join(dir, p));
    } catch {
      /* ignore */
    }
  }
}

const CSV_SKIP = new Set(['format', 'size']);

export function sessionToCsv(data: Uint8Array): string {
  const fhs = decodeFhs(data);
  const lines: string[] = [];
  let header: string[] | null = null;
  for (const r of fhs.records) {
    const f = parsePacket(r.packet);
    if (!f) continue;
    const row: (string | number)[] = [r.t];
    const cols: string[] = ['t_ms'];
    for (const [k, v] of Object.entries(f)) {
      if (CSV_SKIP.has(k)) continue;
      if (Array.isArray(v)) {
        ['FL', 'FR', 'RL', 'RR'].forEach((w, i) => {
          cols.push(k + w);
          row.push(v[i]);
        });
      } else if (v !== null) {
        cols.push(k);
        row.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
      }
    }
    if (!header) {
      header = cols;
      lines.push(cols.join(','));
    }
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
