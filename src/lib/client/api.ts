import { CityError, type CityErrorCode } from '@/lib/errors';
import type { ApiResponse, CityManifest, LatestCity, SnapshotBatch } from '@/lib/history/types';
import type { RepoRef } from '@/lib/repo-ref';

const ERROR_CODES: readonly CityErrorCode[] = [
  'invalid-link',
  'not-found',
  'empty',
  'rate-limited',
  'upstream',
  'no-webgl',
];

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseEnvelope<T>(body: unknown): ApiResponse<T> | null {
  if (!isRecord(body)) return null;
  if (body.ok === true && 'data' in body) return body as ApiResponse<T>;
  if (body.ok !== false || !isRecord(body.error)) return null;
  const { code, retryAfterMinutes } = body.error;
  if (!ERROR_CODES.includes(code as CityErrorCode)) return null;
  if (retryAfterMinutes !== undefined && typeof retryAfterMinutes !== 'number') return null;
  return body as ApiResponse<T>;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(path, { signal });
    body = await res.json();
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new CityError('upstream', { cause: e });
  }
  const envelope = parseEnvelope<T>(body);
  if (envelope === null) throw new CityError('upstream', { cause: new Error('Invalid API envelope') });
  if (!envelope.ok) {
    throw new CityError(envelope.error.code, { retryAfterMinutes: envelope.error.retryAfterMinutes });
  }
  if (!res.ok) throw new CityError('upstream', { cause: new Error(`Unexpected status ${res.status}`) });
  return envelope.data;
}

function cityPath(fullName: string): string {
  return `/api/city/${fullName.split('/').map(encodeURIComponent).join('/')}`;
}

/** Lower-cased so every casing of a repo shares one CDN entry; the server canonicalises the name. */
export function fetchLatest(ref: RepoRef, signal?: AbortSignal): Promise<LatestCity> {
  const owner = encodeURIComponent(ref.owner.toLowerCase());
  const repo = encodeURIComponent(ref.repo.toLowerCase());
  return request<LatestCity>(`/api/city/${owner}/${repo}`, signal);
}

export function fetchManifest(fullName: string, head: string, signal?: AbortSignal): Promise<CityManifest> {
  return request<CityManifest>(`${cityPath(fullName)}/${encodeURIComponent(head)}/manifest`, signal);
}

export function fetchBatch(
  fullName: string,
  head: string,
  batch: number,
  signal?: AbortSignal,
): Promise<SnapshotBatch> {
  return request<SnapshotBatch>(`${cityPath(fullName)}/${encodeURIComponent(head)}/batch/${batch}`, signal);
}
