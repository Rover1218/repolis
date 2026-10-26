export const BUILD_LIMIT = { max: 10, windowMs: 600_000 } as const;

const MS_PER_MINUTE = 60_000;

export type LimitResult = { ok: true } | { ok: false; retryAfterMinutes: number };

export interface Limiter {
  allow(key: string, now: number): LimitResult;
}

/** Sliding-window limiter: at most `max` allowed calls per key within `windowMs`. */
export function createLimiter(opts: { max: number; windowMs: number }): Limiter {
  const calls = new Map<string, number[]>();
  return {
    allow(key, now) {
      const recent = (calls.get(key) ?? []).filter((t) => t + opts.windowMs > now);
      const oldest = recent[0];
      if (recent.length >= opts.max && oldest !== undefined) {
        calls.set(key, recent);
        return { ok: false, retryAfterMinutes: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / MS_PER_MINUTE)) };
      }
      calls.set(key, [...recent, now]);
      return { ok: true };
    },
  };
}
