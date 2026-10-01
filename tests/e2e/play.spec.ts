import { expect, test, type Page } from '@playwright/test';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { LETTERS } from '../../src/engine/problem';
import { problemFromId } from '../../src/engine/registry';

const current = (page: Page) => page.locator('[data-current="true"]');

async function answerCurrent(page: Page, correct: boolean) {
  const stem = current(page).locator('[id^="stem-g:"]');
  await expect(stem).toBeVisible();
  const id = (await stem.getAttribute('id'))!.slice('stem-'.length);
  const problem = problemFromId(id)!.problem;
  if (problem.answer.kind === 'choice') {
    const index = correct ? problem.answer.index : (problem.answer.index + 1) % 4;
    await current(page).locator(`[data-letter="${LETTERS[index]}"]`).click();
  } else {
    const right = answerValue(problem)!;
    await current(page)
      .getByLabel('Your answer')
      .fill(correct ? right : right === '1' ? '2' : '1');
    await current(page).getByRole('button', { name: 'Check' }).click();
  }
  await expect(current(page).getByRole('status')).toContainText(correct ? 'Correct' : 'Not quite');
}

const next = (page: Page) => page.getByRole('button', { name: 'Next card' }).click();

test('Play starts the feed and a right answer earns points', async ({ page }) => {
  await page.goto('/play/');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await answerCurrent(page, true);
  await expect(page.getByText(/^\d+ pts$/)).not.toHaveText('0 pts');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fsm.progress.v1')!));
  expect(saved.attempts[0].mode).toBe('play');
  expect(saved.game.points).toBeGreaterThan(0);
});

test('a skip keeps the combo going', async ({ page }) => {
  await page.goto('/play/?go=1');
  await answerCurrent(page, true);
  await next(page);
  await answerCurrent(page, true);
  await next(page);
  await next(page); // skip without answering
  await answerCurrent(page, true);
  await expect(page.getByText('Combo 3 · ×2')).toBeVisible();
});

test('five answers in a day start a streak, and nothing is lost on reload', async ({ page }) => {
  await page.goto('/play/?go=1');
  for (let i = 0; i < 5; i++) {
    await answerCurrent(page, i % 2 === 0);
    await next(page);
  }
  // A fresh visit to the start screen (no ?go=1) reads everything back from storage.
  await page.goto('/play/');
  await expect(page.getByText('1-day streak')).toBeVisible();
});

test('the feed works with the keyboard alone', async ({ page }) => {
  await page.goto('/play/?go=1');
  await expect(current(page).locator('[id^="stem-g:"]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-index="1"]')).toHaveAttribute('data-current', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-index="0"]')).toHaveAttribute('data-current', 'true');
});

test('reduced motion turns the burst off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play/?go=1');
  await answerCurrent(page, true);
  await expect(page.locator('.play-burst')).toHaveCount(0);
});

test('Quick Play fits a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/play/', '/play/?go=1']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
