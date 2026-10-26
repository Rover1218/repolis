import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Pixel baselines come from a Windows machine: compare them locally only (Ruling R26).
  // The dev server compiles routes and the three.js chunk on first hit: allow for it.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  ignoreSnapshots: !!process.env.CI,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
