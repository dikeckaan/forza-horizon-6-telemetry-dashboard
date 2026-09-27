import { useCallback, useEffect, useState } from 'react';
import type { SessionMeta } from '../../shared/ipc';
import { carClassName, CLASS_COLORS, fmtDuration, speedLabel, speedOf } from '../../shared/units';
import { useSettings, useStatus, useUnits } from '../hooks';
import { replay } from '../replay';
import { IconDownload, IconFolder, IconPlay, IconTrash } from '../components/icons';

export function SessionsPage({ onOpen }: { onOpen: () => void }) {
  const [list, setList] = useState<SessionMeta[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const u = useUnits();
  const { settings } = useSettings();
  const status = useStatus();
  const recording = status?.recording.active;

  const refresh = useCallback(() => {
    window.fh?.listSessions().then(setList);
  }, []);
  useEffect(refresh, [refresh, recording]);

  if (!window.fh) {
    return (
      <div className="panel empty" style={{ minHeight: 300 }}>
        <div>
          <h3>Kayıtlar masaüstü uygulamasında</h3>Tarayıcı önizlemesinde disk erişimi yok.
        </div>
      </div>
    );
  }

  const play = async (m: SessionMeta) => {
    setBusy(m.name);
    try {
      const data = await window.fh!.readSession(m.name);
      replay.load(m.name, data);
      if (replay.truncated) setMsg('Kayıt yarım kalmış — okunabilen kısım yüklendi.');
      onOpen();
    } catch (e) {
      setMsg(`Açılamadı: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async (m: SessionMeta) => {
    setBusy(m.name);
    const path = await window.fh!.exportCsv(m.name).finally(() => setBusy(null));
    if (path) setMsg(`CSV kaydedildi: ${path}`);
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
          <div style={{ fontSize: 18, fontWeight: 650 }}>Kayıtlı sürüşler</div>
          <div className="muted" style={{ marginTop: 3 }}>
            {settings.record ? 'Her sürüş otomatik kaydedilir (menüde ya da 5 sn veri yoksa kayıt kapanır).' : 'Otomatik kayıt kapalı — Ayarlar’dan açabilirsin.'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" onClick={refresh}>
            Yenile
          </button>
          <button className="btn" onClick={() => window.fh!.revealSessions()}>
            <IconFolder width={15} height={15} /> Klasörü aç
          </button>
        </div>
      </div>
      {msg && (
        <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg}</span>
          <button className="btn ghost" onClick={() => setMsg(null)}>
            Tamam
          </button>
        </div>
      )}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {list === null ? (
          <div className="empty">Yükleniyor…</div>
        ) : list.length === 0 ? (
          <div className="empty">
            <div>
              <h3>Henüz kayıt yok</h3>Oyunda sürmeye başladığında kayıt otomatik başlar.
            </div>
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Araç</th>
                <th className="r">Süre</th>
                <th className="r">Mesafe</th>
                <th className="r">Vmax</th>
                <th className="r">Boyut</th>
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
                      <div style={{ fontWeight: 600 }}>{new Date(m.startEpochMs).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
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
                        {settings.carNames[String(m.carOrdinal)] ?? `#${m.carOrdinal}`}
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
                          <span className="dot rec" /> kaydediliyor
                        </span>
                      ) : confirm === m.name ? (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn danger" onClick={() => del(m)}>
                            Evet, sil
                          </button>
                          <button className="btn ghost" onClick={() => setConfirm(null)}>
                            Vazgeç
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn primary" disabled={busy === m.name} onClick={() => play(m)}>
                            <IconPlay width={13} height={13} /> Oynat
                          </button>
                          <button className="btn" disabled={busy === m.name} onClick={() => exportCsv(m)} title="CSV olarak dışa aktar">
                            <IconDownload width={15} height={15} /> CSV
                          </button>
                          <button className="btn ghost danger" onClick={() => setConfirm(m.name)} title="Sil">
                            <IconTrash width={15} height={15} />
                          </button>
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
