import { describe, expect, it } from 'vitest';
import { CityError } from '@/lib/errors';
import { createGitHub } from './client';
import { fakeFetch, jsonResponse } from './test-fetch';

const REF = { owner: 'facebook', repo: 'react' };
const GQL = 'POST https://api.github.com/graphql';
const NOW = 1_700_000_000_000;

function commitNode(oid: string) {
  return {
    oid,
    committedDate: '2024-03-12T10:00:00Z',
    messageHeadline: `msg ${oid}`,
    tree: { oid: `tree-${oid}` },
    author: { name: 'Dan', user: { login: 'gaearon' } },
  };
}

function makeHeadBody(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      repository: {
        nameWithOwner: 'facebook/react',
        defaultBranchRef: {
          name: 'main',
          target: {
            oid: 'abc123',
            committedDate: '2024-03-12T10:00:00Z',
            messageHeadline: 'first line',
            tree: { oid: 'tree1' },
            author: { name: 'Dan Abramov', user: { login: 'gaearon' } },
            history: { totalCount: 19876 },
            ...overrides,
          },
        },
      },
    },
  };
}

async function rejection(p: Promise<unknown>): Promise<CityError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(CityError);
    return e as CityError;
  }
  throw new Error('expected rejection');
}

const gh = (routes: Parameters<typeof fakeFetch>[0]) => {
  const f = fakeFetch(routes);
  return { f, client: createGitHub({ token: 'test-token', fetch: f.fetch, now: () => NOW }) };
};

describe('getRepoHead', () => {
  it('maps the GraphQL body and sends auth headers', async () => {
    const { f, client } = gh({ [GQL]: jsonResponse(makeHeadBody()) });
    const head = await client.getRepoHead(REF);
    expect(head).toEqual({
      fullName: 'facebook/react',
      defaultBranch: 'main',
      head: { sha: 'abc123', treeSha: 'tree1', date: '2024-03-12T10:00:00Z', author: 'gaearon', message: 'first line' },
      totalCommits: 19876,
    });
    expect(f.calls[0].headers.authorization).toBe('Bearer test-token');
    expect(f.calls[0].headers['user-agent']).toBe('repolis');
    expect(f.calls[0].headers['x-github-api-version']).toBe('2022-11-28');
  });

  it('falls back to author name, then null', async () => {
    const named = makeHeadBody({ author: { name: 'Dan Abramov', user: null } });
    expect((await gh({ [GQL]: jsonResponse(named) }).client.getRepoHead(REF)).head.author).toBe('Dan Abramov');
    const none = makeHeadBody({ author: null });
    expect((await gh({ [GQL]: jsonResponse(none) }).client.getRepoHead(REF)).head.author).toBeNull();
  });

  it('takes only the first line of the message', async () => {
    const body = makeHeadBody({ messageHeadline: 'line one\nline two' });
    expect((await gh({ [GQL]: jsonResponse(body) }).client.getRepoHead(REF)).head.message).toBe('line one');
  });

  it('maps GraphQL NOT_FOUND to not-found', async () => {
    const { client } = gh({ [GQL]: jsonResponse({ data: { repository: null }, errors: [{ type: 'NOT_FOUND' }] }) });
    expect((await rejection(client.getRepoHead(REF))).code).toBe('not-found');
  });

  it('maps a null repository without errors to not-found', async () => {
    const { client } = gh({ [GQL]: jsonResponse({ data: { repository: null } }) });
    expect((await rejection(client.getRepoHead(REF))).code).toBe('not-found');
  });

  it('maps a null defaultBranchRef to empty', async () => {
    const body = { data: { repository: { nameWithOwner: 'a/b', defaultBranchRef: null } } };
    const { client } = gh({ [GQL]: jsonResponse(body) });
    expect((await rejection(client.getRepoHead(REF))).code).toBe('empty');
  });

  it('maps GraphQL RATE_LIMITED to rate-limited', async () => {
    const { client } = gh({ [GQL]: jsonResponse({ errors: [{ type: 'RATE_LIMITED' }] }) });
    expect((await rejection(client.getRepoHead(REF))).code).toBe('rate-limited');
  });

  it('maps other GraphQL error types to upstream', async () => {
    const { client } = gh({ [GQL]: jsonResponse({ errors: [{ type: 'SOMETHING' }] }) });
    expect((await rejection(client.getRepoHead(REF))).code).toBe('upstream');
  });
});

