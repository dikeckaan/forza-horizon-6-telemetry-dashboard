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
  return (f.engineMaxRpm || 8000) * 0.9;
}

export function Tachometer({ f, units, size = 460 }: { f: Frame; units: UnitPrefs; size?: number }) {
  const id = useId().replace(/:/g, '');
  const max = Math.max(1000, Math.ceil((f.engineMaxRpm || 8000) / 1000) * 1000);
  const rpm = Math.min(f.currentEngineRpm, max);
  const redline = redlineOf(f);
  const c = size / 2;
  const R = c - 26;
  const ang = (v: number) => START + (v / max) * SWEEP;
  const progress = ang(rpm);
  const k = rpm / max;
  const shift = f.currentEngineRpm > 0 && rpm >= redline;
  const blink = shift && Math.floor(performance.now() / 110) % 2 === 0;
  // arc colour walks cyan → pink → orange → red as revs climb
  const glow = k < 0.6 ? '#2de2e6' : k < 0.8 ? '#ff2e88' : k < 0.9 ? '#ff7a2e' : '#ff3b4e';

  const ticks = [];
  for (let v = 0; v <= max; v += 250) {
    const major = v % 1000 === 0;
    const half = v % 500 === 0;
    const a = ang(v);
    const [x1, y1] = polar(c, c, R - 6, a);
    const [x2, y2] = polar(c, c, R - (major ? 30 : half ? 20 : 14), a);
    const hot = v >= redline;
    const lit = v <= rpm;
    ticks.push(
      <line
        key={v}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={hot ? '#ff3b4e' : lit ? '#ffffff' : major ? '#9aa2b4' : '#3a4050'}
        strokeWidth={major ? 3 : half ? 2 : 1.3}
        strokeLinecap="round"
        style={lit && major ? { filter: `drop-shadow(0 0 4px ${glow})` } : undefined}
      />,
    );
    if (major) {
      const [tx, ty] = polar(c, c, R - 52, a);
      ticks.push(
        <text key={'t' + v} x={tx} y={ty + 7} textAnchor="middle" className="num" fontSize={22} fontWeight={700} fontStyle="italic" fill={hot ? '#ff3b4e' : lit ? '#fff' : '#7d8599'}>
          {v / 1000}
        </text>,
      );
    }
  }
  // tapered needle
  const [tip] = [polar(c, c, R - 18, progress)];
  const [b1, b2] = [polar(c, c, 14, progress - 90), polar(c, c, 14, progress + 90)];
  const [tail] = [polar(c, c, 34, progress + 180)];
  const gear = gearLabel(f.gear);
  const spd = speedOf(f.speed, units);

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id + 'arc'} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2de2e6" />
          <stop offset="0.55" stopColor="#ff2e88" />
          <stop offset="0.85" stopColor="#ff7a2e" />
          <stop offset="1" stopColor="#ff3b4e" />
        </linearGradient>
        <linearGradient id={id + 'bezel'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b6172" />
          <stop offset="0.35" stopColor="#1a1d26" />
          <stop offset="0.65" stopColor="#2a2e3a" />
          <stop offset="1" stopColor="#0c0e13" />
        </linearGradient>
        <radialGradient id={id + 'face'} cx="50%" cy="42%">
          <stop offset="0" stopColor="#1b1f2b" />
          <stop offset="0.7" stopColor="#0d1017" />
          <stop offset="1" stopColor="#07080c" />
        </radialGradient>
        <radialGradient id={id + 'hot'} cx="50%" cy="50%">
          <stop offset="0.55" stopColor={glow} stopOpacity={0} />
          <stop offset="1" stopColor={glow} stopOpacity={0.22 + k * 0.25} />
        </radialGradient>
        {/* carbon weave */}
        <pattern id={id + 'carbon'} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#0d1016" />
          <rect width="4" height="4" fill="#141821" />
          <rect x="4" y="4" width="4" height="4" fill="#141821" />
        </pattern>
        <filter id={id + 'glow'} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={id + 'soft'} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* bezel + face */}
      <circle cx={c} cy={c} r={c - 4} fill={`url(#${id}bezel)`} />
      <circle cx={c} cy={c} r={c - 12} fill={`url(#${id}carbon)`} />
      <circle cx={c} cy={c} r={c - 12} fill={`url(#${id}face)`} opacity={0.82} />
      <circle cx={c} cy={c} r={c - 12} fill={`url(#${id}hot)`} />
      <circle cx={c} cy={c} r={c - 12} fill="none" stroke="rgba(255,255,255,0.08)" />

      {/* track, redline band, live arc */}
      <path d={arcPath(c, c, R, START, START + SWEEP)} stroke="#181b24" strokeWidth={12} fill="none" strokeLinecap="round" />
      <path d={arcPath(c, c, R, ang(redline), START + SWEEP)} stroke="rgba(255,59,78,0.45)" strokeWidth={12} fill="none" />
      {rpm > 1 && (
        <>
          <path d={arcPath(c, c, R, START, Math.max(START + 0.5, progress))} stroke={`url(#${id}arc)`} strokeWidth={14} fill="none" strokeLinecap="round" filter={`url(#${id}glow)`} opacity={0.55 + k * 0.4} />
          <path d={arcPath(c, c, R, START, Math.max(START + 0.5, progress))} stroke={`url(#${id}arc)`} strokeWidth={12} fill="none" strokeLinecap="round" />
        </>
      )}
      {ticks}

      {/* needle */}
      <polygon points={`${tip[0]},${tip[1]} ${b1[0]},${b1[1]} ${tail[0]},${tail[1]} ${b2[0]},${b2[1]}`} fill={glow} filter={`url(#${id}soft)`} opacity={0.9} />
      <polygon points={`${tip[0]},${tip[1]} ${b1[0]},${b1[1]} ${tail[0]},${tail[1]} ${b2[0]},${b2[1]}`} fill="#fff" />
      <circle cx={c} cy={c} r={18} fill="#0b0d12" stroke="#3a3f4d" strokeWidth={2} />
      <circle cx={c} cy={c} r={6} fill={glow} />

      {/* readouts */}
      <text x={c} y={c - 70} textAnchor="middle" fill="#6b7285" fontSize={11} fontWeight={600} letterSpacing="0.24em">
        RPM × 1000
      </text>
      <g transform={`translate(${c}, ${c + 70})`}>
        <rect x={-46} y={-60} width={92} height={84} rx={16} fill="rgba(0,0,0,0.55)" stroke={shift ? '#ff3b4e' : 'rgba(255,255,255,0.12)'} strokeWidth={shift ? 2.5 : 1} style={shift ? { filter: 'drop-shadow(0 0 10px #ff3b4e)' } : undefined} />
        <text y={10} textAnchor="middle" className="num" fontWeight={700} fontSize={78} fontStyle="italic" fill={shift ? '#ff3b4e' : '#fff'}>
          {gear}
        </text>
      </g>
      <text x={c} y={c + 140} textAnchor="middle" className="num" fontWeight={700} fontStyle="italic" fontSize={46} fill="#eef1f7">
        {Math.round(spd)}
        <tspan fontSize={14} fill="#6b7285" dx={6} fontStyle="normal" letterSpacing="0.14em">
          {speedLabel(units).toUpperCase()}
        </tspan>
      </text>
      <text x={c} y={c + 166} textAnchor="middle" className="mono" fill="#8d95a8" fontSize={13}>
        {Math.round(f.currentEngineRpm).toLocaleString('tr-TR')} rpm
      </text>
      {blink && (
        <text x={c} y={c - 30} textAnchor="middle" className="num" fontWeight={700} fontSize={26} letterSpacing="0.3em" fill="#ff3b4e" style={{ filter: 'drop-shadow(0 0 8px #ff3b4e)' }}>
          SHIFT
        </text>
      )}
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
  const flash = f.currentEngineRpm > 0 && f.currentEngineRpm >= hi && Math.floor(performance.now() / 90) % 2 === 0;
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

