import { describe, expect, it } from 'vitest';
import { CityError } from '@/lib/errors';
import { pickQuality } from './quality';

const quality = pickQuality({ coarsePointer: false, devicePixelRatio: 1 });

describe('city-scene module', () => {
  it('imports without a DOM (no window/document access at import time)', async () => {
    const mod = await import('./city-scene');
    expect(typeof mod.CityScene).toBe('function');
  });

  it("throws CityError('no-webgl') when WebGL2 is unavailable", async () => {
    const { CityScene } = await import('./city-scene');
    const canvas = { ownerDocument: {} } as unknown as HTMLCanvasElement;
    let caught: unknown;
    try {
      new CityScene(canvas, { quality, reducedMotion: true });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CityError);
    expect((caught as CityError).code).toBe('no-webgl');
  });
});
