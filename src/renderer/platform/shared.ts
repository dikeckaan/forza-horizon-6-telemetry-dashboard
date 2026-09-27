import type { BridgeCaps, FhBridge, Settings, Status } from '../../shared/ipc';

export const notHere = (what = 'Bu işlem') => () => Promise.reject(new Error(`${what} yalnızca masaüstü uygulamasında yapılabilir`));

export const emptyStatus = (): Status => ({
  listening: false,
  port: 20440,
  error: null,
  packetsPerSec: 0,
  source: null,
  lastPacketAt: 0,
  packetSize: 0,
  demo: false,
  recording: { active: false, name: null, packets: 0 },
  localAddresses: [],
  remote: { running: false, port: 0, clients: 0, error: null },
});

/** tiny event emitter used by the non-desktop bridges */
export function channel<T>() {
  const subs = new Set<(v: T) => void>();
  return {
    emit: (v: T) => subs.forEach((s) => s(v)),
    on: (cb: (v: T) => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type PartialBridge = Omit<FhBridge, 'kind' | 'caps'> & { kind: FhBridge['kind']; caps: BridgeCaps };
export type { Settings };
