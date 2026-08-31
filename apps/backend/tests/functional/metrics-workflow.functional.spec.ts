import { test, expect } from '../fixtures/api-fixtures';

/**
 * Functional Tests for Metrics Workflows
 *
 * Tests complete metrics collection and monitoring workflows
 */

test.describe('Metrics Workflow Tests', () => {
  test('complete metrics collection workflow', async ({ metrics, api }) => {
    // Step 1: Get metrics data
    const { response: metricsResponse, data: metricsData } = await metrics.getMetrics();

    expect(metricsResponse.status()).toBe(200);
    expect(metricsData).toContain('# HELP');

    // Step 2: Verify metrics contain expected data
    const expectedMetrics = [
      'process_cpu_user_seconds_total',
      'process_cpu_system_seconds_total',
      'process_resident_memory_bytes',
    ];

    expectedMetrics.forEach(metric => {
      expect(metricsData).toContain(metric);
    });

    // Step 3: Verify metrics format is valid
    const lines = metricsData.split('\n');
    const helpLines = lines.filter(line => line.startsWith('# HELP'));
    const typeLines = lines.filter(line => line.startsWith('# TYPE'));

    expect(helpLines.length).toBeGreaterThan(0);
    expect(typeLines.length).toBeGreaterThan(0);
  });

  test('metrics collection under load', async ({ metrics }) => {
    // Make multiple concurrent requests to simulate load
    const promises = Array.from({ length: 20 }, () => metrics.getMetrics());
    const results = await Promise.all(promises);

    // All requests should succeed
    results.forEach(({ response, data }) => {
      expect(response.status()).toBe(200);
      expect(data).toContain('# HELP');
    });
  });

  test('metrics consistency over time', async ({ metrics }) => {
    // Get metrics multiple times and verify consistency
    const results = [];

    for (let i = 0; i < 5; i++) {
      const { response, data } = await metrics.getMetrics();
      expect(response.status()).toBe(200);
      results.push(data);

      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // All responses should have the same structure
    results.forEach(data => {
      expect(data).toContain('# HELP');
      expect(data).toContain('# TYPE');
    });
  });

  test('metrics performance', async ({ metrics }) => {
    const startTime = Date.now();

    const { response, data } = await metrics.getMetrics();

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(response.status()).toBe(200);
    expect(data).toContain('# HELP');

    // Metrics should be generated quickly
    expect(duration).toBeLessThan(2000); // 2 seconds
  });
});
