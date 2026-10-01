/** Builds a ⚡ Lightning round. Quick Play loads this on demand, a few cards before a round is due. */
import type { Progress } from '../../store/schema';
import type { Rng } from '../rng';
import { generateMental } from './build';
import { DRILLS } from './registry';
import type { MentalProblem } from './types';

/** 3 verified questions from one random drill at the student's saved tier (spec §4.4). */
export function lightningRound(
  progress: Progress,
  rng: Rng,
): [MentalProblem, MentalProblem, MentalProblem] | null {
  const drill = rng.pick(DRILLS);
  const tier = progress.mental.tier[drill.id] ?? 1;
  const qs = [0, 1, 2].map(() => generateMental(drill, tier, rng));
  return qs.every((q) => q !== null) ? (qs as [MentalProblem, MentalProblem, MentalProblem]) : null;
}
