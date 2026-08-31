import { APIRequestContext, expect } from '@playwright/test';

/**
 * Test Helpers and Utilities
 *
 * Common functions used across all test types
 */

export interface ApiResponse<T = any> {
  statusCode: number;
  status: string;
  message: string;
  data: T;
}

export interface HealthCheckResponse {
  status: string;
  info: {
    google: { status: number; url: string };
    database: { status: string; message: string; error?: string };
    redis: { status: string };
    memory_heap: { status: string };
  };
  details: {
    google: { status: number; url: string };
    database: { status: string; message: string; error?: string };
    redis: { status: string };
    memory_heap: { status: string };
  };
}

export interface MetricsResponse {
  [key: string]: any;
}

/**
 * API Helper Functions
 */
export class ApiHelpers {
  constructor(private request: APIRequestContext) {}

  /**
   * Make a GET request and return parsed JSON or text
   */
  async get<T = any>(url: string): Promise<{ response: any; data: T }> {
    const response = await this.request.get(url);
    const contentType = response.headers()['content-type'] || '';

    let data: T;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = (await response.text()) as T;
    }

    return { response, data };
  }

  /**
   * Make a POST request and return parsed JSON or text
   */
  async post<T = any>(url: string, data?: any): Promise<{ response: any; data: T }> {
    const response = await this.request.post(url, { data });
    const contentType = response.headers()['content-type'] || '';

    let responseData: T;
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = (await response.text()) as T;
    }

    return { response, data: responseData };
  }

  /**
   * Make a PUT request and return parsed JSON or text
   */
  async put<T = any>(url: string, data?: any): Promise<{ response: any; data: T }> {
    const response = await this.request.put(url, { data });
    const contentType = response.headers()['content-type'] || '';

    let responseData: T;
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = (await response.text()) as T;
    }

    return { response, data: responseData };
  }

  /**
   * Make a DELETE request and return parsed JSON or text
   */
  async delete<T = any>(url: string): Promise<{ response: any; data: T }> {
    const response = await this.request.delete(url);
    const contentType = response.headers()['content-type'] || '';

    let data: T;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = (await response.text()) as T;
    }

    return { response, data };
  }

  /**
   * Check if response is successful
   */
  isSuccessResponse(response: any): boolean {
    return response.status() >= 200 && response.status() < 300;
  }

  /**
   * Assert successful response
   */
  assertSuccessResponse(response: any, data: any) {
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
    expect(data).toHaveProperty('statusCode');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('message');
    expect(data).toHaveProperty('data');
  }

  /**
   * Assert error response
   */
  assertErrorResponse(response: any, data: any, expectedStatus: number) {
    expect(response.status()).toBe(expectedStatus);
    expect(data).toHaveProperty('statusCode');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('message');
  }
}

/**
 * Health Check Helper Functions
 */
export class HealthCheckHelpers {
  constructor(private api: ApiHelpers) {}

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{ response: any; data: HealthCheckResponse }> {
    return await this.api.get<HealthCheckResponse>('/health');
  }

  /**
   * Assert all services are healthy
   */
  assertAllServicesHealthy(data: HealthCheckResponse) {
    expect(data.status).toBe('up');
    expect(data.info.google.status).toBe(200);
    expect(data.info.redis.status).toBe('up');
    expect(data.info.memory_heap.status).toBe('up');
  }

  /**
   * Assert specific service is healthy
   */
  assertServiceHealthy(data: HealthCheckResponse, service: keyof HealthCheckResponse['info']) {
    expect(data.info[service].status).toBe('up');
  }

  /**
   * Assert specific service is down
   */
  assertServiceDown(data: HealthCheckResponse, service: keyof HealthCheckResponse['info']) {
    expect(data.info[service].status).toBe('down');
  }
}

/**
 * Metrics Helper Functions
 */
export class MetricsHelpers {
  constructor(private api: ApiHelpers) {}

  /**
   * Get metrics data
   */
  async getMetrics(): Promise<{ response: any; data: string }> {
    return await this.api.get<string>('/metrics');
  }

  /**
   * Assert metrics contain expected data
   */
  assertMetricsContain(metricsData: string, expectedMetrics: string[]) {
    expectedMetrics.forEach(metric => {
      expect(metricsData).toContain(metric);
    });
  }
}

/**
 * Test Data Factory
 */
export class TestDataFactory {
  /**
   * Create test user data
   */
  static createTestUser(overrides: Partial<any> = {}) {
    return {
      id: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  /**
   * Create test API request data
   */
  static createTestRequest(overrides: Partial<any> = {}) {
    return {
      method: 'GET',
      url: '/test',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Playwright Test',
      },
      ...overrides,
    };
  }
}

/**
 * Wait Helpers
 */
export class WaitHelpers {
  /**
   * Wait for a condition to be true
   */
  static async waitForCondition(
    condition: () => Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Wait for API to be ready
   */
  static async waitForApiReady(baseURL: string, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${baseURL}/health`);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`API not ready within ${timeout}ms`);
  }
}
