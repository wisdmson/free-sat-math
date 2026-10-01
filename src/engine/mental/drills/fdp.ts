import { r, Rational } from '../../rational';
import { choiceBody, choicesOk, numberBody, numberOk, type Drill } from '../types';

/** n/d by long division, truncated to `places` decimals: (2, 3, 4) → "0.6666". */
function truncated(n: number, d: number, places: number): string {
  let rem = n % d;
  let out = `${Math.floor(n / d)}.`;
  for (let k = 0; k < places; k++) {
    rem *= 10;
    out += String(Math.floor(rem / d));
    rem %= d;
  }
  return out;
}

const REPEATING = [
  [1, 3],
  [2, 3],
  [1, 6],
  [5, 6],
  [1, 9],
  [2, 9],
  [4, 9],
  [5, 9],
  [7, 9],
  [8, 9],
] as const;

export const fdp: Drill = {
  id: 'mm.fdp',
  version: 1,
  name: 'Fractions, decimals, percents',
  blurb: 'Switch between 3/8, 0.375 and 37.5% without a calculator.',
  generate(rng, tier) {
    if (tier === 1) {
      // Reduced fractions only: 2/4 or 6/10 would never appear on the test.
      const [n, d] = rng.pick([
        [1, 2],
        [1, 4],
        [3, 4],
        [1, 5],
        [2, 5],
        [3, 5],
        [4, 5],
        [1, 10],
        [3, 10],
        [7, 10],
        [9, 10],
      ] as const);
      return rng.chance(0.5)
        ? numberBody(`${n}/${d} as a decimal`, r(n, d), { form: 'decimal' })
        : numberBody(`${n}/${d} as a percent`, r(n * 100, d), { suffix: '%' });
    }
    if (tier === 2) {
      const kind = rng.int(0, 2);
      const n = rng.pick([1, 3, 5, 7]);
      if (kind === 0) {
        return rng.chance(0.5)
          ? numberBody(`${n}/8 as a decimal`, r(n, 8), { form: 'decimal' })
          : numberBody(`${n}/8 as a percent`, r(n * 100, 8), { suffix: '%' });
      }
      if (kind === 1) return numberBody(`${n / 8} as a fraction`, r(n, 8), { form: 'fraction' });
      const [a, b] = rng.pick(REPEATING);
      const correct = `${truncated(a, b, 4)}…`;
      const reciprocal = String(Number((b / a).toFixed(4)));
      return choiceBody(
        `${a}/${b} as a decimal`,
        correct,
        [truncated(a, b, 1), truncated(a, b, 2), reciprocal],
        rng,
      );
    }
    const kind = rng.int(0, 2);
    if (kind === 0) {
      const p = rng.pick([110, 120, 125, 150, 175, 225, 250, 350]);
      return numberBody(`${p}% as a fraction`, r(p, 100), { form: 'fraction' });
    }
    if (kind === 1) {
      const n = rng.pick([1, 3, 5, 7]);
      return numberBody(`${n}/8 as a percent`, r(n * 100, 8), { suffix: '%' });
    }
    const k = rng.int(1, 999);
    return numberBody(`${k / 1000} as a percent`, r(k, 10), { suffix: '%' });
  },
  verify(p) {
    let m = /^(\d+)\/(\d+) as a decimal$/.exec(p.prompt);
    if (m) {
      const n = Number(m[1]);
      const d = Number(m[2]);
      if (p.answer.kind === 'choice') {
        // Repeating: computed by float flooring here, by long division in generate().
        return choicesOk(p, `${(Math.floor((n / d) * 1e4) / 1e4).toFixed(4)}…`);
      }
      return numberOk(p, r(n, d), 'decimal');
    }
    m = /^(\d+)\/(\d+) as a percent$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]) * 100, Number(m[2])), undefined, '%');
    m = /^(\d+)% as a fraction$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]), 100), 'fraction');
    m = /^(\d*\.\d+) as a fraction$/.exec(p.prompt);
    if (m) return numberOk(p, Rational.parse(m[1] as string), 'fraction');
    m = /^(\d*\.\d+) as a percent$/.exec(p.prompt);
    if (m) return numberOk(p, Rational.parse(m[1] as string).mul(r(100)), undefined, '%');
    return false;
  },
};
