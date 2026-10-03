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

test('home has a clear start action and the visual layout landmarks', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await expect(page.locator('.home-hero')).toBeVisible();
  await expect(page.locator('.home-actions')).toBeVisible();
  await expect(page.locator('.home-availability')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start practicing' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Skills' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Train' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('primary actions keep readable contrast in both themes', async ({ page }) => {
  await page.goto('/');
  const contrast = async () =>
    page.locator('.home-actions .button.primary').evaluate((button) => {
      const parse = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const luminance = (color: string) => {
        const channels = parse(color).map((channel) => channel / 255);
        const linear = channels.map((channel) =>
          channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        );
        return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
      };
      const styles = getComputedStyle(button);
      const foreground = luminance(styles.color);
      const background = luminance(styles.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button', { name: 'Switch between light and dark theme' }).click();
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
});

test('muted hint text stays readable on the page background in both themes', async ({ page }) => {
  await page.goto('/');
  const contrast = async () =>
    page.locator('.home-copy .lead').evaluate((el) => {
      const rgb = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map((c) => Number(c) / 255);
      const lum = (color: string) => {
        const [r, g, b] = rgb(color).map((c) =>
          c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
        );
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const fg = lum(getComputedStyle(el).color);
      const bg = lum(getComputedStyle(document.body).backgroundColor);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button', { name: 'Switch between light and dark theme' }).click();
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
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

test('on a phone the floating Play button is a small round icon', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/practice/?skill=mix&level=auto');
  const fab = page.getByRole('link', { name: 'Quick Play' });
  await expect(fab).toBeVisible();
  const box = (await fab.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(56);
});
