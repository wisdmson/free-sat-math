/** A tiny evaluator for mental-math prompts, used only by verify() (shares nothing with generators). */
import { Rational } from '../rational';

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
};
const FROM_SUPERSCRIPT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SUPERSCRIPT).map(([k, v]) => [v, k]),
);

/** An integer exponent as superscript characters: sup(-2) → "⁻²". */
export function sup(n: number): string {
  return [...String(n)].map((c) => SUPERSCRIPT[c] as string).join('');
}

/** base^e for an integer e (negative e gives the reciprocal). */
export function pow(base: Rational, e: number): Rational {
  let out = Rational.of(1);
  for (let i = 0; i < Math.abs(e); i++) out = out.mul(base);
  return e < 0 ? Rational.of(1).div(out) : out;
}

/** Numbers, + − × ÷ · /, parentheses, unary minus and superscript integer exponents. */
export function evalExpr(text: string): Rational {
  const s = text.replace(/−/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  let i = 0;
  const fail = (): never => {
    throw new SyntaxError(`Cannot evaluate "${text}" at ${i}`);
  };
  const atom = (): Rational => {
    if (s[i] === '(') {
      i++;
      const v = expr();
      if (s[i] !== ')') fail();
      i++;
      return v;
    }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (m === null) return fail();
    i += m[0].length;
    return Rational.parse(m[0]);
  };
  const power = (): Rational => {
    const base = atom();
    let digits = '';
    while (i < s.length && FROM_SUPERSCRIPT[s[i] as string] !== undefined) {
      digits += FROM_SUPERSCRIPT[s[i] as string];
      i++;
    }
    return digits === '' ? base : pow(base, Number(digits));
  };
  const unary = (): Rational => {
    if (s[i] === '-') {
      i++;
      return unary().neg();
    }
    return power();
  };
  const term = (): Rational => {
    let v = unary();
    while (s[i] === '*' || s[i] === '/') {
      const op = s[i++];
      const t = unary();
      v = op === '*' ? v.mul(t) : v.div(t);
    }
    return v;
  };
  const expr = (): Rational => {
    let v = term();
    while (s[i] === '+' || s[i] === '-') {
      const op = s[i++];
      const t = term();
      v = op === '+' ? v.add(t) : v.sub(t);
    }
    return v;
  };
  const v = expr();
  if (i !== s.length) fail();
  return v;
}
