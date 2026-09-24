import { describe, expect, it } from 'vitest';
import {
  answerValue,
  fallbackCandidates,
  fixedChoices,
  isNice,
  numericAnswer,
  numericChoices,
  pickDistractors,
  shuffledChoices,
} from '../../src/engine/generators/shared/choices';
import type { Problem } from '../../src/engine/problem';
import { r } from '../../src/engine/rational';
import { createRng } from '../../src/engine/rng';

describe('isNice', () => {
  it('applies the default and custom rules', () => {
    expect(isNice(r(7, 2))).toBe(true);
    expect(isNice(r(1, 13))).toBe(false);
    expect(isNice(r(10000))).toBe(false);
    expect(isNice(r(7, 2), { integerOnly: true })).toBe(false);
    expect(isNice(r(0), { min: 1 })).toBe(false);
  });
});

describe('pickDistractors', () => {
  it('skips the answer, duplicates and non-nice values, in order', () => {
    const picked = pickDistractors(r(5), [
      { value: r(5), note: 'same as answer' },
      { value: r(1, 13), note: 'ugly' },
      { value: r(3), note: 'a' },
      { value: r(3), note: 'duplicate' },
      { value: r(-5), note: 'b' },
      { value: r(6), note: 'c' },
      { value: r(7), note: 'unused' },
    ]);
    expect(picked.map((c) => c.note)).toEqual(['a', 'b', 'c']);
  });
  it('throws when fewer than three survive', () => {
    expect(() => pickDistractors(r(0), [{ value: r(0), note: 'x' }])).toThrow();
  });
  it('fallback offsets vary with the seed', () => {
    const orders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        fallbackCandidates(r(10), createRng(seed))
          .slice(1, 3)
          .map((c) => c.value.toString())
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
  it('fallbacks give enough options even for 0', () => {
    expect(pickDistractors(r(0), fallbackCandidates(r(0), createRng(1)))).toHaveLength(3);
  });
});

describe('numericChoices', () => {
  it('sorts ascending and tracks the answer and notes', () => {
    const built = numericChoices(r(2), [
      { value: r(9), note: 'nine' },
      { value: r(-1), note: 'minus one' },
      { value: r(1, 2), note: 'half' },
    ]);
    expect(built.choices.map((c) => c.value)).toEqual(['-1', '1/2', '2', '9']);
    expect(built.choices[1].text).toBe('$\\frac{1}{2}$');
    expect(built.answer).toEqual({ kind: 'choice', index: 2 });
    expect(built.distractorNotes).toEqual({ A: 'minus one', B: 'half', D: 'nine' });
  });
});

describe('shuffledChoices and fixedChoices', () => {
  it('shuffles deterministically and keeps exactly one correct', () => {
    const make = () =>
      shuffledChoices(createRng(4), { text: 'right' }, [
        { text: 'w1', note: 'n1' },
        { text: 'w2', note: 'n2' },
        { text: 'w3', note: 'n3' },
      ]);
    const a = make();
    expect(a).toEqual(make());
    expect(a.choices[a.answer.index].text).toBe('right');
    expect(Object.keys(a.distractorNotes)).toHaveLength(3);
  });
  it('rejects zero or two correct choices', () => {
    const wrong = { text: 'w', note: 'n' };
    expect(() => fixedChoices([wrong, wrong, wrong, wrong])).toThrow();
    expect(() =>
      fixedChoices([{ text: 'a', note: null }, { text: 'b', note: null }, wrong, wrong]),
    ).toThrow();
  });
});

describe('numericAnswer and answerValue', () => {
  it('builds spr answers without choices', () => {
    expect(numericAnswer('spr', r(7, 2), () => [])).toEqual({
      answer: { kind: 'values', values: ['7/2'] },
    });
  });
  it('reads the correct value back from either format', () => {
    const mcq = numericAnswer('mcq', r(4), () =>
      fallbackCandidates(r(4), createRng(1)).slice(0, 3),
    );
    const problem = { ...mcq, stem: '', solution: [] } as unknown as Problem;
    expect(answerValue(problem)).toBe('4');
    const spr = { answer: { kind: 'values', values: ['7/2'] } } as unknown as Problem;
    expect(answerValue(spr)).toBe('7/2');
  });
});
