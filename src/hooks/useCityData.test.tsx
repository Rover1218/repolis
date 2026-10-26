// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { clear } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyCacheKey, saveCachedHistory } from '@/lib/client/history-cache';
import { HEAD, jsonResponse, makeBatches, makeLatest, makeManifest, routeFetch } from '@/lib/client/test-fixtures';
import type { CityError } from '@/lib/errors';
import { type CityDataState, useCityData } from './useCityData';

const REF = { owner: 'o', repo: 'r' };

async function advance(ms: number) {
  // Step the fake clock; yield real macrotasks so fake-indexeddb can settle between steps.
  const STEP_MS = 50;
  await act(async () => {
    for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
      await vi.advanceTimersByTimeAsync(Math.min(STEP_MS, ms - elapsed));
      await new Promise<void>((r) => setImmediate(r));
    }
  });
}

function mount() {
  const phases: string[] = [];
  const hook = renderHook(() => {
    const s = useCityData(REF);
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    return s;
  });
  return { ...hook, phases };
}

beforeEach(async () => {
  await clear();
  // setImmediate stays real: fake-indexeddb schedules its work with it.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCityData', () => {
  it('fast path goes loading -> history without today', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    const { result, phases } = mount();
    await advance(100);
    expect(phases).toEqual(['loading', 'history']);
    expect(result.current.phase).toBe('history');
  });

  it('slow history shows today with rising progress, then history', async () => {
    vi.stubGlobal('fetch', routeFetch({ batchDelayMs: 3000 }));
    const { result, phases } = mount();
    await advance(1000);
    expect(result.current.phase).toBe('loading');
    await advance(600);
    expect(result.current).toMatchObject({ phase: 'today', progress: 0 });
    await advance(3000);
    expect((result.current as CityDataState).phase).toBe('history');
    expect(phases).toEqual(['loading', 'today', 'history']);
  });

  it('keeps progress updating while on today', async () => {
    vi.stubGlobal('fetch', routeFetch({ batchDelayMs: (k) => 2000 + k * 1000 }));
    const { result } = mount();
    await advance(1600);
    await advance(1500);
    expect(result.current).toMatchObject({ phase: 'today' });
    expect((result.current as { progress: number }).progress).toBeGreaterThan(0);
  });

  it('shows today immediately when latest arrives after the fast-path window', async () => {
    const fetchFn = routeFetch({ batchDelayMs: 3000 });
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (/\/api\/city\/o\/r$/.test(url)) {
        return new Promise<Response>((r) =>
          setTimeout(() => r(jsonResponse({ ok: true, data: makeLatest() })), 2000),
        );
      }
      return fetchFn(url, init);
    });
    const { result, phases } = mount();
    await advance(2100);
    expect(result.current.phase).toBe('today');
    await advance(4000);
    expect(phases).toEqual(['loading', 'today', 'history']);
  });

  it('rate-limited batch gives today-only with the error and keeps latest', async () => {
    vi.stubGlobal('fetch', routeFetch({ failBatch: 2 }));
    const { result } = mount();
    await advance(100);
    expect(result.current.phase).toBe('today-only');
    const s = result.current as Extract<CityDataState, { phase: 'today-only' }>;
    expect(s.historyError.code).toBe('rate-limited');
    expect(s.historyError.retryAfterMinutes).toBe(7);
    expect(s.latest).toEqual(makeLatest());
  });

  it('latest 404 gives error not-found', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({ latest: jsonResponse({ ok: false, error: { code: 'not-found', message: 'x' } }, 404) }),
    );
    const { result } = mount();
    await advance(100);
    expect(result.current.phase).toBe('error');
    expect((result.current as { error: CityError }).error.code).toBe('not-found');
  });

  it('cached history makes no batch requests', async () => {
    await saveCachedHistory(historyCacheKey('o/r', HEAD), { manifest: makeManifest(), batches: makeBatches() });
    const fetchFn = routeFetch({});
    vi.stubGlobal('fetch', fetchFn);
    const { result, phases } = mount();
    await advance(100);
    expect(phases).toEqual(['loading', 'history']);
    expect(result.current.phase).toBe('history');
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/batch/'))).toBe(false);
  });

  it('aborts in-flight requests on unmount without state updates', async () => {
    const fetchFn = routeFetch({ batchDelayMs: 3000 });
    vi.stubGlobal('fetch', fetchFn);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = mount();
    await advance(200);
    const signals = fetchFn.mock.calls.map(([, init]) => init?.signal as AbortSignal);
    expect(signals.length).toBeGreaterThan(0);
    unmount();
    expect(signals.every((s) => s.aborted)).toBe(true);
    await advance(5000);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('aborts on unmount before latest arrives', async () => {
    const fetchFn = routeFetch({});
    vi.stubGlobal('fetch', fetchFn);
    const { unmount } = mount();
    unmount();
    expect((fetchFn.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    await advance(100);
  });

  it('maps a non-CityError history failure to upstream', async () => {
    const fetchFn = routeFetch({});
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      url.endsWith('/manifest') ? Promise.reject(new TypeError('boom')) : fetchFn(url, init),
    );
    const { result } = mount();
    await advance(100);
    expect(result.current.phase).toBe('today-only');
    expect((result.current as { historyError: CityError }).historyError.code).toBe('upstream');
  });

  it('stays today-only when sibling batches finish after a batch failure', async () => {
    vi.stubGlobal('fetch', routeFetch({ failBatch: 2, batchDelayMs: (k) => (k === 2 ? 2000 : 3000) }));
    const { result, phases } = mount();
    await advance(1600);
    await advance(2000);
    expect(result.current.phase).toBe('today-only');
    expect((result.current as { historyError: CityError }).historyError.retryAfterMinutes).toBe(7);
    expect(phases).toEqual(['loading', 'today', 'today-only']);
  });
});
