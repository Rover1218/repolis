import { expect, test as base } from '@playwright/test';

/**
 * `test` with an API guard on every test: any /api/ request that no specific mock
 * answered gets a 500 and fails the test at the end, so a missed route can't hide.
 * Specific mocks are registered later (Playwright runs the newest route first).
 */
export const test = base.extend<{ apiGuard: string[] }>({
  apiGuard: [
    async ({ page }, use) => {
      const unmatched: string[] = [];
      await page.route('**/api/**', (route) => {
        unmatched.push(route.request().url());
        return route.fulfill({
          status: 500,
          json: { ok: false, error: { code: 'upstream', message: 'unmocked API call' } },
        });
      });
      await use(unmatched);
      expect(unmatched, 'API calls that no mock answered').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
