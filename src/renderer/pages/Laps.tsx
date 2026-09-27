import { useMemo, useState } from 'react';
import { useFrame, useUnits } from '../hooks';
import { store } from '../store';
import { fmtDelta, fmtLap, speedLabel, speedOf } from '../../shared/units';
import { timeAtDistance, type Lap } from '../../shared/laps';
import { StaticChart } from '../components/StaticChart';
import { TrackCanvas } from '../components/TrackCanvas';

const A = '#1a9fb0';
const B = '#f03a7e';

export function LapsPage() {
  const f = useFrame();
  const u = useUnits();
  const laps = store.laps.laps;
  const best = store.laps.best;
  const cur = store.laps.current;
  const delta = store.laps.delta();
  const [sel, setSel] = useState<number[]>([]);
  // laps array identity changes only on reset; version bumps on structure change
  const lapsVersion = store.laps.version;

  // Default comparison: best lap vs. the most recent one.
  const last = laps.at(-1);
  const effSel = sel.length ? sel : best ? (last && last !== best ? [best.number, last.number] : [best.number]) : [];
  const effKey = effSel.join(',');
  const selected = useMemo(() => effSel.map((n) => laps.find((l) => l.number === n)).filter(Boolean) as Lap[], [effKey, laps, lapsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!laps.length && (!cur || f.lapNumber === 0) && f.currentLap === 0) {
    return (
      <div className="panel empty" style={{ minHeight: 400 }}>
        <div>
          <h3>Henüz tur yok</h3>
          Turlar yarışlarda ve tur bazlı etkinliklerde otomatik olarak ayrılır.
          <br />
          Serbest sürüşte oyun tur/mesafe verisi göndermez — sürüşünü <b>Harita</b> ve <b>Grafikler</b> ekranlarında izleyebilirsin.
        </div>
      </div>
    );
  }

  const toggle = (n: number) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s.slice(-1), n]));

  return (
    <div className="grid">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Big label={`Tur ${f.lapNumber + 1}`} value={fmtLap(f.currentLap)} />
        <Big label="Delta (en iyiye göre)" value={isNaN(delta) ? '—' : fmtDelta(delta)} color={isNaN(delta) ? undefined : delta <= 0 ? 'var(--good)' : 'var(--bad)'} />
        <Big label="En iyi" value={fmtLap(best?.time ?? f.bestLap)} color="#b36bff" />
        <Big label="Son" value={fmtLap(f.lastLap)} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(360px, 460px) 1fr' }}>
        <div className="panel" style={{ padding: 0, overflow: 'auto', maxHeight: 460 }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>Tur</th>
                <th className="r">Süre</th>
                <th className="r">Fark</th>
                <th className="r">Vmax</th>
              </tr>
            </thead>
            <tbody>
              {[...laps].reverse().map((l) => {
                const isBest = best === l;
                const idx = effSel.indexOf(l.number);
                return (
                  <tr key={l.number} onClick={() => toggle(l.number)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 4, border: '1.5px solid var(--line-2)', background: idx === -1 ? 'transparent' : idx === 0 ? A : B }} />
                    </td>
                    <td className="num" style={{ fontSize: 16 }}>
                      {l.number + 1}
                    </td>
                    <td className="r mono" style={{ color: isBest ? '#b36bff' : undefined, fontWeight: isBest ? 700 : 400 }}>
                      {fmtLap(l.time)}
                    </td>
                    <td className="r mono muted">{best && !isBest ? fmtDelta(l.time - best.time) : isBest ? 'EN İYİ' : ''}</td>
                    <td className="r mono">
                      {Math.round(speedOf(l.maxSpeed, u))} <span className="muted">{speedLabel(u)}</span>
                    </td>
                  </tr>
                );
              })}
              {!laps.length && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 20 }}>
                    İlk tur tamamlanınca burada görünecek.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel" style={{ padding: 0, overflow: 'hidden', minHeight: 320 }}>
          <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 1 }} className="panel-title">
            {selected.length ? `Çizgi · ${selected.map((l) => `Tur ${l.number + 1}`).join(' vs ')}` : 'Karşılaştırmak için soldan 1–2 tur seç'}
          </div>
          <TrackCanvas
            key={selected.map((l) => l.number).join(',')}
            colorBy="plain"
            showCar={false}
            showTrail={false}
            overlays={selected.map((l, i) => ({ points: l.samples, color: i === 0 ? A : B, width: 3 }))}
          />
        </div>
      </div>

      {selected.length > 0 && <Comparison laps={selected} />}
    </div>
  );
}

function Comparison({ laps }: { laps: Lap[] }) {
  const u = useUnits();
  const data = useMemo(() => {
    const ref = laps[0];
    const maxD = Math.min(...laps.map((l) => l.samples.at(-1)?.d ?? 0));
    const step = 5;
    const x: number[] = [];
    for (let d = 0; d <= maxD; d += step) x.push(d);
    const at = (l: Lap, key: 'speed' | 'accel' | 'brake' | 'gear') => {
      let j = 0;
      return x.map((d) => {
        while (j < l.samples.length - 2 && l.samples[j + 1].d < d) j++;
        const a = l.samples[j];
        const b = l.samples[j + 1] ?? a;
        const k = b.d === a.d ? 0 : Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d)));
        return a[key] + (b[key] - a[key]) * k;
      });
    };
    const series = laps.map((l, i) => ({
      l,
      color: i === 0 ? A : B,
      speed: at(l, 'speed').map((v) => speedOf(v, u)),
      thr: at(l, 'accel').map((v) => v / 2.55),
      brk: at(l, 'brake').map((v) => v / 2.55),
      gear: at(l, 'gear'),
    }));
    const delta = laps.length === 2 ? x.map((d) => {
      const a = timeAtDistance(ref.samples, d);
      const b = timeAtDistance(laps[1].samples, d);
      return isNaN(a) || isNaN(b) ? null : b - a;
    }) : null;
    return { x, series, delta };
  }, [laps, u]);

  const name = (l: Lap) => `Tur ${l.number + 1}`;
  return (
    <div className="grid">
      <StaticChart title="Hız" unit={speedLabel(u)} x={data.x} series={data.series.map((s) => ({ label: name(s.l), color: s.color, data: s.speed }))} height={200} />
      {data.delta && (
        <StaticChart title="Zaman farkı" unit={`sn (${name(laps[1])} − ${name(laps[0])})`} x={data.x} series={[{ label: 'Δ', color: '#c47f1c', data: data.delta }]} digits={3} height={130} />
      )}
      <StaticChart
        title="Gaz"
        unit="%"
        x={data.x}
        series={data.series.map((s) => ({ label: name(s.l), color: s.color, data: s.thr }))}
        range={[0, 102]}
        height={120}
      />
      <StaticChart
        title="Fren"
        unit="%"
        x={data.x}
        series={data.series.map((s) => ({ label: name(s.l), color: s.color, data: s.brk }))}
        range={[0, 102]}
        height={120}
      />
      <StaticChart title="Vites" x={data.x} series={data.series.map((s) => ({ label: name(s.l), color: s.color, data: s.gear }))} height={100} />
    </div>
  );
}

function Big({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="panel stat">
      <span className="label">{label}</span>
      <span className="mono" style={{ fontSize: 30, color, marginTop: 4 }}>
        {value}
      </span>
    </div>
  );
}
