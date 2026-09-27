import { decodeFhs, type FhsRecord } from '../shared/fhs';
import { store } from './store';

/** Plays a recorded .fhs session back through the same store the live view uses. */
class ReplayController {
  records: FhsRecord[] = [];
  name: string | null = null;
  startEpochMs = 0;
  playing = false;
  speed = 1;
  /** current position in ms */
  position = 0;
  truncated = false;
  private idx = 0;
  private wallStart = 0;
  private posStart = 0;
  private raf = 0;
  private listeners = new Set<() => void>();

  get active() {
    return this.name !== null;
  }
  get duration() {
    return this.records.at(-1)?.t ?? 0;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  load(name: string, data: Uint8Array) {
    const f = decodeFhs(data);
    this.records = f.records;
    this.truncated = f.truncated;
    this.startEpochMs = f.startEpochMs;
    this.name = name;
    store.source = 'replay';
    this.seek(0);
    this.play();
  }

  exit() {
    this.pause();
    this.name = null;
    this.records = [];
    store.source = 'live';
    store.reset();
    this.emit();
  }

  play() {
    if (!this.active) return;
    if (this.position >= this.duration) this.seek(0);
    this.playing = true;
    this.wallStart = performance.now();
    this.posStart = this.position;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
    this.emit();
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(s: number) {
    this.speed = s;
    if (this.playing) this.play();
    else this.emit();
  }

  seek(ms: number) {
    ms = Math.max(0, Math.min(this.duration, ms));
    store.reset();
    this.idx = 0;
    while (this.idx < this.records.length && this.records[this.idx].t <= ms) {
      const r = this.records[this.idx++];
      store.ingest(r.packet, r.t / 1000, true);
    }
    this.position = ms;
    store.emit();
    if (this.playing) {
      this.wallStart = performance.now();
      this.posStart = ms;
    }
    this.emit();
  }

  private tick = () => {
    if (!this.playing) return;
    const target = this.posStart + (performance.now() - this.wallStart) * this.speed;
    let any = false;
    while (this.idx < this.records.length && this.records[this.idx].t <= target) {
      const r = this.records[this.idx++];
      store.ingest(r.packet, r.t / 1000, true);
      any = true;
    }
    this.position = Math.min(target, this.duration);
    if (any) store.emit();
    this.emit();
    if (this.idx >= this.records.length) {
      this.playing = false;
      this.emit();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}

export const replay = new ReplayController();
