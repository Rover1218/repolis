/** Pure helpers for scripts/warm.mjs. */

export function normalizeBase(arg) {
  if (typeof arg !== 'string' || !/^https?:\/\/[^\s/]+/i.test(arg)) return null;
  return arg.replace(/\/+$/, '');
}

export function latestUrl(base, owner, repo) {
  return `${base}/api/city/${owner}/${repo}`;
}

export function manifestUrl(base, fullName, head) {
  return `${base}/api/city/${fullName}/${head}/manifest`;
}

export function batchCount(snapshotCount, batchSize) {
  return batchSize > 0 ? Math.ceil(snapshotCount / batchSize) : 0;
}

export function batchUrls(base, fullName, head, snapshotCount, batchSize) {
  return Array.from({ length: batchCount(snapshotCount, batchSize) }, (_, k) => `${base}/api/city/${fullName}/${head}/batch/${k}`);
}
