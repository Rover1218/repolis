/** Pure helpers for scripts/warm.mjs. */

/**
 * Returns the base URL without query, fragment or trailing slashes (a path prefix is kept),
 * or null when the argument is not an http(s) URL.
 */
export function normalizeBase(arg) {
  if (typeof arg !== 'string') return null;
  const trimmed = arg.trim();
  if (!/^https?:\/\/[^\s/?#]+/i.test(trimmed)) return null;
  return trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '');
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

export function latestUrl(base, owner, repo) {
  return `${base}/api/city/${encodePath(`${owner}/${repo}`)}`;
}

export function manifestUrl(base, fullName, head) {
  return `${base}/api/city/${encodePath(fullName)}/${head}/manifest`;
}

/** Throws RangeError for a negative or non-integer snapshotCount, or a batchSize that is not a positive integer. */
export function batchCount(snapshotCount, batchSize) {
  if (!Number.isInteger(snapshotCount) || snapshotCount < 0) throw new RangeError(`invalid snapshot count: ${snapshotCount}`);
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new RangeError(`invalid batch size: ${batchSize}`);
  return Math.ceil(snapshotCount / batchSize);
}

export function batchUrls(base, fullName, head, snapshotCount, batchSize) {
  return Array.from({ length: batchCount(snapshotCount, batchSize) }, (_, k) => `${base}/api/city/${encodePath(fullName)}/${head}/batch/${k}`);
}
