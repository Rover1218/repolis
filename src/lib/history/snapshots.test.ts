import { describe, expect, it } from 'vitest';
import { COARSE_BATCH_SIZE, batchCount, batchRange, chooseBatchSize, pickSnapshotIndices, toRank } from './snapshots';

describe('pickSnapshotIndices', () => {
  it('returns the single index for one commit', () => {
    expect(pickSnapshotIndices(1, 200)).toEqual([0]);
  });

  it('returns every index when total is within the max', () => {
    expect(pickSnapshotIndices(5, 200)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns an empty list for an empty history', () => {
    expect(pickSnapshotIndices(0, 200)).toEqual([]);
  });

  it('spreads max indices evenly, always including first and last', () => {
    const picked = pickSnapshotIndices(1000, 200);
    expect(picked).toHaveLength(200);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(999);
    expect(picked.every((v, i) => i === 0 || v > picked[i - 1])).toBe(true);
  });

  it('falls back to the latest commit when only one snapshot is allowed', () => {
    expect(pickSnapshotIndices(10, 1)).toEqual([9]);
  });
});

describe('toRank', () => {
  it('ranks the oldest snapshot as the highest rank', () => {
    expect(toRank(0, 1000)).toBe(999);
    expect(toRank(999, 1000)).toBe(0);
  });
});

describe('batchCount', () => {
  it('rounds the number of batches up', () => {
    expect(batchCount(200, 20)).toBe(10);
    expect(batchCount(5, 20)).toBe(1);
    expect(batchCount(21, 20)).toBe(2);
  });
});

describe('batchRange', () => {
  it('returns half-open ranges and clamps the final batch', () => {
    expect(batchRange(1, 45, 20)).toEqual([20, 40]);
    expect(batchRange(2, 45, 20)).toEqual([40, 45]);
  });
});

describe('chooseBatchSize (R32)', () => {
  it('uses 20 snapshots per batch up to 2,000 buildings', () => {
    expect(chooseBatchSize(0, 'full')).toBe(20);
    expect(chooseBatchSize(2000, 'full')).toBe(20);
  });

  it('uses 10 up to 8,000 buildings', () => {
    expect(chooseBatchSize(2001, 'full')).toBe(10);
    expect(chooseBatchSize(8000, 'full')).toBe(10);
  });

  it('uses 5 above 8,000 buildings', () => {
    expect(chooseBatchSize(8001, 'full')).toBe(5);
    expect(chooseBatchSize(20000, 'full')).toBe(5);
  });

  it('always uses COARSE_BATCH_SIZE (3) in coarse mode', () => {
    expect(COARSE_BATCH_SIZE).toBe(3);
    expect(chooseBatchSize(10, 'coarse')).toBe(3);
    expect(chooseBatchSize(50000, 'coarse')).toBe(3);
  });
});
