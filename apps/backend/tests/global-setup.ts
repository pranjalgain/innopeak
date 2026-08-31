import { FullConfig } from '@playwright/test';

/**
 * Global Setup for Playwright Tests
 *
 * This setup runs before all tests and:
 * - Ensures the application is running
 * - Sets up test data
 * - Configures test environment
 */

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting Playwright Global Setup...');

  // Check if the application is running
  const baseURL = config.projects[0].use?.baseURL || 'http://localhost:3000';

  try {
    console.log(`📡 Checking application health at ${baseURL}...`);
    let response: Response | null = null;

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      response = await fetch(`${baseURL}/health`).catch(() => null);
      if (response?.ok) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (!response?.ok) {
      throw new Error(`Application not ready. Status: ${response?.status ?? 'NO_RESPONSE'}`);
    }

    const healthData = (await response.json()) as { status?: string };
    console.log('✅ Application is healthy:', healthData.status);

    // Set environment variables for tests
    process.env.TEST_BASE_URL = baseURL;
    process.env.TEST_READY = 'true';

    console.log('✅ Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

export default globalSetup;
