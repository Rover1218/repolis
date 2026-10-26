import { heightFor } from './height';
import { layoutCity } from './layout';

/**
 * The city's silhouette as `buckets` bar heights in [0, 1]: buildings are binned by x,
 * each bar is its tallest building, normalised by the overall tallest. Empty input is all zeros.
 */
export function skylineBars(files: ReadonlyArray<readonly [string, number]>, buckets: number): number[] {
  const bars = new Array<number>(buckets).fill(0);
  if (files.length === 0 || buckets <= 0) return bars;

  const sizeByPath = new Map(files);
  const { paths, positions } = layoutCity(files.map(([path]) => path));
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < paths.length; i += 1) {
    minX = Math.min(minX, positions[i * 2]);
    maxX = Math.max(maxX, positions[i * 2]);
  }
  const span = maxX - minX;

  let peak = 0;
  for (let i = 0; i < paths.length; i += 1) {
    const height = heightFor(sizeByPath.get(paths[i]) ?? 0);
    const bucket = span > 0 ? Math.min(buckets - 1, Math.floor(((positions[i * 2] - minX) / span) * buckets)) : 0;
    bars[bucket] = Math.max(bars[bucket], height);
    peak = Math.max(peak, height);
  }
  return peak > 0 ? bars.map((h) => h / peak) : bars;
}
