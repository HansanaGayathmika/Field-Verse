import { expect, test } from '@playwright/test';

/** The farmer mascot is a visual layer only: it reacts to the login form and greets the farmer after sign-in. */
test('login mascot reacts to focus and a wrong password', async ({ page }) => {
  await page.goto('/login');
  const mascot = page.getByRole('img', { name: 'Farmer mascot', exact: true });
  await expect(mascot).toBeVisible();
  await expect(mascot).toHaveAttribute('data-mood', 'idle');

  await page.getByLabel('Email').focus();
  await expect(mascot).toHaveAttribute('data-mood', 'look');

  await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.org`);
  await page.getByLabel('Password').fill('definitely the wrong password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(mascot).toHaveAttribute('data-mood', 'shake');
  await expect(page).toHaveURL(/\/login$/); // login logic unchanged: still on the login page
});

test('after signing up, the farmer suits up and says welcome', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Nimal Perera');
  await page.getByLabel('Email').fill(`mascot-${Date.now()}@example.org`);
  await page.getByLabel('Password').fill('a long test password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  const banner = page.getByTestId('welcome-banner');
  await expect(banner).toContainText('Captain Farmer!');
  await expect(page.getByRole('img', { name: 'Farmer mascot in astronaut suit' })).toBeVisible();
  await expect(page.getByTestId('mascot-suitup')).toHaveCount(0, { timeout: 5000 }); // ~1 s transition finished
  // greeting loops one sentence at a time, typed letter by letter
  const typed = banner.getByTestId('welcome-typed');
  await expect(typed).toHaveText('Welcome aboard, Captain Farmer!', { timeout: 8000 });
  await expect(typed).toHaveText('Hi Nimal.', { timeout: 10000 });
  await expect(typed).toHaveText('Your mission control for the next growing season is ready.', { timeout: 12000 });
  await expect(typed).toHaveText('Welcome aboard, Captain Farmer!', { timeout: 12000 }); // looped back

  await page.reload(); // the suit-up plays once; afterwards the astronaut is shown straight away
  await expect(banner).toContainText('Welcome back, Captain Farmer!');
  await expect(page.getByTestId('mascot-suitup')).toHaveCount(0);
});

test('with reduced motion the mascots are static', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/login');
  const animations = await page
    .getByRole('img', { name: 'Farmer mascot', exact: true })
    .evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
  expect(animations).toBe(0);
  await ctx.close();
});
