import { expect, test } from "@playwright/test";

test.describe("Navigation & Routing", () => {
  test("should redirect root to /home", async ({ page }) => {
    await page.goto("/");

    // Should be redirected to /home but URL should show /
    await expect(page).toHaveURL("/");

    // Should show home page content
    await expect(
      page.getByRole("heading", { name: /Build faster. Own your stack./ }),
    ).toBeVisible();
  });

  test("should handle direct navigation to /home", async ({ page }) => {
    await page.goto("/home");

    // Should show the same content as root
    await expect(
      page.getByRole("heading", { name: /Build faster. Own your stack./ }),
    ).toBeVisible();
    await expect(page.getByText("Use this starter as-is, or as a reference")).toBeVisible();
  });

  test("should handle 404 pages gracefully", async ({ page }) => {
    const response = await page.goto("/non-existent-page");

    // Should return 404 status
    expect(response?.status()).toBe(404);

    // Should show Next.js 404 page or custom 404
    await expect(page.getByText(/404|not found|page not found/i)).toBeVisible();
  });

  test("should handle unauthorized page", async ({ page }) => {
    await page.goto("/unauthorized");

    // Should load the unauthorized page with specific content
    await expect(page.getByText("Unauthorized")).toBeVisible();
    await expect(
      page.getByText("You are not authorized to access this resource or this page."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Return Home" })).toBeVisible();
  });

  test("should handle forbidden page", async ({ page }) => {
    await page.goto("/forbidden");

    // Should load the forbidden page with specific content
    await expect(page.getByText("Forbidden")).toBeVisible();
    await expect(page.getByText("You are not authorized to access this resource.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Return Home" })).toBeVisible();
  });

  test("should handle Sentry example page", async ({ page }) => {
    await page.goto("/sentry-example-page");

    // Should load without crashing, even if Sentry is not configured
    // The page should exist and not throw unhandled errors
    await expect(page.locator("body")).toBeVisible();

    // Should not have JavaScript errors (basic check)
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.waitForLoadState("networkidle");

    // Allow for some expected errors related to missing Sentry config
    // but should not have critical errors
    const criticalErrors = errors.filter(
      (error) => !error.includes("Sentry") && !error.includes("PostHog") && !error.includes("GTM"),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("should maintain scroll position on navigation", async ({ page }) => {
    await page.goto("/");

    // Scroll down to features section
    await page.getByRole("link", { name: /See features/ }).click();

    // Wait for scroll
    await page.waitForTimeout(1000);

    // Get current scroll position
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);

    // Navigate using browser back
    await page.goBack();

    // Should be back at top
    await page.waitForTimeout(500);
    const newScrollY = await page.evaluate(() => window.scrollY);
    expect(newScrollY).toBeLessThan(scrollY);
  });
});
