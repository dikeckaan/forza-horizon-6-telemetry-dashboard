import type { FhBridge, SessionMeta, Settings, Status } from '../../shared/ipc';
import { base64ToBytes, channel, emptyStatus, notHere } from './shared';
import { t } from '../i18n';

/**
 * Bridge for a phone/tablet browser that opened the desktop app's LAN URL.
 * Live packets and status arrive over Server-Sent Events from the desktop.
 */
export function createRemoteBridge(): FhBridge {
  // the LAN key arrives in the QR/URL (?k=…); keep it for reloads, then tidy the address bar
  const fromUrl = new URLSearchParams(location.search).get('k');
  if (fromUrl) {
    try {
      sessionStorage.setItem('fh.k', fromUrl);
    } catch {
      /* private mode: key only lives in memory */
    }
  }
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem('fh.k');
  } catch {
    /* ignore */
  }
  const key = fromUrl ?? stored ?? '';
  const api = (path: string) => `${path}${path.includes('?') ? '&' : '?'}k=${encodeURIComponent(key)}`;

  const packets = channel<Uint8Array>();
  const statuses = channel<Status>();
  const settingsCh = channel<Settings>();
  let lastStatus = emptyStatus();

  const connect = () => {
    const es = new EventSource(api('/api/stream'));
    es.addEventListener('packet', (e) => packets.emit(base64ToBytes((e as MessageEvent).data)));
    es.addEventListener('status', (e) => {
      lastStatus = JSON.parse((e as MessageEvent).data);
      statuses.emit(lastStatus);
    });
    es.addEventListener('settings', (e) => settingsCh.emit(JSON.parse((e as MessageEvent).data)));
    es.onerror = () => {
      // desktop app closed or network hiccup: show "waiting" and retry
      statuses.emit({ ...lastStatus, listening: false, error: t('platform.desktopUnreachable') });
      es.close();
      setTimeout(connect, 2000);
    };
  };
  connect();

  const getJson = async <T>(url: string): Promise<T> => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<T>;
  };
  const getBytes = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };

  return {
    kind: 'remote',
    caps: { sessions: true, manageSessions: false, customModels: true, modelLibrary: false, network: false },
    platform: 'web',
    onPacket: packets.on,
    onStatus: statuses.on,
    onSettings: settingsCh.on,
    getSettings: () => getJson<Settings>(api('/api/settings')),
    setSettings: async (patch) => {
      const r = await fetch(api('/api/settings'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      return r.json() as Promise<Settings>;
    },
    listSessions: () => getJson<SessionMeta[]>(api('/api/sessions')),
    readSession: (name) => getBytes(api(`/api/sessions/${encodeURIComponent(name)}`)),
    readModel: (id) => getBytes(api(`/api/models/${encodeURIComponent(id)}`)),
    deleteSession: notHere('platform.opDeleteRecordings'),
    deleteAllSessions: notHere('platform.opDeleteRecordings'),
    exportCsv: notHere('platform.opExportCsv'),
    revealSessions: notHere('platform.opOpenFolder'),
    importModel: notHere('platform.opImportModel'),
    deleteModel: notHere('platform.opDeleteModel'),
    sfConnect: notHere('platform.opSketchfabConnect'),
    sfDisconnect: notHere('platform.opSketchfabConnect'),
    sfSearch: notHere('platform.opSketchfabSearch'),
    sfDownload: notHere('platform.opDownloadModel'),
    onSfProgress: () => () => {},
    openExternal: async (url) => void window.open(url, '_blank', 'noopener'),
  };
}
