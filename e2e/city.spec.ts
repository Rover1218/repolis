import { expect, test } from '@playwright/test';
import { oneCommitBatch, oneCommitLatest, oneCommitManifest } from './fixtures/one-commit';
import { collectErrors, settleCity } from './helpers';
import { mockCityApi } from './mock-api';

const CITY = '/facebook/react';

test.describe('city (small fixture)', () => {
  test('renders the canvas, the readout, hover and dive without console errors', async ({ page }) => {
    // Dive is a camera flight stepped per frame; software WebGL under two workers can be slow.
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await mockCityApi(page);
    await page.goto(CITY);
    await settleCity(page);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // The tooltip shows only when a building sits under the pointer; either outcome is fine.
    await expect(canvas).toBeVisible();

    await page.getByRole('button', { name: 'Dive in ↓' }).click();
    await expect(page.getByRole('button', { name: 'Step out ↑' })).toBeVisible({ timeout: 90_000 });

    expect(errors).toEqual([]);
  });

  test('the slider moves the readout', async ({ page }) => {
    await mockCityApi(page);
    await page.goto(CITY);
    await settleCity(page);
    const slider = page.getByRole('slider', { name: 'Snapshot' });
    await slider.focus();
    await slider.press('Home');
    await expect(slider).toHaveValue('0');
    await expect(page.getByRole('region', { name: 'Timeline' })).toContainText('commit 1 ·');
  });

  test('reduced motion shows Play with the slider at its last snapshot', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockCityApi(page);
    await page.goto(CITY);
    await settleCity(page);
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Snapshot' })).toHaveValue('2');
  });

  test('a mixed-case URL is rewritten in place to the canonical one', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mockCityApi(page);
    // Registered last, so it runs first: hold the "latest" reply until the canvas is tagged.
    await page.route(/\/api\/city\/Facebook\/React$/, async (route) => {
      await gate;
      await route.fallback();
    });
    await page.goto('/Facebook/React');
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await canvas.evaluate((el) => el.setAttribute('data-tagged', 'yes'));
    expect(new URL(page.url()).pathname).toBe('/Facebook/React');
    release();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/facebook/react');
    await settleCity(page);
    // Same node, so the scene was not remounted by the rewrite.
    await expect(page.locator('canvas[data-tagged="yes"]')).toHaveCount(1);
  });
});

test.describe('city (one commit)', () => {
  test('shows the all-at-once line', async ({ page }) => {
    await mockCityApi(page, { latest: oneCommitLatest, manifest: oneCommitManifest, batch: oneCommitBatch });
    await page.goto(CITY);
    await expect(page.getByText('Pushed all at once · 1 commit · 12 Mar 2024')).toBeVisible();
  });
});

test.describe('city (errors)', () => {
  test('an unknown repo shows the not-found panel', async ({ page }) => {
    await mockCityApi(page, { errors: { latest: { status: 404, code: 'not-found', message: 'nope' } } });
    await page.goto('/nobody/nothing');
    await expect(page.getByRole('alert').filter({ hasText: 'Repo not found or private' })).toBeVisible();
  });

  test('a rate-limited batch shows the busy message and keeps the canvas', async ({ page }) => {
    await mockCityApi(page, {
      errors: { batch: { status: 429, code: 'rate-limited', message: 'busy', retryAfterMinutes: 5 } },
    });
    await page.goto(CITY);
    await expect(page.getByText('GitHub is busy — try again in 5 minutes')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch behaviour is checked on the phone project');

  test('double-tapping the canvas is harmless and Dive in is visible', async ({ page }) => {
    const errors = collectErrors(page);
    await mockCityApi(page);
    await page.goto(CITY);
    await settleCity(page);
    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
    }
    await expect(page.getByRole('button', { name: 'Dive in ↓' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('visual', () => {
  test.skip(({ isMobile }) => isMobile, 'baselines are taken at explicit widths on the desktop project');

  for (const width of [375, 768, 1440]) {
    test(`city at ${width}px`, async ({ page }) => {
      // Reduced motion: no fly-in, no autoplay, so the final snapshot is static.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await mockCityApi(page);
      await page.goto(CITY);
      await settleCity(page);
      await expect(page.getByRole('slider', { name: 'Snapshot' })).toHaveValue('2');
      await expect(page).toHaveScreenshot(`city-${width}.png`, {
        mask: [page.locator('canvas')],
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });
  }
});
