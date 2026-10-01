import type { Grade } from '../answer';
import { Rational } from '../rational';
import { MAX_SEED, createRng, type Rng } from '../rng';
import type { Tier } from './ids';
import { getDrill } from './registry';
import type { Drill, MentalProblem } from './types';

export function buildMental(drill: Drill, tier: Tier, seed: number): MentalProblem {
  const body = drill.generate(createRng(seed), tier);
  return { ...body, id: `m:${drill.id}@${drill.version}:${tier}:${seed}`, drill: drill.id, tier };
}

/** A fresh problem that passed verify(), or null after 10 failed seeds. */
export function generateMental(drill: Drill, tier: Tier, rng: Rng): MentalProblem | null {
  for (let i = 0; i < 10; i++) {
    const seed = rng.int(0, MAX_SEED);
    try {
      const p = buildMental(drill, tier, seed);
      if (drill.verify(p)) return p;
    } catch {
      // try another seed
    }
  }
  return null;
}

const ID = /^m:([a-z.]+)@(\d+):([123]):(\d+)$/;

/** Rebuilds a problem from its id (current drill version, same seed). */
export function mentalFromId(id: string): MentalProblem | null {
  const m = ID.exec(id);
  if (m === null) return null;
  const drill = getDrill(m[1] as string);
  return drill === undefined ? null : buildMental(drill, Number(m[3]) as Tier, Number(m[4]));
}

const NUMBER_SHAPE = /^-?(?:\d+\/\d+|\d+(?:\.\d*)?|\.\d+)$/;
const NOT_A_NUMBER = 'Enter a number, like 12, 3.5 or 7/2';

/** Grades a typed answer: any exact form is right unless the problem asks for a form. */
export function checkMental(p: MentalProblem, input: string): Grade {
  if (p.answer.kind !== 'number') throw new Error('checkMental is for typed answers');
  const t = input.trim().replace(/−/g, '-');
  if (!NUMBER_SHAPE.test(t)) return { status: 'invalid', reason: NOT_A_NUMBER };
  if (p.answer.form === 'decimal' && t.includes('/'))
    return { status: 'invalid', reason: 'Give a decimal, like 0.75' };
  if (p.answer.form === 'fraction' && !t.includes('/'))
    return { status: 'invalid', reason: 'Give a fraction, like 3/4' };
  let v: Rational;
  try {
    v = Rational.parse(t);
  } catch {
    return { status: 'invalid', reason: NOT_A_NUMBER };
  }
  return { status: 'checked', correct: v.eq(Rational.parse(p.answer.value)) };
}
