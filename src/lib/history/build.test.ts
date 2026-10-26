import { afterEach, describe, expect, test, vi } from 'vitest';
import { CityError } from '@/lib/errors';
import { buildBatch, buildLatest, buildManifest } from './build';
import { createFakeGitHub, generateCommits, type FakeCommit } from './fake-github';

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

/** Date order: main c0-c1-c2, a branch b1-b2 off c0, then merge m (first parent c2). */
function mergeHistory(): FakeCommit[] {
  const files = (...names: string[]): FakeCommit['files'] =>
    Object.fromEntries(names.map((n): [string, [string, number]] => [`${n}.ts`, [`${n}-blob`, 10]]));
  return [
    { sha: 'c0', parents: [], files: files('a') },
    { sha: 'c1', parents: ['c0'], files: files('a', 'b') },
    { sha: 'b1', parents: ['c0'], files: files('a', 'x') },
    { sha: 'c2', parents: ['c1'], files: files('a', 'b', 'c') },
    { sha: 'b2', parents: ['b1'], files: files('a', 'x', 'y') },
    { sha: 'm', parents: ['c2', 'b2'], files: files('a', 'b', 'c', 'x', 'y') },
  ];
}

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

  test('a linear history keeps one snapshot per commit and stays exact (R35)', async () => {
    const m = await buildManifest(createFakeGitHub({ commits: generateCommits(5) }), ref, 'c4');
    expect(m.snapshots.map((s) => s.sha)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
    expect(m.snapshots.map((s) => s.commitIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(m.exact).toBe(true);
  });

  test('a merge-commit history follows the first-parent chain and is not exact (R35)', async () => {
    const gh = createFakeGitHub({ commits: mergeHistory() });
    const m = await buildManifest(gh, ref, 'm');
    expect(m.totalCommits).toBe(6);
    expect(m.snapshots.map((s) => s.sha)).toEqual(['c0', 'c1', 'c2', 'm']);
    expect(m.snapshots.map((s) => s.commitIndex)).toEqual([0, 1, 3, 5]);
    expect(m.snapshots.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(m.exact).toBe(false);
    // The branch's files arrive with the merge; they never flicker in and out.
    const batch = await buildBatch(gh, ref, m, 0);
    expect(batch.deltas.map((d) => d.changes)).toEqual([
      [['a.ts', 10]],
      [['b.ts', 10]],
      [['c.ts', 10]],
      [['x.ts', 10], ['y.ts', 10]],
    ]);
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

/** Commits that each add `perCommit` files under src/ (top-level folder) and keep everything before. */
function hugeCommits(count: number, perCommit: number): FakeCommit[] {
  const commits: FakeCommit[] = [];
  let files: FakeCommit['files'] = {};
  for (let i = 0; i < count; i++) {
    const added: FakeCommit['files'] = {};
    for (let j = 0; j < perCommit; j++) added[`src/c${i}_${j}.ts`] = [`b${i}_${j}`, 1 + j];
    files = { ...files, ...added };
    commits.push({ sha: `c${i}`, files });
  }
  return commits;
}

describe('huge repos', () => {
  test('a truncated head gives a coarse manifest with 30 snapshots', async () => {
    const gh = createFakeGitHub({ commits: hugeCommits(1000, 1), truncateRootAbove: 500 });
    // No truncation yet at 1000 files? every commit under 500 files is complete; the head (1000) truncates.
    const m = await buildManifest(gh, ref, 'c999');
    expect(m.mode).toBe('coarse');
    expect(m.snapshots).toHaveLength(30);
    expect(m.batchSize).toBe(3);
    expect(m.exact).toBe(false);
    expect(m.treeRequests).toBeGreaterThan(1);
    const latest = await buildLatest(gh, ref);
    expect(latest.mode).toBe('coarse');
    expect(latest.files).toHaveLength(1000);
  });

  test('over maxBuildings, latest and batches use +small paths', async () => {
    const gh = createFakeGitHub({ commits: hugeCommits(3, 20) });
    const opts = { maxBuildings: 10 };
    const latest = await buildLatest(gh, ref, opts);
    expect(latest.files.length).toBeLessThanOrEqual(10);
    expect(latest.mergePlan.length).toBeGreaterThan(0);
    const m = await buildManifest(gh, ref, 'c2', opts);
    expect(m.mergePlan).toEqual(latest.mergePlan);
    const batch = await buildBatch(gh, ref, m, 0);
    const paths = batch.deltas.flatMap((d) => d.changes.map(([p]) => p));
    expect(paths.some((p) => p.endsWith('/+small'))).toBe(true);
    expect(paths.length).toBeLessThan(60);
  });

  test('buildManifest refuses up front when the budget cannot cover every tree request (R34)', async () => {
    // 25 commits, 1 tree request per tree, 25 snapshots in 2 batches: 1 x (25 + 2) = 27 requests.
    const resetAt = Math.floor(Date.now() / 1000) + 600;
    const tight = createFakeGitHub({ commits: generateCommits(25), remaining: { remaining: 300 + 26, resetAt } });
    const ranks = vi.spyOn(tight, 'getCommitsAtRanks');
    await expect(buildManifest(tight, ref, 'c24')).rejects.toMatchObject({ code: 'rate-limited', retryAfterMinutes: 10 });
    expect(ranks).toHaveBeenCalledTimes(1); // the head commit only: no snapshot commits fetched
    const enough = createFakeGitHub({ commits: generateCommits(25), remaining: { remaining: 300 + 27, resetAt } });
    await expect(buildManifest(enough, ref, 'c24')).resolves.toMatchObject({ batchSize: 20 });
  });

  test('buildBatch refuses when the GitHub budget is nearly spent', async () => {
    const gh = createFakeGitHub({ commits: generateCommits(3), remaining: { remaining: 310, resetAt: Math.floor(Date.now() / 1000) + 600 } });
    const m = await buildManifest(gh, ref, 'c2');
    await expect(buildBatch(gh, ref, m, 0)).rejects.toMatchObject({ code: 'rate-limited' });
  });
});

/** One commit holding `count` files under src/, each path padded to about `pathLength` characters. */
function oneWideCommit(count: number, pathLength = 12): FakeCommit[] {
  const files: FakeCommit['files'] = {};
  for (let i = 0; i < count; i++) files[`src/${String(i).padStart(pathLength, '0')}.ts`] = [`b${i}`, 100];
  return [{ sha: 'wide', files }];
}

describe('batch size by head buildings (R32)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('a repo with more than 2,000 buildings gets 10 snapshots per batch', async () => {
    const m = await buildManifest(createFakeGitHub({ commits: oneWideCommit(2001) }), ref, 'wide');
    expect(m.batchSize).toBe(10);
  });

  test('counts buildings after merging, not files', async () => {
    const m = await buildManifest(createFakeGitHub({ commits: oneWideCommit(2500) }), ref, 'wide', { maxBuildings: 1500 });
    expect(m.mergePlan.length).toBeGreaterThan(0);
    expect(m.batchSize).toBe(20);
  });

  test('warns once, server-side, when a batch serialises to more than 1.5 MB', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gh = createFakeGitHub({ commits: oneWideCommit(12_000, 120) });
    const m = await buildManifest(gh, ref, 'wide');
    expect(m.batchSize).toBe(5);
    const batch = await buildBatch(gh, ref, m, 0);
    const bytes = JSON.stringify(batch).length;
    expect(bytes).toBeGreaterThan(1_500_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[repolis] large batch', 'facebook/react', 0, bytes);
  });

  test('does not warn for an ordinary batch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gh = threeCommits();
    await buildBatch(gh, ref, await buildManifest(gh, ref, 'c'), 0);
    expect(warn).not.toHaveBeenCalled();
  });
});
