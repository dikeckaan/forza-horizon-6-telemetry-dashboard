import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FhBridge, Status } from '../shared/ipc';

const bridge: FhBridge = {
  onPacket(cb) {
    const h = (_e: IpcRendererEvent, p: Uint8Array) => cb(p);
    ipcRenderer.on('packet', h);
    return () => ipcRenderer.off('packet', h);
  },
  onStatus(cb) {
    const h = (_e: IpcRendererEvent, s: Status) => cb(s);
    ipcRenderer.on('status', h);
    return () => ipcRenderer.off('status', h);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  readSession: (name) => ipcRenderer.invoke('sessions:read', name),
  deleteSession: (name) => ipcRenderer.invoke('sessions:delete', name),
  exportCsv: (name) => ipcRenderer.invoke('sessions:csv', name),
  revealSessions: () => ipcRenderer.invoke('sessions:reveal'),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('fh', bridge);
