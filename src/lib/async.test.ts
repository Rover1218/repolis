import { describe, expect, it } from 'vitest';
import { mapLimit } from './async';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapLimit', () => {
  it('preserves input order regardless of completion order and respects the limit', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 3, 2], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await delay(n);
      active--;
      return n * 2;
    });
    expect(out).toEqual([10, 2, 6, 4]);
    expect(peak).toBe(2);
  });

  it('passes the item index to the mapper', async () => {
    const out = await mapLimit(['a', 'b'], 4, async (s, i) => `${s}${i}`);
    expect(out).toEqual(['a0', 'b1']);
  });

  it('resolves to an empty array for no items', async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
  });

  it('rejects when any mapper rejects', async () => {
    const run = mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    await expect(run).rejects.toThrow('boom');
  });

  it('rejects a limit below 1', async () => {
    await expect(mapLimit([1], 0, async (n) => n)).rejects.toThrow(RangeError);
  });
});
