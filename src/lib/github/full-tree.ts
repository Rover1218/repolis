import { mapLimit } from '@/lib/async';
import { CityError } from '@/lib/errors';
import type { TreeSnapshot } from '@/lib/history/diff';
import type { RepoRef } from '@/lib/repo-ref';
import type { GitHub } from './types';

const DEFAULT_MAX_DEPTH = 3;
const SUBTREE_CONCURRENCY = 6;
/** Hard cap on getTree calls per getFullTree, so a hostile wide repo cannot fan out unboundedly. */
export const MAX_TREE_REQUESTS = 150;

/**
 * Fetches every blob under `treeSha`. A truncated recursive listing is split into a flat listing
 * plus one recursive fetch per subtree, down to `maxDepth`; beyond that it throws rather than
 * returning a partial tree. `requests` counts every getTree call (including the truncated attempt).
 */
export async function getFullTree(
  gh: GitHub,
  ref: RepoRef,
  treeSha: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<{ tree: TreeSnapshot; requests: number; truncated: boolean }> {
  const tree: TreeSnapshot = new Map();
  let requests = 0;
  let anyTruncated = false;

  // Counted synchronously before each call so the cap holds under concurrency.
  const listTree = (sha: string, recursive: boolean) => {
    if (requests >= MAX_TREE_REQUESTS) throw new CityError('upstream');
    requests++;
    return gh.getTree(ref, sha, recursive);
  };

  const load = async (sha: string, prefix: string, depth: number): Promise<void> => {
    const full = await listTree(sha, true);
    if (!full.truncated) {
      for (const e of full.entries) {
        if (e.type === 'blob') tree.set(prefix + e.path, { sha: e.sha, size: e.size ?? 0 });
      }
      return;
    }
    anyTruncated = true;
    if (depth >= maxDepth) throw new CityError('upstream');
    const flat = await listTree(sha, false);
    if (flat.truncated) throw new CityError('upstream');
    for (const e of flat.entries) {
      if (e.type === 'blob') tree.set(prefix + e.path, { sha: e.sha, size: e.size ?? 0 });
    }
    const subtrees = flat.entries.filter((e) => e.type === 'tree');
    await mapLimit(subtrees, SUBTREE_CONCURRENCY, (e) => load(e.sha, `${prefix}${e.path}/`, depth + 1));
  };

  await load(treeSha, '', 0);
  return { tree, requests, truncated: anyTruncated };
}
