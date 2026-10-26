import { type CityLayout, layoutCity } from '@/lib/city/layout';
import type { LatestCity } from '@/lib/history/types';

/** Today's city: the latest file list laid out on its own, before history arrives. */
export interface TodayCity {
  latest: LatestCity;
  layout: CityLayout;
  /** Bytes per building in `layout.paths` order; empty files count as 1 byte (Ruling R15). */
  sizes: Float32Array;
}

export function buildTodayCity(latest: LatestCity): TodayCity {
  const layout = layoutCity(latest.files.map(([path]) => path));
  const byPath = new Map(latest.files);
  const sizes = Float32Array.from(layout.paths, (p) => Math.max(1, byPath.get(p) ?? 0));
  return { latest, layout, sizes };
}
