import { describe, expect, it } from 'vitest';
import { Rational, r } from '../../src/engine/rational';

describe('Rational', () => {
  it('normalises sign and reduces', () => {
    expect(r(6, 8).toString()).toBe('3/4');
    expect(r(3, -6).toString()).toBe('-1/2');
    expect(r(-4, -2).toString()).toBe('2');
    expect(r(0, -5).toString()).toBe('0');
  });

  it('does arithmetic exactly', () => {
    expect(r(1, 3).add(r(1, 6)).toString()).toBe('1/2');
    expect(r(1, 3).sub(r(1, 2)).toString()).toBe('-1/6');
    expect(r(2, 3).mul(r(9, 4)).toString()).toBe('3/2');
    expect(r(2, 3).div(r(4, 9)).toString()).toBe('3/2');
    expect(r(-5, 7).neg().toString()).toBe('5/7');
    expect(r(-5, 7).abs().toString()).toBe('5/7');
  });

  it('compares', () => {
    expect(r(1, 3).cmp(r(1, 2))).toBe(-1);
    expect(r(2, 4).cmp(r(1, 2))).toBe(0);
    expect(r(2, 4).eq(r(1, 2))).toBe(true);
    expect(r(-1).sign()).toBe(-1);
  });

  it('knows which decimals terminate', () => {
    expect(r(3, 4).isTerminating()).toBe(true);
    expect(r(7, 40).isTerminating()).toBe(true);
    expect(r(2, 3).isTerminating()).toBe(false);
    expect(r(1, 7).isTerminating()).toBe(false);
  });

  it('parses integers, fractions and decimals', () => {
    expect(Rational.parse('7').toString()).toBe('7');
    expect(Rational.parse('-7/2').toString()).toBe('-7/2');
    expect(Rational.parse('6/8').toString()).toBe('3/4');
    expect(Rational.parse('0.75').toString()).toBe('3/4');
    expect(Rational.parse('.75').toString()).toBe('3/4');
    expect(Rational.parse('-.5').toString()).toBe('-1/2');
    expect(Rational.parse('3.').toString()).toBe('3');
  });

  it('rejects bad input', () => {
    for (const bad of ['', '.', '-', '1/0', 'abc', '1,000', '3 1/2', '--2', '1/-2']) {
      expect(() => Rational.parse(bad), bad).toThrow();
    }
  });

  it('refuses a zero denominator and division by zero', () => {
    expect(() => r(1, 0)).toThrow(RangeError);
    expect(() => r(1).div(r(0))).toThrow(RangeError);
  });

  it('throws instead of silently losing precision', () => {
    expect(() => r(2 ** 40).mul(r(2 ** 40))).toThrow(RangeError);
  });
});
