import { test, expect } from '../fixtures/api-fixtures';

/**
 * Unit Tests for Health API Endpoints
 *
 * Tests individual health check endpoints in isolation
 */

test.describe('Health API Unit Tests', () => {
  test.describe('GET /health', () => {
    test('should return health status with all services', async ({ api }) => {
      const { response, data } = await api.get('/health');

      // Assert response is successful
      expect(response.status()).toBe(200);
      expect(api.isSuccessResponse(response)).toBe(true);

      // Assert response structure
      expect(data).toHaveProperty('statusCode', 200);
      expect(data).toHaveProperty('status', 'Success');
      expect(data).toHaveProperty('message', 'Health check completed');
      expect(data).toHaveProperty('data');

      // Assert health data structure
      const healthData = data.data;
      expect(healthData).toHaveProperty('status');
      expect(healthData).toHaveProperty('info');
      expect(healthData).toHaveProperty('details');

      // Assert individual services
      expect(healthData.info).toHaveProperty('google');
      expect(healthData.info).toHaveProperty('database');
      expect(healthData.info).toHaveProperty('redis');
      expect(healthData.info).toHaveProperty('memory_heap');
    });

    test('should return consistent response format', async ({ api }) => {
      const { response, data } = await api.get('/health');

      expect(response.status()).toBe(200);

      // Assert consistent response format
      expect(data).toMatchObject({
        statusCode: expect.any(Number),
        status: expect.any(String),
        message: expect.any(String),
        data: {
          status: expect.any(String),
          info: expect.any(Object),
          details: expect.any(Object),
        },
      });
    });

    test('should handle multiple concurrent requests', async ({ api }) => {
      // Make multiple concurrent requests
      const promises = Array.from({ length: 5 }, () => api.get('/health'));
      const results = await Promise.all(promises);

      // All requests should succeed
      results.forEach(({ response, data }) => {
        expect(response.status()).toBe(200);
        expect(data.statusCode).toBe(200);
      });
    });
  });

  test.describe('GET /health/health-ui', () => {
    test('should return HTML health UI page', async ({ api }) => {
      const { response } = await api.get('/health/health-ui');

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');
    });

    test('should contain expected HTML elements', async ({ api }) => {
      const { response, data } = await api.get('/health/health-ui');

      expect(response.status()).toBe(200);
      expect(data).toContain('<html>');
      expect(data).toContain('<head>');
      expect(data).toContain('<body>');
      expect(data).toContain('System Health');
    });
  });
});
