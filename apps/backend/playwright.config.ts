import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for NestJS Application
 *
 * This configuration supports:
 * - Unit tests (API endpoint testing)
 * - Functional tests (API workflow testing)
 * - E2E tests (Complete user journey testing)
 * - Multiple browsers and environments
 */

export default defineConfig({
  // Test directory
  testDir: './tests',

  // Global test configuration
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results.xml' }],
    ['list'],
  ],

  // Global test timeout
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },

  // Global setup and teardown
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),

  // Test configuration
  use: {
    // Base URL for all tests
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',

    // Trace configuration
    trace: 'on-first-retry',

    // Screenshot configuration
    screenshot: 'only-on-failure',

    // Video configuration
    video: 'retain-on-failure',

    // API request context
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  },

  // Project configurations for different test types
  projects: [
    // Unit Tests - API endpoint testing
    {
      name: 'unit-tests',
      testDir: './tests/unit',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*.unit.spec.ts',
    },

    // Functional Tests - API workflow testing
    {
      name: 'functional-tests',
      testDir: './tests/functional',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*.functional.spec.ts',
    },

    // E2E Tests - Complete user journey testing
    {
      name: 'e2e-tests',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*.e2e.spec.ts',
    },

    // Cross-browser testing
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile testing
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },

    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Web server configuration for local testing
  // webServer: {
  //   command: 'pnpm start:dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  //   env: {
  //     NODE_ENV: 'development',
  //     DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  //     POSTGRES_DB: 'postgres',
  //     POSTGRES_USER: 'postgres',
  //     POSTGRES_PASSWORD: 'postgres',
  //     POSTGRES_HOST: '127.0.0.1',
  //     POSTGRES_PORT: '5432',
  //     REDIS_HOST: '127.0.0.1',
  //     REDIS_PORT: '6379',
  //     REDIS_PASSWORD: 'your_password_here',
  //     REDIS_TLS_ENABLED: 'false',
  //     OTEL_SERVICE_NAME: 'nestjs-app',
  //     OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces',
  //     JWT_SECRET: 'supersecretjwtkey',
  //     JWT_EXPIRATION_TIME: '3600s',
  //   },
  // },
});
