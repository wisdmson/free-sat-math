/** How a drill's right answer is shown to the student (e.g. after a wrong Lightning answer). */
import { Rational } from '../rational';
import { MINUS, type MentalAnswer } from './types';

/** An exact decimal for a terminating value: 175/2 → "87.5", -1/8 → "-0.125". */
function exactDecimal(v: Rational): string {
  let twos = 0;
  let fives = 0;
  let d = v.den;
  while (d % 2 === 0) {
    d /= 2;
    twos++;
  }
  while (d % 5 === 0) {
    d /= 5;
    fives++;
  }
  const places = Math.max(twos, fives);
  const scaled = Math.abs(v.num) * (10 ** places / v.den);
  const digits = String(scaled).padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const frac = digits.slice(digits.length - places);
  return `${v.num < 0 ? '-' : ''}${whole}${places > 0 ? `.${frac}` : ''}`;
}

/**
 * The right answer in the form the question asked for: a fraction for "as a fraction", otherwise
 * a decimal when it ends (a fraction when it repeats), with the % suffix and a real minus sign.
 */
export function formatMentalAnswer(answer: MentalAnswer): string {
  if (answer.kind === 'choice') return answer.choices[answer.index];
  const v = Rational.parse(answer.value);
  const text = answer.form !== 'fraction' && v.isTerminating() ? exactDecimal(v) : v.toString();
  return `${text.replace('-', MINUS)}${answer.suffix ?? ''}`;
}
