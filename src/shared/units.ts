export interface UnitPrefs {
  speed: 'kmh' | 'mph';
  temp: 'c' | 'f';
  power: 'hp' | 'kw';
  torque: 'nm' | 'lbft';
  pressure: 'bar' | 'psi';
}

export const DEFAULT_UNITS: UnitPrefs = { speed: 'kmh', temp: 'c', power: 'hp', torque: 'nm', pressure: 'bar' };

export const G = 9.80665;

export const speedOf = (ms: number, u: UnitPrefs) => (u.speed === 'kmh' ? ms * 3.6 : ms * 2.2369363);
export const speedLabel = (u: UnitPrefs) => (u.speed === 'kmh' ? 'km/h' : 'mph');

export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const tempOf = (f: number, u: UnitPrefs) => (u.temp === 'c' ? fToC(f) : f);
export const tempLabel = (u: UnitPrefs) => (u.temp === 'c' ? '°C' : '°F');

export const powerOf = (w: number, u: UnitPrefs) => (u.power === 'hp' ? w / 745.699872 : w / 1000);
export const powerLabel = (u: UnitPrefs) => (u.power === 'hp' ? 'hp' : 'kW');

export const torqueOf = (nm: number, u: UnitPrefs) => (u.torque === 'nm' ? nm : nm * 0.7375621);
export const torqueLabel = (u: UnitPrefs) => (u.torque === 'nm' ? 'Nm' : 'lb·ft');

export const pressureOf = (psi: number, u: UnitPrefs) => (u.pressure === 'psi' ? psi : psi / 14.5037738);
export const pressureLabel = (u: UnitPrefs) => (u.pressure === 'psi' ? 'psi' : 'bar');

export const CAR_CLASSES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
export const carClassName = (c: number) => CAR_CLASSES[c] ?? `#${c}`;
export const CLASS_COLORS: Record<string, string> = {
  D: '#3fb6ff',
  C: '#f5d63d',
  B: '#ff8c2e',
  A: '#ff4d4d',
  S1: '#b36bff',
  S2: '#3a7bff',
  X: '#3bdc84',
};

export const drivetrainName = (d: number) => ['FWD', 'RWD', 'AWD'][d] ?? '—';

export function gearLabel(g: number): string {
  if (g === 0) return 'R';
  if (g === 11 || g > 10) return 'N';
  return String(g);
}

/** Lap time seconds → m:ss.mmm */
export function fmtLap(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '–:––.–––';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function fmtDelta(sec: number): string {
  if (!isFinite(sec)) return '±0.000';
  return `${sec >= 0 ? '+' : '−'}${Math.abs(sec).toFixed(3)}`;
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
