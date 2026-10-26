import { mapLimit } from '@/lib/async';
import { batchCount } from '@/lib/history/snapshots';
import { fetchBatch, fetchManifest } from './api';
import { type CachedHistory, historyCacheKey, loadCachedHistory, saveCachedHistory } from './history-cache';

export const BATCH_CONCURRENCY = 3;

export interface LoadHistoryOptions {
  onProgress(p: number): void;
  signal?: AbortSignal;
}

export async function loadHistory(
  fullName: string,
  head: string,
  opts: LoadHistoryOptions,
): Promise<CachedHistory> {
  const key = historyCacheKey(fullName, head);
  const cached = await loadCachedHistory(key);
  if (cached) {
    opts.onProgress(1);
    return cached;
  }

  const manifest = await fetchManifest(fullName, head, opts.signal);
  const total = batchCount(manifest.snapshots.length, manifest.batchSize);
  const indices = Array.from({ length: total }, (_, i) => i);
  let done = 0;
  const batches = await mapLimit(indices, BATCH_CONCURRENCY, async (k) => {
    const batch = await fetchBatch(fullName, head, k, opts.signal);
    done += 1;
    opts.onProgress(done / total);
    return batch;
  });

  const result = { manifest, batches };
  await saveCachedHistory(key, result);
  return result;
}
