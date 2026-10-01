import { describe, expect, it } from 'vitest';
import { buildMental } from '../../src/engine/mental/build';
import { TIERS } from '../../src/engine/mental/ids';
import { DRILLS } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';
import { Rational } from '../../src/engine/rational';

const SEEDS = Number(process.env['SOAK_SEEDS'] ?? 5000);

function issues(p: MentalProblem): string[] {
  const out: string[] = [];
  if (p.prompt.trim() === '' || /NaN|undefined|Infinity/.test(p.prompt))
    out.push(`bad prompt "${p.prompt}"`);
  if (p.answer.kind === 'number') {
    const typed =
      p.answer.form === 'decimal'
        ? String(Rational.parse(p.answer.value).toNumber())
        : p.answer.value;
    if (typed.length > 8) out.push(`answer too long to type: ${typed}`);
  } else if (new Set(p.answer.choices).size !== 4) {
    out.push(`duplicate choices ${p.answer.choices.join(' | ')}`);
  }
  return out;
}

describe.each(DRILLS.map((d) => [d.id, d] as const))('%s', (_id, drill) => {
  it.each(TIERS)(`tier %s passes on seeds 1-${SEEDS}`, (tier) => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS && failures.length < 5; seed++) {
      let p: MentalProblem;
      try {
        p = buildMental(drill, tier, seed);
      } catch (err) {
        failures.push(`seed ${seed}: generate threw ${(err as Error).message}`);
        continue;
      }
      if (!drill.verify(p)) failures.push(`seed ${seed}: verify() failed for "${p.prompt}"`);
      const found = issues(p);
      if (found.length > 0) failures.push(`seed ${seed}: ${found.join(' | ')}`);
    }
    expect(failures).toEqual([]);
  });
});
