import type { FileChange } from './types';

export type TreeSnapshot = Map<string, { sha: string; size: number }>;

function byPath(a: FileChange, b: FileChange): number {
  if (a[0] < b[0]) return -1;
  return a[0] > b[0] ? 1 : 0;
}

/**
 * Diffs two file trees. Adds and content changes carry the new size;
 * deletions carry `null`. A null `prev` treats every file in `next` as added.
 * Result is sorted by path.
 */
export function diffTrees(prev: TreeSnapshot | null, next: TreeSnapshot): FileChange[] {
  if (prev === null) {
    return [...next].map(([path, { size }]): FileChange => [path, size]).sort(byPath);
  }
  const changes: FileChange[] = [];
  for (const [path, file] of next) {
    const before = prev.get(path);
    if (before === undefined || before.sha !== file.sha) changes.push([path, file.size]);
  }
  for (const path of prev.keys()) {
    if (!next.has(path)) changes.push([path, null]);
  }
  return changes.sort(byPath);
}
