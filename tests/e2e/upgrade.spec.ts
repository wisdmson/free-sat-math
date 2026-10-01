import { expect, test } from '@playwright/test';
import { fixedProblem } from './helpers';

test('an existing v1 record is upgraded in place', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'easy', 'spr', 7);
  const v1 = {
    schemaVersion: 1,
    settings: { targetScore: null, timeMultiplier: 1, untimed: false },
    attempts: [
      {
        problemId: problem.id,
        skill: problem.skill,
        difficulty: problem.difficulty,
        correct: false,
        response: '1',
        timeMs: 1000,
        at: '2026-09-20T10:00:00.000Z',
        mode: 'practice',
      },
    ],
    bookmarks: [],
    skillState: {},
    testAttempts: [],
    completedFixedTests: [],
  };
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('fsm.progress.v1', raw);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(v1));
  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (1)' })).toBeVisible();
  const saved = await page.evaluate(() => ({
    version: JSON.parse(localStorage.getItem('fsm.progress.v1') ?? '{}').schemaVersion,
    copy: localStorage.getItem('fsm.backup.pre-v2') !== null,
  }));
  expect(saved).toEqual({ version: 2, copy: true });
});

test('a tab running an older version never overwrites newer saved data', async ({ page }) => {
  const newer = '{"schemaVersion": 99, "from": "the future"}';
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('fsm.progress.v1', raw);
      sessionStorage.setItem('seeded', '1');
    }
  }, newer);
  await page.goto('/review/');
  await expect(page.getByText('This site was updated in another tab')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fsm.progress.v1'))).toBe(newer);
});
