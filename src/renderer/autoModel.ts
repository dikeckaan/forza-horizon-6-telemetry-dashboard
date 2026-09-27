import { useEffect, useSyncExternalStore } from 'react';
import type { Settings, SketchfabModel } from '../shared/ipc';
import { knownCarName, searchName } from '../shared/cars';
import { pickBest } from '../shared/modelpick';

export interface DownloadState {
  status: 'idle' | 'searching' | 'downloading' | 'done' | 'error' | 'nomatch';
  ordinal: number;
  label: string;
  uid: string;
  received: number;
  total: number;
  error: string;
}

let state: DownloadState = { status: 'idle', ordinal: 0, label: '', uid: '', received: 0, total: 0, error: '' };
const subs = new Set<() => void>();
const set = (patch: Partial<DownloadState>) => {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
};
export const useDownloadState = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );

let progressHooked = false;
function hookProgress() {
  if (progressHooked || !window.fh) return;
  progressHooked = true;
  window.fh.onSfProgress((p) => {
    if (p.uid === state.uid) set({ received: p.received, total: p.total });
  });
}

/** Downloads a model and assigns it to one car. Shared by auto mode and the library. */
export async function downloadFor(model: SketchfabModel, ordinal: number, update: (patch: Partial<Settings>) => void, current: Settings): Promise<string | null> {
  if (!window.fh) return null;
  hookProgress();
  set({ status: 'downloading', ordinal, label: model.name, uid: model.uid, received: 0, total: model.glbBytes, error: '' });
  try {
    const { settings, id } = await window.fh.sfDownload(model);
    update({ customModels: settings.customModels, carModels: { ...current.carModels, [String(ordinal)]: id } });
    set({ status: 'done' });
    return id;
  } catch (e) {
    set({ status: 'error', error: (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
    return null;
  }
}

const tried = new Set<number>();

/** When a new car shows up, find and fetch its real model from Sketchfab (once per car). */
export function useAutoModel(ordinal: number, settings: Settings, update: (patch: Partial<Settings>) => void) {
  useEffect(() => {
    if (!window.fh || !ordinal || !settings.autoModels || !settings.sketchfab.connected) return;
    // a generic built-in body is only a placeholder; keep real or user-imported models
    const assigned = settings.carModels[String(ordinal)];
    if ((assigned && settings.customModels.some((m) => m.id === assigned)) || tried.has(ordinal)) return;
    const name = knownCarName(ordinal);
    if (!name) return;
    tried.add(ordinal);
    let alive = true;
    (async () => {
      set({ status: 'searching', ordinal, label: name, uid: '', error: '' });
      try {
        const results = await window.fh!.sfSearch(searchName(name));
        const best = pickBest(results, name);
        if (!alive) return;
        if (!best) {
          set({ status: 'nomatch' });
          return;
        }
        await downloadFor(best, ordinal, update, settings);
      } catch (e) {
        set({ status: 'error', error: (e as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
    // settings identity changes often; only the car and the account matter here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordinal, settings.autoModels, settings.sketchfab.connected]);
}
