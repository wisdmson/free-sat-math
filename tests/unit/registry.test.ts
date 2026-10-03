import { describe, expect, it } from 'vitest';
import {
  PROBLEM_TYPES,
  availableSkills,
  describeProblemId,
  getProblemType,
  isSkillAvailable,
  problemFromId,
  problemTypesForSkill,
} from '../../src/engine/registry';
import { SKILL_IDS } from '../../src/engine/skills';

describe('registry', () => {
  it('has unique type ids', () => {
    expect(new Set(PROBLEM_TYPES.map((t) => t.id)).size).toBe(PROBLEM_TYPES.length);
  });

  it('finds types by id and skill', () => {
    expect(getProblemType('alg.systems.solve-system')?.skill).toBe('alg.systems');
    expect(getProblemType('nope')).toBeUndefined();
    expect(problemTypesForSkill('alg.systems').length).toBeGreaterThan(0);
    expect(getProblemType('geo.circles.circle-equation')?.skill).toBe('geo.circles');
  });

  it('has practice for every official SAT Math skill', () => {
    expect(availableSkills()).toEqual(SKILL_IDS);
    for (const skill of SKILL_IDS) expect(isSkillAvailable(skill), skill).toBe(true);
  });

  it('rebuilds problems from ids and flags old versions', () => {
    const current = problemFromId('g:alg.systems.solve-system@1:easy:spr:5');
    expect(current?.updated).toBe(false);
    const old = problemFromId('g:alg.systems.solve-system@0:easy:spr:5');
    expect(old?.updated).toBe(true);
    expect(old?.problem).toEqual(current?.problem);
  });

  it('returns null for ids it cannot rebuild', () => {
    expect(problemFromId('g:no.such.type@1:easy:spr:5')).toBeNull();
    expect(problemFromId('b:psda.claims-001')).toBeNull();
    expect(problemFromId('garbage')).toBeNull();
  });

  it('describes an id without building it', () => {
    expect(describeProblemId('g:alg.systems.solve-system@1:hard:spr:9')).toEqual({
      skill: 'alg.systems',
      difficulty: 'hard',
    });
    expect(describeProblemId('g:gone.type@1:hard:spr:9')).toBeNull();
    expect(describeProblemId('b:anything')).toBeNull();
  });
});
