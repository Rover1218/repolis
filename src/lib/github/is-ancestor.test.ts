import { describe, expect, it } from 'vitest';
import { CityError } from '@/lib/errors';
import { createGitHub } from './client';
import { fakeFetch, jsonResponse } from './test-fetch';

const REF = { owner: 'facebook', repo: 'react' };
const SHA = 'a'.repeat(40);
const COMPARE = 'GET https://api.github.com/repos/facebook/react/compare/';
const NOW = 1_700_000_000_000;

const gh = (handler: Parameters<typeof fakeFetch>[0][string]) => {
  const f = fakeFetch({ [COMPARE]: handler });
  return { f, client: createGitHub({ token: 'test-token', fetch: f.fetch, now: () => NOW }) };
};

async function rejection(p: Promise<unknown>): Promise<CityError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(CityError);
    return e as CityError;
  }
  throw new Error('expected rejection');
}

describe('isAncestor', () => {
  it.each(['ahead', 'identical'])("is true when the branch is '%s' of the sha", async (status) => {
    const { f, client } = gh(jsonResponse({ status }));
    expect(await client.isAncestor(REF, SHA, 'main')).toBe(true);
    expect(f.calls[0].url).toBe(`https://api.github.com/repos/facebook/react/compare/${SHA}...main?per_page=1`);
    expect(f.calls[0].headers.authorization).toBe('Bearer test-token');
  });

  it.each(['diverged', 'behind'])("is false when the branch is '%s'", async (status) => {
    const { client } = gh(jsonResponse({ status }));
    expect(await client.isAncestor(REF, SHA, 'main')).toBe(false);
  });

  it('is false when GitHub does not know the sha (404)', async () => {
    const { client } = gh(jsonResponse({ message: 'Not Found' }, { status: 404 }));
    expect(await client.isAncestor(REF, SHA, 'main')).toBe(false);
  });

  it('maps an exhausted quota to rate-limited and records the core budget', async () => {
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 420) };
    const { client } = gh(jsonResponse({ message: 'rate' }, { status: 403, headers }));
    const err = await rejection(client.isAncestor(REF, SHA, 'main'));
    expect(err.code).toBe('rate-limited');
    expect(err.retryAfterMinutes).toBe(7);
    expect(client.remaining('core')).toEqual({ remaining: 0, resetAt: NOW / 1000 + 420 });
  });

  it('maps a 5xx and an unknown status to upstream', async () => {
    expect((await rejection(gh(jsonResponse({}, { status: 502 })).client.isAncestor(REF, SHA, 'main'))).code).toBe('upstream');
    expect((await rejection(gh(jsonResponse({ status: 'weird' })).client.isAncestor(REF, SHA, 'main'))).code).toBe('upstream');
  });

  it('keeps the slashes of a branch name and encodes each segment', async () => {
    const { f, client } = gh(jsonResponse({ status: 'ahead' }));
    await client.isAncestor(REF, SHA, 'release/v1 #2');
    expect(f.calls[0].url).toBe(`https://api.github.com/repos/facebook/react/compare/${SHA}...release/v1%20%232?per_page=1`);
  });

  it('rejects a sha that could escape the path', async () => {
    const { f, client } = gh(jsonResponse({ status: 'ahead' }));
    expect((await rejection(client.isAncestor(REF, '../x', 'main'))).code).toBe('invalid-link');
    expect(f.calls).toHaveLength(0);
  });
});
