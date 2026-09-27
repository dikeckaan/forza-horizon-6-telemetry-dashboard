import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import { store, type Channel } from '../store';

export interface SeriesDef {
  channel: Channel;
  label: string;
  color: string;
  /** value transform (unit conversion) */
  map?: (v: number) => number;
  step?: boolean;
}

interface Props {
  title: string;
  unit: string;
  series: SeriesDef[];
  windowSec: number;
  height?: number;
  range?: [number, number] | ((min: number, max: number) => [number, number]);
  digits?: number;
}

const AXIS = {
  stroke: '#6b7285',
  grid: { stroke: 'rgba(255,255,255,0.045)', width: 1 },
  ticks: { stroke: 'rgba(255,255,255,0.08)', width: 1, size: 4 },
  font: '11px "Inter Variable", sans-serif',
};

export function LiveChart({ title, unit, series, windowSec, height = 150, range, digits = 0 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const winRef = useRef(windowSec);
  winRef.current = windowSec;

  useEffect(() => {
    const el = host.current!;
    const legendEl = legend.current!;
    const valueEls = Array.from(legendEl.querySelectorAll<HTMLSpanElement>('[data-v]'));
    let cursorIdx: number | null = null;

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      padding: [8, 8, 0, 0],
      cursor: {
        sync: { key: 'live' },
        points: { size: 7, width: 2, stroke: '#0e1016' },
        drag: { x: false, y: false },
      },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: range ? { range: typeof range === 'function' ? (_u, min, max) => range(min, max) : range } : {},
      },
      axes: [
        { ...AXIS, size: 30, values: (_u, vals) => vals.map((v) => `${v.toFixed(0)}s`) },
        { ...AXIS, size: 48, values: (_u, vals) => vals.map((v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(Math.abs(v) < 10 && v % 1 ? 1 : 0))) },
      ],
      series: [
        {},
        ...series.map((s) => ({
          stroke: s.color,
          width: 2,
          points: { show: false },
          paths: s.step ? uPlot.paths.stepped!({ align: 1 }) : undefined,
        })),
      ],
      hooks: {
        setCursor: [
          (u) => {
            cursorIdx = u.cursor.idx ?? null;
            paintLegend(u);
          },
        ],
      },
    };

    const paintLegend = (u: uPlot) => {
      const n = u.data[0]?.length ?? 0;
      if (!n) return;
      const idx = cursorIdx ?? n - 1;
      valueEls.forEach((vEl, i) => {
        const v = u.data[i + 1]?.[idx];
        vEl.textContent = v == null ? '—' : (v as number).toFixed(digits);
      });
    };

    const u = new uPlot(opts, [[], ...series.map(() => [])], el);
    let raf = 0;
    let lastV = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (store.version === lastV) return;
      lastV = store.version;
      const { t, data } = store.hist.window(winRef.current, series.map((s) => s.channel));
      const cols = series.map((s) => (s.map ? data[s.channel].map(s.map) : data[s.channel]));
      u.setData([t, ...cols], true);
      u.setScale('x', { min: -winRef.current, max: 0 });
      paintLegend(u);
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      u.destroy();
    };
    // series identity is stable per mount (parent keys by config)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, digits]);

  return (
    <div className="panel" style={{ paddingBottom: 8 }}>
      <div className="panel-head" style={{ marginBottom: 4 }}>
        <span className="panel-title">
          {title} <span className="muted" style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>{unit}</span>
        </span>
        <div ref={legend} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {series.map((s) => (
            <span key={s.channel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />
              <span className="muted">{s.label}</span>
              <span className="mono" data-v style={{ minWidth: 42, textAlign: 'right', color: 'var(--ink)' }}>
                —
              </span>
            </span>
          ))}
        </div>
      </div>
      <div ref={host} />
    </div>
  );
}
