const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright configuration for Article Song extension testing
 * Supports both Chrome and Firefox with extension loading
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  // Timeout for each test (Suno can take a while!)
  timeout: 5 * 60 * 1000, // 5 minutes
  expect: {
    timeout: 10000
  },
  fullyParallel: false, // Run tests sequentially to avoid rate limiting
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to control rate limiting
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    // Base URL for test pages
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Chrome-specific extension loading happens in test file
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox-specific extension loading happens in test file
      },
    },
  ],
});

