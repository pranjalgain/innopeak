import { expect, test } from "@playwright/test";

test.describe("API Routes", () => {
  test("should serve API reference page", async ({ page }) => {
    const response = await page.goto("/reference");

    // Should return 200 status (the route handler works)
    expect(response?.status()).toBe(200);

    // Should have Scalar API reference content
    // The Scalar component renders dynamically, so check for its presence
    await page.waitForTimeout(2000); // Give time for Scalar to load

    // Look for common Scalar elements or just verify the page loaded
    const hasScalarContent = await page.evaluate(() => {
      return (
        document.body.innerHTML.includes("scalar") ||
        document.body.innerHTML.includes("api-reference") ||
        document.body.innerHTML.includes("openapi") ||
        document.querySelector('script[src*="scalar"]') !== null
      );
    });

    expect(hasScalarContent).toBe(true);
  });

  test("should handle API routes correctly", async ({ request }) => {
    // Test the OpenAPI endpoint
    const response = await request.get("/api/openapi/test-id");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toBeDefined();
  });

  test("should serve robots.txt", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain("User-Agent");
    expect(text).toContain("Allow");
    expect(text).toContain("Disallow");
    expect(text).toContain("Sitemap");
  });

  test("should serve sitemap.xml", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain("<urlset");
    expect(text).toContain("http://localhost:3000");
  });

  test("should serve manifest.webmanifest", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.icons).toBeDefined();
    expect(Array.isArray(manifest.icons)).toBe(true);
  });

  test("should handle Sentry example API", async ({ request }) => {
    // This should work even without Sentry configured
    const response = await request.get("/api/sentry-example-api");

    // Should either return success or a handled error, not crash
    expect([200, 400, 500]).toContain(response.status());
  });
});
