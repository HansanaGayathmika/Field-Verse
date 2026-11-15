import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

/** Logged-out visitors may only look at the home page; features need an account. */
test.describe('logged-out visitors', () => {
  test('see only Log in / Sign up and cannot open features', async ({ page }) => {
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(page.getByTestId('guest-nav')).toBeVisible();
    await expect(header.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Sign up' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: /Menu|Settings/ })).toHaveCount(0);

    // "What you can explore" cards are display-only
    for (const id of ['preview-rotations', 'preview-climate', 'preview-roots']) {
      const card = page.getByTestId(id);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('data-locked', 'true');
      await expect(card.locator('a')).toHaveCount(0);
      expect(await card.evaluate((el) => el.tagName)).toBe('DIV');
    }

    // Direct visits to feature pages go to the login page
    for (const path of ['/explore', '/rotations', '/farm', '/data']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('after logging in, the user returns home with the full navigation', async ({ page, context }) => {
    await signUp(page);
    await page.getByRole('link', { name: 'Account' }).first().click();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByTestId('guest-nav')).toBeVisible();
    await context.clearCookies();
  });
});

/**
 * The full public demo journey (no signup, demo analysis provider).
 * Steps follow the acceptance checklist in the project brief.
 */
test.describe('public demo journey', () => {
  test.beforeEach(async ({ page }) => {
    // Init scripts run on every navigation: clear storage only once per test.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('fv-e2e-cleared')) {
        localStorage.clear();
        sessionStorage.setItem('fv-e2e-cleared', '1');
      }
    });
  });

  test('homepage → demo → Sri Lanka → setup → Rotation Lab → scenario → explanation → Kenya → Brazil', async ({ page }) => {
    test.setTimeout(240_000); // the whole multi-region journey in one test
    const consoleErrors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && !/tile\.openstreetmap|Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));

    // 1. Homepage (logged out) → sign up → back on the home page with the full navigation
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Three Futures');
    await page.getByTestId('hero-signup').click();
    await expect(page).toHaveURL(/\/register/);
    await signUp(page);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Community' })).toBeVisible();

    // 2. Open the demo
    await page.goto('/explore?demo=1');
    await expect(page).toHaveURL(/\/explore\?demo=1/);

    // 3. Mark a field inside the Sri Lanka demo area
    await page.getByTestId('lat-input').fill('8.35');
    await page.getByTestId('lon-input').fill('80.42');
    await page.getByTestId('check-location').click();
    const panel = page.getByTestId('region-panel');
    await expect(panel).toContainText('Anuradhapura');
    await expect(panel).toContainText(/mm/);

    // 4. Farm setup (prefilled demo farm)
    await page.getByTestId('continue-setup').click();
    await expect(page).toHaveURL(/\/setup/);
    // Step 1 shows only the chosen location (no region chooser)
    await expect(page.getByTestId('selected-location')).toContainText('8.3500, 80.4200');
    await expect(page.getByTestId('selected-location')).toContainText('Anuradhapura');
    await expect(page.locator('#farmName')).toHaveValue(/Demo paddy field/);
    await page.getByTestId('wizard-next').click();

    // 5. Cropping history & timing, farm conditions, priorities
    await page.getByTestId('crop-rice').click();
    await page.getByTestId('harvestMonth-2').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('waterlogging-few_days').click();
    await expect(page.getByTestId('slider-waterlogging')).toContainText('A few days');
    await page.getByTestId('wizard-next').click();
    // Click the visible label like a farmer would (the radio input itself is visually hidden).
    await page.locator('label', { hasText: 'Very important' }).first().click();
    await expect(page.getByRole('radio', { name: 'Very important' }).first()).toBeChecked();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByRole('heading', { name: 'Review your information' })).toBeVisible();
    await expect(page.getByTestId('review-notice')).toContainText('lower confidence');
    await page.getByRole('button', { name: 'Generate recommendations' }).click();
    await expect(page).toHaveURL(/\/rotations/);

    // Dashboard with real observations
    await page.goto('/farm');
    await expect(page.getByTestId('farm-answers')).toContainText('February');
    await expect(page.getByText('Average rain each month')).toBeVisible();
    await expect(page.getByText(/Most rain falls in/).first()).toBeVisible();

    // 6–7. Rotation Lab compares three prepared strategies
    await page.goto('/rotations');
    await expect(page.getByTestId('demo-notice')).toBeVisible();
    await expect(page.getByTestId('strategy-current-rice-rice')).toBeVisible();
    await expect(page.getByTestId('strategy-alt-rice-mung-bean')).toBeVisible();
    await expect(page.getByTestId('strategy-alt-rice-cowpea-sunn-hemp')).toBeVisible();

    // Right to disagree: no irrigation → rule applied and shown
    await page.getByTestId('add-constraint').click();
    await expect(page.getByTestId('disagree-panel')).toContainText('Applied as a simple rule');

    // 8–9. Climate scenario → supported prepared demo result
    await page.goto('/climate');
    await page.getByTestId('preset-drier').click();
    await expect(page.getByTestId('scenario-results')).toContainText('20% less rain');
    await expect(page.getByTestId('change-current-rice-rice')).toBeVisible();
    // unsupported combination is explained, not invented
    await page.getByTestId('rain-slider').getByRole('slider').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('scenario-unsupported')).toBeVisible();

    // 10. Explanation page
    await page.goto('/rotations');
    await page.getByTestId('details-alt-rice-mung-bean').click();
    await expect(page.getByRole('heading', { name: 'Why consider it?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What should you check locally?' })).toBeVisible();

    // 11. Switch to Kenya
    await page.goto('/explore?demo=1&region=kenya-nakuru');
    await page.getByTestId('continue-setup').click();
    for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-submit').click();
    await page.goto('/rotations');
    await expect(page.getByTestId('strategy-alt-maize-bean')).toBeVisible();

    // 12. Switch to Brazil
    await page.goto('/explore?demo=1&region=brazil-mato-grosso');
    await page.getByTestId('continue-setup').click();
    for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-submit').click();
    await expect(page).toHaveURL(/\/rotations/); // wait until the Brazil farm is saved before leaving the page

    // 13. Region-specific information
    await page.goto('/farm');
    await expect(page.getByText(/Sorriso, Mato Grosso/).first()).toBeVisible();
    await page.goto('/rotations');
    await expect(page.getByTestId('strategy-current-soybean-maize')).toBeVisible();
    await expect(page.getByTestId('strategy-current-rice-rice')).toHaveCount(0);

    // Roots of Tomorrow responds
    await page.goto('/roots');
    await expect(page.getByTestId('roots-result')).toBeVisible();
    await page.getByTestId('roots-region').selectOption('sri-lanka-anuradhapura');
    await expect(page.getByTestId('roots-result')).toContainText('Rice');

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('gap finder and decision card', async ({ page }) => {
    await signUp(page);
    await page.goto('/explore?demo=1&region=kenya-nakuru');
    await page.getByTestId('continue-setup').click();
    for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-submit').click();
    await page.goto('/gaps');
    await expect(page.getByTestId('gap-candidate-common-bean')).toBeVisible();
    await page
      .getByTestId('gap-candidate-common-bean')
      .getByRole('button', { name: /Add to plan/ })
      .click();
    await page.goto('/plan');
    await expect(page.getByTestId('decision-card')).toContainText('ILLUSTRATIVE DEMO');
    await expect(page.getByTestId('decision-card')).toContainText('Common bean');
  });
});
