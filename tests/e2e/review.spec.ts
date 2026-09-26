import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { answer, fixedProblem, problemUrl } from './helpers';

test('a wrong answer lands in review, and a right retry clears it', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'easy', 'spr', 7);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, false);

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (1)' })).toBeVisible();
  await page.getByRole('link', { name: 'Retry' }).click();
  await answer(page, problem, true);

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (0)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '50% of last 2' })).toBeVisible();
});

test('bookmarks show up in review and can be removed', async ({ page }) => {
  const problem = fixedProblem('alg.systems.word-system', 'medium', 'mcq', 3);
  await page.goto(problemUrl(problem.id));
  await page.getByRole('button', { name: '☆ Bookmark' }).click();
  await expect(page.getByRole('button', { name: '★ Bookmarked' })).toBeVisible();

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Bookmarks (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('heading', { name: 'Bookmarks (0)' })).toBeVisible();
});

test('progress survives download, reset and import', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'medium', 'mcq', 11);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, false);

  await page.goto('/settings/');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download progress' }).click();
  const file = await (await downloading).path();
  expect(JSON.parse(readFileSync(file, 'utf8')).attempts).toHaveLength(1);

  await page.getByRole('button', { name: 'Reset progress…' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Progress reset.')).toBeVisible();

  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText(/It has 1 answered problems/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace my progress' }).click();
  await expect(page.getByText('Progress imported.')).toBeVisible();

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (1)' })).toBeVisible();
});

test('a file that is not a progress file is rejected with a reason', async ({ page }) => {
  await page.goto('/settings/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByText(/not a Free SAT Math progress file/)).toBeVisible();
});

test('unreadable saved progress is backed up and the student is told', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('fsm.progress.v1', '{"schemaVersion": 99, "garbage": true}');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/review/');
  await expect(page.getByText("We couldn't read your saved progress")).toBeVisible();
  const backups = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('fsm.backup.')),
  );
  expect(backups).toHaveLength(1);
});

test('a second open tab picks up changes without a reload', async ({ context }) => {
  const problem = fixedProblem('alg.systems.word-system', 'hard', 'spr', 4);
  const review = await context.newPage();
  await review.goto('/review/');
  await expect(review.getByRole('heading', { name: 'Bookmarks (0)' })).toBeVisible();

  const practice = await context.newPage();
  await practice.goto(problemUrl(problem.id));
  await practice.getByRole('button', { name: '☆ Bookmark' }).click();

  await expect(review.getByRole('heading', { name: 'Bookmarks (1)' })).toBeVisible();
});

test('review and settings fit a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/review/', '/settings/']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
