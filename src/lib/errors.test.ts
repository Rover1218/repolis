import { describe, expect, it } from 'vitest';
import { CityError, errorMessage, httpStatus } from './errors';

describe('errorMessage', () => {
  it('returns the exact copy for each fixed error', () => {
    expect(errorMessage('invalid-link')).toBe('Not a GitHub repo link');
    expect(errorMessage('not-found')).toBe('Repo not found or private');
    expect(errorMessage('empty')).toBe('This repo is empty');
    expect(errorMessage('upstream')).toBe("Couldn't reach GitHub — try again");
    expect(errorMessage('no-webgl')).toBe("Your browser can't show 3D");
  });

  it('uses the plural minutes for a known retry window', () => {
    expect(errorMessage('rate-limited', 7)).toBe('GitHub is busy — try again in 7 minutes');
  });

  it('uses the singular minute for a one-minute retry window', () => {
    expect(errorMessage('rate-limited', 1)).toBe('GitHub is busy — try again in 1 minute');
  });

  it('falls back to a few minutes when the retry window is unknown', () => {
    expect(errorMessage('rate-limited')).toBe('GitHub is busy — try again in a few minutes');
  });
});

describe('httpStatus', () => {
  it('maps error codes to HTTP statuses', () => {
    expect([
      httpStatus('invalid-link'),
      httpStatus('not-found'),
      httpStatus('empty'),
      httpStatus('rate-limited'),
      httpStatus('upstream'),
    ]).toEqual([400, 404, 409, 429, 502]);
  });
});

describe('CityError', () => {
  it('is an Error with its name, code, retry window and cause', () => {
    const cause = new Error('socket hang up');
    const error = new CityError('rate-limited', { retryAfterMinutes: 3, cause });

    expect(error).toBeInstanceOf(CityError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CityError');
    expect(error.code).toBe('rate-limited');
    expect(error.retryAfterMinutes).toBe(3);
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('GitHub is busy — try again in 3 minutes');
  });
});
