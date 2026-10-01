import { describe, expect, it } from 'vitest';
import { evalExpr, sup } from '../../src/engine/mental/expr';
import { r } from '../../src/engine/rational';

describe('evalExpr', () => {
  it.each([
    ['47 + 38', r(85)],
    ['7 − 3 × (−2)', r(13)],
    ['(12 − 5) × (−3)', r(-21)],
    ['144 ÷ 12', r(12)],
    ['2⁵ · 2³', r(256)],
    ['(2³)²', r(64)],
    ['4⁻¹', r(1, 4)],
    ['(1/2)⁻²', r(4)],
    ['52² − 48²', r(400)],
    ['7⁰', r(1)],
  ])('%s', (text, value) => {
    expect(evalExpr(text).eq(value)).toBe(true);
  });
  it('throws on text it cannot read', () => {
    expect(() => evalExpr('2 +')).toThrow();
    expect(() => evalExpr('x²')).toThrow();
  });
});

describe('sup', () => {
  it('writes integer exponents as superscripts', () => {
    expect(sup(10)).toBe('¹⁰');
    expect(sup(-2)).toBe('⁻²');
  });
});
