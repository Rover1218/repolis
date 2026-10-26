import { unstable_cache } from 'next/cache';

/** Vercel Data Cache wrapper. `revalidate: false` caches until evicted. */
export function cached<T>(keyParts: string[], revalidate: number | false, fn: () => Promise<T>): Promise<T> {
  return unstable_cache(fn, keyParts, { revalidate })();
}
