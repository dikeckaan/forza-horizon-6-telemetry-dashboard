import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARCHETYPES, guessStyle, type BodyStyle } from '../src/renderer/components/car/archetypes';
import { buildBodyGeometry, layoutOf } from '../src/renderer/components/car/CarBody';

describe('body generator', () => {
  for (const style of Object.keys(ARCHETYPES) as BodyStyle[]) {
    it(`${style}: all geometry is finite`, () => {
      const g = buildBodyGeometry(layoutOf(ARCHETYPES[style]));
      for (const [name, geo] of Object.entries(g)) {
        if (!(geo instanceof THREE.BufferGeometry)) continue;
        const pos = geo.getAttribute('position').array;
        const bad = pos.findIndex((v) => !Number.isFinite(v));
        expect(bad, `${style}.${name} has non-finite vertex at ${bad}`).toBe(-1);
      }
    });
  }

  it('guesses sensible styles', () => {
    expect(guessStyle({ carClass: 6, carPerformanceIndex: 999, drivetrainType: 2, numCylinders: 12 })).toBe('hyper');
    expect(guessStyle({ carClass: 2, carPerformanceIndex: 600, drivetrainType: 1, numCylinders: 8 })).toBe('muscle');
    expect(guessStyle({ carClass: 1, carPerformanceIndex: 500, drivetrainType: 0, numCylinders: 4 })).toBe('hatch');
    expect(guessStyle({ carClass: 2, carPerformanceIndex: 600, drivetrainType: 2, numCylinders: 4 })).toBe('rally');
  });
});
