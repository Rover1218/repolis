import { clear } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityManifest } from '@/lib/history/types';
import { historyCacheKey, loadCachedHistory, saveCachedHistory } from './history-cache';

const value = { manifest: { fullName: 'a/b' } as CityManifest, batches: [{ batch: 0, deltas: [] }] };

beforeEach(() => clear());
afterEach(() => vi.restoreAllMocks());

describe('history cache', () => {
  it('builds a lowercase key', () => {
    expect(historyCacheKey('Own/Repo', 'abc')).toBe('own/repo@abc');
  });

  it('round-trips a value', async () => {
    await saveCachedHistory('k', value);
    await expect(loadCachedHistory('k')).resolves.toEqual(value);
  });

  it('misses on unknown keys', async () => {
    await expect(loadCachedHistory('nope')).resolves.toBeUndefined();
  });

  it('treats IndexedDB failure as a miss and ignores save failure', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked');
    });
    await expect(loadCachedHistory('k2')).resolves.toBeUndefined();
    await expect(saveCachedHistory('k2', value)).resolves.toBeUndefined();
  });
});