/** Segmented LED column. */
export function LedBar({ value, color, label, segments = 22, height = 190 }: { value: number; color: string; label: string; segments?: number; height?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * segments);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
      <span className="num" style={{ fontSize: 20, fontStyle: 'italic', color: pct > 2 ? '#fff' : 'var(--ink-3)' }}>
        {Math.round(pct)}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3, height, width: '100%', maxWidth: 38, padding: 4, borderRadius: 10, background: '#0a0c11', border: '1px solid var(--line)' }}>
        {Array.from({ length: segments }, (_, i) => {
          const on = i < lit;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                borderRadius: 3,
                background: on ? color : '#171a22',
                opacity: on ? 0.55 + (i / segments) * 0.45 : 1,
                boxShadow: on ? `0 0 8px ${color}99` : 'none',
              }}
            />
          );
        })}
      </div>
      <span className="label">{label}</span>
    </div>
  );
}

export function Pedals({ f }: { f: Frame }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <LedBar value={f.clutch / 2.55} color="#4d8dff" label="Debr." />
      <LedBar value={f.brake / 2.55} color="#ff3b4e" label="Fren" />
      <LedBar value={f.accel / 2.55} color="#3bdc84" label="Gaz" />
      <LedBar value={f.handBrake / 2.55} color="#ffc53d" label="El F." />
    </div>
  );
}

export function SteeringWheel({ steer, size = 170 }: { steer: number; size?: number }) {
  const deg = (steer / 127) * 180;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg width={size} height={size * 0.82} viewBox="0 0 120 98" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="swGrip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b2f3a" />
            <stop offset="1" stopColor="#12141a" />
          </linearGradient>
        </defs>
        <g transform={`rotate(${deg} 60 50)`}>
          {/* flat-bottom racing rim */}
          <path d="M 18 66 A 44 44 0 1 1 102 66 L 88 84 L 32 84 Z" fill="none" stroke="url(#swGrip)" strokeWidth={11} strokeLinejoin="round" />
          <path d="M 18 66 A 44 44 0 1 1 102 66 L 88 84 L 32 84 Z" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
          {/* 12 o'clock marker */}
          <rect x={56} y={1} width={8} height={11} rx={2} fill="#ff2e88" style={{ filter: 'drop-shadow(0 0 4px #ff2e88)' }} />
          {/* spokes + hub with shift lights */}
          <path d="M 22 56 L 44 52 M 98 56 L 76 52 M 60 66 L 60 82" stroke="#1d2029" strokeWidth={9} strokeLinecap="round" />
          <rect x={40} y={40} width={40} height={26} rx={8} fill="#0d0f14" stroke="#343a48" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={46 + i * 7} cy={47} r={2.2} fill={Math.abs(steer) / 127 > i / 5 ? (i < 2 ? '#3bdc84' : i < 4 ? '#ffc53d' : '#ff3b4e') : '#262a35'} />
          ))}
          <text x={60} y={60} textAnchor="middle" fontSize={7} fill="#6b7285" fontWeight={700} letterSpacing="0.1em">
            FH
          </text>
        </g>
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
            boxShadow: '0 0 10px rgba(255,46,136,.5)',
          }}
        />
        <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: '#6b7285' }} />
      </div>
      <span className="mono muted" style={{ fontSize: 12 }}>
        {steer > 0 ? 'SAĞ ' : steer < 0 ? 'SOL ' : ''}
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
