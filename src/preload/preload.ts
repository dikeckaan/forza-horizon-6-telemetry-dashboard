import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DownloadProgress, FhBridge, Settings, Status } from '../shared/ipc';

const bridge: FhBridge = {
  kind: 'desktop',
  caps: { sessions: true, manageSessions: true, customModels: true, modelLibrary: true, network: true },
  onSettings(cb) {
    const h = (_e: IpcRendererEvent, s: Settings) => cb(s);
    ipcRenderer.on('settings', h);
    return () => ipcRenderer.off('settings', h);
  },
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
  deleteAllSessions: () => ipcRenderer.invoke('sessions:deleteAll'),
  exportCsv: (name) => ipcRenderer.invoke('sessions:csv', name),
  revealSessions: () => ipcRenderer.invoke('sessions:reveal'),
  importModel: () => ipcRenderer.invoke('models:import'),
  readModel: (id) => ipcRenderer.invoke('models:read', id),
  deleteModel: (id) => ipcRenderer.invoke('models:delete', id),
  sfConnect: (token) => ipcRenderer.invoke('sf:connect', token),
  sfDisconnect: () => ipcRenderer.invoke('sf:disconnect'),
  sfSearch: (q) => ipcRenderer.invoke('sf:search', q),
  sfDownload: (m) => ipcRenderer.invoke('sf:download', m),
  onSfProgress(cb) {
    const h = (_e: IpcRendererEvent, p: DownloadProgress) => cb(p);
    ipcRenderer.on('sf:progress', h);
    return () => ipcRenderer.off('sf:progress', h);
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('fh', bridge);
