import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

interface Props {
  title: string;
  unit?: string;
  x: number[];
  series: { label: string; color: string; data: (number | null)[]; dash?: number[] }[];
  height?: number;
  xLabel?: (v: number) => string;
  range?: [number, number];
  digits?: number;
}

const AXIS = {
  stroke: '#6b7285',
  grid: { stroke: 'rgba(255,255,255,0.045)', width: 1 },
  ticks: { stroke: 'rgba(255,255,255,0.08)', width: 1, size: 4 },
  font: '11px "Inter Variable", sans-serif',
};

/** Non-streaming chart with hover values, used for lap comparisons. */
export function StaticChart({ title, unit, x, series, height = 170, xLabel = (v) => `${Math.round(v)} m`, range, digits = 0 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const valueEls = Array.from(legend.current!.querySelectorAll<HTMLSpanElement>('[data-v]'));
    const xEl = legend.current!.querySelector<HTMLSpanElement>('[data-x]');
    const u = new uPlot(
      {
        width: el.clientWidth,
        height,
        padding: [8, 8, 0, 0],
        legend: { show: false },
        cursor: { sync: { key: 'laps' }, points: { size: 7, width: 2, stroke: '#0e1016' }, drag: { x: true, y: false } },
        scales: { x: { time: false }, y: range ? { range } : {} },
        axes: [
          { ...AXIS, size: 30, values: (_u, v) => v.map(xLabel) },
          { ...AXIS, size: 48 },
        ],
        series: [{}, ...series.map((s) => ({ stroke: s.color, width: 2, dash: s.dash, points: { show: false } }))],
        hooks: {
          setCursor: [
            (u) => {
              const i = u.cursor.idx;
              valueEls.forEach((e, k) => {
                const v = i == null ? null : u.data[k + 1][i];
                e.textContent = v == null ? '—' : (v as number).toFixed(digits);
              });
              if (xEl) xEl.textContent = i == null ? '' : xLabel(u.data[0][i]);
            },
          ],
        },
      },
      [x, ...series.map((s) => s.data)] as uPlot.AlignedData,
      el,
    );
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [x, series, height, xLabel, range, digits]);

  return (
    <div className="panel" style={{ paddingBottom: 8 }}>
      <div className="panel-head" style={{ marginBottom: 4 }} ref={legend}>
        <span className="panel-title">
          {title} {unit && <span className="muted" style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>{unit}</span>}{' '}
          <span className="mono muted" data-x style={{ letterSpacing: 0, marginLeft: 8 }} />
        </span>
        <div style={{ display: 'flex', gap: 14 }}>
          {series.map((s) => (
            <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />
              <span className="muted">{s.label}</span>
              <span className="mono" data-v style={{ minWidth: 40, textAlign: 'right' }}>
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
