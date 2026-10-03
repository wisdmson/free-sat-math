import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { DIFFICULTIES, type Problem } from '../../src/engine/problem';
import { Rational, r } from '../../src/engine/rational';
import { PROBLEM_TYPES } from '../../src/engine/registry';

/** The same problem with a wrong answer recorded. */
function tamper(p: Problem): Problem {
  if (p.answer.kind === 'choice') {
    return { ...p, answer: { kind: 'choice', index: ((p.answer.index + 1) % 4) as 0 | 1 | 2 | 3 } };
  }
  if (p.answer.kind === 'values') {
    const wrong = Rational.parse(p.answer.values[0] as string).add(r(1));
    return { ...p, answer: { kind: 'values', values: [wrong.toString()] } };
  }
  return p;
}

describe.each(PROBLEM_TYPES.map((t) => [t.id, t] as const))('%s', (_id, type) => {
  const variants = DIFFICULTIES.flatMap((d) => type.supports[d].map((f) => [d, f] as const));
  it.each(variants)(
    'verify() accepts %s %s problems and rejects a wrong recorded answer',
    (d, f) => {
      for (let seed = 1; seed <= 20; seed++) {
        const problem = buildProblem(type, d, f, seed);
        expect(type.verify(problem), `seed ${seed}`).toBe(true);
        expect(type.verify(tamper(problem)), `tampered seed ${seed}`).toBe(false);
      }
    },
  );
});

describe('catalog answer verification', () => {
  it('checks the recorded answer against the prompt parameters without answer metadata', () => {
    const type = PROBLEM_TYPES.find((t) => t.id === 'alg.linear-one-var.solve');
    expect(type).toBeDefined();
    const problem = buildProblem(type!, 'medium', 'mcq', 12);
    const meta = { ...problem.meta };
    delete meta['answer'];
    expect(type!.verify({ ...problem, meta })).toBe(true);
  });
});

describe('quadratic root explanation', () => {
  it('identifies the greater root even when the roots are generated in reverse order', () => {
    const type = PROBLEM_TYPES.find((t) => t.id === 'adv.nonlinear-equations.quadratic-solve');
    expect(type).toBeDefined();
    for (let seed = 1; seed <= 100; seed++) {
      const problem = buildProblem(type!, 'medium', 'mcq', seed);
      const values = problem.meta?.['values'] as number[];
      const greater = Math.max(values[0] as number, values[1] as number);
      expect(problem.solution.at(-1)).toContain(`$${greater}$`);
    }
  });
});
