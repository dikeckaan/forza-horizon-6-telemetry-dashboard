import { lazy, Suspense, useState } from 'react';
import { useFrame, useSettings, useUnits } from '../hooks';
import { autoPaint, guessStyle, PAINTS, STYLE_LABELS, type BodyStyle } from '../components/car/archetypes';
import type { CameraMode } from '../components/car/CarScene';
import type { Settings } from '../../shared/ipc';
import { tempLabel, tempOf, fToC, speedOf, speedLabel } from '../../shared/units';
import type { Frame } from '../../shared/packet';
import { tireTempColor } from '../components/colors';

const CarScene = lazy(() => import('../components/car/CarScene').then((m) => ({ default: m.CarScene })));

type StyleSource = 'user' | 'learned' | 'guess';

/** user choice for this car → choice learned for its game category → heuristic */
function resolveStyle(f: Frame, s: Settings): { style: BodyStyle; source: StyleSource } {
  const own = s.carStyles[String(f.carOrdinal)] as BodyStyle | undefined;
  if (own && own in STYLE_LABELS) return { style: own, source: 'user' };
  const cat = f.horizonCarCategory ? (s.categoryStyles[String(f.horizonCarCategory)] as BodyStyle | undefined) : undefined;
  if (cat && cat in STYLE_LABELS) return { style: cat, source: 'learned' };
  return { style: guessStyle(f), source: 'guess' };
}

const SOURCE_LABEL: Record<StyleSource, string> = { user: 'seçimin', learned: 'kategoriden öğrenildi', guess: 'otomatik tahmin' };

const NAMES = ['Ön Sol', 'Ön Sağ', 'Arka Sol', 'Arka Sağ'];
const deg = (r: number) => (r * 180) / Math.PI;

