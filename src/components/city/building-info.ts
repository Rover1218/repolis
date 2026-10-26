import { buildTooltipInfo, type TooltipInfo } from '@/lib/city/format';
import type { TodayCity } from '@/lib/city/today';
import type { CityManifest } from '@/lib/history/types';
import type { ReplayCity } from './director';

/** Before history: size only, no change line (Ruling R20). */
export function todayBuildingInfo(today: TodayCity, id: number): TooltipInfo | null {
  const { layout, sizes, latest } = today;
  if (id < 0 || id >= layout.paths.length) return null;
  return buildTooltipInfo({
    path: layout.paths[id],
    bytes: sizes[id],
    changes: null,
    lastChange: null,
    exact: false,
    mergePlan: latest.mergePlan,
  });
}

/** During the replay: size, change count and last change as of the snapshot on screen. */
export function replayBuildingInfo(
  replay: ReplayCity,
  manifest: CityManifest,
  id: number,
  index: number,
): TooltipInfo | null {
  const { layout, history } = replay;
  if (id < 0 || id >= layout.paths.length) return null;
  const s = Math.min(Math.max(0, index), history.snapshots.length - 1);
  const last = history.lastChangeUntil(id, s);
  return buildTooltipInfo({
    path: layout.paths[id],
    bytes: history.sizesAt(s)[id],
    changes: history.changeCountUntil(id, s),
    lastChange: last === null ? null : history.snapshots[last],
    exact: manifest.exact,
    mergePlan: manifest.mergePlan,
  });
}
