import 'server-only';
import { CityError } from '@/lib/errors';
import type { GitHub } from '@/lib/github/types';
import { buildBatch, buildLatest, buildManifest } from '@/lib/history/build';
import type { CityManifest, LatestCity, SnapshotBatch } from '@/lib/history/types';
import type { RepoRef } from '@/lib/repo-ref';
import { cached } from './cache';
import { getGitHub } from './github-instance';
import { BUILD_LIMIT, LATEST_LIMIT, createLimiter } from './limiter';

const LATEST_REVALIDATE_SECONDS = 3600;
/** Bump when a cached payload's shape changes, so old Data Cache entries are never read back. */
const CACHE_SCHEMA = 'v1';

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
  return cached(['latest', CACHE_SCHEMA, o, r], LATEST_REVALIDATE_SECONDS, async () => {
    enforce(latestLimiter, clientKey);
    return buildLatest(getGitHub(), ref);
  });
}

/**
 * A client's head may be up to an hour stale (Data Cache + CDN), so besides the cached latest head
 * any ancestor of the default branch is accepted; anything else is refused before building (R31).
 */
async function assertBuildableHead(gh: GitHub, ref: RepoRef, head: string, latest: LatestCity): Promise<void> {
  if (head === latest.headSha.toLowerCase()) return;
  if (!(await gh.isAncestor(ref, head, latest.defaultBranch))) throw new CityError('upstream');
}

/**
 * The latest city is resolved here, outside the cached callback: Next skips the cache read for a
 * nested unstable_cache, which would rebuild latest on every miss (R31). The canonical
 * (GitHub-cased) ref is used so cached data never depends on caller casing.
 */
export async function getManifest(ref: RepoRef, headSha: string, clientKey: string): Promise<CityManifest> {
  const [o, r] = lower(ref);
  const head = headSha.toLowerCase();
  const latest = await getLatestCity(ref, clientKey);
  const canonical = canonicalRef(latest.fullName, ref);
  return cached(['manifest', CACHE_SCHEMA, o, r, head], false, async () => {
    // Before the ancestry request too, so made-up heads cannot spend the shared GitHub budget.
    enforce(buildLimiter, clientKey);
    const gh = getGitHub();
    await assertBuildableHead(gh, canonical, head, latest);
    return buildManifest(gh, canonical, head);
  });
}

function canonicalRef(fullName: string, fallback: RepoRef): RepoRef {
  const [owner, repo] = fullName.split('/');
  return owner && repo ? { owner, repo } : fallback;
}

/** The manifest is resolved outside the batch's cached callback (no nested unstable_cache). */
export async function getBatch(ref: RepoRef, headSha: string, batch: number, clientKey: string): Promise<SnapshotBatch> {
  const [o, r] = lower(ref);
  const head = headSha.toLowerCase();
  const manifest = await getManifest(ref, head, clientKey);
  const canonical = canonicalRef(manifest.fullName, ref);
  return cached(['batch', CACHE_SCHEMA, o, r, head, String(batch)], false, () => buildBatch(getGitHub(), canonical, manifest, batch));
}
