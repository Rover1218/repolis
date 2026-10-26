export const BYTES_PER_LINE = 35;
export const MAX_TOWER = 12;
export const HEAT_DECAY = 2.5;
export const CONSTRUCTION_SHARE = 0.3;

const BASE_HEIGHT = 0.2;
const HEIGHT_PER_SQRT_LINE = 0.21;
const KB = 1024;
const MB = KB * KB;

/** Building height for a file of `bytes`; 0 means absent. */
export function heightFor(bytes: number): number {
  if (bytes <= 0) return 0;
  return BASE_HEIGHT + Math.min(Math.sqrt(bytes / BYTES_PER_LINE) * HEIGHT_PER_SQRT_LINE, MAX_TOWER);
}

export function estimateLines(bytes: number): number {
  return Math.max(1, Math.round(bytes / BYTES_PER_LINE));
}

export function formatSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
