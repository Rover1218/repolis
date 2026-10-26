import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CityError } from '@/lib/errors';
import { createFakeGitHub, generateCommits, type FakeCommit, type FakeGitHub } from '@/lib/history/fake-github';
import { getBatch, getLatestCity, getManifest } from './city-data';
import { getGitHub } from './github-instance';
import { testCache } from './test-cache';

vi.mock('next/cache', async () => ({ unstable_cache: (await import('./test-cache')).testCache.unstable_cache }));
vi.mock('./github-instance', () => ({ getGitHub: vi.fn() }));

const hex = (i: number): string => i.toString(16).padStart(40, '0');
const commits = (n: number): FakeCommit[] => generateCommits(n).map((c, i) => ({ ...c, sha: hex(i + 1) }));
const REF = { owner: 'facebook', repo: 'react' };
const FOREIGN = 'f'.repeat(40);
const manifestKey = (head: string) => ['manifest', 'v1', 'facebook', 'react', head];

let gh: FakeGitHub;
let visitor = 0;
const key = (): string => `visitor-${++visitor}`;

beforeEach(() => {
  testCache.reset();
  gh = createFakeGitHub({ commits: commits(25) });
  vi.mocked(getGitHub).mockImplementation(() => gh);
});

describe('Data Cache usage', () => {
  test('no data function calls cached from inside another cached callback', async () => {
    await getLatestCity(REF, key());
    await getManifest(REF, hex(25), key());
    await getBatch(REF, hex(25), 1, key());
    await getManifest(REF, hex(10), key());
    await getBatch(REF, hex(10), 0, key());
    await expect(getManifest(REF, FOREIGN, key())).rejects.toBeInstanceOf(CityError);
    expect(testCache.runs.length).toBeGreaterThanOrEqual(5);
    expect(testCache.nested).toEqual([]);
  });

  test('a batch reuses the cached latest and manifest', async () => {
    await getBatch(REF, hex(25), 0, key());
    await getBatch(REF, hex(25), 1, key());
    expect(testCache.runs.map((k) => k[0])).toEqual(['latest', 'manifest', 'batch', 'batch']);
  });
});

describe('head acceptance (R31)', () => {
  test('a head that was current when latest was cached still builds after the branch moves on', async () => {
    const latest = await getLatestCity(REF, key());
    gh = createFakeGitHub({ commits: commits(30) });
    const manifest = await getManifest(REF, latest.headSha, key());
    expect(manifest.headSha).toBe(hex(25));
    expect(manifest.snapshots).toHaveLength(25);
  });

  test('the current head is accepted without asking GitHub about ancestry', async () => {
    const spy = vi.spyOn(gh, 'isAncestor');
    const manifest = await getManifest(REF, hex(25).toUpperCase(), key());
    expect(manifest.headSha).toBe(hex(25));
    expect(spy).not.toHaveBeenCalled();
  });

  test('a stale head that is an ancestor of the default branch builds its own manifest', async () => {
    const spy = vi.spyOn(gh, 'isAncestor');
    const manifest = await getManifest(REF, hex(10), key());
    expect(manifest.headSha).toBe(hex(10));
    expect(manifest.snapshots).toHaveLength(10);
    expect(spy).toHaveBeenCalledWith({ owner: 'facebook', repo: 'react' }, hex(10), 'main');
    expect(testCache.has(manifestKey(hex(10)))).toBe(true);
  });

  test('the ancestry check runs only on a manifest miss', async () => {
    const spy = vi.spyOn(gh, 'isAncestor');
    await getManifest(REF, hex(10), key());
    await getManifest(REF, hex(10), key());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a foreign head is refused as upstream, and nothing is built or cached', async () => {
    await getLatestCity(REF, key());
    const count = vi.spyOn(gh, 'getCommitCount');
    const ranks = vi.spyOn(gh, 'getCommitsAtRanks');
    const trees = gh.treeCalls.length;
    await expect(getManifest(REF, FOREIGN, key())).rejects.toMatchObject({ code: 'upstream' });
    expect(count).not.toHaveBeenCalled();
    expect(ranks).not.toHaveBeenCalled();
    expect(gh.treeCalls).toHaveLength(trees);
    expect(testCache.has(manifestKey(FOREIGN))).toBe(false);
  });

  test('a rate limit from the ancestry check passes through', async () => {
    vi.spyOn(gh, 'isAncestor').mockRejectedValue(new CityError('rate-limited', { retryAfterMinutes: 4 }));
    await expect(getManifest(REF, hex(10), key())).rejects.toMatchObject({ code: 'rate-limited', retryAfterMinutes: 4 });
    expect(testCache.has(manifestKey(hex(10)))).toBe(false);
  });
});
