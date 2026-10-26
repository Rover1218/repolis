import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CityError } from '@/lib/errors';
import { getGitHub } from '@/lib/data/github-instance';
import { CACHE_IMMUTABLE, CACHE_LATEST, NO_STORE } from '@/lib/data/http';
import { getLatestCity } from '@/lib/data/city-data';
import { createFakeGitHub, generateCommits, type FakeCommit } from '@/lib/history/fake-github';
import type { GitHub } from '@/lib/github/types';
import { GET as getLatest } from './[owner]/[repo]/route';
import { GET as getManifest } from './[owner]/[repo]/[head]/manifest/route';
import { GET as getBatch } from './[owner]/[repo]/[head]/batch/[k]/route';

const capturedKeys: string[][] = [];
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, keyParts: string[]) => {
    capturedKeys.push(keyParts);
    return fn;
  },
}));
vi.mock('@/lib/data/github-instance', () => ({ getGitHub: vi.fn() }));

const hex = (i: number): string => i.toString(16).padStart(40, '0');
const COMMITS: FakeCommit[] = generateCommits(25).map((c, i) => ({ ...c, sha: hex(i + 1) }));
const HEAD = hex(25);
const fake = (): GitHub => createFakeGitHub({ commits: COMMITS });

let ip = 0;
const req = (): Request => new Request('http://x', { headers: { 'x-forwarded-for': `10.0.0.${++ip}` } });
const ctx = <P extends object>(params: P) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  capturedKeys.length = 0;
  vi.mocked(getGitHub).mockReturnValue(fake());
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/city/{owner}/{repo}', () => {
  test('returns the latest city with CACHE_LATEST', async () => {
    const res = await getLatest(req(), ctx({ owner: 'facebook', repo: 'react' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_LATEST);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.fullName).toBe('facebook/react');
  });

  test('rejects an invalid owner with 400 and no-store', async () => {
    const res = await getLatest(req(), ctx({ owner: '-bad', repo: 'x' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'invalid-link', message: 'Not a GitHub repo link' } });
  });

  test('rejects an invalid repo name', async () => {
    const res = await getLatest(req(), ctx({ owner: 'a', repo: '..' }));
    expect(res.status).toBe(400);
  });

  test('maps not-found to 404', async () => {
    const res = await getLatest(req(), ctx({ owner: 'nobody', repo: 'nothing' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe('Repo not found or private');
  });

  test('maps a rate-limited upstream error to 429 with retryAfterMinutes', async () => {
    vi.mocked(getGitHub).mockReturnValue({
      ...fake(),
      getRepoHead: async () => {
        throw new CityError('rate-limited', { retryAfterMinutes: 7 });
      },
    });
    const res = await getLatest(req(), ctx({ owner: 'facebook', repo: 'react' }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'rate-limited', message: 'GitHub is busy — try again in 7 minutes', retryAfterMinutes: 7 },
    });
  });

  test('a missing GITHUB_TOKEN surfaces as logged 502 upstream, not an exception', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getGitHub).mockImplementation(() => {
      throw new Error('GITHUB_TOKEN is not set');
    });
    const res = await getLatest(req(), ctx({ owner: 'facebook', repo: 'react' }));
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('cache keys', () => {
  test('latest key is lower-cased', async () => {
    await getLatestCity({ owner: 'Facebook', repo: 'React' }).catch(() => undefined);
    expect(capturedKeys).toContainEqual(['latest', 'facebook', 'react']);
  });

  test('manifest and batch keys are lower-cased', async () => {
    await getBatch(req(), ctx({ owner: 'Facebook', repo: 'React', head: HEAD.toUpperCase(), k: '0' }));
    expect(capturedKeys).toContainEqual(['manifest', 'facebook', 'react', HEAD]);
    expect(capturedKeys).toContainEqual(['batch', 'facebook', 'react', HEAD, '0']);
  });
});

describe('GET .../{head}/manifest', () => {
  test('rejects a malformed head with 400', async () => {
    for (const head of ['abc', 'g'.repeat(40), HEAD + '0']) {
      const res = await getManifest(req(), ctx({ owner: 'facebook', repo: 'react', head }));
      expect(res.status).toBe(400);
    }
  });

  test('returns the manifest with CACHE_IMMUTABLE', async () => {
    const res = await getManifest(req(), ctx({ owner: 'facebook', repo: 'react', head: HEAD }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_IMMUTABLE);
    const body = await res.json();
    expect(body.data.headSha).toBe(HEAD);
    expect(body.data.snapshots).toHaveLength(25);
  });

  test('returns 429 with retryAfterMinutes once a visitor exceeds the build limit', async () => {
    const limited = (): Request => new Request('http://x', { headers: { 'x-forwarded-for': '77.7.7.7' } });
    const c = ctx({ owner: 'facebook', repo: 'react', head: HEAD });
    for (let i = 0; i < 10; i++) expect((await getManifest(limited(), c)).status).toBe(200);
    const res = await getManifest(limited(), c);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.retryAfterMinutes).toBeGreaterThanOrEqual(1);
    expect(res.headers.get('Cache-Control')).toBe(NO_STORE);
  });
});

describe('GET .../{head}/batch/{k}', () => {
  test('returns a batch with CACHE_IMMUTABLE', async () => {
    const res = await getBatch(req(), ctx({ owner: 'facebook', repo: 'react', head: HEAD, k: '1' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_IMMUTABLE);
    expect((await res.json()).data.batch).toBe(1);
  });

  test.each(['abc', '2', '99', '-1', '1.5'])('rejects k=%s with 400', async (k) => {
    const res = await getBatch(req(), ctx({ owner: 'facebook', repo: 'react', head: HEAD, k }));
    expect(res.status).toBe(400);
  });

  test('rejects a malformed head or owner', async () => {
    expect((await getBatch(req(), ctx({ owner: 'facebook', repo: 'react', head: 'zz', k: '0' }))).status).toBe(400);
    expect((await getBatch(req(), ctx({ owner: '-bad', repo: 'react', head: HEAD, k: '0' }))).status).toBe(400);
  });
});
