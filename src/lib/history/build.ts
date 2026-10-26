import { mapLimit } from '@/lib/async';
import { CityError } from '@/lib/errors';
import { getFullTree } from '@/lib/github/full-tree';
import type { GitHub } from '@/lib/github/types';
import type { RepoRef } from '@/lib/repo-ref';
import { diffTrees, type TreeSnapshot } from './diff';
import { BATCH_SIZE, MAX_SNAPSHOTS, batchCount, batchRange, pickSnapshotIndices, toRank } from './snapshots';
import type { CityManifest, LatestCity, SnapshotBatch, SnapshotDelta, SnapshotMeta } from './types';

export const TREE_CONCURRENCY = 6;

function comparePaths(a: [string, number], b: [string, number]): number {
  if (a[0] < b[0]) return -1;
  return a[0] > b[0] ? 1 : 0;
}

/** Today's files, from the head commit's tree. */
export async function buildLatest(gh: GitHub, ref: RepoRef): Promise<LatestCity> {
  const { fullName, defaultBranch, head, totalCommits } = await gh.getRepoHead(ref);
  const { tree } = await getFullTree(gh, ref, head.treeSha);
  const files = [...tree].map(([path, { size }]): [string, number] => [path, size]).sort(comparePaths);
  return { fullName, defaultBranch, headSha: head.sha, date: head.date, totalCommits, files, mode: 'full', mergePlan: [] };
}

/** The list of snapshot commits (up to MAX_SNAPSHOTS, oldest first) for `headSha`. */
export async function buildManifest(gh: GitHub, ref: RepoRef, headSha: string): Promise<CityManifest> {
  const totalCommits = await gh.getCommitCount(ref, headSha);
  const commitIndices = pickSnapshotIndices(totalCommits, MAX_SNAPSHOTS);
  const ranks = commitIndices.map((i) => toRank(i, totalCommits));
  const commits = await gh.getCommitsAtRanks(ref, headSha, ranks);
  if (commits.length !== ranks.length) throw new CityError('upstream');

  const snapshots: SnapshotMeta[] = commits.map((c, index) => ({
    index,
    commitIndex: commitIndices[index]!,
    sha: c.sha,
    treeSha: c.treeSha,
    date: c.date,
    author: c.author,
    message: c.message,
  }));
  const head = snapshots[snapshots.length - 1];
  if (head === undefined) throw new CityError('empty');
  const { requests } = await getFullTree(gh, ref, head.treeSha);

  return {
    fullName: `${ref.owner}/${ref.repo}`,
    headSha,
    totalCommits,
    exact: totalCommits <= MAX_SNAPSHOTS,
    mode: 'full',
    batchSize: BATCH_SIZE,
    snapshots,
    mergePlan: [],
    treeRequests: requests,
  };
}

/** File changes for one batch of snapshots, diffed against the preceding snapshot's tree. */
export async function buildBatch(gh: GitHub, ref: RepoRef, manifest: CityManifest, batch: number): Promise<SnapshotBatch> {
  const { snapshots, batchSize } = manifest;
  if (!Number.isInteger(batch) || batch < 0 || batch >= batchCount(snapshots.length, batchSize)) {
    throw new CityError('invalid-link');
  }
  const [start, end] = batchRange(batch, snapshots.length, batchSize);
  const first = Math.max(start - 1, 0);
  const wanted = snapshots.slice(first, end);
  const trees: TreeSnapshot[] = await mapLimit(wanted, TREE_CONCURRENCY, async (s) => (await getFullTree(gh, ref, s.treeSha)).tree);

  const deltas: SnapshotDelta[] = [];
  for (let index = start; index < end; index++) {
    const prev = index === 0 ? null : trees[index - 1 - first]!;
    deltas.push({ index, changes: diffTrees(prev, trees[index - first]!) });
  }
  return { batch, deltas };
}
