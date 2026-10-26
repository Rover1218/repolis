import { mapLimit } from '@/lib/async';
import { CityError } from '@/lib/errors';
import type { RepoRef } from '@/lib/repo-ref';
import {
  assertSafeSha,
  buildRanksQuery,
  COMMIT_COUNT_QUERY,
  MAX_ALIASES_PER_REQUEST,
  REPO_HEAD_QUERY,
} from './queries';
import type { CommitInfo, GitHub, RepoHead, TreeEntry } from './types';

const API = 'https://api.github.com';
const REST_FALLBACK_CONCURRENCY = 6;
const MS_PER_MINUTE = 60_000;
const TREE_TYPES: ReadonlySet<string> = new Set(['blob', 'tree', 'commit']);
/** Compare `{sha}...{branch}` status: the sha is an ancestor when the branch is ahead of it or the same. */
const ANCESTRY: ReadonlyMap<unknown, boolean> = new Map([
  ['ahead', true],
  ['identical', true],
  ['behind', false],
  ['diverged', false],
]);

type Resource = 'core' | 'graphql';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untrusted JSON, narrowed at use

/** GraphQL errors of a type we don't classify; getCommitsAtRanks falls back to REST on these. */
class UnclassifiedGraphQLError extends CityError {
  constructor() {
    super('upstream');
  }
}

