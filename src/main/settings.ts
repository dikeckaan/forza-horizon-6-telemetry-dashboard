import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Settings } from '../shared/ipc';
import { DEFAULT_UNITS } from '../shared/units';

export const DEFAULT_SETTINGS: Settings = {
  port: 20440,
  units: DEFAULT_UNITS,
  forward: { enabled: false, host: '127.0.0.1', port: 20441 },
  demo: false,
  record: true,
  carNames: {},
  carModels: {},
  categoryModels: {},
  carPaints: {},
  customModels: [],
  modelFlips: {},
  sketchfab: { connected: false, account: '' },
  autoModels: true,
  scene: 'day',
  ground: 'wet',
  fx: true,
};

const file = () => join(app.getPath('userData'), 'settings.json');

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8'));
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      units: { ...DEFAULT_SETTINGS.units, ...raw.units },
      forward: { ...DEFAULT_SETTINGS.forward, ...raw.forward },
      sketchfab: { ...DEFAULT_SETTINGS.sketchfab, ...raw.sketchfab },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings) {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(file(), JSON.stringify(s, null, 2));
}
