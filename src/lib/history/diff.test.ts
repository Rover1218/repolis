import { describe, expect, it } from 'vitest';
import { diffTrees, type TreeSnapshot } from './diff';

describe('diffTrees', () => {
  const prev: TreeSnapshot = new Map([
    ['a.ts', { sha: '1', size: 10 }],
    ['b.ts', { sha: '2', size: 5 }],
    ['c.ts', { sha: '3', size: 7 }],
  ]);
  const next: TreeSnapshot = new Map([
    ['a.ts', { sha: '1', size: 10 }],
    ['b.ts', { sha: '9', size: 5 }],
    ['d.ts', { sha: '4', size: 1 }],
  ]);

  it('reports added, changed (including same-size) and deleted files sorted by path', () => {
    expect(diffTrees(prev, next)).toEqual([
      ['b.ts', 5],
      ['c.ts', null],
      ['d.ts', 1],
    ]);
  });

  it('treats a missing previous tree as all files added', () => {
    expect(diffTrees(null, next)).toEqual([
      ['a.ts', 10],
      ['b.ts', 5],
      ['d.ts', 1],
    ]);
  });

  it('returns no changes for identical trees', () => {
    expect(diffTrees(next, new Map(next))).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const before = new Map(prev);
    diffTrees(prev, next);
    expect(prev).toEqual(before);
  });
});
