import { describe, expect, it } from 'vitest';
import { CityError } from '@/lib/errors';
import type { RepoRef } from '@/lib/repo-ref';
import { getFullTree, MAX_TREE_REQUESTS } from './full-tree';
import type { GitHub, TreeEntry } from './types';

const REF: RepoRef = { owner: 'o', repo: 'r' };
type Listing = { entries: TreeEntry[]; truncated: boolean };

function fakeGh(listings: Record<string, Listing>): { gh: GitHub; log: string[] } {
  const log: string[] = [];
  const gh: GitHub = {
    getRepoHead: async () => {
      throw new Error('unused');
    },
    getCommitCount: async () => {
      throw new Error('unused');
    },
    getCommitsAtRanks: async () => {
      throw new Error('unused');
    },
    isAncestor: async () => {
      throw new Error('unused');
    },
    remaining: () => null,
    getTree: async (_ref, sha, recursive) => {
      const key = `${sha}:${recursive ? 'r' : 'n'}`;
      log.push(key);
      const l = listings[key];
      if (!l) throw new Error(`no listing ${key}`);
      return l;
    },
  };
  return { gh, log };
}

const blob = (path: string, size = 1): TreeEntry => ({ path, type: 'blob', sha: `sha-${path}`, size });

describe('getFullTree', () => {
  it('keeps blobs only, skips submodules and trees, preserves unicode paths, 1 request', async () => {
    const { gh } = fakeGh({
      'R:r': {
        truncated: false,
        entries: [
          blob('README.md', 5),
          blob('docs/日本語 file.md', 7),
          { path: 'docs', type: 'tree', sha: 'd' },
          { path: 'vendor/lib', type: 'commit', sha: 'c' },
        ],
      },
    });
    const out = await getFullTree(gh, REF, 'R');
    expect(out.requests).toBe(1);
    expect(out.truncated).toBe(false);
    expect([...out.tree.keys()]).toEqual(['README.md', 'docs/日本語 file.md']);
    expect(out.tree.get('docs/日本語 file.md')).toEqual({ sha: 'sha-docs/日本語 file.md', size: 7 });
  });

  it('defaults a missing blob size to 0', async () => {
    const { gh } = fakeGh({ 'R:r': { truncated: false, entries: [{ path: 'a', type: 'blob', sha: 's' }] } });
    expect((await getFullTree(gh, REF, 'R')).tree.get('a')).toEqual({ sha: 's', size: 0 });
  });

  it('on a truncated root lists it flat, fetches each subtree recursively and prefixes paths', async () => {
    const { gh, log } = fakeGh({
      'R:r': { truncated: true, entries: [] },
      'R:n': {
        truncated: false,
        entries: [
          blob('top.txt'),
          { path: 'src', type: 'tree', sha: 'S' },
          { path: 'docs', type: 'tree', sha: 'D' },
          { path: 'mod', type: 'commit', sha: 'M' },
        ],
      },
      'S:r': { truncated: false, entries: [blob('a.ts'), blob('lib/b.ts'), { path: 'lib', type: 'tree', sha: 'L' }] },
      'D:r': { truncated: false, entries: [blob('日本語 file.md')] },
    });
    const out = await getFullTree(gh, REF, 'R');
    expect(out.truncated).toBe(true);
    expect([...out.tree.keys()].sort()).toEqual(['docs/日本語 file.md', 'src/a.ts', 'src/lib/b.ts', 'top.txt']);
    // 1 recursive attempt + 1 flat listing + 2 subtrees
    expect(out.requests).toBe(4);
    expect(log).toEqual(['R:r', 'R:n', 'S:r', 'D:r']);
  });

  it('recurses into a truncated subtree and prefixes nested paths', async () => {
    const { gh } = fakeGh({
      'R:r': { truncated: true, entries: [] },
      'R:n': { truncated: false, entries: [{ path: 'big', type: 'tree', sha: 'B' }] },
      'B:r': { truncated: true, entries: [] },
      'B:n': { truncated: false, entries: [blob('x.ts'), { path: 'inner', type: 'tree', sha: 'I' }] },
      'I:r': { truncated: false, entries: [blob('y.ts')] },
    });
    const out = await getFullTree(gh, REF, 'R');
    expect([...out.tree.keys()].sort()).toEqual(['big/inner/y.ts', 'big/x.ts']);
    expect(out.requests).toBe(5);
  });

  it('throws upstream when truncation persists past maxDepth, never returning a partial tree', async () => {
    const { gh } = fakeGh({
      'R:r': { truncated: true, entries: [] },
      'R:n': { truncated: false, entries: [{ path: 'a', type: 'tree', sha: 'A' }] },
      'A:r': { truncated: true, entries: [] },
    });
    const err = await getFullTree(gh, REF, 'R', 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CityError);
    expect((err as CityError).code).toBe('upstream');
  });

  it('throws upstream when a flat listing is itself truncated', async () => {
    const { gh } = fakeGh({
      'R:r': { truncated: true, entries: [] },
      'R:n': { truncated: true, entries: [] },
    });
    const err = await getFullTree(gh, REF, 'R').catch((e: unknown) => e);
    expect((err as CityError).code).toBe('upstream');
  });

  it('propagates errors from subtree fetches', async () => {
    const { gh } = fakeGh({
      'R:r': { truncated: true, entries: [] },
      'R:n': { truncated: false, entries: [{ path: 'a', type: 'tree', sha: 'A' }] },
    });
    await expect(getFullTree(gh, REF, 'R')).rejects.toThrow('no listing A:r');
  });

  it('caps total getTree calls at MAX_TREE_REQUESTS on a very wide tree', async () => {
    const subtrees: TreeEntry[] = Array.from({ length: 200 }, (_, i) => ({ path: `d${i}`, type: 'tree', sha: `S${i}` }));
    const listings: Record<string, Listing> = {
      'R:r': { truncated: true, entries: [] },
      'R:n': { truncated: false, entries: subtrees },
    };
    for (let i = 0; i < 200; i++) listings[`S${i}:r`] = { truncated: false, entries: [blob('f')] };
    const { gh, log } = fakeGh(listings);
    const err = await getFullTree(gh, REF, 'R').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CityError);
    expect((err as CityError).code).toBe('upstream');
    expect(log.length).toBeLessThanOrEqual(MAX_TREE_REQUESTS);
  });
});
