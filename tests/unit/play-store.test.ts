import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { getProblemType } from '../../src/engine/registry';
import { addBonusPoints, applyLightningAnswer, applyPlayAnswer } from '../../src/store/play';
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
describe('Lightning answers', () => {
  it('count toward points, best combo and today, but timeouts are not answers', () => {
    let p = applyLightningAnswer(emptyProgress(), {
      answered: true,
      points: 10,
      combo: 4,
      now: base.now,
    });
    p = applyLightningAnswer(p, { answered: false, points: 0, combo: 0, now: base.now });
    p = addBonusPoints(p, 25);
    expect(p.game.points).toBe(35);
    expect(p.game.bestCombo).toBe(4);
    expect(p.game.answerDays).toEqual({ '2026-10-01': 1 });
    expect(p.attempts).toEqual([]);
  });
});

describe('perfect Lightning rounds', () => {
  it('add the bonus and count the boosted combo toward the best combo', () => {
    let p = applyLightningAnswer(emptyProgress(), {
      answered: true,
      points: 5,
      combo: 7,
      now: base.now,
    });
    p = addBonusPoints(p, 25, 9);
    expect(p.game.points).toBe(30);
    expect(p.game.bestCombo).toBe(9);
    // A lower combo never lowers the best.
    expect(addBonusPoints(p, 25, 2).game.bestCombo).toBe(9);
  });
});
