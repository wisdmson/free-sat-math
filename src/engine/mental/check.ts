/** Grades typed drill answers. Kept apart from the drills so the Lightning card can load without them. */
import type { Grade } from '../answer';
import { Rational } from '../rational';
import type { MentalProblem } from './types';

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
