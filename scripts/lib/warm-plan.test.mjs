import { describe, expect, it } from 'vitest';
import { batchCount, batchUrls, latestUrl, manifestUrl, normalizeBase } from './warm-plan.mjs';

describe('warm-plan', () => {
  it('accepts http(s) bases and strips trailing slashes', () => {
    expect(normalizeBase('https://x.vercel.app//')).toBe('https://x.vercel.app');
    expect(normalizeBase('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects missing or non-http bases', () => {
    expect(normalizeBase(undefined)).toBeNull();
    expect(normalizeBase('ftp://x')).toBeNull();
    expect(normalizeBase('x.vercel.app')).toBeNull();
  });

  it('builds latest and manifest urls', () => {
    expect(latestUrl('https://h', 'a', 'b')).toBe('https://h/api/city/a/b');
    expect(manifestUrl('https://h', 'a/b', 'abc')).toBe('https://h/api/city/a/b/abc/manifest');
  });

  it('computes one url per batch', () => {
    expect(batchCount(0, 40)).toBe(0);
    expect(batchCount(200, 0)).toBe(0);
    expect(batchUrls('https://h', 'a/b', 'abc', 5, 2)).toEqual([
      'https://h/api/city/a/b/abc/batch/0',
      'https://h/api/city/a/b/abc/batch/1',
      'https://h/api/city/a/b/abc/batch/2',
    ]);
  });
});
