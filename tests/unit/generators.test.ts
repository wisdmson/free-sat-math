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
