import { expect, test, type Page } from '@playwright/test';
import { mentalFromId } from '../../src/engine/mental/build';

async function answerRight(page: Page, nowCorrect: number) {
  const prompt = page.locator('[data-mental-id]');
  await expect(prompt).toBeVisible();
  const p = mentalFromId((await prompt.getAttribute('data-mental-id'))!)!;
  if (p.answer.kind === 'choice') {
    await page
      .getByRole('button', { name: p.answer.choices[p.answer.index] as string, exact: true })
      .click();
  } else {
    const value = p.answer.value;
    const text =
      p.answer.form === 'decimal'
        ? String(Number(value.split('/')[0]) / Number(value.split('/')[1] ?? 1))
        : value;
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }
  await expect(
    page.locator('.gym-bar').getByText(`${nowCorrect} correct`, { exact: true }),
  ).toBeVisible();
}

test('the sprint ends after 60 seconds and keeps the personal best', async ({ page }) => {
  await page.clock.install();
  await page.goto('/train/');
  await page.getByRole('button', { name: /Speed arithmetic/ }).click();
  for (let i = 1; i <= 3; i++) await answerRight(page, i);
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('heading', { name: '3 correct' })).toBeVisible();
  await expect(page.getByText('New personal best!')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fsm.progress.v1')!));
  expect(saved.mental.best['mm.arithmetic']).toBe(3);
  expect(saved.game.points).toBe(6);

  await page.getByRole('button', { name: 'Go again' }).click();
  await answerRight(page, 1);
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('heading', { name: '1 correct' })).toBeVisible();
  await expect(page.getByText('Personal best: 3')).toBeVisible();
});

test('the Gym fits a 360px screen and is in the main menu', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Train' }).click();
  await expect(page.getByRole('heading', { name: 'Mental Math Gym', level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a drill picked low on the list starts with the question on screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/train/');
  await page.getByRole('button', { name: /SAT shortcuts/ }).click();
  await expect(page.locator('[data-mental-id]')).toBeInViewport();
});

test('the floating Play button stays out of the way in the Gym', async ({ page }) => {
  await page.goto('/train/');
  await expect(page.getByRole('heading', { name: 'Mental Math Gym', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Quick Play' })).toHaveCount(0);
});

test('the Gym is one tap from the home page and the Play screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: 'Mental Math Gym' }).click();
  await expect(page.getByRole('heading', { name: 'Mental Math Gym', level: 1 })).toBeVisible();
  await page.goto('/play/');
  await page.getByRole('link', { name: 'Mental Math Gym' }).click();
  await expect(page.getByRole('heading', { name: 'Mental Math Gym', level: 1 })).toBeVisible();
});

test('a save from another tab does not restart the sprint clock', async ({ page }) => {
  await page.clock.install();
  await page.goto('/train/');
  await page.getByRole('button', { name: /Speed arithmetic/ }).click();
  await expect(page.locator('[data-mental-id]')).toBeVisible();
  await page.clock.fastForward(40_000);
  // Another tab (e.g. Quick Play) saves progress: the store reloads and the Gym re-renders.
  await page.evaluate(() =>
    window.dispatchEvent(new StorageEvent('storage', { key: 'fsm.progress.v1' })),
  );
  await page.clock.fastForward(21_000);
  await expect(page.getByRole('heading', { name: '0 correct' })).toBeVisible();
});
