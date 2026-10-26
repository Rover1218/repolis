import { CityError } from '@/lib/errors';
import type { RepoRef } from '@/lib/repo-ref';
import type { CommitInfo, GitHub, RepoHead, TreeEntry } from '@/lib/github/types';

export interface FakeCommit {
  sha: string;
  files: Record<string, [sha: string, size: number]>;
}

export interface FakeRepo {
  fullName?: string;
  commits: FakeCommit[];
}

export interface FakeGitHub extends GitHub {
  treeCalls: Array<{ treeSha: string; recursive: boolean }>;
}

const DEFAULT_FULL_NAME = 'facebook/react';

/** Generates `count` commits; commit i adds file `f<i>.ts` and keeps everything before it. */
export function generateCommits(count: number): FakeCommit[] {
  const commits: FakeCommit[] = [];
  let files: FakeCommit['files'] = {};
  for (let i = 0; i < count; i++) {
    files = { ...files, [`f${i}.ts`]: [`blob-${i}`, 10 + i] };
    commits.push({ sha: `c${i}`, files });
  }
  return commits;
}

function toInfo(c: FakeCommit, i: number): CommitInfo {
  return { sha: c.sha, treeSha: `tree-${c.sha}`, date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`, author: 'dev', message: `commit ${i}` };
}

export function createFakeGitHub(repo: FakeRepo): FakeGitHub {
  const fullName = repo.fullName ?? DEFAULT_FULL_NAME;
  const { commits } = repo;
  const treeCalls: FakeGitHub['treeCalls'] = [];
  const indexOf = (sha: string): number => {
    const i = commits.findIndex((c) => c.sha === sha);
    if (i < 0) throw new CityError('not-found');
    return i;
  };
  return {
    treeCalls,
    async getRepoHead(ref: RepoRef): Promise<RepoHead> {
      if (`${ref.owner}/${ref.repo}`.toLowerCase() !== fullName.toLowerCase()) throw new CityError('not-found');
      if (commits.length === 0) throw new CityError('empty');
      const last = commits.length - 1;
      return { fullName, defaultBranch: 'main', head: toInfo(commits[last]!, last), totalCommits: commits.length };
    },
    async getCommitCount(_ref, sha) {
      return indexOf(sha) + 1;
    },
    async getCommitsAtRanks(_ref, headSha, ranks) {
      const total = indexOf(headSha) + 1;
      return ranks.map((r) => {
        const i = total - 1 - r;
        const c = commits[i];
        if (c === undefined) throw new CityError('upstream');
        return toInfo(c, i);
      });
    },
    async getTree(_ref, treeSha, recursive) {
      treeCalls.push({ treeSha, recursive });
      const commit = commits.find((c) => `tree-${c.sha}` === treeSha);
      if (commit === undefined) throw new CityError('not-found');
      const entries: TreeEntry[] = Object.entries(commit.files).map(([path, [sha, size]]) => ({ path, type: 'blob', sha, size }));
      return { entries, truncated: false };
    },
    remaining: () => null,
  };
}
