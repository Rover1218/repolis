import type { CommitInfo } from '@/lib/github/types';

export interface ChainCommit {
  commit: CommitInfo;
  /** Position in the full, date-ordered history (oldest = 0). */
  commitIndex: number;
}

/**
 * GitHub's `history` is in date order and interleaves commits from merged branches. Given every
 * commit (oldest first, head last), this walks first parents back from the head, locally, so
 * merged branches don't flicker in and out of the replay (R35). `linear` is true when no commit
 * has two parents, i.e. the chain is the whole history.
 */
export function firstParentChain(commits: readonly CommitInfo[]): { chain: ChainCommit[]; linear: boolean } {
  const indexOf = new Map(commits.map((c, i) => [c.sha, i]));
  const chain: ChainCommit[] = [];
  const seen = new Set<number>();
  let i: number | undefined = commits.length - 1;
  while (i !== undefined && i >= 0 && !seen.has(i)) {
    seen.add(i);
    const commit: CommitInfo = commits[i]!;
    chain.push({ commit, commitIndex: i });
    const parent = commit.parents[0];
    i = parent === undefined ? undefined : indexOf.get(parent);
  }
  return { chain: chain.reverse(), linear: commits.every((c) => c.parents.length < 2) };
}
