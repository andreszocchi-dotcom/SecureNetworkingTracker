import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

/**
 * Drives the app end to end and saves the README's grading screenshots.
 *
 * Against the deployed app:   E2E_BASE_URL=https://<your-app>.vercel.app npm run evidence
 * Against a local dev server: npm run evidence     (starts `next dev` automatically)
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const isLocal = baseURL.includes('localhost');

export default defineConfig({
  testDir: './e2e',
  // The evidence run tells one continuous story, so the steps must not be reordered or shared out.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  ...(isLocal
    ? {
        webServer: {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
