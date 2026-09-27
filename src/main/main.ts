import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { copyFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parsePacket } from '../shared/packet';
import { DemoSim } from '../shared/demo';
import type { Settings, Status } from '../shared/ipc';
import { loadSettings, saveSettings } from './settings';
import { Recorder, deleteAllSessions, deleteSession, listSessions, sessionToCsv } from './sessions';
import { checkToken, downloadModel, searchModels } from './sketchfab';
import type { SketchfabModel } from '../shared/ipc';

const here = fileURLToPath(new URL('.', import.meta.url));
const devUrl = process.env.VITE_DEV_URL;

let win: BrowserWindow | null = null;
let settings: Settings;
let sock: Socket | null = null;
let fwd: Socket | null = null;
let recorder: Recorder;
let demoTimer: NodeJS.Timeout | null = null;

const sessionsDir = () => join(app.getPath('userData'), 'sessions');
const modelsDir = () => join(app.getPath('userData'), 'models');
const safeId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
const tokenFile = () => join(app.getPath('userData'), 'sketchfab.token');

// The Sketchfab token never reaches the renderer; it is kept encrypted by the OS keychain when possible.
function saveToken(token: string | null) {
  if (!token) {
    try {
      unlinkSync(tokenFile());
    } catch {
      /* no token stored */
    }
    return;
  }
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(`plain:${token}`);
  writeFileSync(tokenFile(), data);
}
function loadToken(): string | null {
  try {
    const data = readFileSync(tokenFile());
    if (data.subarray(0, 6).toString() === 'plain:') return data.subarray(6).toString();
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
}

const status: Status = {
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
};
let packetCount = 0;

function localAddresses() {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

function handlePacket(buf: Uint8Array, source: string, fromDemo = false) {
  packetCount++;
  status.lastPacketAt = Date.now();
  status.source = source;
  status.packetSize = buf.byteLength;
  const f = parsePacket(buf);
  if (!f) return;
  if (!fromDemo && settings.record) recorder.push(buf, f);
  if (!fromDemo && settings.forward.enabled && fwd) {
    fwd.send(buf, settings.forward.port, settings.forward.host);
  }
  win?.webContents.send('packet', buf);
}

function startUdp() {
  stopUdp();
  status.port = settings.port;
  status.error = null;
  const s = createSocket({ type: 'udp4', reuseAddr: true });
  s.on('message', (msg, rinfo) => {
    // copy out of Node's pooled buffer before sending over IPC
    handlePacket(new Uint8Array(msg), `${rinfo.address}:${rinfo.port}`);
  });
  s.on('error', (err) => {
    status.error = (err as NodeJS.ErrnoException).code === 'EADDRINUSE' ? `Port ${settings.port} kullanımda` : err.message;
    status.listening = false;
    pushStatus();
  });
  s.on('listening', () => {
    status.listening = true;
    pushStatus();
  });
  s.bind(settings.port, '0.0.0.0');
  sock = s;
  fwd = createSocket('udp4');
}

function stopUdp() {
  sock?.close();
  fwd?.close();
  sock = null;
  fwd = null;
  status.listening = false;
}

function applyDemo() {
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
  status.demo = settings.demo;
  if (!settings.demo) return;
  const sim = new DemoSim();
  // warm up so tires and laps look alive
  for (let i = 0; i < 60 * 5; i++) sim.step(1 / 60);
  demoTimer = setInterval(() => handlePacket(new Uint8Array(sim.stepPacket(1 / 60)), 'demo', true), 1000 / 60);
}

function pushStatus() {
  status.recording = { active: recorder.active, name: recorder.name, packets: recorder.packets };
  win?.webContents.send('status', status);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#07080b',
    title: 'FH Telemetry',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(join(here, '../renderer/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => (win = null));

  // Dev aid: FH_CAPTURE=/path/prefix FH_CAPTURE_PAGES=1,2,3 writes a PNG per page after startup.
  const capture = process.env.FH_CAPTURE;
  if (capture) {
    const pages = (process.env.FH_CAPTURE_PAGES ?? '1').split(',');
    win.webContents.once('did-finish-load', async () => {
      for (const p of pages) {
        await new Promise((r) => setTimeout(r, 4000));
        await win?.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${p}' }))`);
        await new Promise((r) => setTimeout(r, 2500));
        const img = await win?.webContents.capturePage();
        if (img) writeFileSync(`${capture}-${p}.png`, img.toPNG());
      }
    });
  }
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const prev = settings;
    settings = { ...settings, ...patch };
    saveSettings(settings);
    if (patch.port !== undefined && patch.port !== prev.port) startUdp();
    if (patch.demo !== undefined && patch.demo !== prev.demo) applyDemo();
    if (patch.record === false) recorder.close();
    pushStatus();
    return settings;
  });
  ipcMain.handle('sessions:list', () => listSessions(sessionsDir()));
  ipcMain.handle('sessions:read', (_e, name: string) => {
    if (name.includes('/') || name.includes('\\')) throw new Error('bad name');
    return new Uint8Array(readFileSync(join(sessionsDir(), name)));
  });
  ipcMain.handle('sessions:delete', (_e, name: string) => deleteSession(sessionsDir(), name));
  ipcMain.handle('sessions:deleteAll', () => deleteAllSessions(sessionsDir(), recorder.name));
  ipcMain.handle('sessions:csv', async (_e, name: string) => {
    if (name.includes('/') || name.includes('\\')) throw new Error('bad name');
    const res = await dialog.showSaveDialog(win!, { defaultPath: name.replace(/\.fhs$/, '.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (res.canceled || !res.filePath) return null;
    writeFileSync(res.filePath, sessionToCsv(readFileSync(join(sessionsDir(), name))));
    return res.filePath;
  });
  ipcMain.handle('sessions:reveal', () => shell.openPath(sessionsDir()));

  ipcMain.handle('models:import', async () => {
    const res = await dialog.showOpenDialog(win!, { title: '3D araç modeli seç', filters: [{ name: 'glTF binary', extensions: ['glb'] }], properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) return settings;
    const id = randomUUID();
    mkdirSync(modelsDir(), { recursive: true });
    copyFileSync(res.filePaths[0], join(modelsDir(), `${id}.glb`));
    settings = { ...settings, customModels: [...settings.customModels, { id, name: basename(res.filePaths[0]).replace(/\.glb$/i, '') }] };
    saveSettings(settings);
    return settings;
  });
  ipcMain.handle('models:read', (_e, id: string) => {
    if (!safeId(id)) throw new Error('bad id');
    return new Uint8Array(readFileSync(join(modelsDir(), `${id}.glb`)));
  });
  ipcMain.handle('open-external', (_e, url: string) => {
    if (/^https:\/\/(sketchfab\.com|polyhaven\.com|github\.com)\//.test(url)) return shell.openExternal(url);
  });
  ipcMain.handle('sf:connect', async (_e, token: string) => {
    const account = await checkToken(token.trim());
    saveToken(token.trim());
    settings = { ...settings, sketchfab: { connected: true, account } };
    saveSettings(settings);
    return settings;
  });
  ipcMain.handle('sf:disconnect', () => {
    saveToken(null);
    settings = { ...settings, sketchfab: { connected: false, account: '' } };
    saveSettings(settings);
    return settings;
  });
  ipcMain.handle('sf:search', (_e, q: string) => searchModels(String(q).slice(0, 120)));
  ipcMain.handle('sf:download', async (_e, m: SketchfabModel) => {
    const token = loadToken();
    if (!token) throw new Error('Önce Ayarlar’dan Sketchfab hesabını bağla');
    if (!/^[a-f0-9]{32}$/.test(m.uid)) throw new Error('bad uid');
    const existing = settings.customModels.find((c) => c.uid === m.uid);
    if (existing) return { settings, id: existing.id };
    const id = randomUUID();
    await downloadModel(m.uid, token, modelsDir(), id, (received, total) => win?.webContents.send('sf:progress', { uid: m.uid, received, total }));
    settings = {
      ...settings,
      customModels: [...settings.customModels, { id, name: m.name, source: 'sketchfab', uid: m.uid, author: m.author, license: m.license, viewerUrl: m.viewerUrl }],
    };
    saveSettings(settings);
    return { settings, id };
  });
  ipcMain.handle('models:delete', (_e, id: string) => {
    if (!safeId(id)) throw new Error('bad id');
    try {
      unlinkSync(join(modelsDir(), `${id}.glb`));
    } catch {
      /* already gone */
    }
    const drop = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== id));
    settings = { ...settings, customModels: settings.customModels.filter((m) => m.id !== id), carModels: drop(settings.carModels), categoryModels: drop(settings.categoryModels) };
    saveSettings(settings);
    return settings;
  });
}

app.whenReady().then(() => {
  settings = loadSettings();
  recorder = new Recorder(sessionsDir());
  status.localAddresses = localAddresses();
  registerIpc();
  createWindow();
  startUdp();
  applyDemo();

  setInterval(() => {
    status.packetsPerSec = packetCount;
    packetCount = 0;
    recorder.tick();
    status.localAddresses = localAddresses();
    pushStatus();
  }, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  recorder?.close();
  stopUdp();
});
