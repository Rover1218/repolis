import { describe, expect, it } from 'vitest';
import { batchCount, batchUrls, latestUrl, manifestUrl, normalizeBase } from './warm-plan.mjs';

describe('normalizeBase', () => {
  it('accepts http(s) bases and strips trailing slashes', () => {
    expect(normalizeBase('https://x.vercel.app//')).toBe('https://x.vercel.app');
    expect(normalizeBase('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('keeps a path prefix but strips its trailing slash', () => {
    expect(normalizeBase('https://h/base/')).toBe('https://h/base');
  });

  it('drops query string and fragment', () => {
    expect(normalizeBase('https://h/base?x=1#top')).toBe('https://h/base');
    expect(normalizeBase('https://h?x=1')).toBe('https://h');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBase('  https://h/  ')).toBe('https://h');
  });

  it('rejects missing, non-http or malformed bases', () => {
    expect(normalizeBase(undefined)).toBeNull();
    expect(normalizeBase('ftp://x')).toBeNull();
    expect(normalizeBase('x.vercel.app')).toBeNull();
    expect(normalizeBase('https://')).toBeNull();
    expect(normalizeBase('')).toBeNull();
  });
});

describe('urls', () => {
  it('builds latest and manifest urls', () => {
    expect(latestUrl('https://h', 'a', 'b')).toBe('https://h/api/city/a/b');
    expect(manifestUrl('https://h', 'a/b', 'abc')).toBe('https://h/api/city/a/b/abc/manifest');
  });

  it('keeps dots in repo names and encodes unsafe characters per segment', () => {
    expect(latestUrl('https://h', 'vercel', 'next.js')).toBe('https://h/api/city/vercel/next.js');
    expect(manifestUrl('https://h', 'vercel/next.js', 'abc')).toBe('https://h/api/city/vercel/next.js/abc/manifest');
    expect(latestUrl('https://h', 'a', 'b c')).toBe('https://h/api/city/a/b%20c');
  });
});

describe('batchCount', () => {
  it('rounds up', () => {
    expect(batchCount(0, 40)).toBe(0);
    expect(batchCount(200, 40)).toBe(5);
    expect(batchCount(41, 40)).toBe(2);
  });

  it('throws on negative or non-integer counts and non-positive batch sizes', () => {
    expect(() => batchCount(-1, 40)).toThrow(RangeError);
    expect(() => batchCount(1.5, 40)).toThrow(RangeError);
    expect(() => batchCount(Number.NaN, 40)).toThrow(RangeError);
    expect(() => batchCount(200, 0)).toThrow(RangeError);
    expect(() => batchCount(200, -2)).toThrow(RangeError);
  });
});

describe('batchUrls', () => {
  it('lists one url per batch', () => {
    expect(batchUrls('https://h', 'a/b', 'abc', 5, 2)).toEqual([
      'https://h/api/city/a/b/abc/batch/0',
      'https://h/api/city/a/b/abc/batch/1',
      'https://h/api/city/a/b/abc/batch/2',
    ]);
  });
});
