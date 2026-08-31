# Testing Guide

This document provides comprehensive information about the testing setup in Create Next CoE.

## 🎯 Testing Philosophy

We use **End-to-End (E2E) testing** with Playwright as our primary testing strategy because:

- ✅ **Real user scenarios**: Tests the complete user journey
- ✅ **Cross-browser compatibility**: Chrome, Firefox, Safari, Mobile
- ✅ **Performance monitoring**: Core Web Vitals and load times
- ✅ **Visual regression**: Screenshots and video recordings
- ✅ **API testing**: Full-stack integration testing

## 🚀 Quick Start

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/e2e/homepage.spec.ts

# Run tests with visible browser
pnpm test:headed

# Interactive test development
pnpm test:ui

# View test results
pnpm test:report
```

## 📁 Test Structure

```
tests/
└── e2e/
    ├── homepage.spec.ts    # Homepage functionality
    ├── api.spec.ts         # API routes and endpoints
    ├── navigation.spec.ts  # Routing and navigation
    ├── performance.spec.ts # Performance and Web Vitals
    └── utils.ts           # Shared test utilities
```

## 🧪 Test Categories

### 1. Homepage Tests (`homepage.spec.ts`)

Tests core homepage functionality:

```typescript
// Page loading and content
test("should load the homepage successfully", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Create Next CoE/);
  await expect(page.getByRole("heading", { name: /Build faster/ })).toBeVisible();
});

// Navigation
test("should navigate to features section", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /See features/ }).click();
  await expect(page.getByText("Everything you need to launch")).toBeVisible();
});
```

**Coverage:**

- Page loading and rendering
- Section navigation
- External links
- Responsive design
- SEO meta tags

### 2. API Tests (`api.spec.ts`)

Tests API routes and static files:

```typescript
// API endpoints
test("should handle API routes correctly", async ({ request }) => {
  const response = await request.get("/api/openapi/test-id");
  expect(response.status()).toBe(200);
});

// Static files
test("should serve robots.txt", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain("User-agent");
});
```

**Coverage:**

- OpenAPI endpoints
- Static files (robots.txt, sitemap.xml)
- Web manifest
- Error handling
- API reference page

### 3. Navigation Tests (`navigation.spec.ts`)

Tests routing and navigation:

```typescript
// Route redirects
test("should redirect root to /home", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /Build faster/ })).toBeVisible();
});

// Error pages
test("should handle 404 pages gracefully", async ({ page }) => {
  const response = await page.goto("/non-existent-page");
  expect(response?.status()).toBe(404);
});
```

**Coverage:**

- Route redirects
- 404 handling
- Auth pages (unauthorized, forbidden)
- Browser navigation
- Scroll behavior

### 4. Performance Tests (`performance.spec.ts`)

Tests performance metrics and optimization:

```typescript
// Load time
test("should load homepage within performance budget", async ({ page }) => {
  const startTime = Date.now();
  await page.goto("/", { waitUntil: "networkidle" });
  const loadTime = Date.now() - startTime;
  expect(loadTime).toBeLessThan(3000);
});

// Web Vitals
test("should have good Core Web Vitals", async ({ page }) => {
  await page.goto("/");
  const webVitals = await getWebVitals(page);
  if (webVitals.lcp) expect(webVitals.lcp).toBeLessThan(2500);
  if (webVitals.cls !== undefined) expect(webVitals.cls).toBeLessThan(0.1);
});
```

**Coverage:**

- Load time measurement
- Core Web Vitals (LCP, FID, CLS)
- Image optimization
- JavaScript bundle size
- Resource prefetching

## 🛠️ Test Utilities

The `tests/e2e/utils.ts` file provides helpful utilities:

### Page Utilities

```typescript
import { scrollToElement, takeScreenshot, waitForPageLoad } from "./utils";

// Wait for complete page load
await waitForPageLoad(page);

// Scroll to element
await scrollToElement(page, "#features");

// Take screenshot
await takeScreenshot(page, "homepage-loaded");
```

### Accessibility Testing

```typescript
import { checkAccessibility } from "./utils";

// Basic a11y checks
await checkAccessibility(page);
await checkAccessibility(page, ".main-content");
```

### Performance Testing

```typescript
import { getWebVitals, measureLoadTime } from "./utils";

// Measure load time
const loadTime = await measureLoadTime(page, "/");

// Get Web Vitals
const vitals = await getWebVitals(page);
```

### Responsive Testing

```typescript
import { viewports } from "./utils";

