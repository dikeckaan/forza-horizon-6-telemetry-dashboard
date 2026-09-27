import type { Frame } from '../../../shared/packet';
import type { Settings } from '../../../shared/ipc';
import { t } from '../../i18n';

export interface ModelDef {
  id: string;
  label: string;
  /** bundled file under public/models, or null for user-imported models */
  url: string | null;
  /** keep the model's own paint (real replicas); built-ins get recoloured */
  original?: boolean;
  author?: string;
  license?: string;
  viewerUrl?: string;
}

export const BUILTIN_MODELS: ModelDef[] = [
  // getters: the label follows the current UI language
  {
    id: 'italian-v8',
    get label() {
      return t('car.model.italianV8');
    },
    url: './models/italian-v8.glb',
  },
  {
    id: 'concept-gt',
    get label() {
      return t('car.model.conceptGt');
    },
    url: './models/concept-gt.glb',
  },
];

export const PAINTS = ['#c8102e', '#e0145f', '#ff6a13', '#f4c20d', '#7ac70c', '#0fb5c4', '#1f5fd6', '#1b2a4a', '#e8e8ea', '#9aa3b5', '#101014', '#6b2bd9'];

export function autoPaint(carOrdinal: number): string {
  let h = Math.imul(carOrdinal, 2654435761);
  h ^= h >>> 15;
  return PAINTS[Math.abs(h) % PAINTS.length];
}

/** The game does not say which model it is; pick something plausible. */
function guessModel(f: Frame): string {
  return f.carClass >= 4 || (f.drivetrainType === 1 && f.numCylinders >= 8) ? 'italian-v8' : 'concept-gt';
}

export type ModelSource = 'user' | 'learned' | 'guess';

export function allModels(s: Settings): ModelDef[] {
  return [
    ...BUILTIN_MODELS,
    // user models live on the desktop; phones only see them through the LAN server
    ...(typeof window !== 'undefined' && window.fh?.caps.customModels ? s.customModels : []).map((m) => ({ id: m.id, label: m.name, url: null, original: true, author: m.author, license: m.license, viewerUrl: m.viewerUrl })),
  ];
}

/** user choice for this car → choice learned for its game category → guess */
export function resolveModel(f: Frame, s: Settings): { model: ModelDef; source: ModelSource } {
  const models = allModels(s);
  const find = (id?: string) => models.find((m) => m.id === id);
  const own = find(s.carModels[String(f.carOrdinal)]);
  if (own) return { model: own, source: 'user' };
  const cat = f.horizonCarCategory ? find(s.categoryModels[String(f.horizonCarCategory)]) : undefined;
  if (cat) return { model: cat, source: 'learned' };
  return { model: find(guessModel(f))!, source: 'guess' };
}
