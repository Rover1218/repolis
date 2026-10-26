import { describe, expect, it } from 'vitest';
import type { LatestCity } from '@/lib/history/types';
import { buildTodayCity } from './today';

const latest: LatestCity = {
  fullName: 'o/r',
  defaultBranch: 'main',
  headSha: 'h',
  date: '2024-03-12T00:00:00Z',
  totalCommits: 3,
  files: [
    ['src/b.ts', 200],
    ['README.md', 0],
    ['src/a.ts', 100],
  ],
  mode: 'full',
  mergePlan: [],
};

describe('buildTodayCity', () => {
  it('lays out the latest files and orders sizes like the layout', () => {
    const city = buildTodayCity(latest);
    expect(city.latest).toBe(latest);
    expect(city.layout.paths).toEqual(['README.md', 'src/a.ts', 'src/b.ts']);
    expect(Array.from(city.sizes)).toEqual([1, 100, 200]);
  });
});
