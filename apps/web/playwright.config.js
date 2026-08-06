import { defineConfig } from '@playwright/test';

const E2E_API = 'http://127.0.0.1:4100';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Block the service worker so tests exercise the app deterministically.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'kiosk',
      testMatch: /kiosk\.spec\.js/,
      use: { viewport: { width: 1024, height: 600 } },
    },
    {
      name: 'admin',
      testMatch: /admin\.spec\.js/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'responsive',
      testMatch: /responsive\.spec\.js/,
      use: { viewport: { width: 1024, height: 600 } },
    },
    {
      name: 'staff',
      testMatch: /staff\.spec\.js/,
      use: { viewport: { width: 1365, height: 768 } },
    },
  ],
  webServer: [
    {
      command: 'node e2e/server-for-e2e.js',
      port: 4100,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run preview',
      port: 4173,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        KIOSK_API_TARGET: E2E_API,
      },
    },
  ],
});
