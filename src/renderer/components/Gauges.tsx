import { useId } from 'react';
import type { Frame } from '../../shared/packet';
import { gearLabel, speedLabel, speedOf, type UnitPrefs } from '../../shared/units';
import { store } from '../store';

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const arcPath = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
};

const START = -135;
const SWEEP = 270;

export function redlineOf(f: Frame) {
  return f.engineMaxRpm * 0.9;
}

export function Tachometer({ f, units, size = 440 }: { f: Frame; units: UnitPrefs; size?: number }) {
  const id = useId();
  const max = Math.max(1000, Math.ceil((f.engineMaxRpm || 8000) / 1000) * 1000);
  const rpm = Math.min(f.currentEngineRpm, max);
  const redline = redlineOf(f);
  const c = size / 2;
  const R = c - 18;
  const ang = (v: number) => START + (v / max) * SWEEP;
  const progress = ang(rpm);
  const ticks = [];
  for (let v = 0; v <= max; v += 250) {
    const major = v % 1000 === 0;
    const a = ang(v);
    const [x1, y1] = polar(c, c, R - 2, a);
    const [x2, y2] = polar(c, c, R - (major ? 20 : 10), a);
    const hot = v >= redline;
    ticks.push(
      <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? '#ff4d5e' : major ? '#d6dbe6' : '#4a5063'} strokeWidth={major ? 2.4 : 1.3} strokeLinecap="round" />,
    );
    if (major) {
      const [tx, ty] = polar(c, c, R - 40, a);
      ticks.push(
        <text key={'t' + v} x={tx} y={ty + 6} textAnchor="middle" className="num" fontSize={18} fill={hot ? '#ff4d5e' : '#aab1c2'}>
          {v / 1000}
        </text>,
      );
    }
  }
  const [nx, ny] = polar(c, c, R - 26, progress);
  const [nbx, nby] = polar(c, c, R - 92, progress);
  const shift = rpm >= redline;
  const gear = gearLabel(f.gear);
  const spd = speedOf(f.speed, units);

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id + 'g'} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2de2e6" />
          <stop offset="0.6" stopColor="#ff2e88" />
          <stop offset="1" stopColor="#ff7a2e" />
        </linearGradient>
        <radialGradient id={id + 'bg'}>
          <stop offset="0" stopColor="#151925" />
          <stop offset="1" stopColor="#0a0c11" />
        </radialGradient>
        <filter id={id + 'glow'} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <circle cx={c} cy={c} r={R + 8} fill={`url(#${id}bg)`} stroke="rgba(255,255,255,0.06)" />
      <path d={arcPath(c, c, R + 1, START, START + SWEEP)} stroke="#1c202b" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={arcPath(c, c, R + 1, ang(redline), START + SWEEP)} stroke="rgba(255,77,94,0.35)" strokeWidth={10} fill="none" />
      {rpm > 1 && (
        <>
          <path d={arcPath(c, c, R + 1, START, Math.max(START + 0.5, progress))} stroke={`url(#${id}g)`} strokeWidth={10} fill="none" strokeLinecap="round" filter={`url(#${id}glow)`} opacity={0.7} />
          <path d={arcPath(c, c, R + 1, START, Math.max(START + 0.5, progress))} stroke={`url(#${id}g)`} strokeWidth={10} fill="none" strokeLinecap="round" />
        </>
      )}
      {ticks}
      <line x1={nbx} y1={nby} x2={nx} y2={ny} stroke={shift ? '#ff4d5e' : '#fff'} strokeWidth={4} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(255,46,136,.8))' }} />
      
      <text x={c} y={c - 58} textAnchor="middle" className="label" fill="#6b7285" fontSize={11} letterSpacing="0.2em">
        RPM × 1000
      </text>
      <text x={c} y={c + 34} textAnchor="middle" className="num" fontWeight={700} fontSize={112} fill={shift ? '#ff4d5e' : '#fff'} style={{ transition: 'fill .1s' }}>
        {gear}
      </text>
      <text x={c} y={c + 96} textAnchor="middle" className="num" fontWeight={600} fontSize={50} fill="#eef1f7">
        {Math.round(spd)}
      </text>
      <text x={c} y={c + 118} textAnchor="middle" fill="#6b7285" fontSize={12} fontWeight={600} letterSpacing="0.16em">
        {speedLabel(units).toUpperCase()}
      </text>
      <text x={c} y={c + 156} textAnchor="middle" className="mono" fill="#aab1c2" fontSize={15}>
        {Math.round(f.currentEngineRpm).toLocaleString('tr-TR')} rpm
      </text>
    </svg>
  );
}

export function ShiftLights({ f }: { f: Frame }) {
  const N = 15;
  const max = f.engineMaxRpm || 8000;
  const lo = max * 0.68;
  const hi = redlineOf(f);
  const k = Math.max(0, Math.min(1, (f.currentEngineRpm - lo) / (hi - lo)));
  const lit = Math.round(k * N);
  const flash = f.currentEngineRpm >= hi && Math.floor(performance.now() / 90) % 2 === 0;
  return (
    <div style={{ display: 'flex', gap: 7, justifyContent: 'center', padding: '4px 0 2px' }}>
      {Array.from({ length: N }, (_, i) => {
        const color = flash ? '#4d8dff' : i < 5 ? '#3bdc84' : i < 10 ? '#ffc53d' : '#ff4d5e';
        const on = flash || i < lit;
        return (
          <div
            key={i}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: on ? color : '#161a23',
              boxShadow: on ? `0 0 14px ${color}, inset 0 -3px 6px rgba(0,0,0,.25)` : 'inset 0 2px 4px rgba(0,0,0,.6)',
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'background .05s',
            }}
          />
        );
      })}
    </div>
  );
}

