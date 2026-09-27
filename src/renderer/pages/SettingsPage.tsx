import { useState, type ReactNode } from 'react';
import { useFrame, useSettings, useStatus } from '../hooks';
import type { UnitPrefs } from '../../shared/units';

export function SettingsPage() {
  const { settings, update } = useSettings();
  const status = useStatus();
  const f = useFrame();
  const [port, setPort] = useState(String(settings.port));
  const [fwdHost, setFwdHost] = useState(settings.forward.host);
  const [fwdPort, setFwdPort] = useState(String(settings.forward.port));
  const [carName, setCarName] = useState('');
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
          Oyun aracın adını değil yalnızca kimlik numarasını gönderir. Kullandığın araçlara isim verebilirsin.
        </p>
        {f.carOrdinal > 0 && (
          <Row label={`Şu anki araç #${f.carOrdinal}`}>
            <input type="text" placeholder={settings.carNames[String(f.carOrdinal)] ?? 'ör. Toyota GR Yaris'} value={carName} onChange={(e) => setCarName(e.target.value)} style={{ width: 200 }} />
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
