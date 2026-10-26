import { describe, expect, test } from 'vitest';
import type { TreeSnapshot } from './diff';
import { applyMerge, mergedPath, planMerge } from './merge';

const folderFiles = (folder: string, n: number): Array<[string, number]> =>
  Array.from({ length: n }, (_, i) => [`${folder}/f${i}.ts`, i + 1]);

describe('planMerge', () => {
  test('keeps the largest files of the biggest folder and merges the rest', () => {
    const files = [...folderFiles('a', 30), ...folderFiles('b', 5)];
    const plan = planMerge(files, 20, 3);
    expect(plan).toEqual([{ folder: 'a', keep: ['a/f29.ts', 'a/f28.ts', 'a/f27.ts'], count: 27 }]);
    // 35 files - (27 merged - 1 block) = 9 buildings
    expect(35 - (plan[0]!.count - 1)).toBe(9);
  });

  test('returns an empty plan at or under the max', () => {
    expect(planMerge(folderFiles('a', 10), 10, 3)).toEqual([]);
  });

  test('plans the root folder under the empty name', () => {
    const files: Array<[string, number]> = Array.from({ length: 10 }, (_, i) => [`r${i}.ts`, i]);
    const plan = planMerge(files, 5, 2);
    expect(plan).toEqual([{ folder: '', keep: ['r9.ts', 'r8.ts'], count: 8 }]);
    expect(mergedPath('r0.ts', plan)).toBe('+small');
    expect(mergedPath('r9.ts', plan)).toBe('r9.ts');
  });
});

describe('mergedPath', () => {
  const plan = [{ folder: 'a', keep: ['a/big.ts'], count: 5 }];
  test('maps a non-kept file in a planned folder to +small', () => {
    expect(mergedPath('a/past-only.ts', plan)).toBe('a/+small');
  });
  test('leaves kept files and other folders alone', () => {
    expect(mergedPath('a/big.ts', plan)).toBe('a/big.ts');
    expect(mergedPath('b/x.ts', plan)).toBe('b/x.ts');
    expect(mergedPath('a/sub/x.ts', plan)).toBe('a/sub/x.ts');
  });
});

describe('applyMerge', () => {
  const plan = [{ folder: 'a', keep: ['a/big.ts'], count: 2 }];
  const make = (sha: string): TreeSnapshot =>
    new Map([
      ['a/big.ts', { sha: 'B', size: 100 }],
      ['a/x.ts', { sha, size: 3 }],
      ['a/y.ts', { sha: 'Y', size: 4 }],
      ['z.ts', { sha: 'Z', size: 1 }],
    ]);

  test('sums sizes and leaves other entries unchanged', () => {
    const merged = applyMerge(make('X'), plan);
    expect([...merged.keys()].sort()).toEqual(['a/+small', 'a/big.ts', 'z.ts']);
    expect(merged.get('a/+small')!.size).toBe(7);
    expect(merged.get('z.ts')).toEqual({ sha: 'Z', size: 1 });
  });

  test('merged sha is stable and changes when a member changes', () => {
    const a = applyMerge(make('X'), plan).get('a/+small')!.sha;
    expect(applyMerge(make('X'), plan).get('a/+small')!.sha).toBe(a);
    expect(applyMerge(make('X2'), plan).get('a/+small')!.sha).not.toBe(a);
  });
});