export function VBar({ value, color, label, height = 170 }: { value: number; color: string; label: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
      <span className="num" style={{ fontSize: 18 }}>
        {Math.round(pct)}
      </span>
      <div style={{ position: 'relative', width: '100%', maxWidth: 34, height, borderRadius: 10, background: '#141821', overflow: 'hidden', border: '1px solid var(--line)' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${pct}%`,
            background: `linear-gradient(to top, ${color}88, ${color})`,
            boxShadow: `0 0 18px ${color}66`,
            borderRadius: 8,
          }}
        />
      </div>
      <span className="label">{label}</span>
    </div>
  );
}

export function Pedals({ f }: { f: Frame }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <VBar value={f.clutch / 2.55} color="#4d8dff" label="Debr." />
      <VBar value={f.brake / 2.55} color="#ff4d5e" label="Fren" />
      <VBar value={f.accel / 2.55} color="#3bdc84" label="Gaz" />
      <VBar value={f.handBrake / 2.55} color="#ffc53d" label="El F." />
    </div>
  );
}

export function SteeringWheel({ steer, size = 150 }: { steer: number; size?: number }) {
  const deg = (steer / 127) * 180;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `rotate(${deg}deg)` }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#2a2f3d" strokeWidth="9" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="url(#swg)" strokeWidth="9" strokeDasharray="30 234" strokeDashoffset="15" transform="rotate(-90 50 50)" />
        <defs>
          <linearGradient id="swg">
            <stop offset="0" stopColor="#ff2e88" />
            <stop offset="1" stopColor="#ff7a2e" />
          </linearGradient>
        </defs>
        <path d="M8 52 Q50 62 92 52" stroke="#2a2f3d" strokeWidth="7" fill="none" />
        <path d="M50 58 L50 92" stroke="#2a2f3d" strokeWidth="7" />
        <circle cx="50" cy="55" r="11" fill="#1b1f2a" stroke="#353b4c" />
      </svg>
      <div style={{ width: '100%', height: 6, borderRadius: 6, background: '#141821', position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: steer < 0 ? `${50 + (steer / 127) * 50}%` : '50%',
            width: `${Math.abs(steer / 127) * 50}%`,
            background: 'linear-gradient(90deg,#ff2e88,#ff7a2e)',
            borderRadius: 6,
          }}
        />
        <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: '#6b7285' }} />
      </div>
      <span className="mono muted" style={{ fontSize: 12 }}>
        {steer > 0 ? 'R ' : steer < 0 ? 'L ' : ''}
        {Math.round(Math.abs(steer / 127) * 100)}%
      </span>
    </div>
  );
}

export function GCircle({ size = 230, maxG = 2 }: { size?: number; maxG?: number }) {
  const trail = store.gTrail;
  const c = size / 2;
  const R = c - 14;
  const px = (g: number) => (g / maxG) * R;
  const cur = trail.at(-1) ?? { lat: 0, long: 0 };
  const pts = trail.map((p) => `${c + px(p.lat)},${c - px(p.long)}`).join(' ');
  const total = Math.hypot(cur.lat, cur.long);
  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, display: 'block', margin: '0 auto' }}>
        <defs>
          <radialGradient id="gcbg">
            <stop offset="0" stopColor="rgba(255,46,136,0.10)" />
            <stop offset="1" stopColor="rgba(255,46,136,0)" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={R} fill="url(#gcbg)" />
        {[0.5, 1, 1.5, 2].map((g) => (
          <circle key={g} cx={c} cy={c} r={px(g)} fill="none" stroke={g === 1 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'} strokeDasharray={g === 1 ? '' : '3 4'} />
        ))}
        <line x1={c - R} y1={c} x2={c + R} y2={c} stroke="rgba(255,255,255,0.07)" />
        <line x1={c} y1={c - R} x2={c} y2={c + R} stroke="rgba(255,255,255,0.07)" />
        <text x={c + px(1) + 3} y={c - 4} fill="#6b7285" fontSize={9}>
          1g
        </text>
        <text x={c} y={12} textAnchor="middle" fill="#6b7285" fontSize={9} letterSpacing=".1em">
          HIZLANMA
        </text>
        <text x={c} y={size - 4} textAnchor="middle" fill="#6b7285" fontSize={9} letterSpacing=".1em">
          FREN
        </text>
        <polyline points={pts} fill="none" stroke="#ff2e88" strokeOpacity={0.45} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={c + px(cur.lat)} cy={c - px(cur.long)} r={9} fill="#ff2e88" stroke="#0e1016" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 8px #ff2e88)' }} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }} className="mono">
        <span className="muted">Y {cur.lat.toFixed(2)}</span>
        <span>{total.toFixed(2)} g</span>
        <span className="muted">B {cur.long.toFixed(2)}</span>
      </div>
    </div>
  );
}

/** Horizontal meter, supports negative ranges (e.g. vacuum on boost). */
export function HMeter({ value, min, max, color, zero = 0 }: { value: number; min: number; max: number; color: string; zero?: number }) {
  const span = max - min;
  const z = ((zero - min) / span) * 100;
  const v = ((Math.max(min, Math.min(max, value)) - min) / span) * 100;
  const left = Math.min(z, v);
  const width = Math.abs(v - z);
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 6, background: '#141821', marginTop: 8 }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, background: color, borderRadius: 6, boxShadow: `0 0 10px ${color}66` }} />
      {min < zero && <div style={{ position: 'absolute', left: `${z}%`, top: -3, bottom: -3, width: 1, background: '#6b7285' }} />}
    </div>
  );
}
