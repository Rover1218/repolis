export type CityErrorCode = 'invalid-link' | 'not-found' | 'empty' | 'rate-limited' | 'upstream' | 'no-webgl';

const MESSAGES: Record<Exclude<CityErrorCode, 'rate-limited'>, string> = {
  'invalid-link': 'Not a GitHub repo link',
  'not-found': 'Repo not found or private',
  empty: 'This repo is empty',
  upstream: "Couldn't reach GitHub — try again",
  'no-webgl': "Your browser can't show 3D",
};

const HTTP_STATUSES: Record<CityErrorCode, number> = {
  'invalid-link': 400,
  'not-found': 404,
  empty: 409,
  'rate-limited': 429,
  upstream: 502,
  'no-webgl': 500,
};

export function errorMessage(code: CityErrorCode, retryAfterMinutes?: number): string {
  if (code !== 'rate-limited') return MESSAGES[code];
  if (retryAfterMinutes === undefined) return 'GitHub is busy — try again in a few minutes';
  const unit = retryAfterMinutes === 1 ? 'minute' : 'minutes';
  return `GitHub is busy — try again in ${retryAfterMinutes} ${unit}`;
}

export function httpStatus(code: CityErrorCode): number {
  return HTTP_STATUSES[code];
}

export class CityError extends Error {
  readonly code: CityErrorCode;
  readonly retryAfterMinutes?: number;

  constructor(code: CityErrorCode, opts: { retryAfterMinutes?: number; cause?: unknown } = {}) {
    super(errorMessage(code, opts.retryAfterMinutes), { cause: opts.cause });
    this.name = 'CityError';
    this.code = code;
    this.retryAfterMinutes = opts.retryAfterMinutes;
  }
}
