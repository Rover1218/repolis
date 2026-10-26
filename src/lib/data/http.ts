import { CityError, errorMessage, httpStatus, type CityErrorCode } from '@/lib/errors';
import { isValidOwner, isValidRepoName, type RepoRef } from '@/lib/repo-ref';
import type { ApiResponse } from '@/lib/history/types';

export const CACHE_LATEST = 'public, s-maxage=3600, stale-while-revalidate=86400';
export const CACHE_IMMUTABLE = 'public, s-maxage=31536000, immutable';
export const NO_STORE = 'no-store';

const HEAD_SHA_PATTERN = /^[0-9a-f]{40}$/;
const BATCH_INDEX_PATTERN = /^\d+$/;

function json<T>(body: ApiResponse<T>, status: number, cacheControl: string): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': cacheControl } });
}

export function jsonOk<T>(data: T, cacheControl: string): Response {
  return json({ ok: true, data }, 200, cacheControl);
}

export function jsonError(err: unknown, context: string): Response {
  if (err instanceof CityError) {
    const { code, retryAfterMinutes } = err;
    const error: { code: CityErrorCode; message: string; retryAfterMinutes?: number } = {
      code,
      message: errorMessage(code, retryAfterMinutes),
    };
    if (retryAfterMinutes !== undefined) error.retryAfterMinutes = retryAfterMinutes;
    return json({ ok: false, error }, httpStatus(code), NO_STORE);
  }
  console.error('[repolis]', context, err);
  return json({ ok: false, error: { code: 'upstream', message: errorMessage('upstream') } }, httpStatus('upstream'), NO_STORE);
}

export function clientKeyFrom(req: Request): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first ? first : 'unknown';
}

/** Validates route params; throws CityError('invalid-link') on bad input. */
export function parseRef(owner: string, repo: string): RepoRef {
  if (!isValidOwner(owner) || !isValidRepoName(repo)) throw new CityError('invalid-link');
  return { owner, repo };
}

export function parseHead(head: string): string {
  const lower = head.toLowerCase();
  if (!HEAD_SHA_PATTERN.test(lower)) throw new CityError('invalid-link');
  return lower;
}

export function parseBatchIndex(k: string): number {
  if (!BATCH_INDEX_PATTERN.test(k)) throw new CityError('invalid-link');
  return Number(k);
}
