import { expect, test } from '@playwright/test';

test('the theme choice sticks across page loads', async ({ page }) => {
  await page.goto('/formulas/');
  const before = await page.evaluate(() => document.documentElement.dataset['theme'] ?? 'system');
  await page.getByRole('button', { name: 'Switch between light and dark theme' }).click();
  await page.reload();
  const after = await page.evaluate(() => document.documentElement.dataset['theme']);
  expect(after).toBeDefined();
  expect(after).not.toBe(before);
});

test('the formula sheet and footer disclaimer render', async ({ page }) => {
  await page.goto('/formulas/');
  await expect(page.getByRole('heading', { name: 'Formula sheet', level: 1 })).toBeVisible();
  await expect(page.getByText('Pythagorean theorem')).toBeVisible();
  await expect(
    page.getByText(/not affiliated with, and does not endorse, this site/),
  ).toBeVisible();
});

test('unknown pages show the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('static pages fit a 360px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/', '/formulas/', '/about/']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
