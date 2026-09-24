import { describe, expect, it } from 'vitest';
import { readPracticeParams } from '../../src/components/PracticeSession';

describe('readPracticeParams', () => {
  it('defaults to mixed practice at auto level', () => {
    expect(readPracticeParams('')).toEqual({ skill: 'mix', level: 'auto' });
  });
  it('reads a skill and a level', () => {
    expect(readPracticeParams('?skill=alg.systems&level=hard')).toEqual({
      skill: 'alg.systems',
      level: 'hard',
    });
  });
  it('rejects unknown skills and levels', () => {
    expect(readPracticeParams('?skill=alg.nope')).toBeNull();
    expect(readPracticeParams('?skill=alg.systems&level=extreme')).toBeNull();
  });
});
