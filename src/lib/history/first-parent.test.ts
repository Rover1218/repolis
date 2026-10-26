import { describe, expect, it } from 'vitest';
import type { CommitInfo } from '@/lib/github/types';
import { firstParentChain } from './first-parent';

const commit = (sha: string, parents: string[]): CommitInfo => ({
  sha,
  treeSha: `t-${sha}`,
  date: '2024-01-01T00:00:00Z',
  author: null,
  message: sha,
  parents,
});

describe('firstParentChain', () => {
  it('keeps a linear history whole, oldest first, and calls it linear', () => {
    const commits = [commit('a', []), commit('b', ['a']), commit('c', ['b'])];
    const { chain, linear } = firstParentChain(commits);
    expect(chain.map(({ commit: c, commitIndex }) => [c.sha, commitIndex])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect(linear).toBe(true);
  });

  it('follows first parents from the head and skips the merged branch', () => {
    const commits = [
      commit('a', []),
      commit('x', ['a']),
      commit('b', ['a']),
      commit('m', ['b', 'x']),
    ];
    const { chain, linear } = firstParentChain(commits);
    expect(chain.map(({ commit: c, commitIndex }) => [c.sha, commitIndex])).toEqual([
      ['a', 0],
      ['b', 2],
      ['m', 3],
    ]);
    expect(linear).toBe(false);
  });

  it('stops at a parent that was not fetched, and never loops', () => {
    expect(firstParentChain([commit('b', ['gone']), commit('c', ['b'])]).chain.map((p) => p.commit.sha)).toEqual(['b', 'c']);
    expect(firstParentChain([commit('a', ['b']), commit('b', ['a'])]).chain.map((p) => p.commit.sha)).toEqual(['a', 'b']);
  });

  it('is empty for no commits', () => {
    expect(firstParentChain([])).toEqual({ chain: [], linear: true });
  });
});
