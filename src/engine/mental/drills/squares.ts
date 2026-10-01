import { r } from '../../rational';
import { evalExpr } from '../expr';
import { choiceBody, choicesOk, numberBody, numberOk, type Drill } from '../types';

export const squares: Drill = {
  id: 'mm.squares',
  version: 1,
  name: 'Squares and roots',
  blurb: 'Perfect squares, cubes and simplifying square roots.',
  generate(rng, tier) {
    if (tier === 1) {
      const n = rng.int(2, 15);
      return rng.chance(0.5) ? numberBody(`${n}²`, r(n * n)) : numberBody(`√${n * n}`, r(n));
    }
    if (tier === 2) {
      if (rng.chance(0.6)) {
        const n = rng.int(16, 25);
        return numberBody(`${n}²`, r(n * n));
      }
      const n = rng.int(2, 5);
      return numberBody(`${n}³`, r(n * n * n));
    }
    const a = rng.int(2, 6);
    const b = rng.pick([2, 3, 5, 6, 7]);
    const swapped = a === b ? `${a + 3}√${b}` : `${b}√${a}`;
    return choiceBody(
      `Simplify √${a * a * b}`,
      `${a}√${b}`,
      [`${a + 1}√${b}`, `${a * a}√${b}`, swapped],
      rng,
    );
  },
  verify(p) {
    let m = /^√(\d+)$/.exec(p.prompt);
    if (m) {
      const n = Number(m[1]);
      const root = Math.round(Math.sqrt(n));
      return root * root === n && numberOk(p, r(root));
    }
    m = /^Simplify √(\d+)$/.exec(p.prompt);
    if (m) {
      const n = Number(m[1]);
      let k = Math.floor(Math.sqrt(n));
      while (n % (k * k) !== 0) k--;
      return k > 1 && choicesOk(p, `${k}√${n / (k * k)}`);
    }
    return numberOk(p, evalExpr(p.prompt));
  },
};
