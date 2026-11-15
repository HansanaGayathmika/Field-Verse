import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

/**
 * Worldwide farms: any location (typed, map, or device location) with crops the farmer adds.
 * Uses live NASA POWER data through the API (network required).
 */
test.describe('worldwide locations and custom crops', () => {
  test.setTimeout(120_000);

  test('typed coordinates → live NASA data → own crop → dashboard; rotations honestly unavailable', async ({ page }) => {
    await signUp(page);
    await page.goto('/explore');
    await page.getByTestId('lat-input').fill('7.95');
    await page.getByTestId('lon-input').fill('-1.02');
    await page.getByTestId('check-location').click();

    const panel = page.getByTestId('custom-panel');
    await expect(panel).toContainText('7.9500, -1.0200');
    await expect(panel).toContainText(/\d[\d,]* mm/, { timeout: 45_000 }); // live NASA POWER rainfall
    await page.getByTestId('continue-setup').click();

    await expect(page).toHaveURL(/region=custom/);
    await page.locator('#farmName').fill('Ghana test farm');
    await page.getByTestId('wizard-next').click();

    // Default crops are offered, and the farmer can add their own
    await expect(page.getByTestId('crop-maize')).toBeVisible();
    await page.getByTestId('crop-other').click();
    await page.getByTestId('new-crop-input').fill('Yam');
    await page.getByTestId('add-crop').click();
    await expect(page.getByTestId('crop-yam')).toHaveAttribute('aria-checked', 'true');

    // Required questions block progress until answered ("I am not sure" counts as an answer)
    await page.getByTestId('wizard-next').click();
    await expect(page.getByRole('alert').first()).toContainText('I am not sure');
    await page.getByTestId('nextPlantingMonth-unsure').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByRole('alert').first()).toContainText('receives water');
    await page.getByTestId('waterAccess-none').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('exclude-maize').click();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByText('Yam').first()).toBeVisible(); // review step
    await expect(page.getByTestId('review-notice')).toContainText(/You answered "I do not know" or skipped \d+ question/);
    await page.getByTestId('wizard-submit').click();

    await expect(page).toHaveURL(/\/rotations/);
    await page.goto('/farm');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ghana test farm');
    await expect(page.getByText(/Your location · 7\.95, -1\.02/)).toBeVisible();
    await expect(page.getByText('Yam').first()).toBeVisible();
    await expect(page.getByTestId('farm-answers')).toContainText('Maize');
    await expect(page.getByText('Average rain each month')).toBeVisible({ timeout: 45_000 });

    await page.goto('/rotations');
    await expect(page.getByRole('alert')).toContainText(/three demo regions/);
  });

  test('"Use my current location" places the farm from the device location', async ({ browser }) => {
    const context = await browser.newContext({ geolocation: { latitude: -1.2921, longitude: 36.8219 }, permissions: ['geolocation'] });
    const page = await context.newPage();
    await signUp(page);
    await page.goto('/explore');
    await page.getByTestId('use-my-location').click();
    const panel = page.getByTestId('custom-panel');
    await expect(panel).toContainText('Your current location');
    await expect(panel).toContainText('-1.2921, 36.8219');
    await context.close();
  });

  test('search by village or town places the field (no demo-region list on the page)', async ({ page }) => {
    await signUp(page);
    await page.goto('/explore');
    await expect(page.getByText('Or choose a demo region')).toHaveCount(0);
    await page.getByTestId('place-search-input').fill('Kumasi');
    await page.getByTestId('place-search-button').click();
    const results = page.getByTestId('place-results');
    await expect(results).toContainText('Ghana', { timeout: 20_000 });
    await results.getByRole('button').first().click();
    await expect(page.getByTestId('custom-panel')).toContainText(/6\.\d{4}, -1\.\d{4}/);
  });

  test('crops the farmer excludes are not recommended', async ({ page }) => {
    await signUp(page);
    await page.goto('/explore?demo=1&region=sri-lanka-anuradhapura');
    await page.getByTestId('continue-setup').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('wizard-next').click();
    await page.getByTestId('exclude-cowpea').click();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('review-notice')).toBeVisible();
    await page.getByTestId('wizard-submit').click();
    await expect(page).toHaveURL(/\/rotations/);
    const cowpea = page.getByTestId('strategy-alt-rice-cowpea-sunn-hemp');
    await expect(cowpea).toContainText('Not possible as stated');
    await expect(cowpea).toContainText('You chose not to grow Cowpea');
  });

  test('a location inside a demo area uses the prepared region', async ({ page }) => {
    await signUp(page);
    await page.goto('/explore');
    await page.getByTestId('lat-input').fill('8.35');
    await page.getByTestId('lon-input').fill('80.42');
    await page.getByTestId('check-location').click();
    await expect(page.getByTestId('region-panel')).toContainText('Anuradhapura');
  });
});
