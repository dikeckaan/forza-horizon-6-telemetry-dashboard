import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { _dicts } from '../src/renderer/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('i18n', () => {
  const en = _dicts.EN as Record<string, string>;

  it('Turkish covers every key with the same placeholders', () => {
    const tr = _dicts.TR as Record<string, string>;
    for (const k of Object.keys(en)) {
      expect(tr[k], `tr missing ${k}`).toBeTypeOf('string');
      expect(placeholders(tr[k]), `tr placeholders ${k}`).toBe(placeholders(en[k]));
    }
  });

  const dir = join(__dirname, '../src/renderer/i18n/locales');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    it(`${file}: only known keys, placeholders intact, nothing empty`, async () => {
      const dict = (await import(join(dir, file))).default as Record<string, string>;
      const keys = Object.keys(dict);
      expect(keys.length / Object.keys(en).length, `${file} coverage`).toBeGreaterThan(0.95);
      for (const k of keys) {
        expect(en[k], `${file}: unknown key ${k}`).toBeTypeOf('string');
        expect(dict[k].trim().length, `${file}: empty ${k}`).toBeGreaterThan(0);
        expect(placeholders(dict[k]), `${file}: placeholders in ${k}`).toBe(placeholders(en[k]));
      }
    });
  }
});
