import type { UnitPrefs } from './units';

export interface Settings {
  port: number;
  units: UnitPrefs;
  forward: { enabled: boolean; host: string; port: number };
  demo: boolean;
  record: boolean;
  carNames: Record<string, string>;
}

export interface Status {
  listening: boolean;
  port: number;
  error: string | null;
  packetsPerSec: number;
  source: string | null;
  lastPacketAt: number;
  packetSize: number;
  demo: boolean;
  recording: { active: boolean; name: string | null; packets: number };
  localAddresses: string[];
}

export interface SessionMeta {
  name: string;
  startEpochMs: number;
  durationMs: number;
  packets: number;
  bytes: number;
  carOrdinal: number;
  carClass: number;
  pi: number;
  maxSpeed: number;
  distance: number;
}

export interface FhBridge {
  onPacket(cb: (packet: Uint8Array) => void): () => void;
  onStatus(cb: (s: Status) => void): () => void;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  listSessions(): Promise<SessionMeta[]>;
  readSession(name: string): Promise<Uint8Array>;
  deleteSession(name: string): Promise<void>;
  exportCsv(name: string): Promise<string | null>;
  revealSessions(): Promise<void>;
  platform: string;
}

declare global {
  interface Window {
    fh?: FhBridge;
  }
}
