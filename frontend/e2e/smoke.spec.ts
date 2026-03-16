import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Lineage Agent — smoke tests', () => {
  test('landing page loads and shows hero heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('landing hero search navigates to token workspace', async ({ page }) => {
    await page.goto('/');
    const input = page.getByRole('searchbox');
    await input.fill('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/token\//);
  });

  test('radar page loads with heading', async ({ page }) => {
    await page.goto('/radar');
    await expect(page.getByRole('heading', { name: 'Radar' })).toBeVisible();
  });

  test('compare page loads with heading', async ({ page }) => {
    await page.goto('/compare');
    await expect(page.getByRole('heading', { name: 'Compare Tokens' })).toBeVisible();
  });

  test('watchlist page loads with heading', async ({ page }) => {
    await page.goto('/watchlist');
    await expect(page.getByRole('heading', { name: 'Watchlist' })).toBeVisible();
  });

  test('nav links are visible in app layout', async ({ page }) => {
    await page.goto('/radar');
    await expect(page.getByRole('link', { name: /Radar/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Compare/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Watchlist/ })).toBeVisible();
  });
});

test.describe('Accessibility — axe-core scans', () => {
  const routes = [
    { name: 'Landing', path: '/' },
    { name: 'Radar', path: '/radar' },
    { name: 'Compare', path: '/compare' },
    { name: 'Watchlist', path: '/watchlist' },
    { name: 'Privacy', path: '/privacy' },
  ];

  for (const route of routes) {
    test(`${route.name} page has no critical a11y violations`, async ({ page }) => {
      await page.goto(route.path);
      // Wait for content to load
      await page.waitForSelector('#root:not(:empty)');
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();

      const critical = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      if (critical.length > 0) {
        const summary = critical.map(
          (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`
        ).join('\n');
        console.warn(`A11y violations on ${route.name}:\n${summary}`);
      }

      // Fail on critical violations only — serious/moderate tracked as warnings
      const blockers = results.violations.filter((v) => v.impact === 'critical');
      expect(blockers).toHaveLength(0);
    });
  }
});
