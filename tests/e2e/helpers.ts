import { expect, type Page } from '@playwright/test';

/** Creates a fresh account through the UI and lands on the home page with the full navigation. */
export async function signUp(page: Page) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Farmer');
  await page.getByLabel('Email').fill(`e2e-${id}@example.org`);
  await page.getByLabel('Password').fill('a long test password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('guest-nav')).toHaveCount(0);
}
