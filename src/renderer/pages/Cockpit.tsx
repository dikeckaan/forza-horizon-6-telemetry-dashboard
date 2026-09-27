import { useFrame, useSettings, useUnits } from '../hooks';
import { Spark } from '../components/Spark';
import { carName } from '../../shared/cars';
import { carClassName, CLASS_COLORS, drivetrainName } from '../../shared/units';
import { store } from '../store';
import { GCircle, HMeter, Pedals, ShiftLights, SteeringWheel, Tachometer } from '../components/Gauges';
import { TrackCanvas } from '../components/TrackCanvas';
import { fmtDelta, fmtLap, powerLabel, powerOf, pressureLabel, pressureOf, speedLabel, speedOf, torqueLabel, torqueOf } from '../../shared/units';

export function CockpitPage() {
  const f = useFrame();
  const u = useUnits();
  const delta = store.laps.delta();
  const boostMax = u.pressure === 'psi' ? 30 : 2;
  const boostMin = u.pressure === 'psi' ? -15 : -1;
  const boost = pressureOf(f.boost, u);
  const ev = store.race.event;
  const hasLaps = ev?.kind === 'circuit' || f.lapNumber > 0 || f.bestLap > 0;
  const route = store.race.route;
  const progress = store.race.progress();
  const raceDelta = store.race.delta();
  const { settings } = useSettings();
  const name = carName(f.carOrdinal, settings.carNames);
  const k = Math.min(1, f.currentEngineRpm / (f.engineMaxRpm || 8000));
  const glow = k < 0.6 ? '45,226,230' : k < 0.8 ? '255,46,136' : k < 0.9 ? '255,122,46' : '255,59,78';
  const cls = carClassName(f.carClass);

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(250px, 300px) minmax(420px, 1fr) minmax(250px, 300px)', alignItems: 'start', position: 'relative' }}>
      {/* ambient light that heats up with the revs */}
      <div
        style={{
          position: 'absolute',
          inset: '-18px',
          pointerEvents: 'none',
          background: `radial-gradient(700px 420px at 50% 42%, rgba(${glow},${0.05 + k * 0.13}), transparent 70%)`,
          transition: 'background .25s',
        }}
      />
      {/* hero */}
      <div className="panel" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 18, padding: '14px 20px', overflow: 'hidden', background: 'linear-gradient(100deg, rgba(255,46,136,.10), rgba(18,21,29,.72) 38%, rgba(18,21,29,.72) 70%, rgba(45,226,230,.08))' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', height: 46, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line-2)', fontFamily: 'var(--font-num)', fontWeight: 700 }}>
          <span style={{ display: 'grid', placeItems: 'center', padding: '0 14px', fontSize: 26, color: '#0b0d12', background: CLASS_COLORS[cls] ?? '#888' }}>{cls}</span>
          <span style={{ display: 'grid', placeItems: 'center', padding: '0 14px', fontSize: 24, background: '#0b0d12' }}>{f.carPerformanceIndex || '—'}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="label" style={{ letterSpacing: '.22em' }}>{name ? name.match(/^\d{4}/)?.[0] ?? 'ARAÇ' : 'ARAÇ'}</div>
          {/* car names are English: uppercase them with English rules (no dotted İ) */}
          <div lang="en" className="num" style={{ fontSize: 32, fontWeight: 700, fontStyle: 'italic', textTransform: 'uppercase', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name ? name.replace(/^\d{4}\s+/, '').replace(/\s*\(.*\)$/, '') : f.carOrdinal ? `Araç #${f.carOrdinal}` : 'Araç bekleniyor'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Chip>{drivetrainName(f.drivetrainType)}</Chip>
          {f.numCylinders > 0 && <Chip>{f.numCylinders} silindir</Chip>}
          <Chip>
            {Math.round(powerOf(store.maxPower, u))} {powerLabel(u)} tepe
          </Chip>
          <Chip accent={ev?.kind === 'sprint' || ev?.kind === 'circuit'}>{ev?.kind === 'sprint' ? `Sprint · P${f.racePosition || '—'}` : ev?.kind === 'circuit' ? `Pist · P${f.racePosition || '—'}` : 'Serbest sürüş'}</Chip>
        </div>
      </div>
      {/* left column */}
      <div className="grid">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Pedallar</span>
          </div>
          <Pedals f={f} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Direksiyon</span>
          </div>
          <SteeringWheel steer={f.steer} />
        </div>
      </div>

      {/* center */}
      <div className="grid">
        <div className="panel" style={{ padding: '16px 18px 10px', boxShadow: `0 0 ${20 + k * 50}px rgba(${glow},${0.08 + k * 0.22}) inset, 0 0 ${k * 40}px rgba(${glow},${k * 0.18})`, borderColor: `rgba(${glow},${0.12 + k * 0.3})`, transition: 'box-shadow .15s, border-color .15s' }}>
          <ShiftLights f={f} />
          <Tachometer f={f} units={u} />
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="panel stat">
            <span className="label">Güç</span>
            <span className="v">
              {Math.max(0, Math.round(powerOf(f.power, u)))}
              <small>{powerLabel(u)}</small>
            </span>
            <span className="sub">maks {Math.round(powerOf(store.maxPower, u))}</span>
            <Spark channel="power" color="#c47f1c" map={(v) => powerOf(v, u)} min={0} />
          </div>
          <div className="panel stat">
            <span className="label">Tork</span>
            <span className="v">
              {Math.max(0, Math.round(torqueOf(f.torque, u)))}
              <small>{torqueLabel(u)}</small>
            </span>
            <span className="sub">maks {Math.round(torqueOf(store.maxTorque, u))}</span>
            <Spark channel="torque" color="#8a72f0" map={(v) => torqueOf(v, u)} min={0} />
          </div>
          <div className="panel stat">
            <span className="label">Turbo</span>
            <span className="v">
              {boost.toFixed(u.pressure === 'psi' ? 1 : 2)}
              <small>{pressureLabel(u)}</small>
            </span>
            <HMeter value={boost} min={boostMin} max={boostMax} color={boost >= 0 ? '#2de2e6' : '#6b7285'} />
            <Spark channel="boost" color="#2de2e6" map={(v) => pressureOf(v, u)} height={26} />
          </div>
          <div className="panel stat">
            <span className="label">Yakıt</span>
            <span className="v">
              {Math.round(f.fuel * 100)}
              <small>%</small>
            </span>
            <HMeter value={f.fuel * 100} min={0} max={100} color={f.fuel < 0.15 ? '#ff4d5e' : '#ffc53d'} />
            <Spark channel="speed" color="#f03a7e" map={(v) => speedOf(v, u)} min={0} height={26} />
            <span className="sub">hız · son 12 sn</span>
          </div>
        </div>
      </div>

      {/* right column */}
      <div className="grid">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">G-Kuvveti</span>
            <span className="mono muted" style={{ fontSize: 11 }}>
              tepe {store.peakG.total.toFixed(2)}g
            </span>
          </div>
          <GCircle />
        </div>
        <div className="panel" style={{ padding: 0, overflow: 'hidden', height: 250 }}>
          <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 1 }} className="panel-title">
            Konum
          </div>
          <TrackCanvas follow zoom={0.35} interactive={false} />
        </div>
      </div>

      {/* bottom strip */}
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        {ev?.kind === 'sprint' && <RaceProgress progress={progress} known={!!ev.routeKey} />}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 16 }}>
          {ev?.kind === 'sprint' ? (
            <>
              <Stat label="Pozisyon" value={f.racePosition ? `P${f.racePosition}` : '—'} sub={ev.bestPosition < 99 ? `en iyi P${ev.bestPosition}` : undefined} />
              <Stat label="Yarış süresi" value={fmtLap(f.currentRaceTime)} mono />
              <Stat label="Yarış mesafesi" value={(f.distanceTraveled / 1000).toFixed(2)} unit="km" sub={route ? `rota ${(route.distance / 1000).toFixed(2)} km` : undefined} />
              <Stat label="En iyi koşuya göre" value={isNaN(raceDelta) ? '—' : fmtDelta(raceDelta)} mono color={isNaN(raceDelta) ? undefined : raceDelta <= 0 ? 'var(--good)' : 'var(--bad)'} sub={route?.bestTime ? `en iyi ${fmtLap(route.bestTime)}` : undefined} />
              <Stat label="Geri sarma" value={String(ev.rewinds)} />
            </>
          ) : hasLaps ? (
            <>
              <Stat label="Tur" value={`${f.lapNumber + 1}`} sub={f.racePosition ? `Sıra P${f.racePosition}` : undefined} />
              <Stat label="Mevcut tur" value={fmtLap(f.currentLap)} mono />
              <Stat label="Son tur" value={fmtLap(f.lastLap)} mono />
              <Stat label="En iyi tur" value={fmtLap(f.bestLap)} mono color="#b36bff" />
              <Stat label="Delta" value={isNaN(delta) ? '—' : fmtDelta(delta)} mono color={isNaN(delta) ? undefined : delta <= 0 ? 'var(--good)' : 'var(--bad)'} />
              <Stat label="Yarış süresi" value={fmtLap(f.currentRaceTime)} mono />
            </>
          ) : (
            <Stat label="Sürüş süresi" value={fmtLap(f.currentRaceTime)} mono />
          )}
          <Stat label="Oturum mesafesi" value={(store.odometer / 1000).toFixed(2)} unit="km" />
          <Stat label="Maks hız" value={Math.round(speedOf(store.maxSpeed, u)).toString()} unit={speedLabel(u)} />
          <Stat label="Tepe G" value={`${store.peakG.lat.toFixed(2)} / ${store.peakG.long.toFixed(2)}`} sub="yanal / boyuna" />
          <Stat label="İrtifa" value={Math.round(f.positionY).toString()} unit="m" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, sub, mono, color }: { label: string; value: string; unit?: string; sub?: string; mono?: boolean; color?: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="v" style={{ color, fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 20 : undefined, fontWeight: mono ? 500 : undefined, paddingTop: mono ? 4 : 0 }}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function RaceProgress({ progress, known }: { progress: number | null; known: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <span className="label" style={{ minWidth: 64 }}>
        İlerleme
      </span>
      <div style={{ flex: 1, height: 8, borderRadius: 8, background: '#141821', overflow: 'hidden' }}>
        {progress !== null ? (
          <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 8, background: 'linear-gradient(90deg, #2de2e6, #ff2e88, #ff7a2e)', boxShadow: '0 0 12px rgba(255,46,136,.5)' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg, #1c2130 0 8px, #141821 8px 16px)' }} />
        )}
      </div>
      <span className="num" style={{ fontSize: 22, minWidth: 64, textAlign: 'right' }}>
        {progress !== null ? `${Math.floor(progress * 100)}%` : '—'}
      </span>
      {progress === null && (
        <span className="muted" style={{ fontSize: 11.5 }}>
          {known ? 'ilk koşu: rota uzunluğu öğreniliyor' : 'yarışın başı görülmedi — rota tanınamadı'}
        </span>
      )}
    </div>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 30,
        padding: '0 12px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        letterSpacing: '.04em',
        background: accent ? 'linear-gradient(135deg, rgba(255,46,136,.25), rgba(255,122,46,.2))' : 'rgba(0,0,0,.35)',
        border: `1px solid ${accent ? 'rgba(255,46,136,.5)' : 'var(--line-2)'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
