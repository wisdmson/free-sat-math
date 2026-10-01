import { describe, expect, it } from 'vitest';
import { buildMental } from '../../src/engine/mental/build';
import { TIERS } from '../../src/engine/mental/ids';
import { DRILLS, getDrill } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';
import { Rational } from '../../src/engine/rational';

function tampered(p: MentalProblem): MentalProblem {
  if (p.answer.kind === 'choice') {
    return { ...p, answer: { ...p.answer, index: ((p.answer.index + 1) % 4) as 0 | 1 | 2 | 3 } };
  }
  return {
    ...p,
    answer: { ...p.answer, value: Rational.parse(p.answer.value).add(Rational.of(1)).toString() },
  };
}

describe.each(DRILLS.map((d) => [d.id, d] as const))('%s', (_id, drill) => {
  it.each(TIERS)('tier %s: verify() accepts 300 seeds and rejects a tampered answer', (tier) => {
    for (let seed = 1; seed <= 300; seed++) {
      const p = buildMental(drill, tier, seed);
      expect(drill.verify(p), p.id).toBe(true);
      expect(drill.verify(tampered(p)), `${p.id} tampered`).toBe(false);
    }
  });
});

const prompts = (id: string, tier: 1 | 2 | 3, n = 60) =>
  Array.from({ length: n }, (_, i) => buildMental(getDrill(id)!, tier, i + 1).prompt);

describe('drill content', () => {
  it('arithmetic moves from + − × to ÷ to order of operations with negatives', () => {
    expect(prompts('mm.arithmetic', 1).every((t) => /^\d+ [+−×] \d+$/.test(t))).toBe(true);
    expect(prompts('mm.arithmetic', 2).some((t) => t.includes('÷'))).toBe(true);
    expect(prompts('mm.arithmetic', 3).every((t) => t.includes('−'))).toBe(true);
  });
  it('fractions, decimals and percents ask for repeating decimals as a choice', () => {
    const t2 = Array.from({ length: 60 }, (_, i) => buildMental(getDrill('mm.fdp')!, 2, i + 1));
    expect(
      t2.some((p) => p.answer.kind === 'choice' && p.answer.choices.some((c) => c.endsWith('…'))),
    ).toBe(true);
    expect(prompts('mm.fdp', 3).some((t) => /% as a fraction$/.test(t))).toBe(true);
  });
  it('percents cover "of", "what percent" and increases and decreases', () => {
    expect(prompts('mm.percent', 1).every((t) => /^\d+% of \d+$/.test(t))).toBe(true);
    expect(prompts('mm.percent', 2).some((t) => t.includes('what percent'))).toBe(true);
    expect(prompts('mm.percent', 3).some((t) => t.includes('then decreased'))).toBe(true);
  });
});
