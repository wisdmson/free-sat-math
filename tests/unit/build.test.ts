import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProblem, generateVerified, MAX_TRIES } from '../../src/engine/build';
import type { ProblemType } from '../../src/engine/problem';
import { createRng } from '../../src/engine/rng';

afterEach(() => vi.restoreAllMocks());

const fake: ProblemType = {
  id: 'test.fake',
  version: 3,
  skill: 'alg.systems',
  supports: { easy: ['mcq', 'spr'], medium: ['spr'], hard: [] },
  generate: (rng) => ({
    stem: `n = ${rng.int(1, 1000)}`,
    answer: { kind: 'values', values: ['1'] },
    solution: ['s'],
  }),
  verify: () => true,
};

describe('buildProblem', () => {
  it('fills in id, skill, difficulty, format and source', () => {
    const p = buildProblem(fake, 'easy', 'spr', 42);
    expect(p.id).toBe('g:test.fake@3:easy:spr:42');
    expect([p.skill, p.difficulty, p.format, p.source]).toEqual([
      'alg.systems',
      'easy',
      'spr',
      'generated',
    ]);
  });
  it('is deterministic for a seed', () => {
    expect(buildProblem(fake, 'easy', 'mcq', 7)).toEqual(buildProblem(fake, 'easy', 'mcq', 7));
    expect(buildProblem(fake, 'easy', 'mcq', 7).stem).not.toBe(
      buildProblem(fake, 'easy', 'mcq', 8).stem,
    );
  });
  it('refuses difficulty and format pairs the type does not offer', () => {
    expect(() => buildProblem(fake, 'medium', 'mcq', 1)).toThrow('does not offer medium mcq');
    expect(() => buildProblem(fake, 'hard', 'spr', 1)).toThrow();
  });
});

describe('generateVerified', () => {
  it('skips seeds that fail verify()', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const flaky: ProblemType = { ...fake, verify: () => ++calls > 3 };
    expect(generateVerified(flaky, 'easy', 'mcq', createRng(1))).not.toBeNull();
    expect(calls).toBe(4);
  });
  it('gives up after MAX_TRIES failures', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      generateVerified({ ...fake, verify: () => false }, 'easy', 'mcq', createRng(1)),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(MAX_TRIES);
  });
  it('treats a throwing generator as a failed seed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing: ProblemType = {
      ...fake,
      generate: () => {
        throw new Error('boom');
      },
    };
    expect(generateVerified(throwing, 'easy', 'mcq', createRng(1))).toBeNull();
  });
});
