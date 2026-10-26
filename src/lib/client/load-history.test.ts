import { clear } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CityError } from '@/lib/errors';
import { historyCacheKey, saveCachedHistory } from './history-cache';
import { loadHistory } from './load-history';
import { makeBatches, makeManifest, routeFetch } from './test-fixtures';

beforeEach(() => clear());
afterEach(() => vi.unstubAllGlobals());

const noop = () => {};

describe('loadHistory', () => {
  it('fetches the manifest and all batches in order, reporting progress', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    const progress: number[] = [];
    const res = await loadHistory('o/r', 'head1', { onProgress: (p) => progress.push(p) });
    expect(res.manifest).toEqual(makeManifest());
    expect(res.batches).toEqual(makeBatches());
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
  });

  it('serves from cache without fetching and reports 1', async () => {
    await saveCachedHistory(historyCacheKey('o/r', 'head1'), { manifest: makeManifest(), batches: makeBatches() });
    const fetchFn = routeFetch({});
    vi.stubGlobal('fetch', fetchFn);
    const onProgress = vi.fn();
    const res = await loadHistory('O/R', 'head1', { onProgress });
    expect(res.batches).toEqual(makeBatches());
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('saves to the cache after success', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    await loadHistory('o/r', 'head1', { onProgress: noop });
    const fetchFn = routeFetch({});
    vi.stubGlobal('fetch', fetchFn);
    await loadHistory('o/r', 'head1', { onProgress: noop });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects with the CityError of a failing batch and does not cache', async () => {
    vi.stubGlobal('fetch', routeFetch({ failBatch: 2 }));
    const err = await loadHistory('o/r', 'head1', { onProgress: noop }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CityError);
    expect((err as CityError).code).toBe('rate-limited');
    const fetchFn = routeFetch({});
    vi.stubGlobal('fetch', fetchFn);
    await loadHistory('o/r', 'head1', { onProgress: noop });
    expect(fetchFn).toHaveBeenCalled();
  });
});