export function createGitHub(opts: { token: string; fetch?: typeof fetch; now?: () => number }): GitHub {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const limits = new Map<Resource, { remaining: number; resetAt: number }>();

  const minutesUntil = (resetEpochSec: number): number =>
    Math.max(1, Math.ceil((resetEpochSec * 1000 - now()) / MS_PER_MINUTE));

  const record = (resource: Resource, headers: Headers): void => {
    const remaining = Number(headers.get('x-ratelimit-remaining'));
    const resetAt = Number(headers.get('x-ratelimit-reset'));
    if (headers.get('x-ratelimit-remaining') && headers.get('x-ratelimit-reset') && Number.isFinite(remaining) && Number.isFinite(resetAt)) {
      limits.set(resource, { remaining, resetAt });
    }
  };

  const rateLimitMinutes = (headers: Headers): number | undefined => {
    const reset = Number(headers.get('x-ratelimit-reset'));
    if (headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) && headers.get('x-ratelimit-reset')) {
      return minutesUntil(reset);
    }
    const retryAfter = Number(headers.get('retry-after'));
    if (headers.get('retry-after') && Number.isFinite(retryAfter)) {
      return Math.max(1, Math.ceil(retryAfter / 60));
    }
    return undefined;
  };

  const send = async (resource: Resource, url: string, init: RequestInit): Promise<{ body: Json; headers: Headers }> => {
    let res: Response;
    try {
      res = await doFetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${opts.token}`,
          'User-Agent': 'repolis',
          'X-GitHub-Api-Version': '2022-11-28',
          Accept: 'application/vnd.github+json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (cause) {
      throw new CityError('upstream', { cause });
    }
    record(resource, res.headers);
    if (!res.ok) {
      if (res.status === 404) throw new CityError('not-found');
      if (res.status === 409) throw new CityError('empty');
      if (res.status === 403 || res.status === 429) {
        const minutes = rateLimitMinutes(res.headers);
        if (minutes !== undefined) throw new CityError('rate-limited', { retryAfterMinutes: minutes });
      }
      throw new CityError('upstream');
    }
    try {
      return { body: (await res.json()) as Json, headers: res.headers };
    } catch (cause) {
      throw new CityError('upstream', { cause });
    }
  };

  const graphql = async (query: string, variables: Json, tolerateUnclassified = false): Promise<Json> => {
    const { body, headers } = await send('graphql', `${API}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });
    const errors: Json[] | undefined = Array.isArray(body.errors) ? body.errors : undefined;
    if (errors && errors.length > 0) {
      const types = errors.map((e) => e?.type);
      if (types.includes('NOT_FOUND')) throw new CityError('not-found');
      if (types.includes('RATE_LIMITED')) {
        throw new CityError('rate-limited', { retryAfterMinutes: rateLimitMinutes(headers) ?? 1 });
      }
      throw tolerateUnclassified ? new UnclassifiedGraphQLError() : new CityError('upstream');
    }
    if (!body.data) throw new CityError('upstream');
    return body.data;
  };

  const toCommit = (n: Json | null | undefined): CommitInfo => {
    if (!n || typeof n.oid !== 'string' || typeof n.tree?.oid !== 'string' || typeof n.committedDate !== 'string') {
      throw new CityError('upstream');
    }
    return {
      sha: n.oid,
      treeSha: n.tree.oid,
      date: n.committedDate,
      author: n.author?.user?.login ?? n.author?.name ?? null,
      message: String(n.messageHeadline ?? '').split('\n')[0],
    };
  };

  const restCommit = async (ref: RepoRef, headSha: string, rank: number): Promise<CommitInfo> => {
    const url = `${API}/repos/${ref.owner}/${ref.repo}/commits?sha=${encodeURIComponent(headSha)}&per_page=1&page=${rank + 1}`;
    const { body } = await send('core', url, { method: 'GET' });
    const c: Json | undefined = Array.isArray(body) ? body[0] : undefined;
    const date = c?.commit?.committer?.date ?? c?.commit?.author?.date;
    if (!c || typeof c.sha !== 'string' || typeof c.commit?.tree?.sha !== 'string' || typeof date !== 'string') {
      throw new CityError('upstream');
    }
    return {
      sha: c.sha,
      treeSha: c.commit.tree.sha,
      date,
      author: c.author?.login ?? c.commit.author?.name ?? null,
      message: String(c.commit.message ?? '').split('\n')[0],
    };
  };

  const ranksViaGraphQL = async (ref: RepoRef, headSha: string, ranks: number[]): Promise<CommitInfo[]> => {
    const out: CommitInfo[] = [];
    for (let i = 0; i < ranks.length; i += MAX_ALIASES_PER_REQUEST) {
      const batch = ranks.slice(i, i + MAX_ALIASES_PER_REQUEST);
      const data = await graphql(
        buildRanksQuery(batch, headSha),
        { owner: ref.owner, name: ref.repo, sha: headSha },
        true,
      );
      const object = data.repository?.object;
      if (!object) throw new CityError('not-found');
      for (const r of batch) out.push(toCommit(object[`r${r}`]?.nodes?.[0]));
    }
    return out;
  };

  return {
    async getRepoHead(ref) {
      const data = await graphql(REPO_HEAD_QUERY, { owner: ref.owner, name: ref.repo });
      const repo = data.repository;
      if (!repo) throw new CityError('not-found');
      const branch = repo.defaultBranchRef;
      if (!branch?.target) throw new CityError('empty');
      const total = branch.target.history?.totalCount;
      if (typeof total !== 'number') throw new CityError('upstream');
      return {
        fullName: String(repo.nameWithOwner),
        defaultBranch: String(branch.name),
        head: toCommit(branch.target),
        totalCommits: total,
      } satisfies RepoHead;
    },

    async getCommitCount(ref, sha) {
      assertSafeSha(sha);
      const data = await graphql(COMMIT_COUNT_QUERY, { owner: ref.owner, name: ref.repo, sha });
      const total = data.repository?.object?.history?.totalCount;
      if (data.repository?.object == null) throw new CityError('not-found');
      if (typeof total !== 'number') throw new CityError('upstream');
      return total;
    },

    async getCommitsAtRanks(ref, headSha, ranks) {
      assertSafeSha(headSha);
      if (ranks.length === 0) return [];
      try {
        return await ranksViaGraphQL(ref, headSha, ranks);
      } catch (e) {
        if (!(e instanceof UnclassifiedGraphQLError)) throw e;
        return mapLimit(ranks, REST_FALLBACK_CONCURRENCY, (r) => restCommit(ref, headSha, r));
      }
    },

    async getTree(ref, treeSha, recursive) {
      const url = `${API}/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(treeSha)}${recursive ? '?recursive=1' : ''}`;
      const { body } = await send('core', url, { method: 'GET' });
      if (!Array.isArray(body.tree)) throw new CityError('upstream');
      const entries: TreeEntry[] = body.tree.map((t: Json) => {
        if (typeof t?.path !== 'string' || typeof t.sha !== 'string' || !TREE_TYPES.has(t.type)) {
          throw new CityError('upstream');
        }
        const entry: TreeEntry = { path: t.path, type: t.type, sha: t.sha };
        if (typeof t.size === 'number') entry.size = t.size;
        return entry;
      });
      return { entries, truncated: body.truncated === true };
    },

    async isAncestor(ref, sha, branch) {
      assertSafeSha(sha);
      const head = branch.split('/').map(encodeURIComponent).join('/');
      const url = `${API}/repos/${ref.owner}/${ref.repo}/compare/${sha}...${head}?per_page=1`;
      let body: Json;
      try {
        ({ body } = await send('core', url, { method: 'GET' }));
      } catch (e) {
        if (e instanceof CityError && e.code === 'not-found') return false;
        throw e;
      }
      const verdict = ANCESTRY.get(body.status);
      if (verdict === undefined) throw new CityError('upstream');
      return verdict;
    },

    remaining(resource) {
      const v = limits.get(resource);
      return v ? { ...v } : null;
    },
  };
}
