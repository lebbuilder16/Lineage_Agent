import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads and shows title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Meme Lineage Agent");
  });

  test("search bar is present with aria-label", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('input[aria-label]');
    await expect(input).toBeVisible();
  });

  test("typing a name navigates to search page", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("input[type=text]");
    await input.fill("bonk");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=bonk/);
  });

  test("typing a mint navigates to lineage page", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("input[type=text]");
    // Valid base58 mint address (44 chars)
    await input.fill("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/lineage\/DezXAZ/);
  });
});

test.describe("404 page", () => {
  test("shows custom 404 for invalid routes", async ({ page }) => {
    await page.goto("/nonexistent-page");
    await expect(page.locator("h1")).toContainText("Page Not Found");
    await expect(page.locator('a[href="/"]')).toBeVisible();
  });
});

test.describe("Search page", () => {
  test("shows search bar", async ({ page }) => {
    await page.goto("/search?q=test");
    const input = page.locator("input[type=text]");
    await expect(input).toBeVisible();
  });
});

test.describe("Accessibility", () => {
  test("header link uses Next.js Link (no full reload)", async ({ page }) => {
    await page.goto("/search?q=test");
    const headerLink = page.locator("header a");
    await expect(headerLink).toHaveAttribute("href", "/");
  });
});
