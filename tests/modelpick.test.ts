import { describe, expect, it } from 'vitest';
import { pickBest } from '../src/shared/modelpick';
import { carName, knownCarName, searchName } from '../src/shared/cars';
import type { SketchfabModel } from '../src/shared/ipc';

const m = (name: string, mb: number, faces: number): SketchfabModel => ({ uid: name, name, author: '', license: '', faces, glbBytes: mb * 1e6, thumbnail: '', viewerUrl: '' });

describe('car names', () => {
  it('knows the cars from the real captures', () => {
    expect(knownCarName(3413)).toBe('2019 Volkswagen Golf R');
    expect(knownCarName(4081)).toBe('2024 Koenigsegg Gemera');
    expect(carName(3413, { '3413': 'Benim Golf' })).toBe('Benim Golf');
    expect(searchName('2023 Ford F-150 Raptor R (Welcome Pack)')).toBe('Ford F-150 Raptor R');
  });
});

describe('pickBest', () => {
  it('prefers the matching year and sane sizes, skips parts and huge files', () => {
    const results = [
      m('2025 Volkswagen Golf R', 22, 470_000),
      m('2019 Volkswagen Golf R', 18, 290_000),
      m('Volkswagen Golf R wheel rim', 2, 20_000),
      m('2019 Volkswagen Golf R 8K', 140, 3_000_000),
    ];
    expect(pickBest(results, '2019 Volkswagen Golf R')!.name).toBe('2019 Volkswagen Golf R');
  });

  it('returns nothing when no result is really that car', () => {
    expect(pickBest([m('Random sports car', 10, 100_000), m('Old truck', 10, 100_000)], '2019 Volkswagen Golf R')).toBeNull();
  });
});
