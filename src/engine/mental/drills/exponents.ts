import { r } from '../../rational';
import { evalExpr, sup } from '../expr';
import { numberBody, numberOk, type Drill } from '../types';

export const exponents: Drill = {
  id: 'mm.exponents',
  version: 2,
  name: 'Exponents',
  blurb: 'Powers, exponent rules, and zero and negative exponents.',
  generate(rng, tier) {
    if (tier === 1) {
      const [b, max] = rng.pick([
        [2, 10],
        [3, 6],
        [5, 4],
        [10, 5],
      ] as const);
      const e = rng.int(2, max);
      return numberBody(`${b}${sup(e)}`, r(b ** e));
    }
    if (tier === 2) {
      const b = rng.pick([2, 3]);
      const cap = b === 2 ? 10 : 6;
      const form = rng.int(0, 2);
      if (form === 0) {
        const m = rng.int(1, cap - 1);
        const n = rng.int(1, cap - m);
        return numberBody(`${b}${sup(m)} · ${b}${sup(n)}`, r(b ** (m + n)));
      }
      if (form === 1) {
        const n = rng.int(1, cap - 1);
        const m = n + rng.int(1, cap);
        return numberBody(`${b}${sup(m)} ÷ ${b}${sup(n)}`, r(b ** (m - n)));
      }
      const m = rng.int(1, b === 2 ? 5 : 3);
      const n = rng.int(2, Math.floor(cap / m));
      return numberBody(`(${b}${sup(m)})${sup(n)}`, r(b ** (m * n)));
    }
    const form = rng.int(0, 2);
    if (form === 0) return numberBody(`${rng.int(2, 12)}${sup(0)}`, r(1));
    const n = rng.int(1, 2);
    if (form === 1) {
      // Bases whose reciprocals end as decimals: a repeating answer is never typed (spec §4.2).
      const b = rng.pick([2, 4, 5, 10]);
      return numberBody(`${b}${sup(-n)}`, r(1, b ** n));
    }
    const b = rng.pick([2, 3, 4, 5]);
    return numberBody(`(1/${b})${sup(-n)}`, r(b ** n));
  },
  verify(p) {
    return numberOk(p, evalExpr(p.prompt));
  },
};
