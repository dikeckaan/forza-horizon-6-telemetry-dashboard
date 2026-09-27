import { useFrame, useUnits } from '../hooks';
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
  const hasLaps = f.lapNumber > 0 || f.currentLap > 0 || f.bestLap > 0;

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(250px, 300px) minmax(420px, 1fr) minmax(250px, 300px)', alignItems: 'start' }}>
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
        <div className="panel" style={{ padding: '16px 18px 10px' }}>
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
          </div>
          <div className="panel stat">
            <span className="label">Tork</span>
            <span className="v">
              {Math.max(0, Math.round(torqueOf(f.torque, u)))}
              <small>{torqueLabel(u)}</small>
            </span>
            <span className="sub">maks {Math.round(torqueOf(store.maxTorque, u))}</span>
          </div>
          <div className="panel stat">
            <span className="label">Turbo</span>
            <span className="v">
              {boost.toFixed(u.pressure === 'psi' ? 1 : 2)}
              <small>{pressureLabel(u)}</small>
            </span>
            <HMeter value={boost} min={boostMin} max={boostMax} color={boost >= 0 ? '#2de2e6' : '#6b7285'} />
          </div>
          <div className="panel stat">
            <span className="label">Yakıt</span>
            <span className="v">
              {Math.round(f.fuel * 100)}
              <small>%</small>
            </span>
            <HMeter value={f.fuel * 100} min={0} max={100} color={f.fuel < 0.15 ? '#ff4d5e' : '#ffc53d'} />
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
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 16 }}>
          {hasLaps ? (
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
          <Stat label="Mesafe" value={(store.odometer / 1000).toFixed(2)} unit="km" />
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
