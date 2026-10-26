import { afterEach, describe, expect, test, vi } from 'vitest';
import { CityError } from '@/lib/errors';
import { CACHE_LATEST, NO_STORE, clientKeyFrom, jsonError, jsonOk } from './http';

afterEach(() => vi.restoreAllMocks());

describe('clientKeyFrom', () => {
  test('takes the first IP of x-forwarded-for', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } });
    expect(clientKeyFrom(req)).toBe('9.9.9.9');
  });

  test("falls back to 'unknown'", () => {
    expect(clientKeyFrom(new Request('http://x'))).toBe('unknown');
  });
});

describe('jsonOk', () => {
  test('wraps data with the given Cache-Control', async () => {
    const res = jsonOk({ a: 1 }, CACHE_LATEST);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_LATEST);
    expect(await res.json()).toEqual({ ok: true, data: { a: 1 } });
  });
});

describe('jsonError', () => {
  test('maps CityError to its status and message, no-store', async () => {
    const res = jsonError(new CityError('rate-limited', { retryAfterMinutes: 7 }), 'manifest');
    expect(res.status).toBe(429);
    expect(res.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'rate-limited', message: 'GitHub is busy — try again in 7 minutes', retryAfterMinutes: 7 },
    });
  });

  test('turns unknown errors into 502 upstream and logs once without leaking details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom token=ghp_secret');
    const res = jsonError(err, 'latest');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('upstream');
    expect(JSON.stringify(body)).not.toContain('ghp_secret');
    expect(res.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[repolis]', 'latest', err);
  });
});
