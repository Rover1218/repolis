import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TestCache } from './test-cache';

let cache: TestCache;
beforeEach(() => {
  cache = new TestCache();
});

describe('TestCache (unstable_cache double)', () => {
  test('memoises by keyParts and returns a JSON copy on a hit', async () => {
    const fn = vi.fn(async () => ({ n: 1 }));
    const first = await cache.unstable_cache(fn, ['a', '1'])();
    const second = await cache.unstable_cache(fn, ['a', '1'])();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(cache.has(['a', '1'])).toBe(true);
  });

  test('a call made inside another cached callback runs its function and is recorded', async () => {
    const inner = vi.fn(async () => 'inner');
    await cache.unstable_cache(inner, ['inner'])();
    await cache.unstable_cache(async () => cache.unstable_cache(inner, ['inner'])(), ['outer'])();
    expect(inner).toHaveBeenCalledTimes(2);
    expect(cache.nested).toEqual([{ outer: ['outer'], inner: ['inner'] }]);
  });

  test('does not store a thrown error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(cache.unstable_cache(fn, ['e'])()).rejects.toThrow('boom');
    await expect(cache.unstable_cache(fn, ['e'])()).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(cache.has(['e'])).toBe(false);
  });

  test('reset forgets values and records', async () => {
    await cache.unstable_cache(async () => 1, ['k'])();
    cache.reset();
    expect(cache.has(['k'])).toBe(false);
    expect([cache.keys, cache.runs, cache.nested]).toEqual([[], [], []]);
  });
});
