#!/usr/bin/env node
// Checks that the GraphQL cursor "<headSha> <n>" returns the same commits as REST pagination.
// Needs GITHUB_TOKEN in the environment or in .env.local. The token is never printed.
import { readFileSync } from 'node:fs';
import { readJson } from './lib/read-json.mjs';

const OWNER = 'facebook';
const REPO = 'react';
const RANKS = [0, 1, 500, 5000];

function readEnvLocal() {
  let text;
  try {
    text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const token = process.env.GITHUB_TOKEN || readEnvLocal().GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is not set. Put it in .env.local (GITHUB_TOKEN=...) or export it, then rerun.');
  process.exit(2);
}

const TIMEOUT_MS = 30_000;

async function timedFetch(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw new Error(`timed out after 30 seconds: ${url}`);
    throw err;
  }
}

const headers = {
  Authorization: `Bearer ${token}`,
  'User-Agent': 'repolis',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function graphql(query) {
  const res = await timedFetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await readJson(res, 'https://api.github.com/graphql', '30 seconds');
  if (!body) throw new Error(`GraphQL returned no JSON body: ${res.status}`);
  if (!res.ok || body.errors) throw new Error(`GraphQL failed: ${res.status} ${JSON.stringify(body.errors ?? body.message)}`);
  return body.data;
}

async function restSha(head, rank) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/commits?sha=${head}&per_page=1&page=${rank + 1}`;
  const res = await timedFetch(url, { headers });
  if (!res.ok) throw new Error(`REST failed for rank ${rank}: ${res.status}`);
  const list = await readJson(res, url, '30 seconds');
  if (!Array.isArray(list)) throw new Error(`REST returned no JSON list for rank ${rank}`);
  return list[0]?.sha ?? null;
}

async function main() {
  const headData = await graphql(
    `{ repository(owner: "${OWNER}", name: "${REPO}") { defaultBranchRef { target { oid } } } }`,
  );
  const head = headData.repository.defaultBranchRef.target.oid;

  const fields = RANKS.map((r) => {
    const after = r === 0 ? '' : `, after: "${head} ${r - 1}"`;
    return `r${r}: history(first: 1${after}) { nodes { oid } }`;
  }).join(' ');
  const gql = await graphql(
    `{ repository(owner: "${OWNER}", name: "${REPO}") { object(oid: "${head}") { ... on Commit { ${fields} } } } }`,
  );
  const commit = gql.repository.object;

  const mismatched = [];
  for (const r of RANKS) {
    const viaGraphql = commit[`r${r}`].nodes[0]?.oid ?? null;
    const viaRest = await restSha(head, r);
    if (viaGraphql === null || viaGraphql !== viaRest) mismatched.push(r);
  }

  if (mismatched.length === 0) {
    console.log('OK');
    return;
  }
  console.log(`MISMATCH at ranks: ${mismatched.join(', ')}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
