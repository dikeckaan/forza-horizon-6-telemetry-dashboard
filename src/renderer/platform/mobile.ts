import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { FhBridge, Settings, Status } from '../../shared/ipc';
import { DemoSim } from '../../shared/demo';
import { FALLBACK_SETTINGS } from '../hooks';
import { base64ToBytes, channel, emptyStatus, notHere } from './shared';

interface UdpTelemetryPlugin {
  start(o: { port: number }): Promise<void>;
  stop(): Promise<void>;
  getAddresses(): Promise<{ addresses: string[] }>;
  addListener(e: 'packet', cb: (ev: { data: string; from: string }) => void): Promise<PluginListenerHandle>;
}

const Udp = registerPlugin<UdpTelemetryPlugin>('UdpTelemetry');
const KEY = 'fh.mobile.settings';

function loadSettings(): Settings {
  try {
    return { ...FALLBACK_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...FALLBACK_SETTINGS };
  }
}

/**
 * Android / iOS: the phone or tablet receives the game's UDP packets itself.
 * Recordings and the model library stay on the desktop app.
 */
export function createMobileBridge(): FhBridge {
  const packets = channel<Uint8Array>();
  const statuses = channel<Status>();
  let settings = loadSettings();
  const status = emptyStatus();
  let count = 0;
  let demo: ReturnType<typeof setInterval> | null = null;

  const deliver = (bytes: Uint8Array, from: string) => {
    count++;
    status.lastPacketAt = Date.now();
    status.source = from;
    status.packetSize = bytes.byteLength;
    packets.emit(bytes);
  };

  Udp.addListener('packet', (e) => deliver(base64ToBytes(e.data), e.from));

  const listen = async () => {
    try {
      await Udp.start({ port: settings.port });
      status.listening = true;
      status.error = null;
    } catch (e) {
      status.listening = false;
      status.error = (e as Error).message;
    }
    status.port = settings.port;
    statuses.emit({ ...status });
  };

  const applyDemo = () => {
    if (demo) clearInterval(demo);
    demo = null;
    status.demo = settings.demo;
    if (!settings.demo) return;
    const sim = new DemoSim();
    demo = setInterval(() => deliver(new Uint8Array(sim.stepPacket(1 / 60)), 'demo'), 1000 / 60);
  };

  listen();
  applyDemo();
  Udp.getAddresses()
    .then((r) => (status.localAddresses = r.addresses))
    .catch(() => {});
  setInterval(() => {
    status.packetsPerSec = count;
    count = 0;
    statuses.emit({ ...status });
  }, 1000);

  return {
    kind: 'mobile',
    caps: { sessions: false, manageSessions: false, customModels: false, modelLibrary: false, network: true },
    platform: 'mobile',
    onPacket: packets.on,
    onStatus: statuses.on,
    getSettings: async () => settings,
    setSettings: async (patch) => {
      const prev = settings;
      settings = { ...settings, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(settings));
      } catch {
        /* storage full: settings still apply for this run */
      }
      if (patch.port !== undefined && patch.port !== prev.port) {
        await Udp.stop();
        await listen();
      }
      if (patch.demo !== undefined && patch.demo !== prev.demo) applyDemo();
      return settings;
    },
    listSessions: async () => [],
    readSession: notHere('Kayıt oynatma'),
    readModel: notHere('Özel modeller'),
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
    openExternal: async (url) => void window.open(url, '_blank'),
  };
}
