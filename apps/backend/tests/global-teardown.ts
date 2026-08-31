import { FullConfig } from '@playwright/test';

/**
 * Global Teardown for Playwright Tests
 *
 * This teardown runs after all tests and:
 * - Cleans up test data
 * - Generates test reports
 * - Performs final cleanup
 */

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting Playwright Global Teardown...');

  try {
    // Clean up any test data or resources
    console.log('🧹 Cleaning up test data...');

    // Add any cleanup logic here
    // For example: delete test users, clear test databases, etc.

    console.log('✅ Global teardown completed successfully');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw here to avoid masking test failures
  }
}

export default globalTeardown;
