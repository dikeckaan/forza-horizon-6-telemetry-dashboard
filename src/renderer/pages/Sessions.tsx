import { useCallback, useEffect, useState } from 'react';
import type { SessionMeta } from '../../shared/ipc';
import { carClassName, CLASS_COLORS, fmtDuration, speedLabel, speedOf } from '../../shared/units';
import { carName } from '../../shared/cars';
import { useSettings, useStatus, useUnits } from '../hooks';
import { replay } from '../replay';
import { IconDownload, IconFolder, IconPlay, IconTrash } from '../components/icons';
import { locale, t } from '../i18n';

export function SessionsPage({ onOpen }: { onOpen: () => void }) {
  const [list, setList] = useState<SessionMeta[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const u = useUnits();
  const { settings } = useSettings();
  const status = useStatus();
  const recording = status?.recording.active;

  const refresh = useCallback(() => {
    window.fh?.listSessions().then(setList);
  }, []);
  useEffect(refresh, [refresh, recording]);

  const manage = !!window.fh?.caps.manageSessions;
  if (!window.fh?.caps.sessions) {
    return (
      <div className="panel empty" style={{ minHeight: 300 }}>
        <div>
          <h3>{t('sessions.desktopOnlyTitle')}</h3>
          {t('sessions.desktopOnlyBody')}
        </div>
      </div>
    );
  }

  const play = async (m: SessionMeta) => {
    setBusy(m.name);
    try {
      const data = await window.fh!.readSession(m.name);
      replay.load(m.name, data);
      if (replay.truncated) setMsg(t('sessions.truncated'));
      onOpen();
    } catch (e) {
      setMsg(t('sessions.openFailed', { error: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async (m: SessionMeta) => {
    setBusy(m.name);
    const path = await window.fh!.exportCsv(m.name).finally(() => setBusy(null));
    if (path) setMsg(t('sessions.csvSaved', { path }));
  };

  const del = async (m: SessionMeta) => {
    await window.fh!.deleteSession(m.name);
    setConfirm(null);
    refresh();
  };

  return (
    <div className="grid">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 650 }}>{t('sessions.title')}</div>
          <div className="muted" style={{ marginTop: 3 }}>
            {settings.record ? t('sessions.autoOn') : t('sessions.autoOff')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!manage ? null : confirmAll ? (
            <>
              <span style={{ alignSelf: 'center', color: 'var(--bad)' }}>{t('sessions.confirmAll', { count: list?.length ?? 0 })}</span>
              <button
                className="btn danger"
                onClick={async () => {
                  const n = await window.fh!.deleteAllSessions();
                  setConfirmAll(false);
                  setMsg(t('sessions.deleted', { count: n }));
                  refresh();
                }}
              >
                {t('sessions.yesDeleteAll')}
              </button>
              <button className="btn ghost" onClick={() => setConfirmAll(false)}>
                {t('sessions.cancel')}
              </button>
            </>
          ) : (
            <button className="btn ghost danger" disabled={!list?.length} onClick={() => setConfirmAll(true)}>
              <IconTrash width={15} height={15} /> {t('sessions.deleteAll')}
            </button>
          )}
          <button className="btn" onClick={refresh}>
            {t('sessions.refresh')}
          </button>
          {manage && (
            <button className="btn" onClick={() => window.fh!.revealSessions()}>
              <IconFolder width={15} height={15} /> {t('sessions.openFolder')}
            </button>
          )}
        </div>
      </div>
      {msg && (
        <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg}</span>
          <button className="btn ghost" onClick={() => setMsg(null)}>
            {t('sessions.ok')}
          </button>
        </div>
      )}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {list === null ? (
          <div className="empty">{t('sessions.loading')}</div>
        ) : list.length === 0 ? (
          <div className="empty">
            <div>
              <h3>{t('sessions.emptyTitle')}</h3>
              {t('sessions.emptyBody')}
            </div>
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>{t('sessions.colDate')}</th>
                <th>{t('sessions.colCar')}</th>
                <th className="r">{t('sessions.colDuration')}</th>
                <th className="r">{t('sessions.colDistance')}</th>
                <th className="r">{t('sessions.colVmax')}</th>
                <th className="r">{t('sessions.colSize')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const cls = carClassName(m.carClass);
                const live = status?.recording.name === m.name;
                return (
                  <tr key={m.name}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{new Date(m.startEpochMs).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })}</div>
                      <div className="muted mono" style={{ fontSize: 11 }}>
                        {m.name}
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className="class-badge" style={{ height: 22, fontSize: 13 }}>
                          <span style={{ background: CLASS_COLORS[cls] ?? '#888' }}>{cls}</span>
                          <span>{m.pi}</span>
                        </span>
                        {carName(m.carOrdinal, settings.carNames) ?? `#${m.carOrdinal}`}
                      </span>
                    </td>
                    <td className="r mono">{fmtDuration(m.durationMs)}</td>
                    <td className="r mono">{(m.distance / 1000).toFixed(2)} km</td>
                    <td className="r mono">
                      {Math.round(speedOf(m.maxSpeed, u))} <span className="muted">{speedLabel(u)}</span>
                    </td>
                    <td className="r mono muted">{(m.bytes / 1024 / 1024).toFixed(1)} MB</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {live ? (
                        <span className="pill">
                          <span className="dot rec" /> {t('sessions.recording')}
                        </span>
                      ) : confirm === m.name ? (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn danger" onClick={() => del(m)}>
                            {t('sessions.yesDelete')}
                          </button>
                          <button className="btn ghost" onClick={() => setConfirm(null)}>
                            {t('sessions.cancel')}
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn primary" disabled={busy === m.name} onClick={() => play(m)}>
                            <IconPlay width={13} height={13} /> {t('sessions.play')}
                          </button>
                          {manage && (
                            <>
                              <button className="btn" disabled={busy === m.name} onClick={() => exportCsv(m)} title={t('sessions.exportCsv')}>
                                <IconDownload width={15} height={15} /> CSV
                              </button>
                              <button className="btn ghost danger" onClick={() => setConfirm(m.name)} title={t('sessions.delete')}>
                                <IconTrash width={15} height={15} />
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
