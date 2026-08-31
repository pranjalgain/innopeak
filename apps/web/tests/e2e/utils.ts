import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Common utilities for E2E tests
 */

/**
 * Wait for the page to be fully loaded including all network requests
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500); // Additional buffer for dynamic content
}

/**
 * Check if an element is in the viewport
 */
export async function isInViewport(page: Page, selector: string): Promise<boolean> {
  return await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }, selector);
}

/**
 * Scroll to an element smoothly
 */
export async function scrollToElement(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, selector);

  // Wait for scroll to complete
  await page.waitForTimeout(1000);
}

/**
 * Take a screenshot with a custom name
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${name}-${Date.now()}.png`,
    fullPage: true,
  });
}

/**
 * Check for JavaScript errors on the page
 */
export async function checkForJSErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  return errors;
}

/**
 * Mock network requests for testing
 */
export async function mockApiResponse(page: Page, url: string, response: any) {
  await page.route(url, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

/**
 * Test responsive design across different viewports
 */
export const viewports = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 },
  ultrawide: { width: 2560, height: 1440 },
} as const;

/**
 * Common test data
 */
export const testData = {
  app: {
    title: "Create Next CoE",
    description: "Production-ready Next.js starter",
    url: "http://localhost:3000",
  },
  repository: {
    url: "https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs",
  },
} as const;

/**
 * Accessibility testing helpers
 */
export async function checkAccessibility(page: Page, selector?: string) {
  // Basic accessibility checks
  const element = selector ? page.locator(selector) : page;

  // Check for alt text on images
  const images = element.locator("img");
  const imageCount = await images.count();

  for (let i = 0; i < imageCount; i++) {
    const img = images.nth(i);
    const alt = await img.getAttribute("alt");
    expect(alt, `Image ${i + 1} should have alt text`).toBeTruthy();
  }

  // Check for proper heading hierarchy
  const headings = await element.locator("h1, h2, h3, h4, h5, h6").all();
  if (headings.length > 0) {
    // Should have at least one h1
    const h1Count = await element.locator("h1").count();
    expect(h1Count, "Page should have at least one h1").toBeGreaterThanOrEqual(1);
  }

  // Check for proper form labels
  const inputs = element.locator("input, textarea, select");
  const inputCount = await inputs.count();

  for (let i = 0; i < inputCount; i++) {
    const input = inputs.nth(i);
    const type = await input.getAttribute("type");

    // Skip hidden inputs
    if (type === "hidden") continue;

    const id = await input.getAttribute("id");
    const ariaLabel = await input.getAttribute("aria-label");
    const ariaLabelledBy = await input.getAttribute("aria-labelledby");

    if (id) {
      const label = element.locator(`label[for="${id}"]`);
      const hasLabel = (await label.count()) > 0;

      expect(
        hasLabel || ariaLabel || ariaLabelledBy,
        `Input ${i + 1} should have a label, aria-label, or aria-labelledby`,
      ).toBeTruthy();
    }
  }
}

/**
 * Performance testing helpers
 */
export async function measureLoadTime(page: Page, url: string): Promise<number> {
  const startTime = Date.now();
  await page.goto(url, { waitUntil: "networkidle" });
  return Date.now() - startTime;
}

export async function getWebVitals(page: Page): Promise<Record<string, number>> {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      const vitals: Record<string, number> = {};

      // LCP
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        vitals.lcp = lastEntry.startTime;
      }).observe({ entryTypes: ["largest-contentful-paint"] });

      // FID
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          vitals.fid = entry.processingStart - entry.startTime;
        });
      }).observe({ entryTypes: ["first-input"] });

      // CLS
      let clsValue = 0;
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        vitals.cls = clsValue;
      }).observe({ entryTypes: ["layout-shift"] });

      setTimeout(() => resolve(vitals), 3000);
    });
  });
}
