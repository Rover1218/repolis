import { expect, test } from './test';
import { mockCityApi } from './mock-api';

test.describe('home', () => {
  test('pasting facebook/react and pressing Enter opens the city', async ({ page }) => {
    await mockCityApi(page);
    await page.goto('/');
    const input = page.getByLabel('GitHub repository link');
    await input.fill('facebook/react');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/facebook\/react$/);
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('a link that is not a repo shows the invalid-link message', async ({ page }) => {
    await page.goto('/');
    const input = page.getByLabel('GitHub repository link');
    await input.fill('nope');
    await input.press('Enter');
    await expect(page.getByText('Not a GitHub repo link')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('visual', () => {
  test.skip(({ isMobile }) => isMobile, 'baselines are taken at explicit widths on the desktop project');

  for (const width of [375, 768, 1440]) {
    test(`home at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByLabel('GitHub repository link')).toBeVisible();
      await expect(page).toHaveScreenshot(`home-${width}.png`, {
        mask: [page.locator('canvas')],
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });
  }
});
