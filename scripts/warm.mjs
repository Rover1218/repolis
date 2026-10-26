#!/usr/bin/env node
// Usage: node scripts/warm.mjs <baseUrl>
// Walks every example city (latest -> manifest -> all batches) so Vercel's cache is warm.
import { readFileSync } from 'node:fs';
import { batchUrls, latestUrl, manifestUrl, normalizeBase } from './lib/warm-plan.mjs';

const base = normalizeBase(process.argv[2]);
if (!base) {
  console.error('Usage: node scripts/warm.mjs <baseUrl>   (must start with http:// or https://)');
  process.exit(2);
}

const examples = JSON.parse(readFileSync(new URL('../src/lib/examples.json', import.meta.url), 'utf8'));

const TIMEOUT_MS = 5 * 60_000;

async function getData(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'repolis-warm' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw new Error(`timed out after 5 minutes: ${url}`);
    throw err;
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // reported below as "no JSON body"
  }
  if (res.status !== 200 || !body || body.ok !== true) {
    const detail = body?.error?.message ?? 'no JSON body';
    throw new Error(`${res.status} ${url} (${detail})`);
  }
  return body.data;
}

async function timed(fn) {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

let failed = 0;
for (const { owner, repo } of examples) {
  try {
    const latest = await timed(() => getData(latestUrl(base, owner, repo)));
    const { fullName, headSha } = latest.value;
    const manifest = await timed(() => getData(manifestUrl(base, fullName, headSha)));
    const { snapshots, batchSize } = manifest.value;
    const urls = batchUrls(base, fullName, headSha, snapshots.length, batchSize);
    const batches = await timed(async () => {
      for (const url of urls) await getData(url);
    });
    console.log(`${fullName}: latest ${latest.ms} ms, manifest ${manifest.ms} ms, ${urls.length} batches ${batches.ms} ms`);
  } catch (err) {
    failed += 1;
    console.error(`${owner}/${repo}: FAILED ${err instanceof Error ? err.message : err}`);
  }
}

if (failed > 0) {
  console.error(`${failed} of ${examples.length} examples failed`);
  process.exit(1);
}
console.log(`Warmed ${examples.length} examples.`);
