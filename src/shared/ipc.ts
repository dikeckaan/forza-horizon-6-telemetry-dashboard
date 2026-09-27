import type { UnitPrefs } from './units';

export interface Settings {
  port: number;
  units: UnitPrefs;
  forward: { enabled: boolean; host: string; port: number };
  demo: boolean;
  record: boolean;
  carNames: Record<string, string>;
  /** 3D model chosen by the user, per car ordinal */
  carModels: Record<string, string>;
  /** 3D model learned per game-reported car category (horizon block) */
  categoryModels: Record<string, string>;
  /** paint chosen by the user, per car ordinal */
  carPaints: Record<string, string>;
  /** user-imported .glb models (files live in userData/models) */
  customModels: CustomModel[];
  /** models whose front/back auto-detection was corrected */
  modelFlips: Record<string, boolean>;
  /** Sketchfab account link (the token itself stays encrypted in the main process) */
  sketchfab: { connected: boolean; account: string };
  /** download a matching Sketchfab model automatically when a new car shows up */
  autoModels: boolean;
  /** 3D scene look */
  scene: 'day' | 'sunset' | 'night';
  /** post-processing (bloom, ambient occlusion…) */
  fx: boolean;
}

export interface CustomModel {
  id: string;
  name: string;
  source?: 'file' | 'sketchfab';
  uid?: string;
  author?: string;
  license?: string;
  viewerUrl?: string;
}

export interface SketchfabModel {
  uid: string;
  name: string;
  author: string;
  license: string;
  faces: number;
  glbBytes: number;
  thumbnail: string;
  viewerUrl: string;
}

export interface DownloadProgress {
  uid: string;
  received: number;
  total: number;
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
  importModel(): Promise<Settings>;
  readModel(id: string): Promise<Uint8Array>;
  deleteModel(id: string): Promise<Settings>;
  sfConnect(token: string): Promise<Settings>;
  sfDisconnect(): Promise<Settings>;
  sfSearch(query: string): Promise<SketchfabModel[]>;
  /** downloads and registers the model; returns the new settings and the model id */
  sfDownload(model: SketchfabModel): Promise<{ settings: Settings; id: string }>;
  onSfProgress(cb: (p: DownloadProgress) => void): () => void;
  openExternal(url: string): Promise<void>;
  platform: string;
}

declare global {
  interface Window {
    fh?: FhBridge;
  }
}
