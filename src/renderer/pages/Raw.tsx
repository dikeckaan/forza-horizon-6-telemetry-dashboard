import { useState } from 'react';
import { useFrame } from '../hooks';
import type { Frame } from '../../shared/packet';
import { t } from '../i18n';

const W = ['FL', 'FR', 'RL', 'RR'];

const fmt = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  if (v === null) return '—';
  return String(v);
};

/** Every field of the packet, live — for the curious and for debugging. */
export function RawPage() {
  const f = useFrame();
  const [q, setQ] = useState('');
  const rows: [string, string][] = [];
  for (const [k, v] of Object.entries(f) as [keyof Frame, unknown][]) {
    if (Array.isArray(v)) v.forEach((x, i) => rows.push([`${k}.${W[i]}`, fmt(x)]));
    else rows.push([k, fmt(v)]);
  }
  const shown = q ? rows.filter(([k]) => k.toLowerCase().includes(q.toLowerCase())) : rows;
  const half = Math.ceil(shown.length / 2);

  return (
    <div className="grid">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input type="text" placeholder={t('views.raw.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <span className="muted">
          {t('views.raw.fields', { n: rows.length })} · format <b className="mono">{f.format}</b> · {t('views.raw.bytes', { n: f.size })}
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {[shown.slice(0, half), shown.slice(half)].map((part, i) => (
          <div key={i} className="panel" style={{ padding: 0 }}>
            <table className="data">
              <tbody>
                {part.map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono muted" style={{ padding: '5px 12px' }}>
                      {k}
                    </td>
                    <td className="mono r" style={{ padding: '5px 12px' }}>
                      {v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
