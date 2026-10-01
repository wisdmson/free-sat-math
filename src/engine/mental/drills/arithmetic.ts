import { r } from '../../rational';
import { evalExpr } from '../expr';
import { MINUS, numberBody, numberOk, paren, type Drill } from '../types';

export const arithmetic: Drill = {
  id: 'mm.arithmetic',
  version: 1,
  name: 'Speed arithmetic',
  blurb: 'Add, subtract, multiply and divide in your head.',
  generate(rng, tier) {
    if (tier === 1) {
      const op = rng.pick(['+', MINUS, '×'] as const);
      if (op === '×') {
        const a = rng.int(2, 9);
        const b = rng.int(11, 99);
        return numberBody(`${a} × ${b}`, r(a * b));
      }
      let a = rng.int(10, 99);
      let b = rng.int(10, 99);
      if (op === MINUS && b > a) [a, b] = [b, a];
      return numberBody(`${a} ${op} ${b}`, r(op === '+' ? a + b : a - b));
    }
    if (tier === 2) {
      if (rng.chance(0.5)) {
        const a = rng.int(12, 99);
        const b = rng.int(3, 9);
        return numberBody(`${a} × ${b}`, r(a * b));
      }
      const b = rng.int(3, 12);
      const q = rng.int(4, 25);
      return numberBody(`${b * q} ÷ ${b}`, r(q));
    }
    const a = rng.int(2, 20);
    const b = rng.int(2, 9);
    const c = rng.pick([-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]);
    const form = rng.int(0, 2);
    if (form === 0) return numberBody(`${a} ${MINUS} ${b} × ${paren(c)}`, r(a - b * c));
    if (form === 1) return numberBody(`(${a} ${MINUS} ${b}) × ${paren(c)}`, r((a - b) * c));
    return numberBody(`${paren(-Math.abs(c))} × ${b} + ${a}`, r(-Math.abs(c) * b + a));
  },
  verify(p) {
    return numberOk(p, evalExpr(p.prompt));
  },
};
