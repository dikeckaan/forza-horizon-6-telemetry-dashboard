import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { useFrame, useSettings, useStatus } from '../hooks';
import type { UnitPrefs } from '../../shared/units';
import { carCount, knownCarName } from '../../shared/cars';

export function SettingsPage() {
  const { settings, update } = useSettings();
  const status = useStatus();
  const f = useFrame();
  const [port, setPort] = useState(String(settings.port));
  const [fwdHost, setFwdHost] = useState(settings.forward.host);
  const [fwdPort, setFwdPort] = useState(String(settings.forward.port));
  const [carName, setCarName] = useState('');
  const [sfToken, setSfToken] = useState('');
  const desktop = window.fh?.kind === 'desktop';
  const library = !!window.fh?.caps.modelLibrary;
  const [sfErr, setSfErr] = useState<string | null>(null);
  const units = settings.units;
  const setUnit = <K extends keyof UnitPrefs>(k: K, v: UnitPrefs[K]) => update({ units: { ...units, [k]: v } });

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', alignItems: 'start' }}>
      <Section title="Bağlantı">
        <Row label="UDP port" hint="Oyundaki “Veri Çıkışı IP Portu” ile aynı olmalı">
          <input type="number" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 110 }} />
          <button className="btn" disabled={Number(port) === settings.port || !(Number(port) > 0 && Number(port) < 65536)} onClick={() => update({ port: Number(port) })}>
            Uygula
          </button>
        </Row>
        <Row label="Bu bilgisayarın IP’leri" hint="Oyunda “Veri Çıkışı IP Adresi” olarak bunlardan birini gir">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(status?.localAddresses ?? []).map((a) => (
              <span key={a} className="kbd">
                {a}
              </span>
            ))}
          </div>
        </Row>
        <Row label="Durum">
          <span className="mono">
            {status?.error ? <span style={{ color: 'var(--bad)' }}>{status.error}</span> : status?.listening ? `dinleniyor · ${status.packetsPerSec} paket/sn · ${status.packetSize || '—'} byte` : 'kapalı'}
          </span>
        </Row>
        <Row label="Demo modu" hint="Oyun kapalıyken sahte bir sürüşle arayüzü dene">
          <button className={`toggle ${settings.demo ? 'on' : ''}`} onClick={() => update({ demo: !settings.demo })} aria-label="Demo modu" />
        </Row>
      </Section>

      {desktop && (
      <Section title="Kayıt">
        <Row label="Otomatik kayıt" hint="Sürüşler .fhs dosyası olarak saklanır (~1.2 MB/dk)">
          <button className={`toggle ${settings.record ? 'on' : ''}`} onClick={() => update({ record: !settings.record })} aria-label="Otomatik kayıt" />
        </Row>
        <Row label="UDP yönlendirme" hint="Gelen paketleri başka bir uygulamaya da gönder (ör. SimHub)">
          <button className={`toggle ${settings.forward.enabled ? 'on' : ''}`} onClick={() => update({ forward: { ...settings.forward, enabled: !settings.forward.enabled } })} aria-label="UDP yönlendirme" />
        </Row>
        {settings.forward.enabled && (
          <Row label="Hedef">
            <input type="text" value={fwdHost} onChange={(e) => setFwdHost(e.target.value)} style={{ width: 150 }} />
            <input type="number" value={fwdPort} onChange={(e) => setFwdPort(e.target.value)} style={{ width: 90 }} />
            <button
              className="btn"
              disabled={Number(fwdPort) === settings.forward.port && fwdHost === settings.forward.host}
              onClick={() => update({ forward: { ...settings.forward, host: fwdHost.trim(), port: Number(fwdPort) } })}
            >
              Uygula
            </button>
          </Row>
        )}
      </Section>
      )}

      {library && (
      <Section title="3D araç modelleri (Sketchfab)">
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
          Sürdüğün aracın gerçek 3D modeli Sketchfab’dan bulunup indirilir. İndirmek için ücretsiz bir Sketchfab hesabının API anahtarı gerekir
          (sketchfab.com › Settings › Password &amp; API). Anahtar bu bilgisayarda şifreli saklanır.
        </p>
        {settings.sketchfab.connected ? (
          <Row label="Hesap" hint="Bağlı">
            <span>{settings.sketchfab.account}</span>
            <button
              className="btn ghost danger"
              onClick={async () => {
                const next = await window.fh?.sfDisconnect();
                if (next) update({ sketchfab: next.sketchfab });
              }}
            >
              Bağlantıyı kes
            </button>
          </Row>
        ) : (
          <Row label="API anahtarı">
            <input type="text" value={sfToken} onChange={(e) => setSfToken(e.target.value)} placeholder="token" style={{ width: 200 }} />
            <button
              className="btn"
              disabled={!sfToken.trim() || !window.fh}
              onClick={async () => {
                setSfErr(null);
                try {
                  const next = await window.fh!.sfConnect(sfToken.trim());
                  update({ sketchfab: next.sketchfab });
                  setSfToken('');
                } catch {
                  setSfErr('Anahtar doğrulanamadı');
                }
              }}
            >
              Bağla
            </button>
          </Row>
        )}
        {sfErr && <div style={{ color: 'var(--bad)', padding: '4px 0' }}>{sfErr}</div>}
        <Row label="Otomatik indir" hint="Yeni bir araca bindiğinde en uygun modeli kendisi bulup indirir">
          <button className={`toggle ${settings.autoModels ? 'on' : ''}`} onClick={() => update({ autoModels: !settings.autoModels })} aria-label="Otomatik indir" />
        </Row>
        <Row label="İndirilen modeller">
          <span className="mono">{settings.customModels.filter((m) => m.source === 'sketchfab').length}</span>
        </Row>
      </Section>
      )}

      {desktop && <RemoteSection />}

      <Section title="Birimler">
        <Row label="Hız">
          <Seg value={units.speed} options={[['kmh', 'km/h'], ['mph', 'mph']]} onChange={(v) => setUnit('speed', v)} />
        </Row>
        <Row label="Sıcaklık">
          <Seg value={units.temp} options={[['c', '°C'], ['f', '°F']]} onChange={(v) => setUnit('temp', v)} />
        </Row>
        <Row label="Güç">
          <Seg value={units.power} options={[['hp', 'hp'], ['kw', 'kW']]} onChange={(v) => setUnit('power', v)} />
        </Row>
        <Row label="Tork">
          <Seg value={units.torque} options={[['nm', 'Nm'], ['lbft', 'lb·ft']]} onChange={(v) => setUnit('torque', v)} />
        </Row>
        <Row label="Basınç">
          <Seg value={units.pressure} options={[['bar', 'bar'], ['psi', 'psi']]} onChange={(v) => setUnit('pressure', v)} />
        </Row>
      </Section>

      <Section title="Araç isimleri">
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
          Oyun yalnızca araç numarasını gönderir; {carCount} FH6 aracının adı uygulamada kayıtlı. Listede olmayan ya da farklı görünmesini istediğin araçlara isim verebilirsin.
        </p>
        {f.carOrdinal > 0 && (
          <Row label={`Şu anki araç #${f.carOrdinal}`}>
            <input type="text" placeholder={settings.carNames[String(f.carOrdinal)] ?? knownCarName(f.carOrdinal) ?? 'ör. Toyota GR Yaris'} value={carName} onChange={(e) => setCarName(e.target.value)} style={{ width: 200 }} />
            <button
              className="btn"
              disabled={!carName.trim()}
              onClick={() => {
                update({ carNames: { ...settings.carNames, [String(f.carOrdinal)]: carName.trim() } });
                setCarName('');
              }}
            >
              Kaydet
            </button>
          </Row>
        )}
        {Object.entries(settings.carNames).map(([id, name]) => (
          <Row key={id} label={`#${id}`}>
            <span>{name}</span>
            <button
              className="btn ghost danger"
              onClick={() => {
                const next = { ...settings.carNames };
                delete next[id];
                update({ carNames: next });
              }}
            >
              Kaldır
            </button>
          </Row>
        ))}
      </Section>

      <Section title="Kısayollar">
        <Row label="Ekranlar">
          <span className="kbd">1</span>–<span className="kbd">8</span>
        </Row>
        <Row label="Kayıt oynat / duraklat">
          <span className="kbd">Boşluk</span>
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <div className="panel-title" style={{ marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <div>
        <div style={{ fontWeight: 550 }}>{label}</div>
        {hint && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** LAN second screen: phones/tablets open the dashboard in their browser. */
function RemoteSection() {
  const { settings, update } = useSettings();
  const status = useStatus();
  const [qr, setQr] = useState<string | null>(null);
  const r = settings.remote;
  const urls = (status?.localAddresses ?? []).map((a) => `http://${a}:${r.port}/`);
  const [port, setPort] = useState(String(r.port));
  useEffect(() => {
    if (!r.enabled || !urls[0]) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(urls[0], { margin: 1, width: 180, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setQr, () => setQr(null));
  }, [r.enabled, urls[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section title="Telefon / tablet ekranı">
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
        Aynı Wi-Fi’daki telefon, iPad ya da başka bir bilgisayar tarayıcıdan bu adrese girerek paneli ikinci ekran olarak kullanabilir. Kurulum gerekmez; kayıtlar ve indirilen 3D modeller de görünür.
      </p>
      <Row label="Yayını aç" hint="Yerel ağdaki herkes erişebilir; yalnızca güvendiğin ağlarda aç">
        <button className={`toggle ${r.enabled ? 'on' : ''}`} onClick={() => update({ remote: { ...r, enabled: !r.enabled } })} aria-label="Yayını aç" />
      </Row>
      <Row label="Port">
        <input type="number" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 110 }} />
        <button className="btn" disabled={Number(port) === r.port || !(Number(port) > 1024 && Number(port) < 65536)} onClick={() => update({ remote: { ...r, port: Number(port) } })}>
          Uygula
        </button>
      </Row>
      {r.enabled && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          {qr && <img src={qr} alt="QR" width={120} height={120} style={{ borderRadius: 8 }} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {status?.remote.error ? (
              <span style={{ color: 'var(--bad)' }}>{status.remote.error}</span>
            ) : (
              <span className="muted">
                {status?.remote.clients ?? 0} cihaz bağlı · telefon kamerasıyla QR’ı okut
              </span>
            )}
            {urls.map((u) => (
              <span key={u} className="kbd" style={{ userSelect: 'text' }}>
                {u}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
