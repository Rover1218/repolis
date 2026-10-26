import type { RepoRef } from '@/lib/repo-ref';

export interface CommitInfo {
  sha: string;
  treeSha: string;
  date: string;
  author: string | null;
  message: string;
}

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export interface RepoHead {
  fullName: string;
  defaultBranch: string;
  head: CommitInfo;
  totalCommits: number;
}

export interface GitHub {
  getRepoHead(ref: RepoRef): Promise<RepoHead>;
  getCommitCount(ref: RepoRef, sha: string): Promise<number>;
  /** rank 0 = head; result has the same order as `ranks`. */
  getCommitsAtRanks(ref: RepoRef, headSha: string, ranks: number[]): Promise<CommitInfo[]>;
  getTree(ref: RepoRef, treeSha: string, recursive: boolean): Promise<{ entries: TreeEntry[]; truncated: boolean }>;
  remaining(resource: 'core' | 'graphql'): { remaining: number; resetAt: number } | null;
}
