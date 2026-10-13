import { expect, test } from "@playwright/test";

/**
 * Smoke tests that need only the web app (no backend, no seeded data): what a visitor with no session can and cannot reach, and
 * what the HTML tier promises about security. Full signed-in flows need the API and are covered by the regression scripts.
 */
test.describe("public site", () => {
  test("the landing page renders and offers sign-in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in|anmelden/i }).first()).toBeVisible();
  });

  test("sends the security headers the HTML tier promises", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  // Regression: starter-template demo pages (fake users, an API reference, a Sentry error trigger) shipped in the product.
  for (const path of ["/users", "/reference", "/sentry-example-page", "/api/simple-users", "/api/sentry-example-api"]) {
    test(`${path} does not exist`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(404);
    });
  }

  test("robots.txt keeps crawlers out of the app and the sitemap lists only real pages", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    const sitemap = await (await request.get("/sitemap.xml")).text();

    expect(robots).toContain("Disallow: /dashboard");
    expect(robots).toContain("Disallow: /admin");
    for (const gone of ["/users", "/reference", "/showcase"]) expect(sitemap).not.toContain(gone);
  });
});

test.describe("signed-out visitor", () => {
  for (const [path, login] of [
    ["/dashboard", "/login"],
    ["/review-queue", "/login"],
    ["/settings", "/login"],
    ["/admin", "/admin-login"],
  ] as const) {
    test(`${path} sends them to ${login}, remembering where they were headed`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(new RegExp(`${login}\\?next=${encodeURIComponent(path)}`));
    });
  }

  test("the sign-in screen asks for an email and a password", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
  });

  test("an unknown page answers 404", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");

    expect(response?.status()).toBe(404);
  });

  // The app has no analytics; the only third party it may contact is Sentry, and only when a DSN is configured.
  test("loads no analytics or tag-manager scripts", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      if (/googletagmanager|posthog|sentry\.io|vercel/.test(new URL(request.url()).host)) external.push(request.url());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(external).toEqual([]);
  });
});
