import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

/** 360 px mobile layout checks: no horizontal scroll, menu works, key pages render. */
test.describe('mobile layout (360px)', () => {
  for (const path of ['/', '/login', '/register']) {
    test(`no horizontal overflow on ${path} (logged out)`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('guest header fits and shows only Log in / Sign up', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('guest-nav')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
  });

  test('mobile menu works after login', async ({ page }) => {
    await signUp(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.locator('#mobile-nav').getByRole('link', { name: 'Explore' }).click();
    await expect(page).toHaveURL(/\/explore/);
  });

  test('demo works end-to-end on a phone', async ({ page }) => {
    await signUp(page);
    await page.goto('/explore?demo=1&region=sri-lanka-anuradhapura');
    await page.getByTestId('continue-setup').click();
    for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-submit').click();
    await page.goto('/rotations');
    await expect(page.getByTestId('strategy-alt-rice-mung-bean')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
