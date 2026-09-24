import { Rational, r } from './rational';

type Num = Rational | number;
const toQ = (n: Num): Rational => (typeof n === 'number' ? r(n) : n);

/** Integer digits with LaTeX thousands separators: 1090 -> "1{,}090". */
function groupDigits(n: number): string {
  const s = String(Math.abs(n));
  const grouped = s.length > 3 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, '{,}') : s;
  return n < 0 ? `-${grouped}` : grouped;
}

/** Plain-text integer with commas, for money in sentences: 1090 -> "1,090". */
export function commas(n: number): string {
  return groupDigits(n).replaceAll('{,}', ',');
}

/** LaTeX for a number: 4, -4, 1{,}090, \frac{7}{2}, -\frac{7}{2}. */
export function tex(n: Num): string {
  const q = toQ(n);
  if (q.isInteger()) return groupDigits(q.num);
  const body = `\\frac{${Math.abs(q.num)}}{${q.den}}`;
  return q.num < 0 ? `-${body}` : body;
}

/**
 * LaTeX for a sum of terms like 2x - 3y + 5.
 * Zero terms are dropped, a coefficient of 1 or -1 is written as x or -x,
 * and signs are merged so the output never contains "+ -".
 */
export function linear(terms: ReadonlyArray<readonly [Num, string]>, constant: Num = 0): string {
  const parts: Array<{ neg: boolean; body: string }> = [];
  for (const [coef, variable] of terms) {
    const q = toQ(coef);
    if (q.isZero()) continue;
    const a = q.abs();
    const body = a.eq(r(1)) ? variable : `${tex(a)}${variable}`;
    parts.push({ neg: q.sign() < 0, body });
  }
  const k = toQ(constant);
  if (!k.isZero()) parts.push({ neg: k.sign() < 0, body: tex(k.abs()) });
  if (parts.length === 0) return '0';
  return parts
    .map((p, i) => (i === 0 ? (p.neg ? `-${p.body}` : p.body) : `${p.neg ? '-' : '+'} ${p.body}`))
    .join(' ');
}

/** A system of equations as an aligned block: rows are [left side, right side]. */
export function system(rows: ReadonlyArray<readonly [string, string]>): string {
  return `\\begin{aligned} ${rows.map(([lhs, rhs]) => `${lhs} &= ${rhs}`).join(' \\\\ ')} \\end{aligned}`;
}

const LINT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\+\s*-/, 'plus followed by minus'],
  [/-\s*-/, 'double minus'],
  [/\+\s*\+/, 'double plus'],
  [/(^|[=(,]\s*)\+/, 'leading plus'],
  [/(^|[^\d.}{])1[a-z]/, 'coefficient of 1'],
  [/(^|[^\d.}{])0[a-z]/, 'coefficient of 0'],
  [/NaN|undefined|Infinity|null/, 'bad value'],
];

/** Formatting problems in one math string. An empty array means it is clean. */
export function lintMath(latex: string): string[] {
  return LINT_RULES.filter(([re]) => re.test(latex)).map(([, name]) => `${name}: ${latex}`);
}

/**
 * A coefficient times a parenthesised group, written to follow an earlier term:
 * signedGroup(-2, 'x + 1') -> "- 2(x + 1)", signedGroup(1, 'x + 1') -> "+ (x + 1)".
 */
export function signedGroup(coef: Num, inner: string): string {
  const q = toQ(coef);
  if (q.isZero()) throw new RangeError('signedGroup needs a non-zero coefficient');
  const a = q.abs();
  return `${q.sign() < 0 ? '-' : '+'} ${a.eq(r(1)) ? '' : tex(a)}(${inner})`;
}
