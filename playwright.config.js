import { defineConfig, devices } from '@playwright/test'

const FRONTEND_URL = process.env.E2E_BASE_URL || 'http://localhost:5173'
const API_URL = process.env.E2E_API_URL || 'http://localhost:5000'

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix backend start',
      url: `${API_URL}/api/assets`,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'npm --prefix frontend dev',
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
})
