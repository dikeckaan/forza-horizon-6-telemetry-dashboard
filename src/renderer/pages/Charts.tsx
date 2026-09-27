import { useState } from 'react';
import { LiveChart, type SeriesDef } from '../components/LiveChart';
import { useUnits } from '../hooks';
import { powerLabel, powerOf, pressureLabel, pressureOf, speedLabel, speedOf, tempLabel, tempOf, type UnitPrefs } from '../../shared/units';

// validated categorical palette (mirrors --s1..--s4); uPlot draws on canvas so no CSS vars
const C = ['#1a9fb0', '#f03a7e', '#c47f1c', '#8a72f0'];

interface Group {
  id: string;
  title: string;
  unit: (u: UnitPrefs) => string;
  series: (u: UnitPrefs) => SeriesDef[];
  range?: [number, number] | ((min: number, max: number) => [number, number]);
  digits?: number;
  height?: number;
}

const wheels = (prefix: 'temp' | 'susp' | 'slip', map?: (v: number) => number): SeriesDef[] =>
  (['FL', 'FR', 'RL', 'RR'] as const).map((w, i) => ({ channel: `${prefix}${w}` as SeriesDef['channel'], label: w, color: C[i], map }));

const GROUPS: Group[] = [
  { id: 'speed', title: 'Hız', unit: speedLabel, series: (u) => [{ channel: 'speed', label: 'Hız', color: C[0], map: (v) => speedOf(v, u) }], range: (_a, b) => [0, Math.max(50, b * 1.05)] },
  { id: 'rpm', title: 'Devir', unit: () => 'rpm', series: () => [{ channel: 'rpm', label: 'RPM', color: C[1] }], range: (_a, b) => [0, Math.max(1000, b * 1.05)] },
  { id: 'gear', title: 'Vites', unit: () => '', series: () => [{ channel: 'gear', label: 'Vites', color: C[3], step: true }], range: (_a, b) => [0, Math.max(6, b + 1)], height: 90 },
  {
    id: 'pedals',
    title: 'Pedallar',
    unit: () => '%',
    series: () => [
      { channel: 'throttle', label: 'Gaz', color: '#3bdc84' },
      { channel: 'brake', label: 'Fren', color: '#ff4d5e' },
      { channel: 'clutch', label: 'Debriyaj', color: '#4d8dff' },
      { channel: 'handbrake', label: 'El freni', color: '#ffc53d' },
    ],
    range: [0, 102],
  },
  { id: 'steer', title: 'Direksiyon', unit: () => '% (− sol / + sağ)', series: () => [{ channel: 'steer', label: 'Direksiyon', color: C[0] }], range: [-102, 102], height: 110 },
  {
    id: 'g',
    title: 'G-kuvveti',
    unit: () => 'g',
    series: () => [
      { channel: 'gLat', label: 'Yanal', color: C[0] },
      { channel: 'gLong', label: 'Boyuna', color: C[1] },
    ],
    range: (a, b) => {
      const m = Math.max(1.2, Math.abs(a), Math.abs(b)) * 1.05;
      return [-m, m];
    },
    digits: 2,
  },
  { id: 'power', title: 'Güç', unit: powerLabel, series: (u) => [{ channel: 'power', label: 'Güç', color: C[2], map: (v) => powerOf(v, u) }], range: (_a, b) => [0, Math.max(50, b * 1.05)] },
  { id: 'boost', title: 'Turbo', unit: pressureLabel, series: (u) => [{ channel: 'boost', label: 'Turbo', color: C[0], map: (v) => pressureOf(v, u) }], digits: 1 },
  { id: 'temp', title: 'Lastik sıcaklığı', unit: tempLabel, series: (u) => wheels('temp', (v) => tempOf(v, u)), digits: 0 },
  { id: 'susp', title: 'Süspansiyon', unit: () => '% sıkışma', series: () => wheels('susp', (v) => v * 100), range: [0, 100] },
  { id: 'slip', title: 'Birleşik kayma', unit: () => '', series: () => wheels('slip'), range: (_a, b) => [0, Math.max(1.5, b * 1.05)], digits: 2 },
];

const DEFAULT_ON = ['speed', 'rpm', 'pedals', 'steer', 'g', 'temp'];

export function ChartsPage() {
  const u = useUnits();
  const [win, setWin] = useState(30);
  const [on, setOn] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('charts') ?? '') as string[];
    } catch {
      return DEFAULT_ON;
    }
  });
  const toggle = (id: string) => {
    const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
    setOn(next);
    try {
      localStorage.setItem('charts', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="seg">
          {[10, 30, 60, 120].map((s) => (
            <button key={s} className={win === s ? 'on' : ''} onClick={() => setWin(s)}>
              {s} sn
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {GROUPS.map((g) => (
            <button key={g.id} className={`btn ${on.includes(g.id) ? '' : 'ghost'}`} style={{ height: 28, opacity: on.includes(g.id) ? 1 : 0.55 }} onClick={() => toggle(g.id)}>
              {g.title}
            </button>
          ))}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))' }}>
        {GROUPS.filter((g) => on.includes(g.id)).map((g) => (
          <LiveChart key={`${g.id}-${JSON.stringify(u)}`} title={g.title} unit={g.unit(u)} series={g.series(u)} windowSec={win} range={g.range} digits={g.digits} height={g.height} />
        ))}
      </div>
    </div>
  );
}
