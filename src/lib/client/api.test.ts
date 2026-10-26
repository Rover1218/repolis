import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityError } from '@/lib/errors';
import { fetchBatch, fetchLatest, fetchManifest } from './api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('client api', () => {
  it('fetchLatest returns the data and encodes owner and repo', async () => {
    const fn = stubFetch(async () => json({ ok: true, data: { fullName: 'a/b' } }));
    const signal = new AbortController().signal;
    await expect(fetchLatest({ owner: 'a b', repo: 'c' }, signal)).resolves.toEqual({ fullName: 'a/b' });
    expect(fn.mock.calls[0][0]).toBe('/api/city/a%20b/c');
    expect(fn.mock.calls[0][1]?.signal).toBe(signal);
  });

  it('fetchManifest and fetchBatch build canonical URLs', async () => {
    const fn = stubFetch(async () => json({ ok: true, data: {} }));
    await fetchManifest('Own/Re.po', 'abc');
    await fetchBatch('Own/Re.po', 'abc', 2);
    expect(fn.mock.calls[0][0]).toBe('/api/city/Own/Re.po/abc/manifest');
    expect(fn.mock.calls[1][0]).toBe('/api/city/Own/Re.po/abc/batch/2');
  });

  it('maps an ok:false body to CityError with retryAfterMinutes', async () => {
    stubFetch(async () =>
      json({ ok: false, error: { code: 'rate-limited', message: 'x', retryAfterMinutes: 7 } }, 429),
    );
    const err = await fetchLatest({ owner: 'a', repo: 'b' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CityError);
    expect((err as CityError).code).toBe('rate-limited');
    expect((err as CityError).retryAfterMinutes).toBe(7);
  });

  it('maps network failure to upstream', async () => {
    stubFetch(async () => {
      throw new TypeError('offline');
    });
    await expect(fetchLatest({ owner: 'a', repo: 'b' })).rejects.toMatchObject({ code: 'upstream' });
  });

  it('maps a non-JSON body to upstream', async () => {
    stubFetch(async () => new Response('<html>', { status: 502 }));
    await expect(fetchLatest({ owner: 'a', repo: 'b' })).rejects.toMatchObject({ code: 'upstream' });
  });

  it('maps an invalid envelope to upstream', async () => {
    stubFetch(async () => json({ hello: 'world' }));
    await expect(fetchLatest({ owner: 'a', repo: 'b' })).rejects.toMatchObject({ code: 'upstream' });
    stubFetch(async () => json({ ok: false, error: { code: 'bogus', message: 'x' } }, 500));
    await expect(fetchLatest({ owner: 'a', repo: 'b' })).rejects.toMatchObject({ code: 'upstream' });
    stubFetch(async () => json({ ok: true, data: {} }, 500));
    await expect(fetchLatest({ owner: 'a', repo: 'b' })).rejects.toMatchObject({ code: 'upstream' });
  });

  it('lets AbortError propagate unchanged', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    stubFetch(async () => {
      throw abort;
    });
    await expect(fetchLatest({ owner: 'a', repo: 'b' })).rejects.toBe(abort);
  });
});
