import { describe, expect, it } from 'vitest';
import {
  nextProblem,
  pickMixSkill,
  similarProblem,
  startingLevel,
  updateStair,
  type Stair,
} from '../../src/engine/practice';
import { parseProblemId } from '../../src/engine/problem';
import { createRng } from '../../src/engine/rng';
import { SKILL_IDS } from '../../src/engine/skills';

describe('startingLevel', () => {
  it('maps target scores to levels at the spec boundaries', () => {
    expect(startingLevel(null)).toBe('medium');
    expect(startingLevel(400)).toBe('easy');
    expect(startingLevel(550)).toBe('easy');
    expect(startingLevel(560)).toBe('medium');
    expect(startingLevel(680)).toBe('medium');
    expect(startingLevel(690)).toBe('hard');
  });
});

describe('updateStair', () => {
  const run = (start: Stair, answers: boolean[]) => answers.reduce(updateStair, start);
  it('moves up after 3 correct in a row', () => {
    expect(run({ level: 'easy', streak: 0 }, [true, true])).toEqual({ level: 'easy', streak: 2 });
    expect(run({ level: 'easy', streak: 0 }, [true, true, true])).toEqual({
      level: 'medium',
      streak: 0,
    });
  });
  it('moves down after 2 wrong in a row', () => {
    expect(run({ level: 'hard', streak: 0 }, [false])).toEqual({ level: 'hard', streak: -1 });
    expect(run({ level: 'hard', streak: 0 }, [false, false])).toEqual({
      level: 'medium',
      streak: 0,
    });
  });
  it('resets the streak when the answer flips', () => {
    expect(run({ level: 'medium', streak: 0 }, [true, true, false])).toEqual({
      level: 'medium',
      streak: -1,
    });
    expect(run({ level: 'medium', streak: 0 }, [false, true])).toEqual({
      level: 'medium',
      streak: 1,
    });
  });
  it('stays within easy and hard', () => {
    expect(run({ level: 'hard', streak: 0 }, [true, true, true])).toEqual({
      level: 'hard',
      streak: 0,
    });
    expect(run({ level: 'easy', streak: 0 }, [false, false])).toEqual({ level: 'easy', streak: 0 });
  });
});

describe('nextProblem', () => {
  it('returns a problem for the requested skill and difficulty', () => {
    const p = nextProblem('alg.systems', 'hard', createRng(1), []);
    expect(p?.skill).toBe('alg.systems');
    expect(p?.difficulty).toBe('hard');
  });
  it('returns a generated problem for each newly enabled skill', () => {
    const p = nextProblem('geo.circles', 'easy', createRng(1), []);
    expect(p?.skill).toBe('geo.circles');
    expect(p?.source).toBe('generated');
  });
  it('never returns a recently shown problem', () => {
    const first = nextProblem('alg.systems', 'easy', createRng(5), [])!;
    const again = nextProblem('alg.systems', 'easy', createRng(5), [first.id])!;
    expect(again.id).not.toBe(first.id);
  });
  it('mixes in typed answers at roughly the target share', () => {
    const rng = createRng(11);
    let spr = 0;
    for (let i = 0; i < 400; i++)
      if (nextProblem('alg.systems', 'medium', rng, [])?.format === 'spr') spr++;
    expect(spr / 400).toBeGreaterThan(0.1);
    expect(spr / 400).toBeLessThan(0.35);
  });
});

describe('similarProblem and pickMixSkill', () => {
  it('keeps the type, difficulty and format but changes the seed', () => {
    const p = nextProblem('alg.systems', 'medium', createRng(2), [])!;
    const s = similarProblem(p, createRng(3))!;
    const [a, b] = [parseProblemId(p.id), parseProblemId(s.id)];
    expect(a?.kind === 'generated' && b?.kind === 'generated').toBe(true);
    if (a?.kind === 'generated' && b?.kind === 'generated') {
      expect([b.typeId, b.difficulty, b.format]).toEqual([a.typeId, a.difficulty, a.format]);
      expect(b.seed).not.toBe(a.seed);
    }
  });
  it('picks an available skill for mix', () => {
    expect(SKILL_IDS).toContain(pickMixSkill(createRng(1)));
  });
});
