import {
  DIFFICULTIES,
  parseProblemId,
  type Difficulty,
  type Format,
  type Problem,
  type ProblemId,
} from './problem';
import { generateVerified } from './build';
import { availableSkills, getProblemType, problemTypesForSkill } from './registry';
import type { Rng } from './rng';
import type { SkillId } from './skills';

/** Starting level from a target score (spec §9.1). */
export function startingLevel(targetScore: number | null): Difficulty {
  if (targetScore === null) return 'medium';
  if (targetScore <= 550) return 'easy';
  if (targetScore <= 680) return 'medium';
  return 'hard';
}

/** Per-skill auto-difficulty state. streak > 0: correct in a row; streak < 0: wrong in a row. */
export interface Stair {
  level: Difficulty;
  streak: number;
}

export const UP_AFTER = 3;
export const DOWN_AFTER = 2;

/** The staircase (spec §9.2): 3 right in a row moves up a level, 2 wrong in a row moves down. */
export function updateStair(state: Stair, correct: boolean): Stair {
  const i = DIFFICULTIES.indexOf(state.level);
  if (correct) {
    const streak = state.streak > 0 ? state.streak + 1 : 1;
    if (streak >= UP_AFTER)
      return { level: DIFFICULTIES[Math.min(i + 1, 2)] as Difficulty, streak: 0 };
    return { level: state.level, streak };
  }
  const streak = state.streak < 0 ? state.streak - 1 : -1;
  if (-streak >= DOWN_AFTER)
    return { level: DIFFICULTIES[Math.max(i - 1, 0)] as Difficulty, streak: 0 };
  return { level: state.level, streak };
}

/** Share of typed-answer problems when a type offers both formats (matches the test's ~25%). */
export const SPR_SHARE = 0.25;
/** Never repeat a problem shown this recently. */
export const RECENT_WINDOW = 10;

function chooseFormat(formats: readonly Format[], rng: Rng): Format {
  if (formats.includes('mcq') && formats.includes('spr'))
    return rng.chance(SPR_SHARE) ? 'spr' : 'mcq';
  return formats[0] as Format;
}

/**
 * The next practice problem for a skill and difficulty, never one of the recent ids.
 * Returns null when the skill has nothing at that difficulty (or generation keeps failing).
 */
export function nextProblem(
  skill: SkillId,
  difficulty: Difficulty,
  rng: Rng,
  recent: readonly ProblemId[],
): Problem | null {
  const types = problemTypesForSkill(skill).filter((t) => t.supports[difficulty].length > 0);
  if (types.length === 0) return null;
  const recentIds = new Set(recent.slice(-RECENT_WINDOW));
  for (let tries = 0; tries < 5; tries++) {
    const type = rng.pick(types);
    const problem = generateVerified(
      type,
      difficulty,
      chooseFormat(type.supports[difficulty], rng),
      rng,
    );
    if (problem !== null && !recentIds.has(problem.id)) return problem;
  }
  return null;
}

/** Same generator type, difficulty and format as a generated problem, with a new seed. */
export function similarProblem(problem: Problem, rng: Rng): Problem | null {
  const ref = parseProblemId(problem.id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  return type ? generateVerified(type, ref.difficulty, ref.format, rng) : null;
}

/** Phase 1 "mix": a random available skill. Phase 4 replaces this with smart-mix weights (spec §9.3). */
export function pickMixSkill(rng: Rng): SkillId | null {
  const skills = availableSkills();
  return skills.length === 0 ? null : rng.pick(skills);
}
