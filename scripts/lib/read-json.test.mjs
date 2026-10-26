import { describe, expect, it } from 'vitest';
import { readJson } from './read-json.mjs';

const fakeRes = (json) => ({ json });

describe('readJson', () => {
  it('returns parsed body', async () => {
    expect(await readJson(fakeRes(async () => ({ a: 1 })), 'https://u', '5 minutes')).toEqual({ a: 1 });
  });

  it('maps TimeoutError and AbortError to a timeout message', async () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const res = fakeRes(async () => { throw new DOMException('x', name); });
      await expect(readJson(res, 'https://u', '5 minutes')).rejects.toThrow('timed out after 5 minutes: https://u');
    }
  });

  it('returns null for a genuine parse failure', async () => {
    const res = fakeRes(async () => { throw new SyntaxError('bad'); });
    expect(await readJson(res, 'https://u', '30 seconds')).toBeNull();
  });
});
