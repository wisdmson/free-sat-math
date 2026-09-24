import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/engine/problem';
import { buildProblem } from '../../src/engine/build';
import { PROBLEM_TYPES } from '../../src/engine/registry';
import { problemIssues } from '../helpers/problem-issues';

const SEEDS = Number(process.env['SOAK_SEEDS'] ?? 5000);

describe.each(PROBLEM_TYPES.map((t) => [t.id, t] as const))('%s', (_id, type) => {
  const variants = DIFFICULTIES.flatMap((d) => type.supports[d].map((f) => [d, f] as const));
  it.each(variants)(`%s %s passes on seeds 1-${SEEDS}`, (difficulty, format) => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS && failures.length < 5; seed++) {
      let problem;
      try {
        problem = buildProblem(type, difficulty, format, seed);
      } catch (err) {
        failures.push(`seed ${seed}: generate threw ${(err as Error).message}`);
        continue;
      }
      if (!type.verify(problem)) failures.push(`seed ${seed}: verify() failed`);
      const issues = problemIssues(problem);
      if (issues.length > 0) failures.push(`seed ${seed}: ${issues.join(' | ')}`);
    }
    expect(failures).toEqual([]);
  });
});
