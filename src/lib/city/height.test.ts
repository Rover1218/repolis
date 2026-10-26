import { describe, expect, it } from 'vitest';
import { estimateLines, formatSize, heightFor } from '@/lib/city/height';

describe('heightFor', () => {
  it('is 0 for no bytes and about 0.41 for one line-equivalent of 35 bytes', () => {
    expect(heightFor(0)).toBe(0);
    expect(heightFor(35)).toBeCloseTo(0.41, 5);
  });
  it('caps towers at 12.2', () => {
    expect(heightFor(500_000)).toBeCloseTo(12.2, 5);
    expect(heightFor(5_000_000)).toBeCloseTo(12.2, 5);
    expect(heightFor(5e8)).toBeCloseTo(12.2, 5);
  });
});

describe('formatSize / estimateLines', () => {
  it('formats B, KB and MB', () => {
    expect(formatSize(812)).toBe('812 B');
    expect(formatSize(4300)).toBe('4.2 KB');
    expect(formatSize(1_300_000)).toBe('1.2 MB');
  });
  it('estimates at least one line', () => {
    expect(estimateLines(0)).toBe(1);
    expect(estimateLines(3500)).toBe(100);
  });
});
