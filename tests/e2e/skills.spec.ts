import { expect, test } from '@playwright/test';
import { SKILLS } from '../../src/engine/skills';

test('the skills list links available skills and marks the rest', async ({ page }) => {
  await page.goto('/skills/');
  await expect(page.getByRole('heading', { name: 'Algebra' })).toBeVisible();
  await expect(page.getByText('Coming soon')).toHaveCount(0);
  await expect(page.locator('.skill-list a')).toHaveCount(19);
  await page
    .getByRole('link', { name: 'Systems of two linear equations in two variables' })
    .click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Systems of two linear equations in two variables',
    }),
  ).toBeVisible();
});

test('every skill has a lesson, two worked examples, and practice', async ({ page }) => {
  for (const skill of SKILLS) {
    await page.goto(`/skills/${skill.id}/`);
    await expect(page.getByRole('heading', { level: 1, name: skill.name })).toBeVisible();
    await expect(page.locator('figure.worked-example')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: /Desmos/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start (adjusts to you)' })).toBeVisible();
  }
});

test('a lesson shows worked examples with a hidden solution', async ({ page }) => {
  await page.goto('/skills/alg.systems/');
  const example = page.locator('figure.worked-example').first();
  await expect(example.getByText('Example: elimination')).toBeVisible();
  await expect(example.getByRole('heading', { name: 'Solution' })).toHaveCount(0);
  await example.getByText('Show the answer and solution').click();
  await expect(example.getByText(/Answer:/)).toBeVisible();
});

test('lesson practice buttons open a practice session at that level', async ({ page }) => {
  await page.goto('/skills/alg.systems/');
  await page.getByRole('link', { name: 'Hard' }).click();
  await expect(page.getByText('Level: Hard')).toBeVisible();
});

test('skills pages fit a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/skills/', '/skills/alg.systems/']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
