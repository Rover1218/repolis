import { describe, expect, it } from 'vitest';
import { heightFor } from './height';
import { layoutCity } from './layout';
import { skylineBars } from './skyline';

const files: Array<[string, number]> = [
  ['src/a.ts', 100],
  ['src/b.ts', 5000],
  ['lib/c.ts', 40000],
  ['lib/d.ts', 300],
  ['README.md', 20],
];

/** A wide city: many files spread over several folders so x positions differ a lot. */
const wide: Array<[string, number]> = Array.from({ length: 60 }, (_, i) => [`dir${i % 6}/f${i}.ts`, 200 + i * 90]);

function xs(input: Array<[string, number]>) {
  const { paths, positions } = layoutCity(input.map(([p]) => p));
  return paths.map((path, i) => ({ path, x: positions[i * 2] }));
}

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

  it('buckets by x: the leftmost and rightmost buildings land in the first and last bars', () => {
    const buckets = 12;
    const bars = skylineBars(wide, buckets);
    const xValues = xs(wide).map((b) => b.x);
    expect(Math.max(...xValues)).toBeGreaterThan(Math.min(...xValues));
    expect(bars[0]).toBeGreaterThan(0);
    expect(bars[buckets - 1]).toBeGreaterThan(0);
  });

  it('fills exactly the buckets that buildings map to, with the tallest per bucket', () => {
    const buckets = 10;
    const placed = xs(wide);
    const min = Math.min(...placed.map((b) => b.x));
    const span = Math.max(...placed.map((b) => b.x)) - min;
    const size = new Map(wide);
    const expected = new Array<number>(buckets).fill(0);
    for (const { path, x } of placed) {
      const k = Math.min(buckets - 1, Math.floor(((x - min) / span) * buckets));
      expected[k] = Math.max(expected[k], heightFor(size.get(path) ?? 0));
    }
    const peak = Math.max(...expected);
    const bars = skylineBars(wide, buckets);
    expected.forEach((h, k) => {
      expect(bars[k]).toBeCloseTo(h / peak, 6);
    });
    // Not everything piled into one bucket.
    expect(bars.filter((v) => v > 0).length).toBeGreaterThan(1);
  });

  it('puts a single building in the bucket it maps to (bucket 0) and nothing elsewhere', () => {
    expect(skylineBars([['a.ts', 500]], 6)).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('stays finite when every building shares one x (zero span)', () => {
    const bars = skylineBars([['a.ts', 500]], 5);
    const same = layoutCity(['a.ts', 'b.ts']);
    expect(same.positions[0]).not.toBeNaN();
    for (const v of skylineBars([['a.ts', 500], ['b.ts', 900]], 5)) expect(Number.isFinite(v)).toBe(true);
    for (const v of bars) expect(Number.isFinite(v)).toBe(true);
  });

  it('gives zero-byte files no height, and all zeros when every file is empty', () => {
    expect(Math.max(...skylineBars([['a', 0], ['b', 10]], 4))).toBe(1);
    const allEmpty = skylineBars([['a', 0], ['b', 0]], 4);
    expect(allEmpty).toEqual([0, 0, 0, 0]);
  });
});
