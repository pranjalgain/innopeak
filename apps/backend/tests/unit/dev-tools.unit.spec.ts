import { test, expect } from '../fixtures/api-fixtures';

/**
 * Unit Tests for Dev Tools API Endpoints
 *
 * Tests individual dev tools endpoints in isolation
 */

test.describe('Dev Tools API Unit Tests', () => {
  test.describe('GET /dev-tools', () => {
    test('should return dev tools HTML page', async ({ api }) => {
      const { response, data } = await api.get('/dev-tools');

      // Assert response is successful
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');

      // Assert HTML content
      expect(data).toContain('<html>');
      expect(data).toContain('<head>');
      expect(data).toContain('<body>');
    });

    test('should contain dev tools navigation', async ({ api }) => {
      const { response, data } = await api.get('/dev-tools');

      expect(response.status()).toBe(200);
      expect(data).toContain('Dev Tools');
      expect(data).toContain('System Health');
      expect(data).toContain('Grafana');
    });

    test('should have proper HTML structure', async ({ api }) => {
      const { response, data } = await api.get('/dev-tools');

      expect(response.status()).toBe(200);

      // Check for proper HTML structure
      expect(data).toMatch(/<html[^>]*>/);
      expect(data).toMatch(/<head[^>]*>/);
      expect(data).toMatch(/<body[^>]*>/);
      expect(data).toMatch(/<\/html>/);
    });
  });
});
