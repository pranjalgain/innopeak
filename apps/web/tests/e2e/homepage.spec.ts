import { expect, test } from "@playwright/test";

test.describe("Homepage", () => {
  test("should load the homepage successfully", async ({ page }) => {
    await page.goto("/");

    // Check that the page loads
    await expect(page).toHaveTitle(/Create Next CoE/);

    // Check for main heading
    await expect(
      page.getByRole("heading", { name: /Build faster. Own your stack./ }),
    ).toBeVisible();

    // Check for the project logo
    await expect(page.getByAltText("Project logo")).toBeVisible();

    // Check for the "Get started" button
    await expect(page.getByRole("link", { name: /Get started/ })).toBeVisible();
  });

  test("should navigate to features section", async ({ page }) => {
    await page.goto("/");

    // Click the "See features" button
    await page.getByRole("link", { name: /See features/ }).click();

    // Should scroll to features section
    await expect(page.getByText("Everything you need to launch")).toBeVisible();

    // Check that feature cards are visible
    await expect(page.getByText("Analytics that respect privacy")).toBeVisible();
    await expect(page.getByText("Feature flags & experiments")).toBeVisible();
    await expect(page.getByText("Production-grade error tracking")).toBeVisible();
  });

  test("should navigate to live demo section", async ({ page }) => {
    await page.goto("/");

    // Click the "See live demo" button
    await page.getByRole("link", { name: /See live demo/ }).click();

    // Should scroll to demo section
    await expect(page.getByText("Live feature flag demo")).toBeVisible();
    await expect(
      page.getByText("This section swaps content based on a PostHog feature flag variant."),
    ).toBeVisible();
  });

  test("should have working external link to the repository", async ({ page }) => {
    await page.goto("/");

    const repositoryLink = page.getByRole("link", { name: /Get started/ });
    await expect(repositoryLink).toHaveAttribute(
      "href",
      "https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs",
    );
    await expect(repositoryLink).toHaveAttribute("target", "_blank");
    await expect(repositoryLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("should be responsive on mobile", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Check that content is still visible on mobile
    await expect(
      page.getByRole("heading", { name: /Build faster. Own your stack./ }),
    ).toBeVisible();
    await expect(page.getByText("Use this starter as-is, or as a reference")).toBeVisible();

    // Check that buttons are accessible
    await expect(page.getByRole("link", { name: /See features/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Get started/ })).toBeVisible();
  });

  test("should have proper SEO meta tags", async ({ page }) => {
    await page.goto("/");

    // Check title
    await expect(page).toHaveTitle(/Create Next CoE/);

    // Check meta description
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute("content", /Production-ready Next.js starter/);

    // Check Open Graph tags
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Create Next CoE/);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");
  });
});