export function CarPage() {
  const f = useFrame();
  const [ex, setEx] = useState(3);
  const [cam, setCam] = useState<CameraMode>(() => (localStorage.getItem('carCam') as CameraMode) || 'chase');
  const [xray, setXray] = useState(false);
  const [picker, setPicker] = useState(false);
  const { settings, update } = useSettings();
  const drift = f.speed > 3 ? deg(Math.atan2(f.velocityX, Math.max(0.1, f.velocityZ))) : 0;
  const { style, source } = resolveStyle(f, settings);
  const ord = String(f.carOrdinal);
  const paint = settings.carPaints[ord] ?? autoPaint(f.carOrdinal);

  const chooseStyle = (st: BodyStyle | null) => {
    const carStyles = { ...settings.carStyles };
    const categoryStyles = { ...settings.categoryStyles };
    if (st) {
      carStyles[ord] = st;
      // teach the category so other cars of the same kind look right too
      if (f.horizonCarCategory) categoryStyles[String(f.horizonCarCategory)] = st;
    } else delete carStyles[ord];
    update({ carStyles, categoryStyles });
    setPicker(false);
  };
  const setCamera = (c: CameraMode) => {
    setCam(c);
    try {
      localStorage.setItem('carCam', c);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(230px, 270px) 1fr minmax(230px, 270px)', gridTemplateRows: 'auto auto' }}>
      <div className="grid">
        <TireCard f={f} i={0} />
        <TireCard f={f} i={2} />
      </div>
      <div className="panel" style={{ padding: 0, overflow: 'hidden', minHeight: 560 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Suspense fallback={<div className="empty">3D yükleniyor…</div>}>
            <CarScene style={style} paint={paint} xray={xray} exaggerate={ex} camera={cam} />
          </Suspense>
        </div>

        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <button className="btn" onClick={() => setPicker((v) => !v)} title="Gövde tipi">
              {STYLE_LABELS[style]} <span className="muted" style={{ fontWeight: 500 }}>· {SOURCE_LABEL[source]}</span> ▾
            </button>
            {picker && (
              <div className="panel" style={{ position: 'absolute', top: 38, left: 0, zIndex: 5, padding: 6, minWidth: 220, background: '#11141b', boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}>
                <MenuItem active={source !== 'user'} onClick={() => chooseStyle(null)}>
                  Otomatik <span className="muted">({STYLE_LABELS[guessStyle(f)]})</span>
                </MenuItem>
                <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                {(Object.keys(STYLE_LABELS) as BodyStyle[]).map((k) => (
                  <MenuItem key={k} active={source === 'user' && style === k} onClick={() => chooseStyle(k)}>
                    {STYLE_LABELS[k]}
                  </MenuItem>
                ))}
                <div className="muted" style={{ fontSize: 11, padding: '6px 8px 2px', lineHeight: 1.45 }}>
                  Oyun modeli göndermiyor; seçimin bu araca ve aynı oyun kategorisindeki araçlara uygulanır.
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 5, padding: '0 4px' }}>
            {PAINTS.map((p) => (
              <button
                key={p}
                aria-label={`Boya ${p}`}
                onClick={() => update({ carPaints: { ...settings.carPaints, [ord]: p } })}
                style={{ width: 18, height: 18, borderRadius: '50%', border: p === paint ? '2px solid #fff' : '1px solid rgba(255,255,255,.2)', background: p, cursor: 'pointer', padding: 0 }}
              />
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div className="seg">
              {(
                [
                  ['chase', 'Takip'],
                  ['orbit', 'Serbest'],
                  ['top', 'Üst'],
                ] as [CameraMode, string][]
              ).map(([k, l]) => (
                <button key={k} className={cam === k ? 'on' : ''} onClick={() => setCamera(k)}>
                  {l}
                </button>
              ))}
            </div>
            <button className={`btn ${xray ? 'primary' : ''}`} onClick={() => setXray((v) => !v)} title="Gövdeyi şeffaf yap, yayları göster">
              Röntgen
            </button>
            <div className="seg" title="Gövde hareketini abart">
              {[1, 3, 6].map((k) => (
                <button key={k} className={ex === k ? 'on' : ''} onClick={() => setEx(k)}>
                  {k}×
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }} className="mono muted">
          <span>{cam === 'orbit' ? 'sürükle: döndür · tekerlek: yakınlaş' : 'araç kayma açısı kadar döner · yol hızla akar'}</span>
          <span>duman/iz: lastik kayması · kızaran disk: fren ısısı</span>
        </div>
      </div>
      <div className="grid">
        <TireCard f={f} i={1} />
        <TireCard f={f} i={3} />
      </div>

      <div className="grid" style={{ gridColumn: '1 / -1', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <MotionPanel title="Yönelim" rows={[['Yaw', `${deg(f.yaw).toFixed(1)}°`], ['Pitch', `${deg(f.pitch).toFixed(1)}°`], ['Roll', `${deg(f.roll).toFixed(1)}°`]]} />
        <MotionPanel title="Açısal hız (rad/s)" rows={[['X (pitch)', f.angularVelocityX.toFixed(2)], ['Y (yaw)', f.angularVelocityY.toFixed(2)], ['Z (roll)', f.angularVelocityZ.toFixed(2)]]} />
        <MotionPanel title="İvme (m/s²)" rows={[['Yanal X', f.accelerationX.toFixed(2)], ['Dikey Y', f.accelerationY.toFixed(2)], ['Boyuna Z', f.accelerationZ.toFixed(2)]]} />
        <DriftPanel f={f} drift={drift} />
      </div>
    </div>
  );
}

function MenuItem({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', gap: 6, width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 7, border: 0, background: active ? 'var(--panel-hi)' : 'transparent', cursor: 'pointer', fontSize: 12.5 }}
    >
      {children}
    </button>
  );
}

function DriftPanel({ f, drift }: { f: Frame; drift: number }) {
  const u = useUnits();
  const a = Math.max(-60, Math.min(60, drift));
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Kayma açısı</span>
        <span className="num" style={{ fontSize: 22, color: Math.abs(drift) > 10 ? 'var(--accent)' : undefined }}>
          {Math.abs(drift).toFixed(0)}°
        </span>
      </div>
      <div style={{ position: 'relative', height: 8, borderRadius: 8, background: '#141821' }}>
        <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: '#6b7285' }} />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: a < 0 ? `${50 + (a / 60) * 50}%` : '50%',
            width: `${(Math.abs(a) / 60) * 50}%`,
            background: 'linear-gradient(90deg,#ff2e88,#ff7a2e)',
            borderRadius: 8,
          }}
        />
      </div>
      <div className="mono muted" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span>Vx {speedOf(f.velocityX, u).toFixed(1)}</span>
        <span>Vz {speedOf(f.velocityZ, u).toFixed(1)}</span>
        <span>{speedLabel(u)}</span>
      </div>
    </div>
  );
}

function MotionPanel({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span className="muted">{k}</span>
          <span className="mono">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Meter({ label, value, text, min = 0, max = 1, color }: { label: string; value: number; text: string; min?: number; max?: number; color: string }) {
  const zero = min < 0 ? ((0 - min) / (max - min)) * 100 : 0;
  const v = ((Math.max(min, Math.min(max, value)) - min) / (max - min)) * 100;
  return (
    <div style={{ marginTop: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
        <span className="muted">{label}</span>
        <span className="mono">{text}</span>
      </div>
      <div style={{ position: 'relative', height: 5, borderRadius: 5, background: '#141821', marginTop: 4 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(zero, v)}%`, width: `${Math.abs(v - zero)}%`, background: color, borderRadius: 5 }} />
        {min < 0 && <div style={{ position: 'absolute', left: `${zero}%`, top: -2, bottom: -2, width: 1, background: '#6b7285' }} />}
      </div>
    </div>
  );
}

function TireCard({ f, i }: { f: Frame; i: number }) {
  const u = useUnits();
  const c = fToC(f.tireTemp[i]);
  const color = tireTempColor(c);
  const slip = f.tireCombinedSlip[i];
  const rumble = f.wheelOnRumbleStrip[i] !== 0;
  const puddle = f.wheelInPuddleDepth[i];
  // wheel surface speed (rad/s × radius ≈ m/s) is not given; show angular speed as rpm
  const wheelRpm = (f.wheelRotationSpeed[i] * 60) / (2 * Math.PI);
  return (
    <div className="panel" style={{ borderColor: slip > 1 ? 'rgba(255,77,94,0.45)' : undefined, transition: 'border-color .2s' }}>
      <div className="panel-head">
        <span className="panel-title">{NAMES[i]}</span>
        <div style={{ display: 'flex', gap: 5 }}>
          {rumble && <Badge color="#ffc53d">KERB</Badge>}
          {puddle > 0 && <Badge color="#4d8dff">SU {(puddle * 100).toFixed(0)}%</Badge>}
          {slip > 1 && <Badge color="#ff4d5e">KAYIYOR</Badge>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 34, height: 58, borderRadius: 9, background: color, boxShadow: `0 0 22px ${color}66`, transition: 'background .3s' }} />
        <div className="stat">
          <span className="v" style={{ fontSize: 30 }}>
            {tempOf(f.tireTemp[i], u).toFixed(0)}
            <small>{tempLabel(u)}</small>
          </span>
          <span className="sub">{Math.round(wheelRpm)} tekerlek rpm</span>
        </div>
      </div>
      <Meter label="Kayma oranı" value={f.tireSlipRatio[i]} min={-1} max={1} text={f.tireSlipRatio[i].toFixed(2)} color="#2de2e6" />
      <Meter label="Kayma açısı" value={f.tireSlipAngle[i]} min={-1} max={1} text={f.tireSlipAngle[i].toFixed(2)} color="#8a72f0" />
      <Meter label="Birleşik kayma" value={slip} max={2} text={slip.toFixed(2)} color={slip > 1 ? '#ff4d5e' : '#ff2e88'} />
      <Meter label="Süspansiyon" value={f.normalizedSuspensionTravel[i]} text={`${(f.normalizedSuspensionTravel[i] * 100).toFixed(0)}% · ${(f.suspensionTravelMeters[i] * 100).toFixed(1)} cm`} color="#3bdc84" />
      <Meter label="Yüzey titreşimi" value={f.surfaceRumble[i]} max={1} text={f.surfaceRumble[i].toFixed(2)} color="#ffc53d" />
      {f.tireWear && <Meter label="Aşınma" value={f.tireWear[i]} text={`${(f.tireWear[i] * 100).toFixed(0)}%`} color="#ff7a2e" />}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', padding: '2px 6px', borderRadius: 5, color, background: `${color}22`, border: `1px solid ${color}55` }}>{children}</span>
  );
}
