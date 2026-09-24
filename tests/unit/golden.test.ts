import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, type Problem } from '../../src/engine/problem';
import { buildProblem } from '../../src/engine/build';
import { PROBLEM_TYPES } from '../../src/engine/registry';

const DIR = join(process.cwd(), 'tests', 'golden');
const UPDATE = process.env['UPDATE_GOLDEN'] === '1';

interface GoldenFile {
  typeId: string;
  version: number;
  problems: Record<string, Problem>;
}

describe.each(PROBLEM_TYPES.map((t) => [t.id, t] as const))('golden %s', (_id, type) => {
  it('matches its golden file', () => {
    const problems: Record<string, Problem> = {};
    for (const d of DIFFICULTIES) {
      for (const f of type.supports[d]) {
        for (let seed = 1; seed <= 5; seed++)
          problems[`${d}:${f}:${seed}`] = buildProblem(type, d, f, seed);
      }
    }
    const current: GoldenFile = JSON.parse(
      JSON.stringify({ typeId: type.id, version: type.version, problems }),
    );
    const file = join(DIR, `${type.id}.json`);

    if (UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    if (!existsSync(file))
      throw new Error(`No golden file for ${type.id}. Run: npm run golden:update`);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
    if (saved.version !== type.version) {
      throw new Error(
        `${type.id} is version ${type.version} but its golden file is version ${saved.version}. Run: npm run golden:update`,
      );
    }
    expect(
      current.problems,
      `${type.id} output changed but its version did not. Bump the version, then run: npm run golden:update`,
    ).toEqual(saved.problems);
  });
});
