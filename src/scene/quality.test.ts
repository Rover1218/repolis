import { describe, expect, it } from 'vitest';
import { pickQuality } from './quality';

describe('pickQuality', () => {
  it('gives a desktop the full look', () => {
    expect(pickQuality({ coarsePointer: false, devicePixelRatio: 2 })).toEqual({
      pixelRatio: 1.75,
      shadowMapSize: 2048,
      bloom: true,
      motes: 420,
    });
  });

  it('gives a phone a lighter preset', () => {
    expect(pickQuality({ coarsePointer: true, devicePixelRatio: 3 })).toEqual({
      pixelRatio: 1.5,
      shadowMapSize: 1024,
      bloom: true,
      motes: 160,
    });
  });

  it('drops bloom and motes on a 2 GB device', () => {
    expect(pickQuality({ coarsePointer: false, deviceMemory: 2, devicePixelRatio: 2 })).toEqual({
      pixelRatio: 1,
      shadowMapSize: 1024,
      bloom: false,
      motes: 0,
    });
  });

  it('treats 4 GB as enough memory for the pointer-based preset', () => {
    expect(pickQuality({ coarsePointer: true, deviceMemory: 4, devicePixelRatio: 3 }).motes).toBe(160);
  });

  it('never raises the pixel ratio above the screen', () => {
    expect(pickQuality({ coarsePointer: false, devicePixelRatio: 1 }).pixelRatio).toBe(1);
  });

  it('falls back to 1x for a missing or invalid devicePixelRatio', () => {
    expect(pickQuality({ coarsePointer: false, devicePixelRatio: Number.NaN }).pixelRatio).toBe(1);
    expect(pickQuality({ coarsePointer: false, devicePixelRatio: 0 }).pixelRatio).toBe(1);
  });
});
