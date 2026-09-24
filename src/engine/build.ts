import {
  formatProblemId,
  type Difficulty,
  type Format,
  type Problem,
  type ProblemType,
} from './problem';
import { MAX_SEED, createRng, type Rng } from './rng';

/** Deterministically builds the problem for a type, difficulty, format and seed. */
export function buildProblem(
  type: ProblemType,
  difficulty: Difficulty,
  format: Format,
  seed: number,
): Problem {
  if (!type.supports[difficulty].includes(format)) {
    throw new Error(`${type.id} does not offer ${difficulty} ${format}`);
  }
  const body = type.generate(createRng(seed), difficulty, format);
  return {
    ...body,
    id: formatProblemId({
      kind: 'generated',
      typeId: type.id,
      version: type.version,
      difficulty,
      format,
      seed,
    }),
    skill: type.skill,
    difficulty,
    format,
    source: 'generated',
  };
}

export const MAX_TRIES = 20;

/**
 * A fresh problem that passed its type's verify(). Seeds that throw or fail verification are
 * skipped (and logged). Returns null after MAX_TRIES failures.
 */
export function generateVerified(
  type: ProblemType,
  difficulty: Difficulty,
  format: Format,
  rng: Rng,
): Problem | null {
  for (let i = 0; i < MAX_TRIES; i++) {
    const seed = rng.int(0, MAX_SEED);
    try {
      const problem = buildProblem(type, difficulty, format, seed);
      if (type.verify(problem)) return problem;
      console.warn(`[generator] verify() rejected ${problem.id}`);
    } catch (err) {
      console.warn(`[generator] ${type.id} failed on seed ${seed}`, err);
    }
  }
  return null;
}
