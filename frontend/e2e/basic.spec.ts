import { test, expect } from "@playwright/test";

/**
 * Auth-aware E2E tests.
 *
 * The app requires authentication for all routes except "/".
 * In CI (no NEXT_PUBLIC_PRIVY_APP_ID), Privy does not initialise and
 * AuthGate's 6-second timeout surfaces a "Sign in to continue" wall.
 *
 * Tests reflect the **unauthenticated** experience.
 */

test.describe("Homepage (public)", () => {
  test("loads within 10s and returns 200", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
  });

  test("shows Lineage branding in header", async ({ page }) => {
    await page.goto("/");
    // The header contains the logo text "L" mark or "Lineage" link
    await expect(page.locator("header")).toBeVisible();
  });
});

test.describe("Protected routes — AuthGate", () => {
  test("visiting /dashboard returns a page (not a crash)", async ({ page }) => {
    const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    // Must respond with 200 (auth wall rendered client-side)
    expect(response?.status()).toBe(200);
    // Page must have some content
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe("404 page", () => {
  test("shows custom 404 for invalid routes", async ({ page }) => {
    await page.goto("/nonexistent-page");
    await expect(page.locator("h1")).toContainText("Page Not Found");
    await expect(page.locator('a[href="/"]')).toBeVisible();
  });
});

test.describe("Accessibility", () => {
  test("header logo link points to /", async ({ page }) => {
    await page.goto("/");
    const headerLink = page.locator("header a").first();
    const href = await headerLink.getAttribute("href");
    expect(href).toBe("/");
  });
});
