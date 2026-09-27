import type { SketchfabModel } from './ipc';

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0);

const JUNK = /interior|engine|wheel|\brim\b|tire|tyre|toy|lego|low ?poly|lowpoly|kit\b|parts?\b|chassis|seat|steering|cockpit|wreck|destroyed|burnt|rusty|lod\b/;

/**
 * Ranks search results for a real car name ("2019 Volkswagen Golf R"):
 * name overlap first, then sane download size and polygon count.
 */
export function scoreModel(m: SketchfabModel, carName: string): number {
  const want = words(carName.replace(/\(.*?\)/g, ''));
  const year = want.find((w) => /^(19|20)\d\d$/.test(w));
  const core = want.filter((w) => w !== year);
  const have = new Set(words(m.name));
  const hits = core.filter((w) => have.has(w)).length;
  let s = (hits / Math.max(1, core.length)) * 10;
  if (core.length && hits === 0) s -= 10;
  if (year && have.has(year)) s += 2;
  if (JUNK.test(m.name.toLowerCase())) s -= 8;
  const mb = m.glbBytes / 1e6;
  if (!m.glbBytes) s -= 1;
  else if (mb > 80) s -= 10;
  else if (mb > 45) s -= 3;
  else if (mb >= 3) s += 1.5;
  if (m.faces > 1_500_000) s -= 6;
  else if (m.faces >= 30_000 && m.faces <= 800_000) s += 1.5;
  else if (m.faces < 8_000) s -= 3;
  return s;
}

export function pickBest(results: SketchfabModel[], carName: string): SketchfabModel | null {
  let best: SketchfabModel | null = null;
  let bestScore = 4; // below this nothing is a convincing match
  for (const m of results) {
    const sc = scoreModel(m, carName);
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  return best;
}
