import { linear, tex } from '../../format';
import { Rational, r } from '../../rational';

/** The equation a·x + b·y = c. */
export interface LinEq {
  a: Rational;
  b: Rational;
  c: Rational;
}

export type Solution2 =
  { kind: 'one'; x: Rational; y: Rational } | { kind: 'none' } | { kind: 'infinite' };

type N = Rational | number;
const q = (n: N): Rational => (typeof n === 'number' ? r(n) : n);

export const lin = (a: N, b: N, c: N): LinEq => ({ a: q(a), b: q(b), c: q(c) });

/** Solves a 2x2 linear system by Cramer's rule and classifies the no-solution and same-line cases. */
export function solve2(e1: LinEq, e2: LinEq): Solution2 {
  const det = e1.a.mul(e2.b).sub(e2.a.mul(e1.b));
  if (!det.isZero()) {
    const x = e1.c.mul(e2.b).sub(e2.c.mul(e1.b)).div(det);
    const y = e1.a.mul(e2.c).sub(e2.a.mul(e1.c)).div(det);
    return { kind: 'one', x, y };
  }
  const ac = e1.a.mul(e2.c).sub(e2.a.mul(e1.c));
  const bc = e1.b.mul(e2.c).sub(e2.b.mul(e1.c));
  return ac.isZero() && bc.isZero() ? { kind: 'infinite' } : { kind: 'none' };
}

/** JSON-safe form for problem meta. */
export type LinEqMeta = [string, string, string];

export const eqToMeta = (e: LinEq): LinEqMeta => [e.a.toString(), e.b.toString(), e.c.toString()];

export function eqFromMeta(value: unknown): LinEq {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((v) => typeof v === 'string')) {
    throw new TypeError('Bad equation meta');
  }
  const [a, b, c] = value as LinEqMeta;
  return lin(Rational.parse(a), Rational.parse(b), Rational.parse(c));
}

/** LaTeX "ax + by = c". */
export const eqTex = (e: LinEq): string =>
  `${linear([
    [e.a, 'x'],
    [e.b, 'y'],
  ])} = ${tex(e.c)}`;

export const scaleEq = (e: LinEq, k: N): LinEq => lin(e.a.mul(q(k)), e.b.mul(q(k)), e.c.mul(q(k)));
