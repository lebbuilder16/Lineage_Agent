import { test, expect } from '@playwright/test';

test.describe('Lineage Agent — smoke tests', () => {
  test('landing page loads and shows app title', async ({ page }) => {
    await page.goto('/');
    // App mounts into #root
    await expect(page.locator('#root')).not.toBeEmpty();
    // Landing screen shows "LINEAGE AGENT" heading
    await expect(page.getByRole('heading', { name: 'LINEAGE AGENT' })).toBeVisible();
  });

  test('clicking INITIALIZE NODE navigates to radar screen', async ({ page }) => {
    await page.goto('/');
    // Click the primary CTA
    await page.getByText('INITIALIZE NODE').click();
    // Radar screen shows "LINEAGE RADAR"
    await expect(page.getByText('RADAR', { exact: false })).toBeVisible();
  });

  test('bottom navigation tabs are visible on radar screen', async ({ page }) => {
    await page.goto('/');
    await page.getByText('INITIALIZE NODE').click();
    // Bottom nav items should be visible (BottomNavigation uses motion.div with labels)
    await expect(page.getByText('Radar')).toBeVisible();
  });
});
