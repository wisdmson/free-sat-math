import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { eqFromMeta, solve2 } from '../../src/engine/generators/shared/linear2';
import { systemsSolve } from '../../src/engine/generators/algebra/systems-solve';
import { Rational } from '../../src/engine/rational';

const build = (d: 'easy' | 'medium' | 'hard', f: 'mcq' | 'spr', seed: number) =>
  buildProblem(systemsSolve, d, f, seed);

describe('alg.systems.solve-system', () => {
  it('offers every difficulty in both formats', () => {
    expect(systemsSolve.supports).toEqual({
      easy: ['mcq', 'spr'],
      medium: ['mcq', 'spr'],
      hard: ['mcq', 'spr'],
    });
  });

  it('easy problems give one equation already solved for y', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(build('easy', 'mcq', seed).stem).toMatch(/^\$\$\\begin\{aligned\} y &= /);
    }
  });

  it('hard problems ask for x + y or x - y with swapped coefficients', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = build('hard', 'spr', seed);
      expect(p.stem).toMatch(/What is the value of \$x [+-] y\$\?$/);
      const [e1, e2] = [eqFromMeta(p.meta?.['e1']), eqFromMeta(p.meta?.['e2'])];
      expect(e1.a.eq(e2.b) && e1.b.eq(e2.a)).toBe(true);
    }
  });

  it('records the true solution as the answer', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = build('medium', 'spr', seed);
      const sol = solve2(eqFromMeta(p.meta?.['e1']), eqFromMeta(p.meta?.['e2']));
      expect(sol.kind).toBe('one');
      if (sol.kind === 'one') {
        const want = p.meta?.['ask'] === 'x' ? sol.x : sol.y;
        expect(Rational.parse(answerValue(p)!).eq(want)).toBe(true);
      }
    }
  });

  it('explains every wrong choice', () => {
    const p = build('easy', 'mcq', 3);
    expect(Object.keys(p.distractorNotes ?? {})).toHaveLength(3);
  });

  it('preloads both equations for Desmos', () => {
    expect(build('medium', 'mcq', 4).desmos).toHaveLength(2);
  });
});
