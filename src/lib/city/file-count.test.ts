import { describe, expect, it } from 'vitest';
import { createCityHistory } from '@/lib/city/history';
import type { CityManifest, FileChange, MergePlan } from '@/lib/history/types';
import { fileCountAt, headFileCount } from './file-count';

const PLAN: MergePlan = [
  { folder: 'src', keep: ['src/a.ts'], count: 12 },
  { folder: '', keep: [], count: 3 },
];

function historyOf(script: FileChange[][]) {
  const manifest: CityManifest = {
    fullName: 'o/r',
    headSha: 'h',
    totalCommits: script.length,
    exact: true,
    mode: 'full',
    batchSize: script.length,
    snapshots: script.map((_, i) => ({
      index: i,
      commitIndex: i,
      sha: `s${i}`,
      treeSha: `t${i}`,
      date: '2024-01-01T00:00:00Z',
      author: null,
      message: `m${i}`,
    })),
    mergePlan: PLAN,
    treeRequests: 1,
  };
  return createCityHistory(manifest, [{ batch: 0, deltas: script.map((changes, index) => ({ index, changes })) }]);
}

describe('headFileCount', () => {
  it('is the building count when nothing is merged', () => {
    expect(headFileCount(4, [])).toBe(4);
  });

  it('counts each merged block as its member files', () => {
    expect(headFileCount(4, PLAN)).toBe(4 + 11 + 2);
  });
});

describe('fileCountAt', () => {
  const history = historyOf([
    [['src/a.ts', 10], ['src/+small', 100]],
    [['+small', 30], ['z.ts', 5]],
    [['src/+small', null]],
  ]);

  it('adds the members of the merged blocks standing at that snapshot', () => {
    expect(history.filesAliveAt(0)).toBe(2);
    expect(fileCountAt(history, PLAN, 0)).toBe(2 + 11);
    expect(fileCountAt(history, PLAN, 1)).toBe(4 + 11 + 2);
    expect(fileCountAt(history, PLAN, 2)).toBe(3 + 2);
  });

  it('is filesAliveAt when nothing is merged', () => {
    expect(fileCountAt(history, [], 1)).toBe(history.filesAliveAt(1));
  });

  it('ignores a planned block that never appears', () => {
    const plan: MergePlan = [{ folder: 'docs', keep: [], count: 9 }];
    expect(fileCountAt(history, plan, 1)).toBe(4);
  });
});
