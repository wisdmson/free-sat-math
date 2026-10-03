import { expect, test, type Page } from '@playwright/test';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { mentalFromId } from '../../src/engine/mental/build';
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
    await page.keyboard.type(correct ? right : right === '1' ? '2' : '1');
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

test('the floating Play button jumps straight into a question', async ({ page }) => {
  await page.goto('/skills/');
  await page.getByRole('link', { name: 'Quick Play' }).click();
  await expect(page).toHaveURL(/\/play\/\?go=1$/);
  await expect(current(page).locator('[id^="stem-g:"]')).toBeVisible();
});

test('the floating Play button is not shown on the Quick Play page', async ({ page }) => {
  await page.goto('/play/');
  await expect(page.locator('.play-fab')).toHaveCount(0);
});

test('a perfect Lightning round earns the bonus', async ({ page }) => {
  await page.goto('/play/?go=1&lightning=first');
  const card = current(page);
  await expect(card.getByText('⚡ Lightning')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const prompt = card.locator('[data-mental-id]');
    await expect(prompt).toHaveAttribute('data-mental-id', /^m:/);
    const p = mentalFromId((await prompt.getAttribute('data-mental-id'))!)!;
    if (p.answer.kind === 'choice') {
      await card
        .getByRole('button', { name: p.answer.choices[p.answer.index] as string, exact: true })
        .click();
    } else {
      const [n, d] = p.answer.value.split('/');
      await page.keyboard.type(
        p.answer.form === 'decimal' ? String(Number(n) / Number(d ?? 1)) : p.answer.value,
      );
      await page.keyboard.press('Enter');
    }
    if (i < 2) await expect(card.getByText(`${i + 1} of 3 done`)).toBeVisible();
  }
  await expect(card.getByText('Perfect! +25 bonus')).toBeVisible();
});

test('an unanswered Lightning question times out', async ({ page }) => {
  await page.clock.install();
  await page.goto('/play/?go=1&lightning=first');
  await expect(current(page).getByText('⚡ Lightning')).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(current(page).getByText("Time's up")).toBeVisible();
});

test('the card arrows never cover the number pad', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto('/play/?go=1&lightning=first');
  await expect(current(page).locator('[data-mental-id]')).toBeVisible();
  // A new player is at tier 1, where every drill's question is typed on the pad.
  const pad = await current(page).locator('.numpad').boundingBox();
  const arrows = await page.getByRole('navigation', { name: 'Move between cards' }).boundingBox();
  expect(pad).not.toBeNull();
  expect(arrows).not.toBeNull();
  expect(pad!.x + pad!.width).toBeLessThanOrEqual(arrows!.x);
});

test('a Lightning round turns up on its own within 13 cards', async ({ page }) => {
  // The drills download a few cards before the first round is due. A student reads each card;
  // this test taps fast, so it waits for that download instead of racing it.
  const drills = page.waitForResponse((r) => /\/lightning\.[\w-]+\.js$/.test(r.url()));
  await page.goto('/play/?go=1');
  // Cards near the current one are rendered ahead, so walk until the round is in the DOM.
  // By the 5th card at least 8 are built, so a round is within reach and the download started.
  const round = page.locator('.play-slot', { hasText: '⚡ Lightning' }).first();
  for (let i = 0; i < 30 && (await round.count()) === 0; i++) {
    await expect(current(page).locator('h2')).toBeAttached();
    if (i === 4) await drills;
    await next(page);
  }
  // Card numbers count from 1: a gap of 8 to 12 questions puts the round at card 9 to 13.
  const index = Number(await round.getAttribute('data-index'));
  expect(index).toBeGreaterThanOrEqual(8);
  expect(index).toBeLessThanOrEqual(12);
});

test('a half-played Lightning round picks up where it left off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // instant scrolling: no in-between cards
  await page.goto('/play/?go=1&lightning=first');
  const card = current(page);
  await expect(card.getByText('⚡ Lightning')).toBeVisible();
  const prompt = card.locator('[data-mental-id]');
  const p = mentalFromId((await prompt.getAttribute('data-mental-id'))!)!;
  if (p.answer.kind === 'choice') {
    await card
      .getByRole('button', { name: p.answer.choices[p.answer.index] as string, exact: true })
      .click();
  } else {
    await page.keyboard.type(p.answer.value === '0' ? '1' : '0');
    await page.keyboard.press('Enter');
  }
  await expect(card.getByText('1 of 3 done')).toBeVisible();
  const second = await prompt.getAttribute('data-mental-id');
  const at = (n: number) => page.locator(`[data-index="${n}"][data-current="true"]`);
  for (let n = 1; n <= 4; n++) {
    await next(page);
    await expect(at(n)).toBeAttached();
  }
  for (let n = 3; n >= 0; n--) {
    await page.getByRole('button', { name: 'Previous card' }).click();
    await expect(at(n)).toBeAttached();
  }
  await expect(current(page).getByText('1 of 3 done')).toBeVisible();
  await expect(current(page).locator('[data-mental-id]')).toHaveAttribute(
    'data-mental-id',
    second!,
  );
});

test('marking an answer as a guess saves it', async ({ page }) => {
  await page.goto('/play/?go=1');
  await answerCurrent(page, false);
  await current(page).getByRole('button', { name: 'Guessed?' }).click();
  await expect(
    current(page).getByRole('button', { name: 'Guessed?', pressed: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fsm.progress.v1')!));
  expect(saved.attempts.at(-1).guessed).toBe(true);
});

test('a pace check shows the time against 95 s and adds the bonus', async ({ page }) => {
  await page.goto('/play/?go=1&pace=first');
  await expect(current(page).getByText('Pace check')).toBeVisible();
  await answerCurrent(page, true);
  await expect(current(page).getByRole('status')).toContainText('on pace ✅');
  await expect(current(page).getByRole('status')).toContainText('+10 pace bonus');
});

test('three misses in a row offer a reset that ends with the unstuck checklist', async ({
  page,
}) => {
  await page.goto('/play/?go=1');
  for (let i = 0; i < 3; i++) {
    await answerCurrent(page, false);
    await next(page);
  }
  await expect(current(page).getByRole('heading', { name: 'Take 20 seconds?' })).toBeVisible();
  await current(page).getByRole('button', { name: 'Start the reset' }).click();
  const dialog = page.getByRole('dialog', { name: 'Take 20 seconds' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip to the checklist' }).click();
  await expect(page.getByRole('dialog', { name: 'Get unstuck' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to the questions' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The three answered cards keep their results.
  await page.getByRole('button', { name: 'Previous card' }).click();
  await expect(current(page).getByRole('status')).toContainText('Not quite');
});
