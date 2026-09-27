import list from './data/fh6-cars.json';

/** FH6 CarOrdinal → "2019 Volkswagen Golf R" */
const byOrdinal = new Map<number, string>();
for (const [name, ord] of Object.entries(list as Record<string, string>)) {
  const o = Number(ord);
  // the list sometimes carries a pack suffix; the first entry wins
  if (!byOrdinal.has(o)) byOrdinal.set(o, name);
}

export function knownCarName(ordinal: number): string | null {
  return byOrdinal.get(ordinal) ?? null;
}

/** user override → FH6 list → null */
export function carName(ordinal: number, overrides: Record<string, string> = {}): string | null {
  return overrides[String(ordinal)] ?? knownCarName(ordinal);
}

/** "2023 Ford F-150 Raptor R (Welcome Pack)" → "Ford F-150 Raptor R" (for model searches) */
export function searchName(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/^\d{4}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const carCount = byOrdinal.size;