describe('HTTP error mapping', () => {
  const status = (s: number, headers: Record<string, string> = {}) =>
    gh({ [GQL]: jsonResponse({ message: 'x' }, { status: s, headers }) }).client.getRepoHead(REF);

  it('403 with exhausted quota uses the reset header', async () => {
    const err = await rejection(status(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 420) }));
    expect(err.code).toBe('rate-limited');
    expect(err.retryAfterMinutes).toBe(7);
  });

  it('429 with retry-after uses seconds', async () => {
    const err = await rejection(status(429, { 'retry-after': '120' }));
    expect(err.code).toBe('rate-limited');
    expect(err.retryAfterMinutes).toBe(2);
  });

  it('rounds retry-after up and never goes below 1', async () => {
    expect((await rejection(status(429, { 'retry-after': '5' }))).retryAfterMinutes).toBe(1);
    const past = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 - 50) };
    expect((await rejection(status(403, past))).retryAfterMinutes).toBe(1);
  });

  it('maps 404 to not-found and 409 to empty', async () => {
    expect((await rejection(status(404))).code).toBe('not-found');
    expect((await rejection(status(409))).code).toBe('empty');
  });

  it('maps 500, 401 and plain 403 to upstream', async () => {
    expect((await rejection(status(500))).code).toBe('upstream');
    expect((await rejection(status(401))).code).toBe('upstream');
    expect((await rejection(status(403))).code).toBe('upstream');
  });

  it('maps a thrown network error to upstream with a cause', async () => {
    const boom = new Error('network down');
    const { client } = gh({
      [GQL]: () => {
        throw boom;
      },
    });
    const err = await rejection(client.getRepoHead(REF));
    expect(err.code).toBe('upstream');
    expect(err.cause).toBe(boom);
  });

  it('maps a non-JSON 200 body to upstream', async () => {
    const { client } = gh({ [GQL]: new Response('<html>', { status: 200 }) });
    expect((await rejection(client.getRepoHead(REF))).code).toBe('upstream');
  });
});

describe('getCommitCount', () => {
  it('returns history totalCount and passes sha as a variable', async () => {
    const { f, client } = gh({ [GQL]: jsonResponse({ data: { repository: { object: { history: { totalCount: 42 } } } } }) });
    expect(await client.getCommitCount(REF, 'abc')).toBe(42);
    expect(JSON.parse(f.calls[0].body ?? '{}').variables).toMatchObject({ owner: 'facebook', name: 'react', sha: 'abc' });
  });

  it('maps a missing object to not-found', async () => {
    const { client } = gh({ [GQL]: jsonResponse({ data: { repository: { object: null } } }) });
    expect((await rejection(client.getCommitCount(REF, 'abc'))).code).toBe('not-found');
  });
});

function ranksResponder(call: { body?: string }): Response {
  const query: string = JSON.parse(call.body ?? '{}').query;
  const aliases = [...query.matchAll(/\br(\d+): history/g)].map((m) => m[1]);
  const object = Object.fromEntries(aliases.map((a) => [`r${a}`, { nodes: [commitNode(`sha${a}`)] }]));
  return jsonResponse({ data: { repository: { object } } });
}

