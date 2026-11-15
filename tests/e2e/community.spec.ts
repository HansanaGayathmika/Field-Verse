import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUp } from './helpers';

/**
 * FieldVerse Community end to end (real API + MongoDB + live OpenStreetMap reverse geocoding).
 * Posts persist in the dev database between runs, so each run uses unique text.
 */
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const STORY = `Run ${RUN}: after the Maha rice harvest we planted mung bean in April. The field needed good drainage channels or the young plants turned yellow.`;

async function signUpWithEmail(page: Page) {
  const email = `community-${RUN}-${Math.random().toString(36).slice(2, 7)}@example.org`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('Private Person Name');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a long test password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  return email;
}

async function setSriLankaFarm(page: Page) {
  await page.goto('/explore?demo=1&region=sri-lanka-anuradhapura');
  await page.getByTestId('continue-setup').click();
  for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-submit').click();
  await expect(page).toHaveURL(/\/rotations/);
}

test('guests can browse the community and fill the form, but must log in to publish', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: 'Farmers Helping Farmers' })).toBeVisible();
  await expect(page.getByTestId('community-location')).toContainText('Choose your area'); // no guessing
  await page.goto('/community/share');
  await expect(page.getByRole('heading', { name: 'Share my experience' })).toBeVisible();
  await expect(page.getByTestId('preview-experience')).toBeDisabled(); // no location chosen yet
});

