import { expect, test } from '@playwright/test';
import { answer, currentProblem, fixedProblem, problemUrl } from './helpers';

test('home page reaches a problem in one click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start practicing' }).click();
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
});

test('auto practice moves up a level after 3 correct answers', async ({ page }) => {
  await page.goto('/practice/?skill=alg.systems&level=auto');
  await expect(page.getByText('Level: Medium (adjusts to you)')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await answer(page, await currentProblem(page), true);
    await page.getByRole('button', { name: 'Next problem' }).click();
  }
  await expect(page.getByText('Level: Hard (adjusts to you)')).toBeVisible();
  await expect(page.getByText('3 of 3 correct')).toBeVisible();
});

test('a problem link shows the solution after a wrong answer', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'easy', 'spr', 7);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, false);
  await expect(page.getByRole('heading', { name: 'Solution' })).toBeVisible();
});

test('try a similar one keeps the type and difficulty', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solution-count', 'hard', 'mcq', 5);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, true);
  await page.getByRole('button', { name: 'Try a similar one' }).click();
  const similar = await currentProblem(page);
  expect(similar.id).not.toBe(problem.id);
  expect(similar.id.startsWith('g:alg.systems.solution-count@1:hard:mcq:')).toBe(true);
});

test('a problem can be answered with the keyboard alone', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'medium', 'mcq', 21);
  await page.goto(problemUrl(problem.id));
  await page.locator('input[type=radio]').first().focus();
  const correct = problem.answer.kind === 'choice' ? problem.answer.index : 0;
  for (let i = 0; i < correct; i++) await page.keyboard.press('ArrowDown');
  if (correct === 0) await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Check' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
});

test('an unknown problem link shows a helpful message', async ({ page }) => {
  await page.goto(problemUrl('g:not.a.type@1:easy:mcq:1'));
  await expect(page.getByRole('heading', { name: 'Problem not found' })).toBeVisible();
});

test('a bad practice link offers the skills list', async ({ page }) => {
  await page.goto('/practice/?skill=not-a-skill');
  await expect(page.getByRole('link', { name: 'Choose a skill' })).toBeVisible();
});

test('when storage is blocked, a banner explains and practice still works', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await page.goto('/practice/?skill=alg.systems&level=easy');
  await expect(page.getByText("Progress won't be saved in this browser")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
});

test('the problem page fits a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(problemUrl(fixedProblem('alg.systems.word-system', 'easy', 'mcq', 2).id));
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
