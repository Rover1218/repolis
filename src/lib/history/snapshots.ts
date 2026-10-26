export const MAX_SNAPSHOTS = 200;
export const COARSE_SNAPSHOTS = 30;
export const COARSE_BATCH_SIZE = 3;
/** [max head buildings, snapshots per batch]: keeps batches well under the 2 MB Data Cache entry (R32). */
const BATCH_SIZES: ReadonlyArray<readonly [maxBuildings: number, size: number]> = [
  [2000, 20],
  [8000, 10],
];
const LARGE_REPO_BATCH_SIZE = 5;

/**
 * Picks up to `max` commit indices spread evenly across `total` commits.
 * The first and latest commit are always included.
 */
export function pickSnapshotIndices(total: number, max: number): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i);
  if (max === 1) return [total - 1];
  return Array.from({ length: max }, (_, i) => Math.round((i * (total - 1)) / (max - 1)));
}

/** Rank from the newest end: the latest commit is rank 0, the oldest is `total - 1`. */
export function toRank(oldestIndex: number, total: number): number {
  return total - 1 - oldestIndex;
}

export function batchCount(snapshots: number, batchSize: number): number {
  return Math.ceil(snapshots / batchSize);
}

/** Half-open `[start, end)` range of snapshot indices covered by `batch`. */
export function batchRange(batch: number, snapshots: number, batchSize: number): [start: number, end: number] {
  const start = batch * batchSize;
  return [start, Math.min(start + batchSize, snapshots)];
}

/** Snapshots per batch for a manifest, from the head's building count (after merging). */
export function chooseBatchSize(buildings: number, mode: 'full' | 'coarse'): number {
  if (mode === 'coarse') return COARSE_BATCH_SIZE;
  for (const [maxBuildings, size] of BATCH_SIZES) {
    if (buildings <= maxBuildings) return size;
  }
  return LARGE_REPO_BATCH_SIZE;
}
