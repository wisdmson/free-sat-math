import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { systemsCount } from '../../src/engine/generators/algebra/systems-count';

describe('alg.systems.solution-count', () => {
  it('offers typed answers only for the hard "find k" problems', () => {
    expect(systemsCount.supports).toEqual({ easy: ['mcq'], medium: ['mcq'], hard: ['mcq', 'spr'] });
  });

  it('lists the choices in counting order', () => {
    const p = buildProblem(systemsCount, 'medium', 'mcq', 1);
    expect(p.choices?.map((c) => c.text)).toEqual([
      'Zero',
      'Exactly one',
      'Exactly two',
      'Infinitely many',
    ]);
  });

  it('never marks "Exactly two" as correct', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const d of ['easy', 'medium'] as const) {
        const p = buildProblem(systemsCount, d, 'mcq', seed);
        expect(p.answer).not.toEqual({ kind: 'choice', index: 2 });
      }
    }
  });

  it('produces all three outcomes', () => {
    const outcomes = new Set<unknown>();
    for (let seed = 1; seed <= 30; seed++)
      outcomes.add(buildProblem(systemsCount, 'easy', 'mcq', seed).meta?.['outcome']);
    expect([...outcomes].sort()).toEqual(['infinite', 'one', 'zero']);
  });

  it('hard problems ask for a constant k', () => {
    const p = buildProblem(systemsCount, 'hard', 'spr', 2);
    expect(p.stem).toContain('$k$ is a constant');
    expect(p.stem).toMatch(/k[xy]/);
  });
});
