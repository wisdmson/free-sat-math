import { describe, expect, it } from 'vitest';
import {
  eqFromMeta,
  eqTex,
  eqToMeta,
  lin,
  scaleEq,
  solve2,
} from '../../src/engine/generators/shared/linear2';
import { r } from '../../src/engine/rational';

describe('solve2', () => {
  it('solves a system with one solution', () => {
    const sol = solve2(lin(2, 3, 12), lin(1, -1, 1));
    expect(sol.kind).toBe('one');
    if (sol.kind === 'one') {
      expect(sol.x.toString()).toBe('3');
      expect(sol.y.toString()).toBe('2');
    }
  });
  it('handles fractional solutions', () => {
    const sol = solve2(lin(2, 0, 1), lin(0, 3, 1));
    expect(sol).toEqual({ kind: 'one', x: r(1, 2), y: r(1, 3) });
  });
  it('detects parallel lines', () => {
    expect(solve2(lin(1, 2, 3), lin(2, 4, 7)).kind).toBe('none');
  });
  it('detects the same line', () => {
    expect(solve2(lin(1, 2, 3), lin(-2, -4, -6)).kind).toBe('infinite');
  });
});

describe('equation helpers', () => {
  it('round-trips meta', () => {
    const e = lin(r(1, 2), -3, 4);
    expect(eqFromMeta(eqToMeta(e))).toEqual(e);
    expect(() => eqFromMeta(['1', '2'])).toThrow(TypeError);
  });
  it('formats and scales', () => {
    expect(eqTex(lin(1, -1, 5))).toBe('x - y = 5');
    expect(eqTex(scaleEq(lin(1, -1, 5), -2))).toBe('-2x + 2y = -10');
  });
});
