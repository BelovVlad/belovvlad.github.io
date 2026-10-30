import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  fullyParallel: true,
  workers: 4,
  use: { baseURL:'http://127.0.0.1:43871', browserName:'chromium', serviceWorkers:'block', screenshot:'only-on-failure', trace:'retain-on-failure', launchOptions: process.env.PWEB_BROWSER ? { executablePath:process.env.PWEB_BROWSER } : {} },
  webServer: { command:'node scripts/serve.mjs', url:'http://127.0.0.1:43871', reuseExistingServer:!process.env.CI },
  reporter:'list'
});
