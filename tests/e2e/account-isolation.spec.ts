import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

/**
 * Regression: a new account on the same browser must not see the previous account's farm.
 * (The farm profile and form answers are stored in the browser, so they must be scoped to the account.)
 */
test.setTimeout(120_000);

test('signing up a second account on the same browser does not show the first account’s farm', async ({ page }) => {
  // Account A sets up a farm and starts the recommendation form
  await signUp(page);
  await page.goto('/explore?demo=1&region=sri-lanka-anuradhapura');
  await page.getByTestId('continue-setup').click();
  for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-submit').click();
  await expect(page).toHaveURL(/\/rotations/);
  await expect(page.getByRole('banner')).toContainText('Demo paddy field');
  await page.goto('/recommend');
  await page.getByTestId('rec-lat').fill('8.2632');
  await page.getByTestId('rec-lon').fill('80.2082');
  await page.getByTestId('rec-use-coords').click();
  await expect(page.getByTestId('chosen-location')).toBeVisible();

  // A logs out
  await page.goto('/account');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByTestId('guest-nav')).toBeVisible();

  // Account B signs up in the same browser: no trace of A's farm
  await signUp(page);
  await expect(page.getByRole('banner')).not.toContainText('Demo paddy field');
  await page.goto('/farm');
  await expect(page.locator('main')).not.toContainText('Demo paddy field');
  await page.goto('/recommend');
  await expect(page.getByTestId('rec-progress')).toHaveText('Step 1 of 5');
  await expect(page.getByTestId('chosen-location')).toHaveCount(0);
  const stored = await page.evaluate(() => ({ farm: localStorage.getItem('fv.farm.v1'), draft: localStorage.getItem('fv.recommend.draft.v1') }));
  expect(stored.farm).toBeNull();
  expect(stored.draft ?? '').not.toContain('8.2632');
});
