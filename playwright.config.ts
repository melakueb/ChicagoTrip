import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: {
    baseURL: 'http://localhost:3100',
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
