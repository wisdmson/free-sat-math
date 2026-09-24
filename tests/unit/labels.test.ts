import { describe, expect, it } from 'vitest';
import type { Problem } from '../../src/engine/problem';
import { LEVEL_NAME, answerText } from '../../src/lib/labels';

const make = (answer: Problem['answer'], format: Problem['format'] = 'spr'): Problem => ({
  id: 'x',
  skill: 'alg.systems',
  difficulty: 'easy',
  format,
  source: 'generated',
  stem: '',
  solution: [],
  answer,
});

describe('answerText', () => {
  it('names the letter for multiple choice', () => {
    expect(answerText(make({ kind: 'choice', index: 2 }, 'mcq'))).toBe('C');
  });
  it('writes typed answers as math', () => {
    expect(answerText(make({ kind: 'values', values: ['7/2', '-4'] }))).toBe(
      '$\\frac{7}{2}$ or $-4$',
    );
  });
  it('describes ranges', () => {
    const range = make({
      kind: 'interval',
      min: '2',
      max: '5/2',
      minInclusive: true,
      maxInclusive: true,
    });
    expect(answerText(range)).toBe('any value from $2$ to $\\frac{5}{2}$');
  });
  it('has a name for every level', () => {
    expect(Object.values(LEVEL_NAME)).toEqual(['Easy', 'Medium', 'Hard']);
  });
});
