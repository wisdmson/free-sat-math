/** Exact fractions over safe integers. Every result is reduced, with a positive denominator. */

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

function safe(n: number, what: string): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Rational overflow in ${what}: ${n}`);
  return n;
}

const DECIMAL = /^(-?)(\d*)\.?(\d*)$/;
const FRACTION = /^(-?)(\d+)\/(\d+)$/;

export class Rational {
  readonly num: number;
  readonly den: number;

  private constructor(num: number, den: number) {
    this.num = num;
    this.den = den;
  }

  static of(num: number, den = 1): Rational {
    safe(num, 'numerator');
    safe(den, 'denominator');
    if (den === 0) throw new RangeError('Rational with zero denominator');
    if (num === 0) return new Rational(0, 1);
    const g = gcd(num, den);
    const sign = den < 0 ? -1 : 1;
    return new Rational((sign * num) / g, (sign * den) / g);
  }

  /** Parses "7", "-7", "7/2", "-7/2", "0.75", ".75", "-.5" and "3.". Throws on anything else. */
  static parse(text: string): Rational {
    const t = text.trim();
    const f = FRACTION.exec(t);
    if (f) {
      const n = Number(f[2]);
      return Rational.of(f[1] === '-' ? -n : n, Number(f[3]));
    }
    const d = DECIMAL.exec(t);
    if (d && (d[2] !== '' || d[3] !== '')) {
      const whole = d[2] === '' ? '0' : (d[2] as string);
      const frac = d[3] as string;
      const n = Number(whole + frac);
      const q = Rational.of(n, 10 ** frac.length);
      return d[1] === '-' ? q.neg() : q;
    }
    throw new SyntaxError(`Not a number: "${text}"`);
  }

  add(o: Rational): Rational {
    return Rational.of(
      safe(this.num * o.den + o.num * this.den, 'add'),
      safe(this.den * o.den, 'add'),
    );
  }
  sub(o: Rational): Rational {
    return this.add(o.neg());
  }
  mul(o: Rational): Rational {
    return Rational.of(safe(this.num * o.num, 'mul'), safe(this.den * o.den, 'mul'));
  }
  div(o: Rational): Rational {
    if (o.num === 0) throw new RangeError('Division by zero');
    return Rational.of(safe(this.num * o.den, 'div'), safe(this.den * o.num, 'div'));
  }
  neg(): Rational {
    return Rational.of(-this.num, this.den);
  }
  abs(): Rational {
    return Rational.of(Math.abs(this.num), this.den);
  }
  sign(): -1 | 0 | 1 {
    return this.num === 0 ? 0 : this.num > 0 ? 1 : -1;
  }
  cmp(o: Rational): -1 | 0 | 1 {
    return this.sub(o).sign();
  }
  eq(o: Rational): boolean {
    return this.num === o.num && this.den === o.den;
  }
  isZero(): boolean {
    return this.num === 0;
  }
  isInteger(): boolean {
    return this.den === 1;
  }
  /** true when the decimal expansion ends (the denominator has no prime factors besides 2 and 5). */
  isTerminating(): boolean {
    let d = this.den;
    while (d % 2 === 0) d /= 2;
    while (d % 5 === 0) d /= 5;
    return d === 1;
  }
  toNumber(): number {
    return this.num / this.den;
  }
  /** "7/2", "-4", "0". */
  toString(): string {
    return this.den === 1 ? String(this.num) : `${this.num}/${this.den}`;
  }
}

/** Shorthand: r(7, 2) is 7/2; r(3) is 3. */
export const r = (num: number, den = 1): Rational => Rational.of(num, den);
