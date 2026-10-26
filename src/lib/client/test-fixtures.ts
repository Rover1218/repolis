import { vi } from 'vitest';
import type { ApiResponse, CityManifest, LatestCity, SnapshotBatch } from '@/lib/history/types';

export const HEAD = 'head1';

export function makeLatest(): LatestCity {
  return {
    fullName: 'o/r',
    defaultBranch: 'main',
    headSha: HEAD,
    date: '2024-03-12T00:00:00Z',
    totalCommits: 3,
    files: [['a.ts', 30]],
    mode: 'full',
    mergePlan: [],
  };
}

export function makeManifest(): CityManifest {
  return {
    fullName: 'o/r',
    headSha: HEAD,
    totalCommits: 3,
    exact: true,
    mode: 'full',
    batchSize: 1,
    snapshots: [0, 1, 2].map((i) => ({
      index: i,
      commitIndex: i,
      sha: `sha${i}`,
      treeSha: `tree${i}`,
      date: '2024-03-12T00:00:00Z',
      author: null,
      message: `m${i}`,
    })),
    mergePlan: [],
    treeRequests: 3,
  };
}

export function makeBatches(): SnapshotBatch[] {
  return [0, 1, 2].map((i) => ({ batch: i, deltas: [{ index: i, changes: [['a.ts', 10 * (i + 1)]] }] }));
}

export function jsonResponse(body: ApiResponse<unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export interface RouteOptions {
  latest?: Response;
  batchDelayMs?: number | ((batch: number) => number);
  failBatch?: number;
}

/** URL-routing fake for fetch; honours AbortSignal and delays batches with (fake) timers. */
export function routeFetch(opts: RouteOptions) {
  return vi.fn((url: string, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal ?? undefined;
    const respond = (): Response => {
      if (url.endsWith('/manifest')) return jsonResponse({ ok: true, data: makeManifest() });
      const m = /\/batch\/(\d+)$/.exec(url);
      if (m) {
        const k = Number(m[1]);
        if (k === opts.failBatch) {
          return jsonResponse(
            { ok: false, error: { code: 'rate-limited', message: 'busy', retryAfterMinutes: 7 } },
            429,
          );
        }
        return jsonResponse({ ok: true, data: makeBatches()[k] });
      }
      return opts.latest?.clone() ?? jsonResponse({ ok: true, data: makeLatest() });
    };
    const delay = batchDelay(url, opts.batchDelayMs);
    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      const done = () => resolve(respond());
      if (delay > 0) setTimeout(done, delay);
      else queueMicrotask(done);
    });
  });
}

function batchDelay(url: string, spec: RouteOptions['batchDelayMs']): number {
  const m = /\/batch\/(\d+)$/.exec(url);
  if (!m || spec === undefined) return 0;
  return typeof spec === 'function' ? spec(Number(m[1])) : spec;
}
