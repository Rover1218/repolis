import { mapLimit } from '@/lib/async';
import { batchCount } from '@/lib/history/snapshots';
import { fetchBatch, fetchManifest } from './api';
import { type CachedHistory, historyCacheKey, loadCachedHistory, saveCachedHistory } from './history-cache';

export const BATCH_CONCURRENCY = 3;

export interface LoadHistoryOptions {
  onProgress(p: number): void;
  signal?: AbortSignal;
}

function isValidCache(cached: CachedHistory, head: string): boolean {
  const { manifest, batches } = cached;
  if (manifest.headSha !== head) return false;
  if (batches.length !== batchCount(manifest.snapshots.length, manifest.batchSize)) return false;
  return batches.every((b, i) => b.batch === i);
}

/** An AbortController that also aborts when `parent` does. */
function chainedController(parent?: AbortSignal): { controller: AbortController; detach: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', onAbort, { once: true });
  return { controller, detach: () => parent?.removeEventListener('abort', onAbort) };
}

export async function loadHistory(
  fullName: string,
  head: string,
  opts: LoadHistoryOptions,
): Promise<CachedHistory> {
  const key = historyCacheKey(fullName, head);
  const cached = await loadCachedHistory(key);
  if (cached && isValidCache(cached, head)) {
    opts.onProgress(1);
    return cached;
  }

  const { controller, detach } = chainedController(opts.signal);
  const { signal } = controller;
  try {
    const manifest = await fetchManifest(fullName, head, signal);
    const total = batchCount(manifest.snapshots.length, manifest.batchSize);
    const indices = Array.from({ length: total }, (_, i) => i);
    let done = 0;
    const batches = await mapLimit(indices, BATCH_CONCURRENCY, async (k) => {
      try {
        const batch = await fetchBatch(fullName, head, k, signal);
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        done += 1;
        opts.onProgress(done / total);
        return batch;
      } catch (e) {
        controller.abort(); // stop sibling batches after the first failure
        throw e;
      }
    });
    const result = { manifest, batches };
    await saveCachedHistory(key, result);
    return result;
  } finally {
    detach();
  }
}
