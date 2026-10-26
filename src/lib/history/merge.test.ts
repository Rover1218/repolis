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

const distinctBuildings = (files: Array<[string, number]>, plan: Parameters<typeof mergedPath>[1]): number =>
  new Set(files.map(([p]) => mergedPath(p, plan))).size;

describe('planMerge subtree fallback', () => {
  const wide = (): Array<[string, number]> => {
    const files: Array<[string, number]> = [];
    for (let i = 0; i < 12000; i++) for (let j = 0; j < 8; j++) files.push([`g${i % 100}/d${i}/f${j}.ts`, j + 1]);
    return files;
  };

  test('12k folders x 8 files still end at or under the max', () => {
    const files = wide();
    const start = Date.now();
    const plan = planMerge(files, 20000);
    const buildings = distinctBuildings(files, plan);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(buildings).toBeLessThanOrEqual(20000);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((p) => p.subtree === true)).toBe(true);
    expect(plan.every((p) => p.folder.split('/').length === 1)).toBe(true);
  });

  test('a deep tree that only converges at the root yields a single root entry', () => {
    const files: Array<[string, number]> = [];
    for (const top of ['a', 'b']) for (let i = 0; i < 30; i++) for (let j = 0; j < 8; j++) files.push([`${top}/s${i}/t/f${j}.ts`, j + 1]);
    const plan = planMerge(files, 10);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.folder).toBe('');
    expect(plan[0]!.subtree).toBe(true);
    expect(distinctBuildings(files, plan)).toBeLessThanOrEqual(10);
  });

  test('mergedPath maps descendants of a subtree prefix and keeps kept paths', () => {
    const plan = [{ folder: 'a', keep: ['a/b/keep.ts'], count: 3, subtree: true }];
    expect(mergedPath('a/b/c/x.ts', plan)).toBe('a/+small');
    expect(mergedPath('a/y.ts', plan)).toBe('a/+small');
    expect(mergedPath('a/b/keep.ts', plan)).toBe('a/b/keep.ts');
    expect(mergedPath('z/x.ts', plan)).toBe('z/x.ts');
    expect(mergedPath('top.ts', plan)).toBe('top.ts');
  });

  test('100k paths plan and map quickly', () => {
    const files: Array<[string, number]> = Array.from({ length: 100000 }, (_, i) => [`p${i % 50}/q${i % 997}/f${i}.ts`, i % 13]);
    const start = Date.now();
    const plan = planMerge(files, 20000);
    for (const [p] of files) mergedPath(p, plan);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('very deep paths only fall back to ancestors of at most 16 segments, quickly', () => {
    const files: Array<[string, number]> = [];
    for (let i = 0; i < 20000; i++) {
      const g = i % 200;
      files.push([`g${g}/${'x/'.repeat(29)}l${i}/${'y/'.repeat(168)}f.ts`, i % 7]);
    }
    const start = Date.now();
    const plan = planMerge(files, 4000);
    const buildings = distinctBuildings(files, plan);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(buildings).toBeLessThanOrEqual(4000);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((p) => p.folder === '' || p.folder.split('/').length <= 16)).toBe(true);
  });
});
