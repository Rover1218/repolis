import { CityError } from '@/lib/errors';
import { buildBatch, buildLatest, buildManifest } from '@/lib/history/build';
import type { CityManifest, LatestCity, SnapshotBatch } from '@/lib/history/types';
import type { RepoRef } from '@/lib/repo-ref';
import { cached } from './cache';
import { getGitHub } from './github-instance';
import { BUILD_LIMIT, LATEST_LIMIT, createLimiter } from './limiter';

const LATEST_REVALIDATE_SECONDS = 3600;

const buildLimiter = createLimiter(BUILD_LIMIT);
const latestLimiter = createLimiter(LATEST_LIMIT);

function lower(ref: RepoRef): [string, string] {
  return [ref.owner.toLowerCase(), ref.repo.toLowerCase()];
}

function enforce(limiter: ReturnType<typeof createLimiter>, clientKey: string): void {
  const verdict = limiter.allow(clientKey, Date.now());
  if (!verdict.ok) throw new CityError('rate-limited', { retryAfterMinutes: verdict.retryAfterMinutes });
}

/** The limit applies on cache misses only. */
export function getLatestCity(ref: RepoRef, clientKey: string): Promise<LatestCity> {
  const [o, r] = lower(ref);
  return cached(['latest', o, r], LATEST_REVALIDATE_SECONDS, async () => {
    enforce(latestLimiter, clientKey);
    return buildLatest(getGitHub(), ref);
  });
}

/** Only the repo's current head may be built; the canonical (GitHub-cased) ref is used so cached data never depends on caller casing. */
export function getManifest(ref: RepoRef, headSha: string, clientKey: string): Promise<CityManifest> {
  const [o, r] = lower(ref);
  const head = headSha.toLowerCase();
  return cached(['manifest', o, r, head], false, async () => {
    const latest = await getLatestCity(ref, clientKey);
    if (head !== latest.headSha.toLowerCase()) throw new CityError('upstream');
    enforce(buildLimiter, clientKey);
    return buildManifest(getGitHub(), canonicalRef(latest.fullName, ref), head);
  });
}

function canonicalRef(fullName: string, fallback: RepoRef): RepoRef {
  const [owner, repo] = fullName.split('/');
  return owner && repo ? { owner, repo } : fallback;
}

export async function getBatch(ref: RepoRef, headSha: string, batch: number, clientKey: string): Promise<SnapshotBatch> {
  const [o, r] = lower(ref);
  const head = headSha.toLowerCase();
  const manifest = await getManifest(ref, head, clientKey);
  const canonical = canonicalRef(manifest.fullName, ref);
  return cached(['batch', o, r, head, String(batch)], false, () => buildBatch(getGitHub(), canonical, manifest, batch));
}