// Test different viewports
await page.setViewportSize(viewports.mobile);
await page.setViewportSize(viewports.tablet);
await page.setViewportSize(viewports.desktop);
```

## 🎨 Writing Tests

### Best Practices

1. **Use descriptive test names**

   ```typescript
   test("should load homepage and display main heading", async ({ page }) => {
     // Test implementation
   });
   ```

2. **Group related tests**

   ```typescript
   test.describe("Homepage", () => {
     test("should load successfully", async ({ page }) => {});
     test("should be responsive", async ({ page }) => {});
   });
   ```

3. **Use Page Object Model for complex flows**

   ```typescript
   class HomePage {
     constructor(private page: Page) {}

     async goto() {
       await this.page.goto("/");
     }

     async clickFeaturesLink() {
       await this.page.getByRole("link", { name: /See features/ }).click();
     }
   }
   ```

4. **Test user journeys, not implementation**

   ```typescript
   // Good: Test user behavior
   test("user can navigate to features section", async ({ page }) => {
     await page.goto("/");
     await page.getByRole("link", { name: /See features/ }).click();
     await expect(page.getByText("Everything you need")).toBeVisible();
   });

   // Avoid: Testing implementation details
   test("features section has correct CSS class", async ({ page }) => {
     // This is too implementation-specific
   });
   ```

### Common Patterns

**Waiting for elements:**

```typescript
// Wait for element to be visible
await expect(page.getByText("Loading...")).toBeVisible();
await expect(page.getByText("Content loaded")).toBeVisible();

// Wait for network requests
await page.waitForLoadState("networkidle");
```

**Form testing:**

```typescript
await page.fill('input[name="email"]', "test@example.com");
await page.click('button[type="submit"]');
await expect(page.getByText("Success")).toBeVisible();
```

**API testing:**

```typescript
const response = await request.get("/api/users");
expect(response.status()).toBe(200);
const users = await response.json();
expect(users).toHaveLength(3);
```

## ⚙️ Configuration

### Playwright Config (`playwright.config.ts`)

Key configuration options:

```typescript
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

### Browser Configuration

Tests run on multiple browsers:

- **Desktop**: Chrome, Firefox, Safari
- **Mobile**: Pixel 5, iPhone 12

### CI/CD Integration

Tests automatically run on:

- Push to main/develop branches
- Pull requests
- Manual workflow dispatch

See `.github/workflows/ci.yml` for the complete pipeline.

## 📊 Test Reports

### HTML Reports

```bash
pnpm test:report
```

Opens an interactive HTML report with:

- Test results and timing
- Screenshots and videos
- Error details and stack traces
- Network activity

### CI Reports

In CI, test reports are uploaded as artifacts and available for 30 days.

## 🐛 Debugging Tests

### Local Debugging

```bash
# Run in headed mode
pnpm test:headed

# Run with UI mode (best for debugging)
pnpm test:ui

# Run specific test
pnpm test tests/e2e/homepage.spec.ts:4
```

### Debug Mode

```typescript
test("debug example", async ({ page }) => {
  await page.goto("/");

  // Pause for manual inspection
  await page.pause();

  // Take screenshot
  await page.screenshot({ path: "debug.png" });

  // Console log for debugging
  console.log(await page.title());
});
```

### VS Code Integration

Install the Playwright VS Code extension for:

- Run tests from editor
- Debug with breakpoints
- View test results inline

## 🚀 Advanced Features

### Visual Testing

```typescript
// Compare screenshots
await expect(page).toHaveScreenshot("homepage.png");
```

### Network Mocking

```typescript
// Mock API responses
await page.route("/api/users", (route) => {
  route.fulfill({
    status: 200,
    body: JSON.stringify([{ id: 1, name: "John" }]),
  });
});
```

### Custom Fixtures

```typescript
// Create reusable test fixtures
import { test as base } from "@playwright/test";

const test = base.extend<{ homePage: HomePage }>({
  homePage: async ({ page }, use) => {
    const homePage = new HomePage(page);
    await use(homePage);
  },
});
```

## 📈 Metrics and Monitoring

Our tests track:

- **Load times**: Page load performance
- **Core Web Vitals**: LCP, FID, CLS
- **Bundle sizes**: JavaScript payload
- **Accessibility**: Basic a11y compliance
- **Cross-browser**: Compatibility across browsers
- **Mobile**: Responsive design validation

## 🎯 Next Steps

1. **Run the tests**: `pnpm test`
2. **Explore the reports**: `pnpm test:report`
3. **Try UI mode**: `pnpm test:ui`
4. **Write your own tests**: Follow the patterns in existing specs
5. **Set up CI**: Tests run automatically on push/PR

Happy testing! 🎉
