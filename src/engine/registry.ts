import { buildProblem } from './build';
import { systemsCount } from './generators/algebra/systems-count';
import { systemsSolve } from './generators/algebra/systems-solve';
import { parseProblemId, type Difficulty, type Problem, type ProblemType } from './problem';
import { SKILL_IDS, type SkillId } from './skills';

/** Every generator the site ships. Add new types here. */
export const PROBLEM_TYPES: readonly ProblemType[] = [systemsSolve, systemsCount];

export function getProblemType(id: string): ProblemType | undefined {
  return PROBLEM_TYPES.find((t) => t.id === id);
}

export function problemTypesForSkill(skill: SkillId): ProblemType[] {
  return PROBLEM_TYPES.filter((t) => t.skill === skill);
}

/** Skills with at least one generator. Phase 4 adds skills that have published bank problems. */
export function availableSkills(): SkillId[] {
  return SKILL_IDS.filter((s) => problemTypesForSkill(s).length > 0);
}

export function isSkillAvailable(skill: SkillId): boolean {
  return problemTypesForSkill(skill).length > 0;
}

/**
 * Rebuilds a generated problem from its id. `updated` is true when the id names an older
 * generator version: the problem is rebuilt with the current version and the same seed.
 */
export function problemFromId(id: string): { problem: Problem; updated: boolean } | null {
  const ref = parseProblemId(id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  if (!type || !type.supports[ref.difficulty].includes(ref.format)) return null;
  try {
    const problem = buildProblem(type, ref.difficulty, ref.format, ref.seed);
    if (!type.verify(problem)) return null;
    return { problem, updated: ref.version !== type.version };
  } catch {
    return null;
  }
}

/** Skill and difficulty for a problem id, without building it. null if the id is unknown. */
export function describeProblemId(id: string): { skill: SkillId; difficulty: Difficulty } | null {
  const ref = parseProblemId(id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  return type ? { skill: type.skill, difficulty: ref.difficulty } : null;
}
