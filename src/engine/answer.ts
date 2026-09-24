import { Rational } from './rational';

export type SprAnswer =
  | { kind: 'values'; values: string[] }
  | { kind: 'interval'; min: string; max: string; minInclusive: boolean; maxInclusive: boolean };

export type Grade = { status: 'invalid'; reason: string } | { status: 'checked'; correct: boolean };

export const SPR_HINT = 'Enter numbers only, e.g. 3.5 or 7/2';
const SPR_SHAPE = /^-?(?:\d+\/\d+|\d+\.?\d*|\.\d+)$/;

/** 5 characters for a positive answer, 6 when it starts with a minus sign. */
export function sprMaxLength(input: string): number {
  return input.startsWith('-') ? 6 : 5;
}

/** Cleans text as it is typed: only digits, ".", "/", a leading "-", and the length cap. */
export function sanitizeSprTyping(raw: string): string {
  const neg = raw.trimStart().startsWith('-');
  const body = raw.replace(/[^0-9./]/g, '');
  const out = (neg ? '-' : '') + body;
  return out.slice(0, sprMaxLength(out));
}

/** The exact value of a typed answer, or null when it breaks the entry rules. */
export function parseSpr(input: string): Rational | null {
  const t = input.trim();
  if (t.length === 0 || t.length > sprMaxLength(t) || !SPR_SHAPE.test(t)) return null;
  try {
    return Rational.parse(t);
  } catch {
    return null;
  }
}

/**
 * Decimal entries accepted for a non-terminating value: the value truncated or rounded
 * so that it fills the whole character limit, with or without a leading zero.
 * 2/3 -> [".6666", ".6667", "0.666", "0.667"].
 */
export function acceptedDecimals(value: Rational): string[] {
  const neg = value.sign() < 0;
  const maxLen = neg ? 6 : 5;
  const num = BigInt(Math.abs(value.num));
  const den = BigInt(value.den);
  const whole = num / den;
  const wholeForms = whole === 0n ? ['', '0'] : [whole.toString()];
  const out = new Set<string>();
  for (const w of wholeForms) {
    const digits = maxLen - (neg ? 1 : 0) - w.length - 1;
    if (digits < 1) continue;
    const scale = 10n ** BigInt(digits);
    const truncated = (num * scale) / den;
    const rounded = (num * scale * 2n + den) / (2n * den);
    for (const scaled of [truncated, rounded]) {
      const intPart = scaled / scale;
      const frac = (scaled % scale).toString().padStart(digits, '0');
      const intText = intPart === 0n ? w : intPart.toString();
      const s = `${neg ? '-' : ''}${intText}.${frac}`;
      if (s.length <= maxLen) out.add(s);
    }
  }
  return [...out];
}

/** Can a student type this value within the entry rules (as a fraction, integer or decimal)? */
export function isEnterable(value: Rational): boolean {
  const asFraction = value.toString();
  if (asFraction.length <= sprMaxLength(asFraction)) return true;
  if (value.isTerminating()) {
    const dec = value.toNumber().toString();
    const short = dec.replace(/^(-?)0\./, '$1.');
    return short.length <= sprMaxLength(short);
  }
  return acceptedDecimals(value).length > 0;
}

export function checkSpr(answer: SprAnswer, input: string): Grade {
  const value = parseSpr(input);
  if (value === null) return { status: 'invalid', reason: SPR_HINT };
  const typed = input.trim();
  if (answer.kind === 'interval') {
    const lo = Rational.parse(answer.min);
    const hi = Rational.parse(answer.max);
    const aboveLo = answer.minInclusive ? value.cmp(lo) >= 0 : value.cmp(lo) > 0;
    const belowHi = answer.maxInclusive ? value.cmp(hi) <= 0 : value.cmp(hi) < 0;
    return { status: 'checked', correct: aboveLo && belowHi };
  }
  for (const text of answer.values) {
    const accepted = Rational.parse(text);
    if (value.eq(accepted)) return { status: 'checked', correct: true };
    if (
      typed.includes('.') &&
      !accepted.isTerminating() &&
      acceptedDecimals(accepted).includes(typed)
    ) {
      return { status: 'checked', correct: true };
    }
  }
  return { status: 'checked', correct: false };
}
