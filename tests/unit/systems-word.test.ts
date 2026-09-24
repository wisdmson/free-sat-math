import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { systemsWord } from '../../src/engine/generators/algebra/systems-word';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { TWO_ITEM_SCENARIOS } from '../../src/engine/generators/shared/scenarios';
import { Rational } from '../../src/engine/rational';

describe('alg.systems.word-system', () => {
  it('offers modeling at easy and counts at medium and hard', () => {
    expect(systemsWord.supports).toEqual({
      easy: ['mcq'],
      medium: ['mcq', 'spr'],
      hard: ['mcq', 'spr'],
    });
  });

  it('easy problems ask which system models the sale', () => {
    const p = buildProblem(systemsWord, 'easy', 'mcq', 1);
    expect(p.stem).toContain('Which system of equations represents this situation?');
    const correct = p.choices?.[p.answer.kind === 'choice' ? p.answer.index : 0];
    expect(correct?.text).toContain('x + y &=');
  });

  it('answers are positive whole-number counts', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of ['medium', 'hard'] as const) {
        const v = Rational.parse(answerValue(buildProblem(systemsWord, d, 'spr', seed))!);
        expect(v.isInteger() && v.sign() > 0, `${d} seed ${seed}`).toBe(true);
      }
    }
  });

  it('writes money with an escaped dollar sign', () => {
    const p = buildProblem(systemsWord, 'medium', 'mcq', 5);
    expect(p.stem).toMatch(/\\\$\d/);
  });

  it('keeps every scenario price range above the cheaper item', () => {
    for (const s of TWO_ITEM_SCENARIOS) expect(s.a.price[0]).toBeGreaterThan(s.b.price[1]);
  });
});
