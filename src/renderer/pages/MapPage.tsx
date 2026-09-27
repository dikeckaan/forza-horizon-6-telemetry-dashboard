import { useRef, useState } from 'react';
import { TrackCanvas, SPEED_RAMP_CSS, type ColorMode } from '../components/TrackCanvas';
import { useFrame, useUnits } from '../hooks';
import { store } from '../store';
import { speedLabel, speedOf } from '../../shared/units';
import { IconCrosshair } from '../components/icons';
import { t } from '../i18n';

export function MapPage() {
  const f = useFrame();
  const u = useUnits();
  const [mode, setMode] = useState<ColorMode>('speed');
  const [follow, setFollow] = useState(true);
  const api = useRef<{ fit: () => void; setFollow: (f: boolean) => void } | null>(null);

  return (
    <div className="panel" style={{ padding: 0, height: '100%', minHeight: 500, overflow: 'hidden' }}>
      <TrackCanvas colorBy={mode} follow={follow} zoom={1.2} viewRef={api} />

      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="seg">
          <button className={mode === 'speed' ? 'on' : ''} onClick={() => setMode('speed')}>
            {t('views.map.bySpeed')}
          </button>
          <button className={mode === 'pedals' ? 'on' : ''} onClick={() => setMode('pedals')}>
            {t('views.map.byPedals')}
          </button>
          <button className={mode === 'plain' ? 'on' : ''} onClick={() => setMode('plain')}>
            {t('views.map.plain')}
          </button>
        </div>
        <button className={`btn ${follow ? 'primary' : ''}`} onClick={() => setFollow((v) => !v)}>
          <IconCrosshair width={15} height={15} /> {t('views.map.follow')}
        </button>
        <button
          className="btn"
          onClick={() => {
            setFollow(false);
            api.current?.fit();
          }}
        >
          {t('views.map.fitAll')}
        </button>
        <button className="btn ghost" onClick={() => (store.trail = [])}>
          {t('views.map.clearTrail')}
        </button>
      </div>

      <div style={{ position: 'absolute', top: 14, right: 14, minWidth: 190 }} className="panel">
        <div className="label">{t('views.map.position')}</div>
        <div className="mono" style={{ marginTop: 6, lineHeight: 1.7 }}>
          X {f.positionX.toFixed(1)}
          <br />Z {f.positionZ.toFixed(1)}
          <br />Y {f.positionY.toFixed(1)} m
        </div>
        <div className="label" style={{ marginTop: 10 }}>
          {t('views.map.heading')}
        </div>
        <div className="mono" style={{ marginTop: 4 }}>
          {(((f.yaw * 180) / Math.PI + 360) % 360).toFixed(0)}°
        </div>
        <div className="label" style={{ marginTop: 10 }}>
          {t('views.map.distance')}
        </div>
        <div className="mono" style={{ marginTop: 4 }}>
          {(store.odometer / 1000).toFixed(2)} km
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 14, right: 14 }} className="panel">
        {mode === 'speed' && (
          <>
            <div style={{ width: 200, height: 8, borderRadius: 4, background: SPEED_RAMP_CSS }} />
            <div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11 }}>
              <span>0</span>
              <span>
                {Math.round(speedOf(Math.max(10, store.maxSpeed), u))} {speedLabel(u)}
              </span>
            </div>
          </>
        )}
        {mode === 'pedals' && (
          <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
            <Legend color="#3bdc84" label={t('views.throttle')} />
            <Legend color="#ff4d5e" label={t('views.brake')} />
            <Legend color="#6b7285" label={t('views.map.coasting')} />
          </div>
        )}
        {mode === 'plain' && <span className="muted">{t('views.map.trail')}</span>}
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }} className="mono muted">
        {t('views.map.hint')}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 14, height: 3, borderRadius: 2, background: color }} /> {label}
    </span>
  );
}
