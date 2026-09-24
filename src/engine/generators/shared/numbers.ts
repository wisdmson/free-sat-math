import type { Rng } from '../../rng';

/** A random integer in [lo, hi] that is not 0. */
export function nonZeroInt(rng: Rng, lo: number, hi: number): number {
  const options: number[] = [];
  for (let v = lo; v <= hi; v++) if (v !== 0) options.push(v);
  return rng.pick(options);
}
