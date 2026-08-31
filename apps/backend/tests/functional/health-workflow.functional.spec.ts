import { test, expect } from '../fixtures/api-fixtures';

/**
 * Functional Tests for Health Check Workflows
 *
 * Tests complete health check workflows and interactions
 */

test.describe('Health Check Workflow Tests', () => {
  test('complete health check workflow', async ({ healthCheck, api }) => {
    // Step 1: Get health status
    const { response: healthResponse, data: healthData } = await healthCheck.getHealthStatus();

    expect(healthResponse.status()).toBe(200);
    expect(healthData.status).toBe('Success');

    // Step 2: Verify individual services
    expect(healthData.data.info.google.status).toBe(200);
    expect(healthData.data.info.redis.status).toBe('up');
    expect(healthData.data.info.memory_heap.status).toBe('up');

    // Step 3: Check health UI
    const { response: uiResponse } = await api.get('/health/health-ui');
    expect(uiResponse.status()).toBe(200);

    // Step 4: Verify metrics are accessible
    const { response: metricsResponse } = await api.get('/metrics');
    expect(metricsResponse.status()).toBe(200);
  });

  test('health check with service degradation', async ({ healthCheck }) => {
    const { response, data } = await healthCheck.getHealthStatus();

    expect(response.status()).toBe(200);

    // Even if database is down, health check should still return 200
    // but with service status information
    expect(data.status).toBe('Success');

    // Check that we get detailed information about each service
    expect(data.data.info).toHaveProperty('google');
    expect(data.data.info).toHaveProperty('database');
    expect(data.data.info).toHaveProperty('redis');
    expect(data.data.info).toHaveProperty('memory_heap');
  });

  test('concurrent health checks', async ({ healthCheck }) => {
    // Make multiple concurrent health check requests
    const promises = Array.from({ length: 10 }, () => healthCheck.getHealthStatus());
    const results = await Promise.all(promises);

    // All requests should succeed
    results.forEach(({ response, data }) => {
      expect(response.status()).toBe(200);
      expect(data.status).toBe('Success');
    });
  });

  test('health check performance', async ({ healthCheck }) => {
    const startTime = Date.now();

    const { response, data } = await healthCheck.getHealthStatus();

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(response.status()).toBe(200);
    expect(data.status).toBe('Success');

    // Health check should complete within reasonable time
    expect(duration).toBeLessThan(5000); // 5 seconds
  });
});
