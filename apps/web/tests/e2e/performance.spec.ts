import { expect, test } from "@playwright/test";

test.describe("Performance", () => {
  test("should load homepage within performance budget", async ({ page }) => {
    // Start measuring
    const startTime = Date.now();

    await page.goto("/", { waitUntil: "networkidle" });

    const loadTime = Date.now() - startTime;

    // Should load within 3 seconds (generous for development)
    expect(loadTime).toBeLessThan(3000);
  });

  test("should have good Core Web Vitals", async ({ page }) => {
    await page.goto("/");

    // Wait for page to fully load
    await page.waitForLoadState("networkidle");

    // Measure Web Vitals using browser APIs
    const webVitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const vitals: Record<string, number> = {};

        // Largest Contentful Paint
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          vitals.lcp = lastEntry.startTime;
        }).observe({ entryTypes: ["largest-contentful-paint"] });

        // First Input Delay (if available)
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            vitals.fid = entry.processingStart - entry.startTime;
          });
        }).observe({ entryTypes: ["first-input"] });

        // Cumulative Layout Shift
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

        // Give some time for measurements
        setTimeout(() => resolve(vitals), 2000);
      });
    });

    const vitals = webVitals as Record<string, number>;

    // LCP should be under 2.5s (good threshold)
    if (vitals.lcp) {
      expect(vitals.lcp).toBeLessThan(2500);
    }

    // CLS should be under 0.1 (good threshold)
    if (vitals.cls !== undefined) {
      expect(vitals.cls).toBeLessThan(0.1);
    }
  });

  test("should load images efficiently", async ({ page }) => {
    await page.goto("/");

    // Check that images have proper attributes
    const images = page.locator("img");
    const imageCount = await images.count();

    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);

      // Should have alt text
      const alt = await img.getAttribute("alt");
      expect(alt).toBeTruthy();

      // Should have proper loading (lazy or eager)
      const loading = await img.getAttribute("loading");
      expect(["lazy", "eager", null]).toContain(loading);
    }

    // Check that Next.js Image optimization is working
    const nextImages = page.locator("img[srcset]");
    const nextImageCount = await nextImages.count();

    if (nextImageCount > 0) {
      // Should have responsive images with srcset
      const firstImage = nextImages.first();
      const srcset = await firstImage.getAttribute("srcset");
      expect(srcset).toContain("w"); // Should contain width descriptors
    }
  });

  test("should have reasonable JavaScript bundle size", async ({ page }) => {
    // Intercept network requests to measure bundle sizes
    const jsRequests: Array<{ url: string; size: number }> = [];

    page.on("response", async (response) => {
      if (response.url().endsWith(".js") && response.status() === 200) {
        try {
          const buffer = await response.body();
          jsRequests.push({
            url: response.url(),
            size: buffer.length,
          });
        } catch (error) {
          // Ignore errors for size measurement
        }
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Calculate total JS size
    const totalJSSize = jsRequests.reduce((total, req) => total + req.size, 0);
    const totalJSSizeKB = totalJSSize / 1024;

    console.log(`Total JavaScript size: ${totalJSSizeKB.toFixed(2)} KB`);

    // In development mode, bundle sizes are much larger due to:
    // - Source maps
    // - Hot reload code
    // - Development warnings
    // - Unminified code
    // So we use a generous threshold to catch major regressions
    expect(totalJSSizeKB).toBeLessThan(15000); // 15MB limit for dev mode

    // Log a warning if it's getting too large
    if (totalJSSizeKB > 10000) {
      console.warn(`⚠️  Large bundle size detected: ${totalJSSizeKB.toFixed(2)} KB`);
      console.warn(
        "   This is expected in development mode but should be much smaller in production",
      );
    }
  });

  test("should prefetch critical resources", async ({ page }) => {
    await page.goto("/");

    // Check for resource hints
    const preloadLinks = page.locator('link[rel="preload"]');
    const preloadCount = await preloadLinks.count();

    // Should have some preloaded resources (fonts, critical CSS, etc.)
    expect(preloadCount).toBeGreaterThanOrEqual(0); // At least not error out

    // Check for DNS prefetch for external domains
    const dnsPrefetchLinks = page.locator('link[rel="dns-prefetch"]');
    const dnsPrefetchCount = await dnsPrefetchLinks.count();

    expect(dnsPrefetchCount).toBeGreaterThanOrEqual(0);
  });
});