test('share → moderate → discover anonymously → helpful → report → related; Rotation Lab link', async ({ browser }) => {
  // 1. Farmer A shares an experience from their Sri Lankan farm.
  const aCtx = await browser.newContext();
  const a = await aCtx.newPage();
  const aEmail = await signUpWithEmail(a);
  await setSriLankaFarm(a);

  await a.goto('/community');
  await expect(a.getByTestId('community-location')).toContainText('Anuradhapura District, North Central Province, Sri Lanka', { timeout: 30_000 });

  await a.getByTestId('share-experience').click();
  await expect(a.getByTestId('share-location')).toContainText('Anuradhapura District', { timeout: 30_000 });
  await a.getByTestId('visibility-admin2').check();
  await a.getByTestId('category-crop_rotation').check({ force: true });
  await a.getByTestId('share-crop-mung-bean').click();
  await a.getByTestId('field-description').fill('Too short');
  await a.getByTestId('preview-experience').click();
  await expect(a.getByText('Please write at least 30 characters').first()).toBeVisible(); // validation
  await a.getByTestId('field-description').fill(`${STORY} Call me on 077 123 4567.`);
  await a.getByTestId('field-lessonsLearned').fill('Check drainage before planting mung bean on paddy land.');
  await a.getByTestId('preview-experience').click();

  // Preview = exact public appearance + privacy check catches the phone number.
  await expect(a.getByTestId('public-preview')).toContainText('Anuradhapura District, North Central Province, Sri Lanka');
  await expect(a.getByTestId('public-preview')).not.toContainText('Private Person Name');
  await expect(a.getByTestId('privacy-check')).toContainText('a phone number');
  await expect(a.getByTestId('publish')).toBeDisabled();
  await a.getByRole('button', { name: 'Back to edit' }).click();
  await a.getByTestId('field-description').fill(STORY);
  await a.getByTestId('preview-experience').click();
  await expect(a.getByTestId('privacy-check')).toContainText('No obvious personal details');
  await a.getByTestId('publish').click();
  await expect(a.getByTestId('share-done')).toContainText('after a moderator reviews it');

  await a.goto('/community/my-experiences');
  const mine = a.getByTestId('my-experience').filter({ hasText: `Run ${RUN}` });
  await expect(mine.getByTestId('moderation-status')).toHaveText(/Waiting for review/);

  // Not public yet.
  const guestCheck = await browser.newPage();
  await guestCheck.goto(`/community?q=${RUN}&scope=world`);
  await expect(guestCheck.getByTestId('community-empty')).toBeVisible();
  await guestCheck.close();

  // 2. A moderator approves it.
  const mCtx = await browser.newContext();
  const m = await mCtx.newPage();
  const mEmail = await signUpWithEmail(m);
  execFileSync('npm', ['run', 'make-moderator', '-w', '@fieldverse/api', '--', mEmail], { stdio: 'ignore', shell: true });
  await m.goto('/community/moderation');
  const item = m.getByTestId('moderation-item').filter({ hasText: `Run ${RUN}` });
  await expect(item).toBeVisible();
  await expect(item).not.toContainText(aEmail);
  await item.getByTestId('approve').click();
  await expect(item).toHaveCount(0);

  // 3. Farmer B discovers it anonymously, marks it helpful and reports it.
  const bCtx = await browser.newContext();
  const b = await bCtx.newPage();
  await signUp(b);
  await b.goto(`/community?q=${RUN}&scope=world`);
  const card = b.getByTestId('experience-card').filter({ hasText: `Run ${RUN}` });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Anuradhapura District, North Central Province, Sri Lanka');
  await expect(card).toContainText('Farmer-reported — not independently verified');
  for (const secret of ['Private Person Name', aEmail]) await expect(card).not.toContainText(secret);

  const helpful = card.getByTestId('helpful-button');
  await helpful.click();
  await expect(helpful).toHaveAttribute('aria-pressed', 'true');
  await expect(helpful).toContainText('1');
  await helpful.click(); // undo
  await expect(helpful).toHaveAttribute('aria-pressed', 'false');
  await helpful.click();
  await expect(helpful).toContainText('1');

  await card.getByTestId('report-button').click();
  await b.getByLabel('Misleading agricultural claims').check();
  await b.getByTestId('submit-report').click();
  await expect(b.getByText('A moderator will review it')).toBeVisible();
  await b.keyboard.press('Escape');

  await card.getByTestId('read-experience').click();
  await expect(b.getByTestId('experience-detail')).toContainText('Check drainage before planting mung bean');
  await expect(b.getByTestId('experience-detail')).toContainText('Conditions may differ on your farm');
  await expect(b.getByRole('heading', { name: 'Related experiences' })).toBeVisible();

  // 4. Rotation Lab → community link with crop filter (clearly labelled as not a recommendation).
  await setSriLankaFarm(b);
  const links = b.getByTestId('community-links');
  await expect(links).toContainText('Community experiences — not verified crop recommendations.');
  await links.getByTestId('community-link-mung-bean').click();
  await expect(b).toHaveURL(/\/community\?crop=mung-bean&scope=country/);
  await expect(b.getByTestId('crop-filter')).toHaveValue('mung-bean');
  await expect(b.getByTestId('community-location')).toContainText('Anuradhapura District', { timeout: 30_000 });

  // 5. The owner can edit (goes back to review) and delete.
  await a.goto('/community/my-experiences');
  const own = a.getByTestId('my-experience').filter({ hasText: `Run ${RUN}` });
  await expect(own).toContainText('1 found this helpful');
  await own.getByTestId('edit-experience').click();
  await a.getByTestId('visibility-country').check();
  await a.getByTestId('preview-experience').click();
  await expect(a.getByTestId('public-preview')).toContainText('Sri Lanka');
  await expect(a.getByTestId('public-preview')).not.toContainText('Anuradhapura');
  await a.getByTestId('publish').click();
  await expect(a.getByTestId('share-done')).toBeVisible();
  await a.goto('/community/my-experiences');
  await expect(own.getByTestId('moderation-status')).toHaveText(/Waiting for review/);
  a.once('dialog', (d) => void d.accept());
  await own.getByTestId('delete-experience').click();
  await expect(own).toHaveCount(0);

  await Promise.all([aCtx.close(), bCtx.close(), mCtx.close()]);
});

test('community works on a 360px phone without horizontal scrolling', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await signUp(page);
  for (const path of ['/community', '/community/share', '/community/my-experiences']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.locator('#mobile-nav').getByRole('link', { name: 'Community' })).toBeVisible();
  await ctx.close();
});
