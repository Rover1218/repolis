import { describe, expect, it } from 'vitest';
import { skylineBars } from './skyline';

const files: Array<[string, number]> = [
  ['src/a.ts', 100],
  ['src/b.ts', 5000],
  ['lib/c.ts', 40000],
  ['lib/d.ts', 300],
  ['README.md', 20],
];

describe('skylineBars', () => {
  it('returns one value per bucket, all within [0, 1], peaking at 1', () => {
    const bars = skylineBars(files, 16);
    expect(bars).toHaveLength(16);
    for (const v of bars) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...bars)).toBe(1);
  });

  it('is all zeros for empty input', () => {
    expect(skylineBars([], 8)).toEqual(new Array(8).fill(0));
  });

  it('puts a single building in one bucket', () => {
    const bars = skylineBars([['a.ts', 500]], 6);
    expect(bars.filter((v) => v === 1)).toHaveLength(1);
    expect(bars.filter((v) => v === 0)).toHaveLength(5);
  });

  it('ignores zero-byte files for the peak', () => {
    expect(Math.max(...skylineBars([['a', 0], ['b', 10]], 4))).toBe(1);
  });
});
