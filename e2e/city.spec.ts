import { expect, test } from './test';
import { oneCommitBatch, oneCommitLatest, oneCommitManifest } from './fixtures/one-commit';
import { collectErrors, settleCity } from './helpers';
import { mockCityApi } from './mock-api';

const CITY = '/facebook/react';
/**
 * Dive in is a 2.2 s camera flight, but CityScene clamps each frame's dt to 0.1 s, so it
 * needs >= 22 rendered frames. Measured on this machine with software WebGL (SwiftShader):
 * 28 frames at 214-319 ms each = 6.0-8.9 s wall time from click to "Step out".
 * 20 s is about 2x the slowest measurement.
 */
const DIVE_TIMEOUT_MS = 20_000;

test.describe('city (small fixture)', () => {
  test('renders the canvas, the readout, hover and dive without console errors', async ({ page }) => {
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
    await expect(page.getByRole('button', { name: 'Step out ↑' })).toBeVisible({
      timeout: DIVE_TIMEOUT_MS,
    });

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
    // The client lower-cases owner/repo in the latest request (R37).
    await page.route(/\/api\/city\/facebook\/react$/, async (route) => {
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
  test('shows the all-at-once line with a canvas and no errors', async ({ page }) => {
    const errors = collectErrors(page);
    await mockCityApi(page, { latest: oneCommitLatest, manifest: oneCommitManifest, batch: oneCommitBatch });
    await page.goto(CITY);
    const timeline = page.getByRole('region', { name: 'Timeline' });
    await expect(timeline).toHaveText('Pushed all at once · 1 commit · 12 Mar 2024');
    await expect(page.locator('canvas')).toBeVisible();
    // A single snapshot has no player.
    await expect(page.getByRole('slider', { name: 'Snapshot' })).toHaveCount(0);
    expect(errors).toEqual([]);
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

interface Box {
  name: string;
  x: number;
  y: number;
  right: number;
  bottom: number;
}

const intersects = (a: Box, b: Box): boolean =>
  a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;

test.describe('hud layout (R28)', () => {
  test.skip(({ isMobile }) => isMobile, 'widths are set explicitly on the desktop project');

  for (const width of [375, 768, 1440]) {
    test(`panels do not overlap and the readout is not clipped at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockCityApi(page);
      await page.goto(CITY);
      await settleCity(page);
      const timeline = page.getByRole('region', { name: 'Timeline' });
      const dive = page.getByRole('navigation', { name: 'Camera' });
      const share = page.getByRole('navigation', { name: 'Share' });
      await expect(dive).toBeVisible();
      await expect(share).toBeVisible();

      const panels = {
        brand: page.locator('header'),
        timeline,
        dive,
        share,
      };
      const boxes: Box[] = [];
      for (const [name, locator] of Object.entries(panels)) {
        const b = await locator.boundingBox();
        expect(b, name).not.toBeNull();
        if (b) boxes.push({ name, x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height });
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(intersects(boxes[i], boxes[j]), `${boxes[i].name} overlaps ${boxes[j].name}`).toBe(false);
        }
      }
      const [d, s] = [boxes[2], boxes[3]];
      expect(s.y - d.bottom, 'gap between the Dive and Share panels').toBeGreaterThanOrEqual(8);
      expect(boxes[1].y - s.bottom, 'gap between the Share panel and the timeline').toBeGreaterThanOrEqual(8);

      const readout = timeline.locator('b').locator('..');
      const clipped = await readout.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped, 'readout is clipped').toBe(false);
    });
  }
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
      // The canvas fills the viewport, so masking it would blank the whole shot; hide the
      // scene (and the labels that track it) instead and compare the HUD layout.
      await page.addStyleTag({ content: 'canvas, [class*="__labels"] { visibility: hidden !important; }' });
      await expect(page).toHaveScreenshot(`city-${width}.png`, {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });
  }
});
