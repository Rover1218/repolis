import { describe, expect, test } from 'vitest';
import { BUILD_LIMIT, createLimiter } from './limiter';

describe('createLimiter', () => {
  test('BUILD_LIMIT is 4 builds per visitor per hour (R34)', () => {
    expect(BUILD_LIMIT).toEqual({ max: 4, windowMs: 3_600_000 });
  });

  test('refuses the 5th build inside the hour with the minutes until the oldest expires', () => {
    const limiter = createLimiter(BUILD_LIMIT);
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(limiter.allow('1.2.3.4', t)).toEqual({ ok: true });
    expect(limiter.allow('1.2.3.4', t)).toEqual({ ok: false, retryAfterMinutes: 60 });
  });

  test('allows again once the hour has passed', () => {
    const limiter = createLimiter(BUILD_LIMIT);
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) limiter.allow('1.2.3.4', t);
    expect(limiter.allow('1.2.3.4', t + 3_600_001)).toEqual({ ok: true });
  });

  test('rounds retryAfterMinutes up and never returns less than 1', () => {
    const limiter = createLimiter({ max: 1, windowMs: 600_000 });
    limiter.allow('k', 0);
    expect(limiter.allow('k', 599_999)).toEqual({ ok: false, retryAfterMinutes: 1 });
    expect(limiter.allow('k', 100_000)).toEqual({ ok: false, retryAfterMinutes: 9 });
  });

  test('tracks keys independently and does not record refused calls', () => {
    const limiter = createLimiter({ max: 1, windowMs: 1000 });
    expect(limiter.allow('a', 0).ok).toBe(true);
    expect(limiter.allow('b', 0).ok).toBe(true);
    expect(limiter.allow('a', 500).ok).toBe(false);
    expect(limiter.allow('a', 1001).ok).toBe(true);
  });
});
