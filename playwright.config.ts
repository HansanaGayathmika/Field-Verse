import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the public demo journey.
 * Starts the API (demo provider, no database required) and the Vite dev server.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL }, testIgnore: /mobile.spec.ts/ },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 }, channel: process.env.PW_CHANNEL },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w @fieldverse/api',
      url: 'http://localhost:5000/api/v1/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { ANALYSIS_PROVIDER: 'demo', PORT: '5000', MONGODB_URI: process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/fieldverse-e2e' },
    },
    {
      command: 'npm run dev -w @fieldverse/web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
      // The /recommend tests use the sample engine outputs (like the API above uses the demo provider).
      env: { VITE_RECOMMEND_MODE: 'mock' },
    },
  ],
});
