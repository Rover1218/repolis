import { CONSTRUCTION_SHARE, HEAT_DECAY } from '@/lib/city/height';
import type { CityManifest, SnapshotBatch, SnapshotDelta, SnapshotMeta } from '@/lib/history/types';

export interface CityHistory {
  /** Every file ever, sorted: same order as layoutCity(paths).paths. */
  paths: string[];
  snapshots: SnapshotMeta[];
  /** Bytes per file at snapshot s, 0 = absent. */
  sizesAt(s: number): Float32Array;
  /** 1 at a change, exp(-(s - c) / HEAT_DECAY) after; 0 if never changed or absent. */
  heatAt(s: number): Float32Array;
  /** Per snapshot: bytes changed. */
  activity: Float32Array;
  changeCountUntil(file: number, s: number): number;
  lastChangeUntil(file: number, s: number): number | null;
  filesAliveAt(s: number): number;
  /** Snapshots whose added bytes exceed CONSTRUCTION_SHARE of the final total. */
  constructionSnapshots: ReadonlySet<number>;
}

/** One file's change list: parallel arrays sorted by snapshot. */
interface ChangeList {
  snaps: number[];
  sizes: number[]; // 0 = deleted / absent
}

const INCOMPLETE = 'history batches incomplete';

function collectDeltas(manifest: CityManifest, batches: readonly SnapshotBatch[]): SnapshotDelta[] {
  const count = manifest.snapshots.length;
  const sorted = [...batches].sort((a, b) => a.batch - b.batch);
  const deltas: SnapshotDelta[] = [];
  for (const batch of sorted) deltas.push(...batch.deltas);
  if (deltas.length !== count) throw new Error(INCOMPLETE);
  deltas.forEach((d, i) => {
    if (d.index !== i) throw new Error(INCOMPLETE);
  });
  return deltas;
}

/** Index of the last entry with snaps[i] <= s, or -1. */
function lastAtOrBefore(snaps: readonly number[], s: number): number {
  let lo = 0;
  let hi = snaps.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (snaps[mid] <= s) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function changeMagnitude(oldSize: number, newSize: number): number {
  if (oldSize === newSize) return newSize;
  return Math.abs(newSize - oldSize);
}

export function createCityHistory(manifest: CityManifest, batches: SnapshotBatch[]): CityHistory {
  const deltas = collectDeltas(manifest, batches);
  const paths = [...new Set(deltas.flatMap((d) => d.changes.map(([p]) => p)))].sort();
  const fileOf = new Map(paths.map((p, i) => [p, i]));
  const lists: ChangeList[] = paths.map(() => ({ snaps: [], sizes: [] }));
  const current = new Float64Array(paths.length);
  const activity = new Float32Array(deltas.length);
  const added = new Float64Array(deltas.length);

  deltas.forEach((delta, s) => {
    for (const [path, size] of delta.changes) {
      const f = fileOf.get(path) as number;
      const next = size === null ? 0 : Math.max(1, size);
      const prev = current[f];
      activity[s] += changeMagnitude(prev, next);
      added[s] += Math.max(0, next - prev);
      current[f] = next;
      const list = lists[f];
      const last = list.snaps.length - 1;
      if (last >= 0 && list.snaps[last] === s) list.sizes[last] = next;
      else {
        list.snaps.push(s);
        list.sizes.push(next);
      }
    }
  });

  let total = 0;
  for (const v of current) total += v;
  const construction = new Set<number>();
  if (total > 0) {
    added.forEach((a, s) => {
      if (a > CONSTRUCTION_SHARE * total) construction.add(s);
    });
  }

  const sizesAt = (s: number): Float32Array => {
    const out = new Float32Array(paths.length);
    lists.forEach((l, f) => {
      const i = lastAtOrBefore(l.snaps, s);
      if (i >= 0) out[f] = l.sizes[i];
    });
    return out;
  };

  const heatAt = (s: number): Float32Array => {
    const out = new Float32Array(paths.length);
    lists.forEach((l, f) => {
      const i = lastAtOrBefore(l.snaps, s);
      if (i >= 0 && l.sizes[i] > 0) out[f] = Math.exp(-(s - l.snaps[i]) / HEAT_DECAY);
    });
    return out;
  };

  return {
    paths,
    snapshots: manifest.snapshots,
    sizesAt,
    heatAt,
    activity,
    changeCountUntil: (file, s) => lastAtOrBefore(lists[file].snaps, s) + 1,
    lastChangeUntil: (file, s) => {
      const i = lastAtOrBefore(lists[file].snaps, s);
      return i < 0 ? null : lists[file].snaps[i];
    },
    filesAliveAt: (s) => {
      let n = 0;
      for (const l of lists) {
        const i = lastAtOrBefore(l.snaps, s);
        if (i >= 0 && l.sizes[i] > 0) n += 1;
      }
      return n;
    },
    constructionSnapshots: construction,
  };
}
