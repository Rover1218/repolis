import type { Page, Route } from '@playwright/test';
import { SMALL_FULL_NAME, SMALL_HEAD, smallBatch, smallLatest, smallManifest, type Json } from './fixtures/small';

export interface MockOptions {
  latest?: Json;
  manifest?: Json;
  batch?: Json;
  /** Replace a route's response with an error envelope. */
  errors?: { latest?: ApiError; manifest?: ApiError; batch?: ApiError };
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  retryAfterMinutes?: number;
}

const ok = (route: Route, data: Json) => route.fulfill({ status: 200, json: { ok: true, data } });
const fail = (route: Route, e: ApiError) =>
  route.fulfill({
    status: e.status,
    json: { ok: false, error: { code: e.code, message: e.message, retryAfterMinutes: e.retryAfterMinutes } },
  });

/** Answers every /api/city/** call from fixtures. Case-insensitive on owner/repo. */
export async function mockCityApi(page: Page, options: MockOptions = {}): Promise<void> {
  const { latest = smallLatest, manifest = smallManifest, batch = smallBatch, errors = {} } = options;
  await page.route('**/api/city/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const rest = pathname.replace(/^\/api\/city\//, '').split('/');
    if (rest.length === 2) return errors.latest ? fail(route, errors.latest) : ok(route, latest);
    if (rest[3] === 'manifest') return errors.manifest ? fail(route, errors.manifest) : ok(route, manifest);
    if (rest[3] === 'batch') return errors.batch ? fail(route, errors.batch) : ok(route, batch);
    return route.fulfill({ status: 404, json: { ok: false, error: { code: 'not-found', message: 'unknown' } } });
  });
}

export { SMALL_FULL_NAME, SMALL_HEAD };
