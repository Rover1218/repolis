import type { CityHistory } from '@/lib/city/history';
import { foldedFiles } from '@/lib/history/merge-plan';
import type { MergePlan } from '@/lib/history/types';

/** Real files at head: the buildings, with each merged "+small" block counted as its member files (R37). */
export function headFileCount(buildings: number, plan: MergePlan): number {
  return buildings + foldedFiles(plan);
}

/**
 * Real files at snapshot `s`: the buildings standing then, plus the other members of every merged
 * block standing then. Member counts are known only at head, so earlier snapshots are approximate.
 */
export function fileCountAt(history: Pick<CityHistory, 'paths' | 'sizesAt' | 'filesAliveAt'>, plan: MergePlan, s: number): number {
  const buildings = history.filesAliveAt(s);
  if (plan.length === 0) return buildings;
  const sizes = history.sizesAt(s);
  return buildings + foldedFiles(plan, (block) => (sizes[sortedIndexOf(history.paths, block)] ?? 0) > 0);
}

/** Index of `value` in a sorted list, or -1. */
function sortedIndexOf(sorted: readonly string[], value: string): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = sorted[mid]!;
    if (at === value) return mid;
    if (at < value) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
