import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { useFrame, useSettings, useStatus } from '../hooks';
import type { UnitPrefs } from '../../shared/units';
import { carCount, knownCarName } from '../../shared/cars';
import { LANGUAGES, t } from '../i18n';

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
      <Section title={t('settings.connection')}>
        <Row label={t('settings.language')}>
          <select
            value={settings.language}
            onChange={(e) => update({ language: e.target.value })}
            style={{ height: 34, borderRadius: 9, background: 'rgba(0,0,0,.35)', color: 'var(--ink)', border: '1px solid var(--line-2)', padding: '0 10px', font: 'inherit' }}
          >
            <option value="auto">{t('settings.languageAuto')}</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.udpPort')} hint={t('settings.udpPortHint')}>
          <input type="number" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 110 }} />
          <button className="btn" disabled={Number(port) === settings.port || !(Number(port) > 0 && Number(port) < 65536)} onClick={() => update({ port: Number(port) })}>
            {t('settings.apply')}
          </button>
        </Row>
        <Row label={t('settings.localIps')} hint={t('settings.localIpsHint')}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(status?.localAddresses ?? []).map((a) => (
              <span key={a} className="kbd">
                {a}
              </span>
            ))}
          </div>
        </Row>
        <Row label={t('settings.status')}>
          <span className="mono">
            {status?.error ? (
              <span style={{ color: 'var(--bad)' }}>{status.error}</span>
            ) : status?.listening ? (
              t('settings.statusListening', { pps: status.packetsPerSec, size: status.packetSize || '—' })
            ) : (
              t('settings.statusOff')
            )}
          </span>
        </Row>
        <Row label={t('settings.demo')} hint={t('settings.demoHint')}>
          <button className={`toggle ${settings.demo ? 'on' : ''}`} onClick={() => update({ demo: !settings.demo })} aria-label={t('settings.demo')} />
        </Row>
      </Section>

      {desktop && (
      <Section title={t('settings.recording')}>
        <Row label={t('settings.autoRecord')} hint={t('settings.autoRecordHint')}>
          <button className={`toggle ${settings.record ? 'on' : ''}`} onClick={() => update({ record: !settings.record })} aria-label={t('settings.autoRecord')} />
        </Row>
        <Row label={t('settings.forward')} hint={t('settings.forwardHint')}>
          <button className={`toggle ${settings.forward.enabled ? 'on' : ''}`} onClick={() => update({ forward: { ...settings.forward, enabled: !settings.forward.enabled } })} aria-label={t('settings.forward')} />
        </Row>
        {settings.forward.enabled && (
          <Row label={t('settings.forwardTarget')}>
            <input type="text" value={fwdHost} onChange={(e) => setFwdHost(e.target.value)} style={{ width: 150 }} />
            <input type="number" value={fwdPort} onChange={(e) => setFwdPort(e.target.value)} style={{ width: 90 }} />
            <button
              className="btn"
              disabled={Number(fwdPort) === settings.forward.port && fwdHost === settings.forward.host}
              onClick={() => update({ forward: { ...settings.forward, host: fwdHost.trim(), port: Number(fwdPort) } })}
            >
              {t('settings.apply')}
            </button>
          </Row>
        )}
      </Section>
      )}

      {library && (
      <Section title={t('settings.models')}>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
          {t('settings.modelsIntro')}
        </p>
        {settings.sketchfab.connected ? (
          <Row label={t('settings.account')} hint={t('settings.connected')}>
            <span>{settings.sketchfab.account}</span>
            <button
              className="btn ghost danger"
              onClick={async () => {
                const next = await window.fh?.sfDisconnect();
                if (next) update({ sketchfab: next.sketchfab });
              }}
            >
              {t('settings.disconnect')}
            </button>
          </Row>
        ) : (
          <Row label={t('settings.apiToken')}>
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
                  setSfErr(t('settings.tokenInvalid'));
                }
              }}
            >
              {t('settings.connect')}
            </button>
          </Row>
        )}
        {sfErr && <div style={{ color: 'var(--bad)', padding: '4px 0' }}>{sfErr}</div>}
        <Row label={t('settings.autoDownload')} hint={t('settings.autoDownloadHint')}>
          <button className={`toggle ${settings.autoModels ? 'on' : ''}`} onClick={() => update({ autoModels: !settings.autoModels })} aria-label={t('settings.autoDownload')} />
        </Row>
        <Row label={t('settings.downloadedModels')}>
          <span className="mono">{settings.customModels.filter((m) => m.source === 'sketchfab').length}</span>
        </Row>
      </Section>
      )}

      {desktop && <RemoteSection />}

      <Section title={t('settings.units')}>
        <Row label={t('settings.unitSpeed')}>
          <Seg value={units.speed} options={[['kmh', 'km/h'], ['mph', 'mph']]} onChange={(v) => setUnit('speed', v)} />
        </Row>
        <Row label={t('settings.unitTemp')}>
          <Seg value={units.temp} options={[['c', '°C'], ['f', '°F']]} onChange={(v) => setUnit('temp', v)} />
        </Row>
        <Row label={t('settings.unitPower')}>
          <Seg value={units.power} options={[['hp', 'hp'], ['kw', 'kW']]} onChange={(v) => setUnit('power', v)} />
        </Row>
        <Row label={t('settings.unitTorque')}>
          <Seg value={units.torque} options={[['nm', 'Nm'], ['lbft', 'lb·ft']]} onChange={(v) => setUnit('torque', v)} />
        </Row>
        <Row label={t('settings.unitPressure')}>
          <Seg value={units.pressure} options={[['bar', 'bar'], ['psi', 'psi']]} onChange={(v) => setUnit('pressure', v)} />
        </Row>
      </Section>

      <Section title={t('settings.carNames')}>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
          {t('settings.carNamesIntro', { count: carCount })}
        </p>
        {f.carOrdinal > 0 && (
          <Row label={t('settings.currentCar', { id: f.carOrdinal })}>
            <input type="text" placeholder={settings.carNames[String(f.carOrdinal)] ?? knownCarName(f.carOrdinal) ?? t('settings.carNamePlaceholder')} value={carName} onChange={(e) => setCarName(e.target.value)} style={{ width: 200 }} />
            <button
              className="btn"
              disabled={!carName.trim()}
              onClick={() => {
                update({ carNames: { ...settings.carNames, [String(f.carOrdinal)]: carName.trim() } });
                setCarName('');
              }}
            >
              {t('settings.save')}
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
              {t('settings.remove')}
            </button>
          </Row>
        ))}
      </Section>

      <Section title={t('settings.shortcuts')}>
        <Row label={t('settings.shortcutPages')}>
          <span className="kbd">1</span>–<span className="kbd">8</span>
        </Row>
        <Row label={t('settings.shortcutReplay')}>
          <span className="kbd">{t('settings.keySpace')}</span>
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
  const urls = (status?.localAddresses ?? []).map((a) => `http://${a}:${r.port}/?k=${r.key}`);
  const [port, setPort] = useState(String(r.port));
  useEffect(() => {
    if (!r.enabled || !urls[0]) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(urls[0], { margin: 1, width: 180, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setQr, () => setQr(null));
  }, [r.enabled, urls[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section title={t('settings.remote')}>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
        {t('settings.remoteIntro')}
      </p>
      <Row label={t('settings.remoteEnable')} hint={t('settings.remoteEnableHint')}>
        <button className={`toggle ${r.enabled ? 'on' : ''}`} onClick={() => update({ remote: { ...r, enabled: !r.enabled } })} aria-label={t('settings.remoteEnable')} />
      </Row>
      <Row label={t('settings.port')}>
        <input type="number" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 110 }} />
        <button className="btn" disabled={Number(port) === r.port || !(Number(port) > 1024 && Number(port) < 65536)} onClick={() => update({ remote: { ...r, port: Number(port) } })}>
          {t('settings.apply')}
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
                {t('settings.remoteClients', { count: status?.remote.clients ?? 0 })}
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
