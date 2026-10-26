import { expect, test } from './test';
import { mockCityApi } from './mock-api';

test.describe('routes (R37)', () => {
  test('a path that cannot be a repo is a 404 with the not-found page and a way home', async ({ page }) => {
    const res = await page.goto('/-bad/repo');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Not a GitHub repo link' })).toBeVisible();
    await page.getByRole('link', { name: 'Try another repo' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel('GitHub repository link')).toBeVisible();
  });

  test('a path with no repo in it is not found too', async ({ page }) => {
    const res = await page.goto('/just-an-owner');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Not a GitHub repo link' })).toBeVisible();
  });

  test('a GitHub deep link opens the repo city', async ({ page }) => {
    await mockCityApi(page);
    await page.goto('/facebook/react/tree/main/packages/react');
    await expect(page).toHaveURL(/\/facebook\/react$/);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'facebook/react' })).toBeVisible();
  });

  test('the share image route is not swallowed by the deep-link redirect', async ({ request }) => {
    const res = await request.get('/facebook/react/opengraph-image', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  });

  test('a deep link with a malformed owner is not found', async ({ page }) => {
    const res = await page.goto('/-bad/repo/tree/main');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Not a GitHub repo link' })).toBeVisible();
  });
});
