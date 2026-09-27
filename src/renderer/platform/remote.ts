import type { FhBridge, SessionMeta, Settings, Status } from '../../shared/ipc';
import { base64ToBytes, channel, emptyStatus, notHere } from './shared';

/**
 * Bridge for a phone/tablet browser that opened the desktop app's LAN URL.
 * Live packets and status arrive over Server-Sent Events from the desktop.
 */
export function createRemoteBridge(): FhBridge {
  const packets = channel<Uint8Array>();
  const statuses = channel<Status>();
  const settingsCh = channel<Settings>();
  let lastStatus = emptyStatus();

  const connect = () => {
    const es = new EventSource('/api/stream');
    es.addEventListener('packet', (e) => packets.emit(base64ToBytes((e as MessageEvent).data)));
    es.addEventListener('status', (e) => {
      lastStatus = JSON.parse((e as MessageEvent).data);
      statuses.emit(lastStatus);
    });
    es.addEventListener('settings', (e) => settingsCh.emit(JSON.parse((e as MessageEvent).data)));
    es.onerror = () => {
      // desktop app closed or network hiccup: show "waiting" and retry
      statuses.emit({ ...lastStatus, listening: false, error: 'Masaüstü uygulamasına bağlanılamıyor' });
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
    getSettings: () => getJson<Settings>('/api/settings'),
    setSettings: async (patch) => {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      return r.json() as Promise<Settings>;
    },
    listSessions: () => getJson<SessionMeta[]>('/api/sessions'),
    readSession: (name) => getBytes(`/api/sessions/${encodeURIComponent(name)}`),
    readModel: (id) => getBytes(`/api/models/${encodeURIComponent(id)}`),
    deleteSession: notHere('Kayıt silme'),
    deleteAllSessions: notHere('Kayıt silme'),
    exportCsv: notHere('CSV dışa aktarma'),
    revealSessions: notHere('Klasör açma'),
    importModel: notHere('Model yükleme'),
    deleteModel: notHere('Model silme'),
    sfConnect: notHere('Sketchfab bağlantısı'),
    sfDisconnect: notHere('Sketchfab bağlantısı'),
    sfSearch: notHere('Sketchfab araması'),
    sfDownload: notHere('Model indirme'),
    onSfProgress: () => () => {},
    openExternal: async (url) => void window.open(url, '_blank', 'noopener'),
  };
}
