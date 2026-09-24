import { describe, expect, it } from 'vitest';
import { commas, linear, lintMath, signedGroup, system, tex } from '../../src/engine/format';
import { r } from '../../src/engine/rational';

describe('tex', () => {
  it('formats integers, fractions and signs', () => {
    expect(tex(4)).toBe('4');
    expect(tex(-4)).toBe('-4');
    expect(tex(r(7, 2))).toBe('\\frac{7}{2}');
    expect(tex(r(-7, 2))).toBe('-\\frac{7}{2}');
  });
  it('groups thousands', () => {
    expect(tex(1090)).toBe('1{,}090');
    expect(tex(-1234567)).toBe('-1{,}234{,}567');
    expect(tex(999)).toBe('999');
    expect(commas(1090)).toBe('1,090');
  });
});

describe('linear', () => {
  it('drops zero terms and unit coefficients', () => {
    expect(
      linear([
        [1, 'x'],
        [-1, 'y'],
      ]),
    ).toBe('x - y');
    expect(
      linear(
        [
          [0, 'x'],
          [3, 'y'],
        ],
        -5,
      ),
    ).toBe('3y - 5');
    expect(linear([[-2, 'x']], 0)).toBe('-2x');
    expect(
      linear(
        [
          [2, 'x'],
          [-3, 'y'],
        ],
        4,
      ),
    ).toBe('2x - 3y + 4');
  });
  it('handles fractional coefficients and all-zero input', () => {
    expect(linear([[r(1, 2), 'x']], r(-3, 4))).toBe('\\frac{1}{2}x - \\frac{3}{4}');
    expect(linear([[0, 'x']], 0)).toBe('0');
    expect(linear([], 7)).toBe('7');
  });
});

describe('system', () => {
  it('builds an aligned block', () => {
    expect(
      system([
        ['x + y', '5'],
        ['x - y', '1'],
      ]),
    ).toBe('\\begin{aligned} x + y &= 5 \\\\ x - y &= 1 \\end{aligned}');
  });
});

describe('lintMath', () => {
  it('accepts clean output', () => {
    expect(lintMath('2x - 3y + 4 = 11')).toEqual([]);
    expect(lintMath('\\frac{1}{2}x + 10y = 1{,}090')).toEqual([]);
    expect(lintMath('11x + 21y')).toEqual([]);
  });
  it('flags bad output', () => {
    expect(lintMath('2x + -3')).toHaveLength(1);
    expect(lintMath('x - -3')).toHaveLength(1);
    expect(lintMath('1x + y')).toHaveLength(1);
    expect(lintMath('y = 0x + 2')).toHaveLength(1);
    expect(lintMath('= +4')).toHaveLength(1);
    expect(lintMath('x = NaN')).toHaveLength(1);
  });
});

describe('signedGroup', () => {
  it('writes the sign and drops a unit coefficient', () => {
    expect(signedGroup(-2, 'x + 1')).toBe('- 2(x + 1)');
    expect(signedGroup(3, 'x')).toBe('+ 3(x)');
    expect(signedGroup(1, 'x + 1')).toBe('+ (x + 1)');
    expect(signedGroup(-1, 'x + 1')).toBe('- (x + 1)');
  });
  it('refuses zero', () => {
    expect(() => signedGroup(0, 'x')).toThrow(RangeError);
  });
});
