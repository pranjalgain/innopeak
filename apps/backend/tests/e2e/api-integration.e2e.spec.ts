import { test, expect } from '../fixtures/api-fixtures';

/**
 * End-to-End API Integration Tests
 *
 * Tests complete API integration workflows
 */

test.describe('API Integration E2E Tests', () => {
  test('complete API monitoring workflow', async ({ api, healthCheck, metrics }) => {
    // Step 1: Verify application is healthy
    const { response: healthResponse, data: healthData } = await healthCheck.getHealthStatus();

    expect(healthResponse.status()).toBe(200);
    expect(healthData.status).toBe('Success');

    // Step 2: Collect metrics
    const { response: metricsResponse, data: metricsData } = await metrics.getMetrics();

    expect(metricsResponse.status()).toBe(200);
    expect(metricsData).toContain('# HELP');

    // Step 3: Verify all services are accessible
    const services = [
      { name: 'Health API', url: '/health' },
      { name: 'Health UI', url: '/health/health-ui' },
      { name: 'Metrics API', url: '/metrics' },
      { name: 'Dev Tools', url: '/dev-tools' },
    ];

    for (const service of services) {
      const { response } = await api.get(service.url);
      expect(response.status()).toBe(200);
    }
  });

  test('API resilience under load', async ({ api, healthCheck, metrics }) => {
    // Step 1: Create load by making multiple concurrent requests
    const healthPromises = Array.from({ length: 10 }, () => healthCheck.getHealthStatus());
    const metricsPromises = Array.from({ length: 10 }, () => metrics.getMetrics());

    // Step 2: Execute all requests concurrently
    const [healthResults, metricsResults] = await Promise.all([
      Promise.all(healthPromises),
      Promise.all(metricsPromises),
    ]);

    // Step 3: Verify all requests succeeded
    healthResults.forEach(({ response, data }) => {
      expect(response.status()).toBe(200);
      expect(data.status).toBe('Success');
    });

    metricsResults.forEach(({ response, data }) => {
      expect(response.status()).toBe(200);
      expect(data).toContain('# HELP');
    });
  });

  test('API error handling and recovery', async ({ api }) => {
    // Step 1: Test non-existent endpoint
    const { response: errorResponse } = await api.get('/v1/non-existent');
    expect(errorResponse.status()).toBe(404);

    // Step 2: Verify application still works after error
    const { response: healthResponse, data: healthData } = await api.get('/health');
    expect(healthResponse.status()).toBe(200);
    expect(healthData.status).toBe('Success');

    // Step 3: Test invalid method
    const { response: methodResponse } = await api.post('/health');
    expect(methodResponse.status()).toBe(404);

    // Step 4: Verify application still works
    const { response: finalResponse } = await api.get('/metrics');
    expect(finalResponse.status()).toBe(200);
  });

  test('API performance and consistency', async ({ api, healthCheck, metrics }) => {
    // Step 1: Measure response times
    const startTime = Date.now();

    const { response: healthResponse } = await healthCheck.getHealthStatus();
    const healthTime = Date.now() - startTime;

    const metricsStartTime = Date.now();
    const { response: metricsResponse } = await metrics.getMetrics();
    const metricsTime = Date.now() - metricsStartTime;

    // Step 2: Verify performance
    expect(healthResponse.status()).toBe(200);
    expect(metricsResponse.status()).toBe(200);
    expect(healthTime).toBeLessThan(5000); // 5 seconds
    expect(metricsTime).toBeLessThan(3000); // 3 seconds

    // Step 3: Test consistency over multiple requests
    const consistencyResults = [];
    for (let i = 0; i < 5; i++) {
      const { response, data } = await api.get('/health');
      consistencyResults.push({ response, data });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // All responses should be consistent
    consistencyResults.forEach(({ response, data }) => {
      expect(response.status()).toBe(200);
      expect(data.status).toBe('Success');
    });
  });
});
