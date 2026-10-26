import type { CityLayout } from '@/lib/city/layout';

export const CONSTRUCTION_SECONDS = 5;
export const RISE_SECONDS = 0.6;

const SLOT_FILL = 0.9;

/**
 * Per-building start delay (seconds) for the construction wave: districts
 * are built biggest first, buildings within one spread outward from its centre.
 */
export function constructionDelays(layout: CityLayout, sizes: Float32Array): Float32Array {
  const count = layout.paths.length;
  const delays = new Float32Array(count);
  const totals = new Float64Array(layout.districts.length);
  for (let i = 0; i < count; i += 1) totals[layout.districtIndex[i]] += sizes[i];

  const order = [...totals.keys()]
    .filter((d) => totals[d] > 0)
    .sort((a, b) => totals[b] - totals[a] || a - b);
  if (order.length === 0) return delays;

  const rank = new Map(order.map((d, i) => [d, i]));
  const slot = (CONSTRUCTION_SECONDS - RISE_SECONDS) / order.length;
  const dist = new Float64Array(count);
  const maxDist = new Float64Array(layout.districts.length);
  for (let i = 0; i < count; i += 1) {
    if (sizes[i] <= 0) continue;
    const d = layout.districtIndex[i];
    const box = layout.districts[d];
    dist[i] = Math.hypot(
      layout.positions[2 * i] - (box.x0 + box.w / 2),
      layout.positions[2 * i + 1] - (box.z0 + box.d / 2),
    );
    if (dist[i] > maxDist[d]) maxDist[d] = dist[i];
  }

  for (let i = 0; i < count; i += 1) {
    if (sizes[i] <= 0) continue;
    const d = layout.districtIndex[i];
    const r = rank.get(d);
    if (r === undefined) continue;
    const spread = maxDist[d] > 0 ? dist[i] / maxDist[d] : 0;
    delays[i] = r * slot + slot * SLOT_FILL * spread;
  }
  return delays;
}
