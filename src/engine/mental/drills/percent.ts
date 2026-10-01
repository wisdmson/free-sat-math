import { r } from '../../rational';
import { numberBody, numberOk, type Drill } from '../types';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export const percent: Drill = {
  id: 'mm.percent',
  version: 1,
  name: 'Percents',
  blurb: 'Percent of a number, what percent, and increases and decreases.',
  generate(rng, tier) {
    if (tier === 1) {
      const p = rng.pick([10, 20, 25, 50]);
      const result = rng.int(2, 40);
      return numberBody(`${p}% of ${(result * 100) / p}`, r(result));
    }
    if (tier === 2) {
      if (rng.chance(0.5)) {
        const p = rng.pick([5, 15, 30, 35, 40, 60, 75]);
        const unit = 100 / gcd(p, 100);
        const n = unit * rng.int(1, Math.max(1, Math.floor(400 / unit)));
        return numberBody(`${p}% of ${n}`, r((p * n) / 100));
      }
      const b = 20 * rng.int(1, 10);
      const pct = rng.pick([5, 10, 20, 25, 40, 50, 60, 75, 80]);
      return numberBody(`${(b * pct) / 100} is what percent of ${b}?`, r(pct), { suffix: '%' });
    }
    if (rng.chance(0.6)) {
      const base = 20 * rng.int(1, 20);
      const pct = rng.pick([10, 15, 20, 25, 30, 40, 50]);
      const up = rng.chance(0.5);
      return numberBody(
        `${base} ${up ? 'increased' : 'decreased'} by ${pct}%`,
        r(base * (100 + (up ? pct : -pct)), 100),
      );
    }
    const base = rng.pick([100, 200]);
    const p1 = rng.pick([10, 20, 50]);
    const p2 = rng.pick([10, 20, 50]);
    return numberBody(
      `${base} increased by ${p1}%, then decreased by ${p2}%`,
      r(base * (100 + p1) * (100 - p2), 10000),
    );
  },
  verify(p) {
    let m = /^(\d+)% of (\d+)$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]) * Number(m[2]), 100));
    m = /^(\d+) is what percent of (\d+)\?$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]) * 100, Number(m[2])), undefined, '%');
    m = /^(\d+) increased by (\d+)%, then decreased by (\d+)%$/.exec(p.prompt);
    if (m) {
      const v = r(Number(m[1]))
        .mul(r(100 + Number(m[2]), 100))
        .mul(r(100 - Number(m[3]), 100));
      return numberOk(p, v);
    }
    m = /^(\d+) (increased|decreased) by (\d+)%$/.exec(p.prompt);
    if (m) {
      const sign = m[2] === 'increased' ? 1 : -1;
      return numberOk(p, r(Number(m[1])).mul(r(100 + sign * Number(m[3]), 100)));
    }
    return false;
  },
};
