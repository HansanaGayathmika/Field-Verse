import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

/** Roots of Tomorrow recommendation UI, against the mock engine (fixtures). */
test.setTimeout(120_000);

test('farmer form → generate → plans; no-plan fixture; answers survive a reload', async ({ page }) => {
  await signUp(page);
  await page.goto('/recommend');
  await expect(page.getByTestId('rec-progress')).toHaveText('Step 1 of 5');

  // Location is the only step that blocks
  await page.getByTestId('rec-next').click();
  await expect(page.getByText('Please choose where your field is.')).toBeVisible();
  await page.getByTestId('rec-lat').fill('8.2632');
  await page.getByTestId('rec-lon').fill('80.2082');
  await page.getByTestId('rec-use-coords').click();
  await expect(page.getByTestId('chosen-location')).toContainText('8.2632, 80.2082');
  await page.getByTestId('rec-next').click();

  // Step 2: required questions accept "I do not know"
  await page.getByTestId('current-unknown').click();
  await page.getByTestId('next-null').click();
  await page.getByTestId('rec-next').click();

  // Step 3
  await page.getByTestId('water-rainfall_only').click();
  await page.getByTestId('rec-next').click();

  // Step 4: defaults are fine; raise one priority
  await page.getByTestId('priority-water_saving-very_important').click();
  await page.getByTestId('rec-next').click();

  // Step 5: review survives a reload (offline-tolerant form)
  await expect(page.getByTestId('rec-review')).toContainText('Rainfall only');
  await page.reload();
  await expect(page.getByTestId('rec-review')).toContainText('Very important');
  await page.getByTestId('rec-generate').click();

  await expect(page).toHaveURL(/\/recommend\/results$/);
  await expect(page.getByTestId('plans')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('plan-card')).toHaveCount(3); // nearest pilot = Sri Lanka rainfed fixture
  await expect(page.getByTestId('confidence')).toContainText('Confidence: High');
  await expect(page.getByTestId('result-footer')).toContainText('unreviewed by agronomists');

  // Dev picker: the no-plan fixture shows the explanation and a way back
  await page.getByTestId('rec-results-fixture').selectOption('LK_no_plan_example');
  await expect(page.getByTestId('no-plan')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('plan-card')).toHaveCount(0);
  await page.getByTestId('no-plan-change').click();
  await expect(page).toHaveURL(/\/recommend$/);
  await expect(page.getByTestId('rec-review')).toBeVisible();
});
