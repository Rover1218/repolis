import { describe, expect, test } from 'vitest';
import { CityError } from '@/lib/errors';
import { buildBatch, buildLatest, buildManifest } from './build';
import { createFakeGitHub, generateCommits } from './fake-github';

const ref = { owner: 'facebook', repo: 'react' };

const threeCommits = () =>
  createFakeGitHub({
    commits: [
      { sha: 'a', files: { 'b.ts': ['b1', 5], 'a.ts': ['a1', 3] } },
      { sha: 'b', files: { 'b.ts': ['b2', 6], 'a.ts': ['a1', 3], 'c.ts': ['c1', 1] } },
      { sha: 'c', files: { 'b.ts': ['b2', 6], 'c.ts': ['c1', 1] } },
    ],
  });

describe('buildLatest', () => {
  test('returns canonical name and sorted files from the head tree', async () => {
    const latest = await buildLatest(threeCommits(), { owner: 'Facebook', repo: 'React' });
    expect(latest.fullName).toBe('facebook/react');
    expect(latest.headSha).toBe('c');
    expect(latest.totalCommits).toBe(3);
    expect(latest.files).toEqual([['b.ts', 6], ['c.ts', 1]]);
    expect(latest.mode).toBe('full');
    expect(latest.mergePlan).toEqual([]);
  });
});

describe('buildManifest', () => {
  test('3 commits give exact one-per-commit snapshots', async () => {
    const m = await buildManifest(threeCommits(), ref, 'c');
    expect(m.snapshots).toHaveLength(3);
    expect(m.snapshots.map((s) => s.commitIndex)).toEqual([0, 1, 2]);
    expect(m.snapshots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(m.exact).toBe(true);
    expect(m.batchSize).toBe(20);
    expect(m.snapshots[2]!.sha).toBe('c');
    expect(m.mode).toBe('full');
    expect(m.mergePlan).toEqual([]);
    expect(m.treeRequests).toBe(1);
  });

  test('1000 commits are sampled to 200 snapshots', async () => {
    const m = await buildManifest(createFakeGitHub({ commits: generateCommits(1000) }), ref, 'c999');
    expect(m.snapshots).toHaveLength(200);
    expect(m.snapshots[0]!.commitIndex).toBe(0);
    expect(m.snapshots[199]!.commitIndex).toBe(999);
    expect(m.exact).toBe(false);
  });
});

describe('buildBatch', () => {
  test('batch 0 starts from an empty baseline and lists deletions as null', async () => {
    const gh = threeCommits();
    const m = await buildManifest(gh, ref, 'c');
    const batch = await buildBatch(gh, ref, m, 0);
    expect(batch.batch).toBe(0);
    expect(batch.deltas.map((d) => d.index)).toEqual([0, 1, 2]);
    expect(batch.deltas[0]!.changes).toEqual([['a.ts', 3], ['b.ts', 5]]);
    expect(batch.deltas[1]!.changes).toEqual([['b.ts', 6], ['c.ts', 1]]);
    expect(batch.deltas[2]!.changes).toEqual([['a.ts', null]]);
  });

  test('batch 1 of 45 commits uses snapshot 19 as the baseline and covers 20-39', async () => {
    const gh = createFakeGitHub({ commits: generateCommits(45) });
    const m = await buildManifest(gh, ref, 'c44');
    gh.treeCalls.length = 0;
    const batch = await buildBatch(gh, ref, m, 1);
    expect(gh.treeCalls.map((c) => c.treeSha)).toContain('tree-c19');
    expect(gh.treeCalls).toHaveLength(21);
    expect(batch.deltas.map((d) => d.index)).toEqual(Array.from({ length: 20 }, (_, i) => 20 + i));
    expect(batch.deltas[0]!.changes).toEqual([['f20.ts', 30]]);
  });

  test('rejects an out-of-range batch with invalid-link', async () => {
    const gh = threeCommits();
    const m = await buildManifest(gh, ref, 'c');
    for (const bad of [99, -1, 1.5]) {
      await expect(buildBatch(gh, ref, m, bad)).rejects.toMatchObject({ code: 'invalid-link' });
    }
    await expect(buildBatch(gh, ref, m, 99)).rejects.toBeInstanceOf(CityError);
  });

  test('rejects with upstream when GitHub returns the wrong number of commits', async () => {
    const gh = threeCommits();
    const broken = { ...gh, getCommitsAtRanks: async () => [] };
    await expect(buildManifest(broken, ref, 'c')).rejects.toMatchObject({ code: 'upstream' });
  });
});
