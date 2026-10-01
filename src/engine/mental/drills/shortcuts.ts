import { r } from '../../rational';
import { evalExpr } from '../expr';
import { MINUS, choiceBody, choicesOk, numberBody, numberOk, signed, type Drill } from '../types';

const NONZERO = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** "+ 3" or "− 3". */
const term = (n: number) => (n < 0 ? `${MINUS} ${-n}` : `+ ${n}`);
/** "(x + a)(x − b)" with the two factors in numeric order. */
const factors = (a: number, b: number) => {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return `(x ${term(lo)})(x ${term(hi)})`;
};
const xTerm = (b: number) => (b === 1 ? '+ x' : b === -1 ? `${MINUS} x` : `${term(b)}x`);
const num = (s: string) => Number(s.replace(MINUS, '-'));

export const shortcuts: Drill = {
  id: 'mm.shortcuts',
  version: 1,
  name: 'SAT shortcuts',
  blurb: 'Slope, quick factoring, estimating and the difference of squares.',
  generate(rng, tier) {
    if (tier === 1) {
      const den = rng.pick([1, 1, 2]);
      const top = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const x1 = rng.int(-5, 5);
      const y1 = rng.int(-5, 5);
      const dx = den * rng.pick([1, 2, -1]);
      const x2 = x1 + dx;
      const y2 = y1 + (top * dx) / den;
      return numberBody(
        `Slope through (${signed(x1)}, ${signed(y1)}) and (${signed(x2)}, ${signed(y2)})`,
        r(top, den),
      );
    }
    if (tier === 2) {
      const p = rng.pick(NONZERO);
      let q = rng.pick(NONZERO);
      while (q === p || q === -p) q = rng.pick(NONZERO);
      return choiceBody(
        `Factor x² ${xTerm(p + q)} ${term(p * q)}`,
        factors(p, q),
        [factors(-p, -q), factors(p, -q), factors(-p, q)],
        rng,
      );
    }
    if (rng.chance(0.5)) {
      const a = rng.int(30, 99);
      const d = rng.int(1, 9);
      return numberBody(`${a + d}² ${MINUS} ${a - d}²`, r(4 * a * d));
    }
    const x = rng.int(11, 99);
    const y = rng.int(11, 99);
    const near = Math.max(100, Math.round((x * y) / 100) * 100);
    const below = near > 300 ? near - 300 : near + 900;
    return choiceBody(
      `Which is closest to ${x} × ${y}?`,
      String(near),
      [String(near + 300), String(near + 600), String(below)],
      rng,
    );
  },
  verify(p) {
    let m = /^Slope through \((−?\d+), (−?\d+)\) and \((−?\d+), (−?\d+)\)$/.exec(p.prompt);
    if (m) {
      const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map((s) => num(s as string));
      return (
        x2 !== x1 &&
        numberOk(p, r((y2 as number) - (y1 as number), (x2 as number) - (x1 as number)))
      );
    }
    m = /^Factor x² ([+−]) (\d*)x ([+−]) (\d+)$/.exec(p.prompt);
    if (m && p.answer.kind === 'choice') {
      const b = (m[1] === '+' ? 1 : -1) * (m[2] === '' ? 1 : Number(m[2]));
      const c = (m[3] === '+' ? 1 : -1) * Number(m[4]);
      const expands = (choice: string) => {
        const f = /^\(x ([+−]) (\d+)\)\(x ([+−]) (\d+)\)$/.exec(choice);
        if (f === null) return false;
        const a1 = (f[1] === '+' ? 1 : -1) * Number(f[2]);
        const a2 = (f[3] === '+' ? 1 : -1) * Number(f[4]);
        return a1 + a2 === b && a1 * a2 === c;
      };
      const right = p.answer.choices.filter(expands);
      return right.length === 1 && choicesOk(p, right[0] as string);
    }
    m = /^Which is closest to (\d+) × (\d+)\?$/.exec(p.prompt);
    if (m && p.answer.kind === 'choice') {
      const product = Number(m[1]) * Number(m[2]);
      const gaps = p.answer.choices.map((c) => Math.abs(Number(c) - product));
      const best = Math.min(...gaps);
      return (
        gaps.filter((g) => g === best).length === 1 &&
        choicesOk(p, p.answer.choices[gaps.indexOf(best)] as string)
      );
    }
    return numberOk(p, evalExpr(p.prompt));
  },
};
