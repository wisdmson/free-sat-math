import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { getProblemType } from '../../src/engine/registry';
import { applyPlayAnswer } from '../../src/store/play';
import { emptyProgress } from '../../src/store/progress';

const problem = buildProblem(getProblemType('alg.systems.solve-system')!, 'medium', 'mcq', 5);
const base = { problem, response: 'A', timeMs: 3000, now: new Date(2026, 9, 1, 15) };

describe('applyPlayAnswer', () => {
  it('records the attempt, points, best combo, day count and staircase', () => {
    const p = applyPlayAnswer(emptyProgress(), { ...base, correct: true, points: 40, combo: 3 });
    expect(p.attempts).toHaveLength(1);
    expect(p.attempts[0]).toMatchObject({ mode: 'play', correct: true, problemId: problem.id });
    expect(p.game.points).toBe(40);
    expect(p.game.bestCombo).toBe(3);
    expect(p.game.answerDays).toEqual({ '2026-10-01': 1 });
    expect(p.skillState['alg.systems']).toEqual({ level: 'medium', streak: 1 });
  });
  it('raises the best streak when today completes a streak day', () => {
    let p = emptyProgress();
    for (let i = 0; i < 5; i++)
      p = applyPlayAnswer(p, { ...base, correct: false, points: 0, combo: 0 });
    expect(p.game.bestStreak).toBe(1);
    expect(p.game.bestCombo).toBe(0);
  });
});
