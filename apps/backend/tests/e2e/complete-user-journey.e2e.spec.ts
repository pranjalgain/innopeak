import { test, expect } from '@playwright/test';

/**
 * End-to-End Tests for Complete User Journeys
 *
 * Tests complete user workflows from start to finish
 */

test.describe('Complete User Journey Tests', () => {
  test('developer onboarding journey', async ({ page }) => {
    // Step 1: Navigate to the application
    await page.goto('/');

    // Step 2: Access dev tools
    await page.goto('/dev-tools');
    await expect(page).toHaveTitle(/Dev Tools/);

    // Step 3: Check health status
    await page.goto('/health');
    await page.waitForLoadState('networkidle');

    const healthData = await page.evaluate(() => {
      return JSON.parse(document.body.textContent || '{}');
    });
    expect(healthData.status).toBe('Success');

    // Step 4: View health UI
    await page.goto('/health/health-ui');
    await expect(page.locator('h4').first()).toContainText('System Health Status');

    // Step 5: Check metrics
    await page.goto('/metrics');
    const metricsContent = await page.textContent('body');
    expect(metricsContent).toContain('# HELP');
    expect(metricsContent).toContain('process_cpu_user_seconds_total');
  });

  test('monitoring dashboard journey', async ({ page }) => {
    // Step 1: Start at health check
    await page.goto('/health');

    // Verify health status
    await page.waitForLoadState('networkidle');
    const healthData = await page.evaluate(() => {
      return JSON.parse(document.body.textContent || '{}');
    });
    expect(healthData.status).toBe('Success');

    // Step 2: Navigate to health UI
    await page.goto('/health/health-ui');

    // Verify UI elements
    await expect(page.locator('h4').first()).toContainText('System Health Status');
    await expect(page.locator('.status-card')).toHaveCount(4); // 4 service cards

    // Step 3: Check metrics
    await page.goto('/metrics');

    // Verify metrics content
    const metricsContent = await page.textContent('body');
    expect(metricsContent).toContain('# HELP');
    expect(metricsContent).toContain('# TYPE');

    // Step 4: Return to dev tools
    await page.goto('/dev-tools');
    await expect(page).toHaveTitle(/Dev Tools/);
  });

  test('error handling journey', async ({ page }) => {
    // Step 1: Try to access non-existent endpoint
    const response = await page.goto('/v1/non-existent');
    expect(response?.status()).toBe(404);

    // Step 2: Verify error page
    await expect(page.locator('body')).toContainText('Cannot GET /v1/non-existent');

    // Step 3: Navigate back to working endpoint
    await page.goto('/health');
    await page.waitForLoadState('networkidle');
    const healthData = await page.evaluate(() => {
      return JSON.parse(document.body.textContent || '{}');
    });
    expect(healthData.status).toBe('Success');
  });

  test('performance monitoring journey', async ({ page }) => {
    // Step 1: Start performance monitoring
    const startTime = Date.now();

    // Step 2: Navigate through all endpoints
    await page.goto('/health');
    await page.waitForLoadState('networkidle');

    await page.goto('/metrics');
    await page.waitForLoadState('networkidle');

    await page.goto('/dev-tools');

    // Step 3: Check total time
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // All operations should complete within reasonable time
    expect(totalTime).toBeLessThan(10000); // 10 seconds
  });
});
