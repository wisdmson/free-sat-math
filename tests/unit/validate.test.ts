import { describe, expect, it } from 'vitest';
import { emptyProgress } from '../../src/store/progress';
import { Invalid, parseProgress, parseProgressV1, tryParse } from '../../src/store/validate';

const valid = () => JSON.parse(JSON.stringify(emptyProgress()));
const attempt = {
  problemId: 'g:alg.systems.solve-system@1:easy:mcq:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  correct: true,
  response: 'A',
  timeMs: 900,
  at: '2026-10-01T00:00:00.000Z',
  mode: 'play',
};
const failsAt = (data: unknown) => {
  const r = tryParse(parseProgress, data);
  return r.ok ? null : r.path;
};

describe('parseProgress', () => {
  it('accepts an empty record and a full one', () => {
    expect(parseProgress(valid())).toEqual(emptyProgress());
    const full = valid();
    full.attempts = [{ ...attempt, guessed: true }];
    full.bookmarks = ['x'];
    full.skillState = { 'alg.systems': { level: 'hard', streak: -1 } };
    full.settings.targetScore = 650;
    full.game.answerDays = { '2026-10-01': 5 };
    full.mental = {
      tier: { 'mm.percent': 3 },
      best: { 'mm.percent': 14 },
      sessions: [
        {
          drill: 'mm.percent',
          at: '2026-10-01T00:00:00.000Z',
          correct: 14,
          attempted: 16,
          medianMs: 2300,
        },
      ],
    };
    expect(parseProgress(full)).toEqual(full);
  });
  it('drops keys it does not know, like zod did', () => {
    const data = { ...valid(), extra: 1, settings: { ...valid().settings, junk: true } };
    expect(parseProgress(data)).toEqual(emptyProgress());
  });
  it('reports where a record is wrong', () => {
    const at = (patch: (d: ReturnType<typeof valid>) => void) => {
      const d = valid();
      patch(d);
      return failsAt(d);
    };
    expect(at((d) => (d.schemaVersion = 1))).toBe('schemaVersion');
    expect(at((d) => (d.attempts = [{ ...attempt, timeMs: -1 }]))).toBe('attempts.0.timeMs');
    expect(at((d) => (d.attempts = [{ ...attempt, mode: 'quiz' }]))).toBe('attempts.0.mode');
    expect(at((d) => (d.attempts = [{ ...attempt, guessed: 'yes' }]))).toBe('attempts.0.guessed');
    expect(at((d) => (d.skillState = { 'not.a.skill': { level: 'easy', streak: 0 } }))).toBe(
      'skillState.not.a.skill',
    );
    expect(at((d) => (d.settings.targetScore = 150))).toBe('settings.targetScore');
    expect(at((d) => (d.settings.timeMultiplier = 3))).toBe('settings.timeMultiplier');
    expect(at((d) => (d.game.answerDays = { yesterday: 3 }))).toBe('game.answerDays.yesterday');
    expect(at((d) => (d.mental.tier = { 'mm.percent': 4 }))).toBe('mental.tier.mm.percent');
    expect(at((d) => (d.completedFixedTests = [5]))).toBe('completedFixedTests.0');
    expect(failsAt('nope')).toBe('');
  });
});

describe('parseProgressV1', () => {
  it('accepts a v1 record and rejects v2-only fields being required', () => {
    const v1 = {
      schemaVersion: 1,
      settings: { targetScore: null, timeMultiplier: 1, untimed: false },
      attempts: [{ ...attempt, mode: 'practice' }],
      bookmarks: [],
      skillState: {},
      testAttempts: [],
      completedFixedTests: [],
    };
    expect(parseProgressV1(v1).attempts).toHaveLength(1);
    expect(() => parseProgressV1({ ...v1, attempts: [{ ...attempt, mode: 'play' }] })).toThrow(
      Invalid,
    );
  });
});
