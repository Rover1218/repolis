'use client';

import { useEffect, useState } from 'react';
import { fetchLatest } from '@/lib/client/api';
import { loadHistory } from '@/lib/client/load-history';
import { type CityHistory, createCityHistory } from '@/lib/city/history';
import { CityError } from '@/lib/errors';
import type { CityManifest, LatestCity } from '@/lib/history/types';
import type { RepoRef } from '@/lib/repo-ref';

export const FAST_PATH_MS = 1500;

export type CityDataState =
  | { phase: 'loading' }
  | { phase: 'today'; latest: LatestCity; progress: number }
  | { phase: 'history'; latest: LatestCity; manifest: CityManifest; history: CityHistory }
  | { phase: 'today-only'; latest: LatestCity; historyError: CityError }
  | { phase: 'error'; error: CityError };

function toCityError(e: unknown): CityError {
  return e instanceof CityError ? e : new CityError('upstream', { cause: e });
}

export function useCityData(ref: RepoRef): CityDataState {
  const [state, setState] = useState<CityDataState>({ phase: 'loading' });
  const { owner, repo } = ref;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (next: CityDataState) => {
      if (!signal.aborted) setState(next);
    };

    update({ phase: 'loading' });

    const run = async () => {
      let latest: LatestCity;
      try {
        latest = await fetchLatest({ owner, repo }, signal);
      } catch (e) {
        update({ phase: 'error', error: toCityError(e) });
        return;
      }
      if (signal.aborted) return;

      let progress = 0;
      let settled = false;
      let showingToday = false;
      const showToday = () => {
        if (settled) return;
        showingToday = true;
        update({ phase: 'today', latest, progress });
      };
      const remaining = t0 + FAST_PATH_MS - Date.now();
      if (remaining <= 0) showToday();
      else timer = setTimeout(showToday, remaining);

      try {
        const { manifest, batches } = await loadHistory(latest.fullName, latest.headSha, {
          signal,
          onProgress: (p) => {
            progress = p;
            if (showingToday && !settled) update({ phase: 'today', latest, progress });
          },
        });
        settled = true;
        clearTimeout(timer);
        if (signal.aborted) return;
        update({ phase: 'history', latest, manifest, history: createCityHistory(manifest, batches) });
      } catch (e) {
        settled = true;
        clearTimeout(timer);
        update({ phase: 'today-only', latest, historyError: toCityError(e) });
      }
    };
    void run();

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [owner, repo]);

  return state;
}
