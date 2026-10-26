import { mapLimit } from '@/lib/async';
import { CityError } from '@/lib/errors';
import { getFullTree } from '@/lib/github/full-tree';
import type { CommitInfo, GitHub } from '@/lib/github/types';
import type { RepoRef } from '@/lib/repo-ref';
import { diffTrees, type TreeSnapshot } from './diff';
import { type ChainCommit, firstParentChain } from './first-parent';
import { MAX_BUILDINGS, applyMerge, ensureBudget, planMerge } from './merge';
import { foldedFiles } from './merge-plan';
import {
  COARSE_SNAPSHOTS,
  MAX_SNAPSHOTS,
  batchCount,
  batchRange,
  chooseBatchSize,
  pickSnapshotIndices,
  toRank,
} from './snapshots';
import type { CityManifest, LatestCity, MergePlan, SnapshotBatch, SnapshotDelta, SnapshotMeta } from './types';

export const TREE_CONCURRENCY = 6;
/** A batch this large (serialised) is logged: the Data Cache drops entries over 2 MB (R32). */
export const LARGE_BATCH_BYTES = 1_500_000;

export interface BuildOpts {
  /** Overrides MAX_BUILDINGS (for tests). */
  maxBuildings?: number;
}

function comparePaths(a: [string, number], b: [string, number]): number {
  if (a[0] < b[0]) return -1;
  return a[0] > b[0] ? 1 : 0;
}

function toFiles(tree: TreeSnapshot): Array<[string, number]> {
  return [...tree].map(([path, { size }]): [string, number] => [path, size]).sort(comparePaths);
}

/** Deterministic from the head tree alone, so latest and manifest always agree on the plan. */
function planFor(tree: TreeSnapshot, opts?: BuildOpts): MergePlan {
  return planMerge(toFiles(tree), opts?.maxBuildings ?? MAX_BUILDINGS);
}

/** Today's files, from the head commit's tree. */
export async function buildLatest(gh: GitHub, ref: RepoRef, opts?: BuildOpts): Promise<LatestCity> {
  const { fullName, defaultBranch, head, totalCommits } = await gh.getRepoHead(ref);
  const { tree, truncated } = await getFullTree(gh, ref, head.treeSha);
  const mergePlan = planFor(tree, opts);
  const files = toFiles(applyMerge(tree, mergePlan));
  return { fullName, defaultBranch, headSha: head.sha, date: head.date, totalCommits, files, mode: truncated ? 'coarse' : 'full', mergePlan };
}

/**
 * Exact mode (every commit was fetched) replays the first-parent chain, and is `exact` only for a
 * linear history; sampled mode keeps the date-order sample (R35).
 */
function chooseSnapshots(
  commits: CommitInfo[],
  commitIndices: number[],
  totalCommits: number,
): { picked: ChainCommit[]; exact: boolean } {
  if (commits.length !== totalCommits) {
    return { picked: commits.map((commit, k) => ({ commit, commitIndex: commitIndices[k]! })), exact: false };
  }
  const { chain, linear } = firstParentChain(commits);
  return { picked: chain, exact: linear && chain.length === totalCommits };
}

/** The list of snapshot commits (oldest first) for `headSha`: up to MAX_SNAPSHOTS, or COARSE_SNAPSHOTS for huge repos. */
export async function buildManifest(gh: GitHub, ref: RepoRef, headSha: string, opts?: BuildOpts): Promise<CityManifest> {
  const totalCommits = await gh.getCommitCount(ref, headSha);
  const headCommit = (await gh.getCommitsAtRanks(ref, headSha, [0]))[0];
  if (headCommit === undefined) throw new CityError('upstream');
  const { tree: headTree, requests, truncated } = await getFullTree(gh, ref, headCommit.treeSha);

  const mode = truncated ? 'coarse' : 'full';
  const mergePlan = planFor(headTree, opts);
  const batchSize = chooseBatchSize(headTree.size - foldedFiles(mergePlan), mode);
  const commitIndices = pickSnapshotIndices(totalCommits, truncated ? COARSE_SNAPSHOTS : MAX_SNAPSHOTS);
  // Fail fast if the batches this manifest promises could not all be built (R34).
  const count = commitIndices.length;
  ensureBudget(gh, requests * (count + batchCount(count, batchSize)));
  const ranks = commitIndices.map((i) => toRank(i, totalCommits));
  const commits = await gh.getCommitsAtRanks(ref, headSha, ranks);
  if (commits.length !== ranks.length) throw new CityError('upstream');

  const { picked, exact } = chooseSnapshots(commits, commitIndices, totalCommits);
  const snapshots: SnapshotMeta[] = picked.map(({ commit: c, commitIndex }, index) => ({
    index,
    commitIndex,
    sha: c.sha,
    treeSha: c.treeSha,
    date: c.date,
    author: c.author,
    message: c.message,
  }));
  if (snapshots.length === 0) throw new CityError('empty');

  return {
    fullName: `${ref.owner}/${ref.repo}`,
    headSha,
    totalCommits,
    exact,
    mode,
    batchSize,
    snapshots,
    mergePlan,
    treeRequests: requests,
  };
}

/** File changes for one batch of snapshots, diffed against the preceding snapshot's tree. */
export async function buildBatch(gh: GitHub, ref: RepoRef, manifest: CityManifest, batch: number): Promise<SnapshotBatch> {
  const { snapshots, batchSize, mergePlan } = manifest;
  if (!Number.isInteger(batch) || batch < 0 || batch >= batchCount(snapshots.length, batchSize)) {
    throw new CityError('invalid-link');
  }
  ensureBudget(gh, (batchSize + 1) * manifest.treeRequests);
  const [start, end] = batchRange(batch, snapshots.length, batchSize);
  const first = Math.max(start - 1, 0);
  const wanted = snapshots.slice(first, end);
  const trees: TreeSnapshot[] = await mapLimit(wanted, TREE_CONCURRENCY, async (s) =>
    applyMerge((await getFullTree(gh, ref, s.treeSha)).tree, mergePlan),
  );

  const deltas: SnapshotDelta[] = [];
  for (let index = start; index < end; index++) {
    const prev = index === 0 ? null : trees[index - 1 - first]!;
    deltas.push({ index, changes: diffTrees(prev, trees[index - first]!) });
  }
  const result: SnapshotBatch = { batch, deltas };
  warnIfLarge(manifest.fullName, result);
  return result;
}

function warnIfLarge(fullName: string, batch: SnapshotBatch): void {
  const bytes = JSON.stringify(batch).length;
  if (bytes > LARGE_BATCH_BYTES) console.warn('[repolis] large batch', fullName, batch.batch, bytes);
}
