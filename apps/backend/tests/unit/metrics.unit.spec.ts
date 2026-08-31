import { test, expect } from '../fixtures/api-fixtures';

/**
 * Unit Tests for Metrics API Endpoints
 *
 * Tests individual metrics endpoints in isolation
 */

test.describe('Metrics API Unit Tests', () => {
  test.describe('GET /metrics', () => {
    test('should return Prometheus metrics format', async ({ metrics }) => {
      const { response, data } = await metrics.getMetrics();

      // Assert response is successful
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/plain');

      // Assert Prometheus format
      expect(data).toContain('# HELP');
      expect(data).toContain('# TYPE');
      expect(data).toContain('process_cpu_user_seconds_total');
    });

    test('should contain expected metrics', async ({ metrics }) => {
      const { response, data } = await metrics.getMetrics();

      expect(response.status()).toBe(200);

      // Check for common Prometheus metrics
      const expectedMetrics = [
        'process_cpu_user_seconds_total',
        'process_cpu_system_seconds_total',
        'process_resident_memory_bytes',
        'nodejs_heap_size_total_bytes',
        'nodejs_eventloop_lag_seconds',
        'nodejs_gc_duration_seconds',
      ];

      expectedMetrics.forEach(metric => {
        expect(data).toContain(metric);
      });
    });

    test('should return valid Prometheus format', async ({ metrics }) => {
      const { response, data } = await metrics.getMetrics();

      expect(response.status()).toBe(200);

      // Check for valid Prometheus format
      const lines = data.split('\n');
      const helpLines = lines.filter(line => line.startsWith('# HELP'));
      const typeLines = lines.filter(line => line.startsWith('# TYPE'));
      const metricLines = lines.filter(line => !line.startsWith('#') && line.trim() !== '');

      expect(helpLines.length).toBeGreaterThan(0);
      expect(typeLines.length).toBeGreaterThan(0);
      expect(metricLines.length).toBeGreaterThan(0);
    });

    test('should handle concurrent requests', async ({ metrics }) => {
      // Make multiple concurrent requests
      const promises = Array.from({ length: 3 }, () => metrics.getMetrics());
      const results = await Promise.all(promises);

      // All requests should succeed
      results.forEach(({ response, data }) => {
        expect(response.status()).toBe(200);
        expect(data).toContain('# HELP');
      });
    });
  });
});
