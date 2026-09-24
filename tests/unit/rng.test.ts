import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.int(0, 1000));
    const seqB = Array.from({ length: 5 }, () => b.int(0, 1000));
    expect(seqA).toEqual(seqB);
  });

  it('is pinned to known values so cross-engine drift is caught', () => {
    const rng = createRng(1);
    expect(Array.from({ length: 5 }, () => rng.int(0, 999))).toEqual(PINNED_SEED_1);
  });

  it('gives different sequences for different seeds', () => {
    const a = Array.from(
      { length: 5 },
      (
        (g) => () =>
          g.int(0, 1e6)
      )(createRng(1)),
    );
    const b = Array.from(
      { length: 5 },
      (
        (g) => () =>
          g.int(0, 1e6)
      )(createRng(2)),
    );
    expect(a).not.toEqual(b);
  });

  it('int() stays in range and hits every value', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('next() is in [0, 1)', () => {
    const rng = createRng(9);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffle() returns a permutation and leaves the input alone', () => {
    const rng = createRng(3);
    const input = [1, 2, 3, 4, 5, 6];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('chance(0) is never true and chance(1) is always true', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('rejects seeds that are not uint32', () => {
    expect(() => createRng(-1)).toThrow(RangeError);
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => createRng(2 ** 32)).toThrow(RangeError);
  });

  it('pick() rejects an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });
});

const PINNED_SEED_1 = [425, 790, 691, 524, 965];