describe('getCommitsAtRanks', () => {
  it('uses one aliased request with cursors, in rank order', async () => {
    const { f, client } = gh({ [GQL]: ranksResponder });
    const commits = await client.getCommitsAtRanks(REF, 'HEAD', [0, 1, 250]);
    expect(f.calls).toHaveLength(1);
    const query: string = JSON.parse(f.calls[0].body ?? '{}').query;
    expect(query).toContain('r0: history(first: 1)');
    expect(query).toContain('after: "HEAD 0"');
    expect(query).toContain('after: "HEAD 249"');
    expect(commits.map((c) => c.sha)).toEqual(['sha0', 'sha1', 'sha250']);
    expect(commits[0]).toMatchObject({ treeSha: 'tree-sha0', author: 'gaearon', message: 'msg sha0' });
  });

  it('batches at most 50 aliases per request', async () => {
    const { f, client } = gh({ [GQL]: ranksResponder });
    const ranks = Array.from({ length: 120 }, (_, i) => i * 3);
    const commits = await client.getCommitsAtRanks(REF, 'HEAD', ranks);
    expect(f.calls).toHaveLength(3);
    expect(commits.map((c) => c.sha)).toEqual(ranks.map((r) => `sha${r}`));
  });

  it('returns [] for no ranks without requesting', async () => {
    const { f, client } = gh({ [GQL]: ranksResponder });
    expect(await client.getCommitsAtRanks(REF, 'HEAD', [])).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });

  it('rejects a head sha that could inject into the query', async () => {
    const { client } = gh({ [GQL]: ranksResponder });
    expect((await rejection(client.getCommitsAtRanks(REF, 'x" ) { a }', [1]))).code).toBe('invalid-link');
  });

  it('falls back to REST pages on unknown GraphQL errors', async () => {
    const restCommit = (sha: string) => [
      {
        sha,
        commit: { message: 'rest msg\nbody', committer: { date: '2020-01-01T00:00:00Z' }, tree: { sha: `t-${sha}` }, author: { name: 'Rest Name' } },
        author: { login: 'restuser' },
      },
    ];
    const { f, client } = gh({
      [GQL]: jsonResponse({ errors: [{ type: 'SOMETHING' }] }),
      'GET https://api.github.com/repos/facebook/react/commits': (call) =>
        jsonResponse(restCommit(`p${new URL(call.url).searchParams.get('page')}`), {
          headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': '1700003600' },
        }),
    });
    const commits = await client.getCommitsAtRanks(REF, 'HEAD', [0, 1, 250]);
    const rest = f.calls.filter((c) => c.method === 'GET');
    expect(rest.map((c) => new URL(c.url).searchParams.get('page')).sort()).toEqual(['1', '2', '251']);
    expect(rest.every((c) => c.url.includes('sha=HEAD') && c.url.includes('per_page=1'))).toBe(true);
    expect(commits.map((c) => c.sha)).toEqual(['p1', 'p2', 'p251']);
    expect(commits[0]).toEqual({ sha: 'p1', treeSha: 't-p1', date: '2020-01-01T00:00:00Z', author: 'restuser', message: 'rest msg' });
    expect(client.remaining('core')).toEqual({ remaining: 4000, resetAt: 1700003600 });
  });

  it('does not fall back on NOT_FOUND', async () => {
    const { f, client } = gh({ [GQL]: jsonResponse({ errors: [{ type: 'NOT_FOUND' }] }) });
    expect((await rejection(client.getCommitsAtRanks(REF, 'HEAD', [0]))).code).toBe('not-found');
    expect(f.calls).toHaveLength(1);
  });

  it('does not fall back on RATE_LIMITED', async () => {
    const { client } = gh({ [GQL]: jsonResponse({ errors: [{ type: 'RATE_LIMITED' }] }) });
    expect((await rejection(client.getCommitsAtRanks(REF, 'HEAD', [0]))).code).toBe('rate-limited');
  });

  it('rejects when a rank is past the end of history', async () => {
    const { client } = gh({
      [GQL]: jsonResponse({ data: { repository: { object: { r5: { nodes: [] } } } } }),
    });
    expect((await rejection(client.getCommitsAtRanks(REF, 'HEAD', [5]))).code).toBe('upstream');
  });
});

describe('getTree', () => {
  const TREES = 'GET https://api.github.com/repos/facebook/react/git/trees/';

  it('maps entries (including submodules) and truncated', async () => {
    const { f, client } = gh({
      [TREES]: jsonResponse(
        {
          truncated: true,
          tree: [
            { path: 'a.ts', type: 'blob', sha: 's1', size: 10, mode: '100644' },
            { path: 'sub', type: 'commit', sha: 's2', mode: '160000' },
            { path: 'dir', type: 'tree', sha: 's3' },
          ],
        },
        { headers: { 'x-ratelimit-remaining': '59', 'x-ratelimit-reset': '1700000500' } },
      ),
    });
    const out = await client.getTree(REF, 'T1', true);
    expect(f.calls[0].url).toBe('https://api.github.com/repos/facebook/react/git/trees/T1?recursive=1');
    expect(out.truncated).toBe(true);
    expect(out.entries).toEqual([
      { path: 'a.ts', type: 'blob', sha: 's1', size: 10 },
      { path: 'sub', type: 'commit', sha: 's2' },
      { path: 'dir', type: 'tree', sha: 's3' },
    ]);
    expect(client.remaining('core')).toEqual({ remaining: 59, resetAt: 1700000500 });
    expect(client.remaining('graphql')).toBeNull();
  });

  it('omits the recursive flag when not recursive and tracks graphql separately', async () => {
    const { f, client } = gh({
      [TREES]: jsonResponse({ truncated: false, tree: [] }),
      [GQL]: jsonResponse(makeHeadBody(), { headers: { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1700003000' } }),
    });
    await client.getTree(REF, 'T1', false);
    expect(f.calls[0].url.endsWith('/git/trees/T1')).toBe(true);
    expect(client.remaining('core')).toBeNull();
    await client.getRepoHead(REF);
    expect(client.remaining('graphql')).toEqual({ remaining: 4999, resetAt: 1700003000 });
  });

  it('maps a 404 and a 409 tree response', async () => {
    const r404 = gh({ [TREES]: jsonResponse({}, { status: 404 }) }).client.getTree(REF, 'x', true);
    expect((await rejection(r404)).code).toBe('not-found');
    const r409 = gh({ [TREES]: jsonResponse({}, { status: 409 }) }).client.getTree(REF, 'x', true);
    expect((await rejection(r409)).code).toBe('empty');
  });

  it('rejects a malformed tree body as upstream', async () => {
    const { client } = gh({ [TREES]: jsonResponse({ truncated: false }) });
    expect((await rejection(client.getTree(REF, 'x', true))).code).toBe('upstream');
  });
});
