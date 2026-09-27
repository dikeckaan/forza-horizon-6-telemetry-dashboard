import { useEffect, useState } from 'react';
import type { SketchfabModel } from '../../../shared/ipc';
import { useSettings } from '../../hooks';
import { downloadFor, useDownloadState } from '../../autoModel';
import { scoreModel } from '../../../shared/modelpick';
import { IconX } from '../icons';

const TOKEN_URL = 'https://sketchfab.com/settings/password';

/** Sketchfab browser: search real car models, download one, assign it to the current car. */
export function Library({ ordinal, carName, initialQuery, onClose }: { ordinal: number; carName: string | null; initialQuery: string; onClose: () => void }) {
  const { settings, update } = useSettings();
  const dl = useDownloadState();
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SketchfabModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const connected = settings.sketchfab.connected;

  const search = async (query: string) => {
    if (!window.fh || !query.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await window.fh.sfSearch(query.trim());
      // best matches for this car first
      setResults(carName ? [...r].sort((a, b) => scoreModel(b, carName) - scoreModel(a, carName)) : r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (!window.fh || !token.trim()) return;
    setErr(null);
    try {
      const s = await window.fh.sfConnect(token.trim());
      update({ sketchfab: s.sketchfab });
      setToken('');
    } catch {
      setErr('Bağlanılamadı: anahtarı kontrol et');
    }
  };

  const use = async (m: SketchfabModel) => {
    const have = settings.customModels.find((c) => c.uid === m.uid);
    if (have) {
      update({ carModels: { ...settings.carModels, [String(ordinal)]: have.id } });
      onClose();
      return;
    }
    const id = await downloadFor(m, ordinal, update, settings);
    if (id) onClose();
  };

  if (!window.fh) {
    return (
      <Shell onClose={onClose} title="Araç kütüphanesi">
        <div className="empty">Kütüphane masaüstü uygulamasında çalışır.</div>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose} title={carName ? `Araç kütüphanesi · ${carName}` : 'Araç kütüphanesi'}>
      {!connected && (
        <div className="panel" style={{ marginBottom: 12, background: 'rgba(255,46,136,.08)', borderColor: 'rgba(255,46,136,.3)' }}>
          <div style={{ fontWeight: 650, marginBottom: 4 }}>İndirmek için Sketchfab hesabını bağla (ücretsiz)</div>
          <div className="muted" style={{ lineHeight: 1.5, marginBottom: 10 }}>
            Sketchfab, modelleri yalnızca hesabı olanlara indiriyor. Hesabına giriş yap →{' '}
            <a href="#" onClick={(e) => (e.preventDefault(), window.fh?.openExternal(TOKEN_URL))} style={{ color: 'var(--accent)' }}>
              Ayarlar › Password &amp; API
            </a>{' '}
            sayfasındaki <b>API Token</b>’ı kopyalayıp buraya yapıştır. Anahtar bu bilgisayarda şifreli saklanır.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="API token" value={token} onChange={(e) => setToken(e.target.value)} style={{ flex: 1 }} />
            <button className="btn primary" onClick={connect} disabled={!token.trim()}>
              Bağla
            </button>
          </div>
        </div>
      )}
      <form
        style={{ display: 'flex', gap: 8, marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} placeholder="ör. Porsche 911 GT3, rally car, pickup truck…" />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Aranıyor…' : 'Ara'}
        </button>
      </form>
      {err && <div style={{ color: 'var(--bad)', marginBottom: 10 }}>{err}</div>}
      {dl.status === 'downloading' && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span>{dl.label} indiriliyor…</span>
            <span className="mono">
              {(dl.received / 1e6).toFixed(1)} / {dl.total ? (dl.total / 1e6).toFixed(1) : '?'} MB
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 6, background: '#141821', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${dl.total ? (dl.received / dl.total) * 100 : 10}%`, background: 'linear-gradient(90deg,#ff2e88,#ff7a2e)' }} />
          </div>
        </div>
      )}
      {dl.status === 'error' && <div style={{ color: 'var(--bad)', marginBottom: 10 }}>{dl.error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        {results?.map((m) => {
          const have = settings.customModels.some((c) => c.uid === m.uid);
          return (
            <div key={m.uid} className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ aspectRatio: '16 / 10', background: '#0b0d12' }}>
                {m.thumbnail && <img src={m.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{m.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {m.author} · {m.license.replace('CC Attribution', 'CC BY')}
                </div>
                <div className="mono muted" style={{ fontSize: 11 }}>
                  {m.glbBytes ? `${(m.glbBytes / 1e6).toFixed(0)} MB` : '? MB'} · {(m.faces / 1000).toFixed(0)}k üçgen
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
                  <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={(!connected && !have) || dl.status === 'downloading'} onClick={() => use(m)}>
                    {have ? 'Kullan' : 'İndir ve kullan'}
                  </button>
                  <button className="btn ghost" onClick={() => window.fh?.openExternal(m.viewerUrl)} title="Sketchfab'da aç">
                    ↗
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {results && !results.length && <div className="empty">Sonuç yok. Daha kısa bir arama dene (ör. sadece model adı).</div>}
      <p className="muted" style={{ fontSize: 11, marginTop: 14, lineHeight: 1.5 }}>
        Modeller Sketchfab kullanıcılarına aittir; lisansları kartlarda yazar (çoğu yalnızca kişisel kullanım için). İndirilenler bu bilgisayarda saklanır.
      </p>
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(4,5,8,.72)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center' }} onClick={onClose}>
      <div
        className="panel"
        style={{ width: 'min(1100px, 92vw)', maxHeight: '86vh', overflow: 'auto', background: '#0e1016', padding: 18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 650 }}>{title}</span>
          <button className="btn ghost" onClick={onClose} aria-label="Kapat">
            <IconX width={15} height={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
