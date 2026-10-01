import { describe, expect, it } from 'vitest';
import { emptyGame, emptyMental, readProgress, upgradeV1 } from '../../src/store/migrate';
import { PROGRESS_SCHEMA_VERSION, type ProgressV1 } from '../../src/store/schema';

const v1: ProgressV1 = {
  schemaVersion: 1,
  settings: { targetScore: 650, timeMultiplier: 1.5, untimed: false },
  attempts: [
    {
      problemId: 'g:alg.systems.solve-system@1:easy:mcq:7',
      skill: 'alg.systems',
      difficulty: 'easy',
      correct: false,
      response: 'B',
      timeMs: 4100,
      at: '2026-09-20T10:00:00.000Z',
      mode: 'practice',
    },
  ],
  bookmarks: ['g:alg.systems.word-system@1:medium:mcq:3'],
  skillState: { 'alg.systems': { level: 'medium', streak: 2 } },
  testAttempts: [],
  completedFixedTests: [],
};

describe('upgradeV1', () => {
  it('upgrades a v1 record without losing anything', () => {
    const v2 = upgradeV1(v1);
    expect(v2.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(v2.attempts).toEqual(v1.attempts);
    expect(v2.bookmarks).toEqual(v1.bookmarks);
    expect(v2.skillState).toEqual(v1.skillState);
    expect(v2.settings).toEqual({ ...v1.settings, sound: false, haptics: true });
    expect(v2.game).toEqual(emptyGame());
    expect(v2.mental).toEqual(emptyMental());
  });
});

describe('readProgress', () => {
  it('reads current records as they are', () => {
    const v2 = upgradeV1(v1);
    expect(readProgress(JSON.parse(JSON.stringify(v2)))).toEqual({ kind: 'current', progress: v2 });
  });
  it('upgrades valid v1 records', () => {
    const r = readProgress(JSON.parse(JSON.stringify(v1)));
    expect(r.kind).toBe('upgraded');
    if (r.kind === 'upgraded') expect(r.progress.attempts).toHaveLength(1);
  });
  it('reports records from a newer version', () => {
    expect(readProgress({ schemaVersion: PROGRESS_SCHEMA_VERSION + 1 })).toEqual({ kind: 'newer' });
  });
  it('reports anything else as unreadable, with where it failed', () => {
    const r = readProgress({ ...upgradeV1(v1), attempts: [{ problemId: 1 }] });
    expect(r.kind).toBe('unreadable');
    if (r.kind === 'unreadable') expect(r.where).toContain('attempts.0');
    expect(readProgress('nope').kind).toBe('unreadable');
  });
});
