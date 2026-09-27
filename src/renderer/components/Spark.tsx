import { useId } from 'react';
import { store, type Channel } from '../store';

/** Tiny area chart of the last few seconds of one channel (re-renders with the live frame). */
export function Spark({ channel, color, seconds = 12, map = (v: number) => v, min, height = 34 }: { channel: Channel; color: string; seconds?: number; map?: (v: number) => number; min?: number; height?: number }) {
  const id = useId().replace(/:/g, '');
  const { t, data } = store.hist.window(seconds, [channel]);
  const raw = data[channel];
  if (raw.length < 2) return <div style={{ height }} />;
  const step = Math.max(1, Math.floor(raw.length / 90));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < raw.length; i += step) {
    xs.push(t[i]);
    ys.push(map(raw[i]));
  }
  const lo = min ?? Math.min(...ys);
  const hi = Math.max(...ys, lo + 1e-6);
  const W = 100;
  const px = (x: number) => ((x + seconds) / seconds) * W;
  const py = (y: number) => height - 2 - ((y - lo) / (hi - lo)) * (height - 6);
  const line = xs.map((x, i) => `${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block', marginTop: 6 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.35} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`${px(xs[0])},${height} ${line} ${px(xs[xs.length - 1])},${height}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
