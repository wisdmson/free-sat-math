import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMental } from '../../src/engine/mental/build';
import { TIERS } from '../../src/engine/mental/ids';
import { DRILLS } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';

const DIR = join(process.cwd(), 'tests', 'golden', 'mental');
const UPDATE = process.env['UPDATE_GOLDEN'] === '1';

interface GoldenFile {
  drill: string;
  version: number;
  problems: Record<string, MentalProblem>;
}

describe.each(DRILLS.map((d) => [d.id, d] as const))('golden %s', (_id, drill) => {
  it('matches its golden file', () => {
    const problems: Record<string, MentalProblem> = {};
    for (const tier of TIERS)
      for (let seed = 1; seed <= 5; seed++)
        problems[`${tier}:${seed}`] = buildMental(drill, tier, seed);
    const current: GoldenFile = JSON.parse(
      JSON.stringify({ drill: drill.id, version: drill.version, problems }),
    );
    const file = join(DIR, `${drill.id}.json`);
    if (UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    if (!existsSync(file))
      throw new Error(`No golden file for ${drill.id}. Run: npm run golden:update`);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
    if (saved.version !== drill.version) {
      throw new Error(
        `${drill.id} is version ${drill.version} but its golden file is ${saved.version}. Run: npm run golden:update`,
      );
    }
    expect(current).toEqual(saved);
  });
});
