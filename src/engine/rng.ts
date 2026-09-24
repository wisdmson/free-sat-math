/**
 * Seeded pseudo-random numbers (sfc32, seeded through splitmix32).
 * Integer-only arithmetic, so a seed produces the same sequence in every JS engine.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** A new array holding the items in random order. */
  shuffle<T>(items: readonly T[]): T[];
  /** true with probability p. */
  chance(p: number): boolean;
}

export const MAX_SEED = 0xffffffff;

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new RangeError(`seed must be an integer in [0, ${MAX_SEED}], got ${seed}`);
  }
  const init = splitmix32(seed);
  let a = init();
  let b = init();
  let c = init();
  let d = init();
  const nextU32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) nextU32();

  const next = (): number => nextU32() / 4294967296;
  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${min}, ${max}) needs integers with min <= max`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('pick() needs a non-empty array');
    return items[int(0, items.length - 1)] as T;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  const chance = (p: number): boolean => next() < p;
  return { next, int, pick, shuffle, chance };
}

/** A fresh random seed from the platform's crypto source. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}
