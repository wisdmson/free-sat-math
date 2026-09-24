import { describe, expect, it } from 'vitest';
import {
  DOMAINS,
  SKILLS,
  SKILL_IDS,
  isSkillId,
  skillsInDomain,
  testWeight,
} from '../../src/engine/skills';

describe('skills', () => {
  it('has the 19 official skills, once each', () => {
    expect(SKILLS).toHaveLength(19);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(19);
    expect(SKILLS.map((s) => s.id)).toEqual([...SKILL_IDS]);
  });

  it('matches the spec split of 12 generator, 5 mixed, 2 bank', () => {
    const count = (src: string) => SKILLS.filter((s) => s.source === src).length;
    expect([count('generator'), count('mixed'), count('bank')]).toEqual([12, 5, 2]);
  });

  it('has 5 + 3 + 7 + 4 skills per domain', () => {
    expect(DOMAINS.map((d) => skillsInDomain(d.id).length)).toEqual([5, 3, 7, 4]);
  });

  it('test weights sum to 1', () => {
    const total = SKILLS.reduce((sum, s) => sum + testWeight(s.id), 0);
    expect(total).toBeCloseTo(1, 10);
    expect(testWeight('alg.systems')).toBeCloseTo(0.07, 10);
  });

  it('recognises skill ids', () => {
    expect(isSkillId('geo.circles')).toBe(true);
    expect(isSkillId('geo.squares')).toBe(false);
  });
});
