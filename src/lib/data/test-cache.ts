import { AsyncLocalStorage } from 'node:async_hooks';

type Callback<T> = () => Promise<T>;

/**
 * A stand-in for `next/cache`'s `unstable_cache` with the semantics the data layer relies on:
 * - results are memoised by keyParts (and come back as a JSON round-trip, like the Data Cache);
 * - a call made while another cached callback is running skips the memo read and runs its
 *   function, as Next does for a nested `unstable_cache` ("bypass cache"), but still stores;
 * - a thrown error is never stored.
 * Every call and every nesting is recorded so tests can assert on them.
 */
export class TestCache {
  /** keyParts of every call, in call order. */
  readonly keys: string[][] = [];
  /** keyParts of every callback that ran (a miss or a bypass). */
  readonly runs: string[][] = [];
  /** Calls made from inside another cached callback. */
  readonly nested: Array<{ outer: string[]; inner: string[] }> = [];

  private readonly memo = new Map<string, string>();
  private readonly running = new AsyncLocalStorage<string[]>();

  readonly unstable_cache = <T>(fn: Callback<T>, keyParts: string[]): Callback<T> => {
    return async () => {
      this.keys.push(keyParts);
      const key = JSON.stringify(keyParts);
      const outer = this.running.getStore();
      if (outer) this.nested.push({ outer, inner: keyParts });
      const hit = outer ? undefined : this.memo.get(key);
      if (hit !== undefined) return JSON.parse(hit) as T;
      this.runs.push(keyParts);
      const value = await this.running.run(keyParts, fn);
      this.memo.set(key, JSON.stringify(value));
      return value;
    };
  };

  /** Whether a value is stored under these keyParts. */
  has(keyParts: string[]): boolean {
    return this.memo.has(JSON.stringify(keyParts));
  }

  reset(): void {
    this.keys.length = 0;
    this.runs.length = 0;
    this.nested.length = 0;
    this.memo.clear();
  }
}

/** One shared instance: `vi.mock('next/cache', ...)` hands out its `unstable_cache`. */
export const testCache = new TestCache();
