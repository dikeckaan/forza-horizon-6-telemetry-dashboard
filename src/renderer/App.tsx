import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Settings, Status } from '../shared/ipc';
import { carClassName, CLASS_COLORS, drivetrainName, fmtDuration } from '../shared/units';
import { FALLBACK_SETTINGS, SettingsContext, StatusContext, useFrame, useStale, useStatus, useSettings } from './hooks';
import { replay } from './replay';
import { store } from './store';
import { IconCar, IconChart, IconFlag, IconFolder, IconGauge, IconList, IconMap, IconPause, IconPlay, IconSettings, IconX } from './components/icons';
import { CockpitPage } from './pages/Cockpit';
import { CarPage } from './pages/Car';
import { MapPage } from './pages/MapPage';
import { ChartsPage } from './pages/Charts';
import { LapsPage } from './pages/Laps';
import { SessionsPage } from './pages/Sessions';
import { RawPage } from './pages/Raw';
import { SettingsPage } from './pages/SettingsPage';

type PageId = 'cockpit' | 'car' | 'map' | 'charts' | 'laps' | 'sessions' | 'raw' | 'settings';

const PAGES: { id: PageId; label: string; icon: ReactNode }[] = [
  { id: 'cockpit', label: 'Kokpit', icon: <IconGauge /> },
  { id: 'car', label: 'Araç & Lastikler', icon: <IconCar /> },
  { id: 'map', label: 'Harita', icon: <IconMap /> },
  { id: 'charts', label: 'Grafikler', icon: <IconChart /> },
  { id: 'laps', label: 'Yarış & Turlar', icon: <IconFlag /> },
  { id: 'sessions', label: 'Kayıtlar', icon: <IconFolder /> },
  { id: 'raw', label: 'Ham Veri', icon: <IconList /> },
];

const browserStatus: Status = {
  listening: true,
  port: 20440,
  error: null,
  packetsPerSec: 60,
  source: 'tarayıcı demo',
  lastPacketAt: 0,
  packetSize: 324,
  demo: true,
  recording: { active: false, name: null, packets: 0 },
  localAddresses: ['127.0.0.1'],
};

export function App() {
  const [page, setPage] = useState<PageId>(() => (localStorage.getItem('page') as PageId) || 'cockpit');
  const [settings, setSettings] = useState<Settings>(FALLBACK_SETTINGS);
  const [status, setStatus] = useState<Status | null>(window.fh ? null : browserStatus);

  useEffect(() => {
    try {
      localStorage.setItem('page', page);
    } catch {
      /* storage unavailable */
    }
  }, [page]);

  useEffect(() => {
    if (!window.fh) return;
    window.fh.getSettings().then(setSettings);
    return window.fh.onStatus(setStatus);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    window.fh?.setSettings(patch).then(setSettings);
  }, []);

  // keyboard: 1..8 switch pages, space toggles replay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const n = Number(e.key);
      const all: PageId[] = [...PAGES.map((p) => p.id), 'settings'];
      if (n >= 1 && n <= all.length) setPage(all[n - 1]);
      if (e.key === ' ' && replay.active) {
        e.preventDefault();
        replay.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      <StatusContext.Provider value={status}>
        <div className="app">
          <TitleBar />
          <nav className="nav">
            {PAGES.map((p) => (
              <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => setPage(p.id)} aria-label={p.label}>
                {p.icon}
                <span className="tip">{p.label}</span>
              </button>
            ))}
            <div className="spacer" />
            <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')} aria-label="Ayarlar">
              <IconSettings />
              <span className="tip">Ayarlar</span>
            </button>
          </nav>
          <main className="main">
            <div className="page" key={page}>
              {page === 'cockpit' && <CockpitPage />}
              {page === 'car' && <CarPage />}
              {page === 'map' && <MapPage />}
              {page === 'charts' && <ChartsPage />}
              {page === 'laps' && <LapsPage />}
              {page === 'sessions' && <SessionsPage onOpen={() => setPage('cockpit')} />}
              {page === 'raw' && <RawPage />}
              {page === 'settings' && <SettingsPage />}
            </div>
            {page !== 'sessions' && page !== 'settings' && <WaitingOverlay onSettings={() => setPage('settings')} />}
          </main>
          <ReplayBar />
        </div>
      </StatusContext.Provider>
    </SettingsContext.Provider>
  );
}

