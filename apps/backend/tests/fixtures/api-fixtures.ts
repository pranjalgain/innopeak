import { test as base, APIRequestContext } from '@playwright/test';
import { ApiHelpers, HealthCheckHelpers, MetricsHelpers } from '../utils/test-helpers';

/**
 * API Fixtures for Playwright Tests
 *
 * Provides reusable API request context and helpers
 */

export interface ApiFixtures {
  api: ApiHelpers;
  healthCheck: HealthCheckHelpers;
  metrics: MetricsHelpers;
}

export const test = base.extend<ApiFixtures>({
  // API Request Context
  api: async ({ request }, use) => {
    const api = new ApiHelpers(request);
    await use(api);
  },

  // Health Check Helper
  healthCheck: async ({ api }, use) => {
    const healthCheck = new HealthCheckHelpers(api);
    await use(healthCheck);
  },

  // Metrics Helper
  metrics: async ({ api }, use) => {
    const metrics = new MetricsHelpers(api);
    await use(metrics);
  },
});

export { expect } from '@playwright/test';
