import { get, set } from 'idb-keyval';
import type { CityManifest, SnapshotBatch } from '@/lib/history/types';

export interface CachedHistory {
  manifest: CityManifest;
  batches: SnapshotBatch[];
}

export function historyCacheKey(fullName: string, head: string): string {
  return `${fullName.toLowerCase()}@${head}`;
}

export async function loadCachedHistory(key: string): Promise<CachedHistory | undefined> {
  try {
    return await get<CachedHistory>(key);
  } catch {
    // Deliberate fallback (R5): IndexedDB unavailable (private mode, quota) counts as a cache miss.
    return undefined;
  }
}

export async function saveCachedHistory(key: string, value: CachedHistory): Promise<void> {
  try {
    await set(key, value);
  } catch {
    // Deliberate fallback (R5): failing to cache is harmless; the next visit refetches.
  }
}