function TitleBar() {
  const f = useFrame();
  const status = useStatus();
  const { settings } = useSettings();
  const stale = useStale();
  const replayActive = useSyncExternalStore(replay.subscribe.bind(replay), () => replay.active);
  const cls = carClassName(f.carClass);
  const carName = settings.carNames[String(f.carOrdinal)];

  let conn: ReactNode;
  if (replayActive) conn = <><span className="dot warn" /> Kayıt oynatılıyor</>;
  else if (status?.error) conn = <><span className="dot bad" /> {status.error}</>;
  else if (!stale) conn = <><span className="dot live" /> <b>{status?.demo ? 'Demo' : 'Canlı'}</b> <span className="mono">{status?.packetsPerSec ?? 0}/s</span></>;
  else conn = <><span className="dot" /> Bekleniyor · UDP {status?.port ?? 20440}</>;

  return (
    <header className={`titlebar ${window.fh?.platform === 'darwin' ? 'mac' : ''}`}>
      <div className="brand">
        <div className="brand-mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
        </div>
        FH Telemetry <small>6</small>
      </div>
      {f.carOrdinal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="class-badge">
            <span style={{ background: CLASS_COLORS[cls] ?? '#888' }}>{cls}</span>
            <span>{f.carPerformanceIndex}</span>
          </span>
          <span style={{ fontWeight: 600 }}>{carName ?? `Araç #${f.carOrdinal}`}</span>
          <span className="muted">
            {drivetrainName(f.drivetrainType)} · {f.numCylinders} sil.
          </span>
        </div>
      )}
      <div className="status-pills">
        {status?.recording.active && (
          <span className="pill">
            <span className="dot rec" /> REC <span className="mono">{status.recording.packets}</span>
          </span>
        )}
        {status?.source && !stale && !replayActive && <span className="pill mono">{status.source}</span>}
        <span className="pill">{conn}</span>
      </div>
    </header>
  );
}

function WaitingOverlay({ onSettings }: { onSettings: () => void }) {
  const stale = useStale(2500);
  const status = useStatus();
  useFrame();
  const replayActive = useSyncExternalStore(replay.subscribe.bind(replay), () => replay.active);
  if (replayActive) return null;
  const inMenu = !stale && !store.raceOn;
  if (!stale && !inMenu) return null;
  const ip = status?.localAddresses[0] ?? '—';
  return (
    <div className="waiting">
      <div className="waiting-card">
        <div className="radar" />
        {inMenu ? (
          <>
            <h2>Oyun bağlı — menüde</h2>
            <p>Sürüşe başladığında veriler burada canlanacak.</p>
          </>
        ) : (
          <>
            <h2>Telemetri bekleniyor</h2>
            <p>
              Forza Horizon 6 → <b>Ayarlar › HUD ve Oynanış</b> → <b>Veri Çıkışı: Açık</b>
            </p>
            <p>
              IP: <span className="kbd">{ip}</span> &nbsp; Port: <span className="kbd">{status?.port ?? 20440}</span>
            </p>
            {status?.error && <p style={{ color: 'var(--bad)' }}>{status.error}</p>}
            <p style={{ marginTop: 14 }}>
              <button className="btn" onClick={onSettings}>
                Ayarlar / Demo modu
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ReplayBar() {
  const snap = useSyncExternalStore(replay.subscribe.bind(replay), () => `${replay.active}|${replay.playing}|${Math.floor(replay.position / 100)}|${replay.speed}`);
  void snap;
  if (!replay.active) return null;
  return (
    <div className="replaybar">
      <button className="btn" onClick={() => replay.toggle()} style={{ width: 40, padding: 0, justifyContent: 'center' }}>
        {replay.playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
      </button>
      <span className="mono" style={{ minWidth: 110 }}>
        {fmtDuration(replay.position)} / {fmtDuration(replay.duration)}
      </span>
      <input
        type="range"
        min={0}
        max={replay.duration}
        step={100}
        value={replay.position}
        onChange={(e) => replay.seek(Number(e.target.value))}
      />
      <div className="seg">
        {[0.5, 1, 2, 4, 8].map((s) => (
          <button key={s} className={replay.speed === s ? 'on' : ''} onClick={() => replay.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
      <span className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {replay.name}
      </span>
      <button className="btn ghost" onClick={() => replay.exit()}>
        <IconX width={15} height={15} /> Canlıya dön
      </button>
    </div>
  );
}

