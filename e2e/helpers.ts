import { expect, type Page } from '@playwright/test';

/**
 * Collects console errors and uncaught page errors.
 * Only `type === 'error'` counts: SwiftShader's WebGL performance notes (GPU stall,
 * readPixels) arrive as 'warning', and React DevTools hints as 'info'.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Waits until history has loaded and the player's readout shows a commit. */
export async function settleCity(page: Page): Promise<void> {
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Timeline' })).toContainText('commit');
}
