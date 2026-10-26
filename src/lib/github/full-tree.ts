import { CityError } from '@/lib/errors';
import type { TreeSnapshot } from '@/lib/history/diff';
import type { RepoRef } from '@/lib/repo-ref';
import type { GitHub } from './types';

const DEFAULT_MAX_DEPTH = 3;

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

  const load = async (sha: string, prefix: string, depth: number): Promise<void> => {
    requests++;
    const full = await gh.getTree(ref, sha, true);
    if (!full.truncated) {
      for (const e of full.entries) {
        if (e.type === 'blob') tree.set(prefix + e.path, { sha: e.sha, size: e.size ?? 0 });
      }
      return;
    }
    anyTruncated = true;
    if (depth >= maxDepth) throw new CityError('upstream');
    requests++;
    const flat = await gh.getTree(ref, sha, false);
    if (flat.truncated) throw new CityError('upstream');
    for (const e of flat.entries) {
      if (e.type === 'blob') tree.set(prefix + e.path, { sha: e.sha, size: e.size ?? 0 });
    }
    for (const e of flat.entries) {
      if (e.type === 'tree') await load(e.sha, `${prefix}${e.path}/`, depth + 1);
    }
  };

  await load(treeSha, '', 0);
  return { tree, requests, truncated: anyTruncated };
}
