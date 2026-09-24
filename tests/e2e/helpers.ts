import { expect, type Page } from '@playwright/test';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { LETTERS, type Problem } from '../../src/engine/problem';
import { buildProblem } from '../../src/engine/build';
import { getProblemType, problemFromId } from '../../src/engine/registry';

/** A fixed generated problem, built in Node with the same engine the site uses. */
export function fixedProblem(
  typeId: string,
  difficulty: 'easy' | 'medium' | 'hard',
  format: 'mcq' | 'spr',
  seed: number,
): Problem {
  const type = getProblemType(typeId);
  if (!type) throw new Error(`unknown type ${typeId}`);
  return buildProblem(type, difficulty, format, seed);
}

export const problemUrl = (id: string) => `/problem/?id=${encodeURIComponent(id)}`;

/** The problem currently on screen, read from the stem element's id. */
export async function currentProblem(page: Page): Promise<Problem> {
  const stem = page.locator('[id^="stem-g:"]');
  await expect(stem).toBeVisible();
  const id = (await stem.getAttribute('id'))!.slice('stem-'.length);
  const found = problemFromId(id);
  if (!found) throw new Error(`could not rebuild ${id}`);
  return found.problem;
}

/** Answers the problem on screen, correctly or not, and presses Check. */
export async function answer(page: Page, problem: Problem, correct: boolean): Promise<void> {
  if (problem.answer.kind === 'choice') {
    const index = correct ? problem.answer.index : (problem.answer.index + 1) % 4;
    await page.locator(`input[type=radio][value="${LETTERS[index]}"]`).check();
  } else {
    const right = answerValue(problem)!;
    await page.getByLabel('Your answer').fill(correct ? right : right === '1' ? '2' : '1');
  }
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: correct ? 'Correct!' : 'Not quite' }),
  ).toBeVisible();
}
