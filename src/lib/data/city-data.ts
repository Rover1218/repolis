import { CityError } from '@/lib/errors';
import { buildBatch, buildLatest, buildManifest } from '@/lib/history/build';
import type { CityManifest, LatestCity, SnapshotBatch } from '@/lib/history/types';
import type { RepoRef } from '@/lib/repo-ref';
import { cached } from './cache';
import { getGitHub } from './github-instance';
import { BUILD_LIMIT, createLimiter } from './limiter';

const LATEST_REVALIDATE_SECONDS = 3600;

const buildLimiter = createLimiter(BUILD_LIMIT);

function lower(ref: RepoRef): [string, string] {
  return [ref.owner.toLowerCase(), ref.repo.toLowerCase()];
}

export function getLatestCity(ref: RepoRef): Promise<LatestCity> {
  const [o, r] = lower(ref);
  return cached(['latest', o, r], LATEST_REVALIDATE_SECONDS, () => buildLatest(getGitHub(), ref));
}

/** Runs only on a cache miss, so the per-visitor limit applies to real builds. */
export function getManifest(ref: RepoRef, headSha: string, clientKey: string): Promise<CityManifest> {
  const [o, r] = lower(ref);
  const head = headSha.toLowerCase();
  return cached(['manifest', o, r, head], false, async () => {
    const verdict = buildLimiter.allow(clientKey, Date.now());
    if (!verdict.ok) throw new CityError('rate-limited', { retryAfterMinutes: verdict.retryAfterMinutes });
    return buildManifest(getGitHub(), ref, head);
  });
}

export async function getBatch(ref: RepoRef, headSha: string, batch: number, clientKey: string): Promise<SnapshotBatch> {
  const [o, r] = lower(ref);
  const head = headSha.toLowerCase();
  const manifest = await getManifest(ref, head, clientKey);
  return cached(['batch', o, r, head, String(batch)], false, () => buildBatch(getGitHub(), ref, manifest, batch));
}
