import { useEffect, useMemo, useState } from 'react';
import type { CityDataState } from '@/hooks/useCityData';
import type { CityHistory } from '@/lib/city/history';
import { type CityLayout, layoutCity } from '@/lib/city/layout';
import { COLLAPSE_MS } from '@/lib/city/playback';
import { buildTodayCity, type TodayCity } from '@/lib/city/today';
import type { CityDirector, ReplayCity } from './director';

export interface CitySync {
  /** Today's city while the data is in 'today' / 'today-only'. */
  today: TodayCity | null;
  /** The replay, once its layout is on screen (after today's city collapsed). */
  replay: ReplayCity | null;
  /** The layout on screen, for labels. */
  shownLayout: CityLayout | null;
  /** The layout on screen or about to be, for the HUD counts. */
  layout: CityLayout | null;
}

/** Pushes data phases into the scene: today's city, then collapse and the replay. */
export function useCitySync(director: CityDirector | null, data: CityDataState): CitySync {
  const todayLatest = data.phase === 'today' || data.phase === 'today-only' ? data.latest : null;
  const history = data.phase === 'history' ? data.history : null;
  // `latest` keeps its identity across progress updates, so this runs once per latest.
  const today = useMemo(() => (todayLatest ? buildTodayCity(todayLatest) : null), [todayLatest]);
  const pending = useMemo<ReplayCity | null>(
    () => (history ? { layout: layoutCity(history.paths), history } : null),
    [history],
  );
  const [shownHistory, setShownHistory] = useState<CityHistory | null>(null);

  useEffect(() => {
    if (director && today) director.showToday(today);
  }, [director, today]);

  useEffect(() => {
    if (!director || !pending) return;
    // Swap layouts only while the city is flat, so nothing moves during the replay.
    const delay = director.collapse() ? COLLAPSE_MS : 0;
    const timer = setTimeout(() => {
      director.playReplay(pending);
      setShownHistory(pending.history);
    }, delay);
    return () => clearTimeout(timer);
  }, [director, pending]);

  const replay = pending !== null && shownHistory === pending.history ? pending : null;
  return {
    today,
    replay,
    shownLayout: replay?.layout ?? today?.layout ?? null,
    layout: pending?.layout ?? today?.layout ?? null,
  };
}
