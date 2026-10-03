import { describe, expect, it } from 'vitest';
import {
  ANSWERS_PER_DAY,
  addAnswerDay,
  comboMultiplier,
  currentStreak,
  dayKey,
  LIGHTNING_POINTS,
  PACE_BONUS,
  formatDuration,
  levelInfo,
  paceBonus,
  paceLimitMs,
  lightningSeconds,
  pointsForLevel,
  scoreLightningAnswer,
  scoreSatAnswer,
} from '../../src/engine/game';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const counted = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, ANSWERS_PER_DAY]));

describe('combos and points', () => {
  it('multiplies by 1, 2, 3 and 5 as the combo grows', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 25].map(comboMultiplier)).toEqual([1, 1, 1, 2, 2, 3, 3, 5, 5]);
  });
  it('awards base points times the multiplier for the new combo', () => {
    expect(scoreSatAnswer(0, true, 'easy')).toEqual({ combo: 1, points: 10, multiplier: 1 });
    expect(scoreSatAnswer(2, true, 'medium')).toEqual({ combo: 3, points: 40, multiplier: 2 });
    expect(scoreSatAnswer(9, true, 'hard')).toEqual({ combo: 10, points: 150, multiplier: 5 });
  });
  it('resets the combo and awards nothing for a wrong answer', () => {
    expect(scoreSatAnswer(7, false, 'hard')).toEqual({ combo: 0, points: 0, multiplier: 1 });
  });
});

describe('levels', () => {
  it('needs 100, 300, 600 running points for levels 2, 3, 4', () => {
    expect([1, 2, 3, 4].map(pointsForLevel)).toEqual([0, 100, 300, 600]);
  });
  it('reports the level and progress into it', () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelInfo(99)).toEqual({ level: 1, into: 99, needed: 100 });
    expect(levelInfo(100)).toEqual({ level: 2, into: 0, needed: 200 });
    expect(levelInfo(450)).toEqual({ level: 3, into: 150, needed: 300 });
  });
});

describe('days and streaks', () => {
  it('uses the local calendar date', () => {
    expect(dayKey(at(2026, 3, 8, 9))).toBe('2026-03-08');
  });
  it('answers on either side of midnight land on different days', () => {
    let days = addAnswerDay({}, at(2026, 10, 1, 23, 59));
    days = addAnswerDay(days, at(2026, 10, 2, 0, 1));
    expect(days).toEqual({ '2026-10-01': 1, '2026-10-02': 1 });
  });
  it('drops days older than the retention window', () => {
    const days = addAnswerDay({ '2024-01-01': 5, '2026-09-30': 2 }, at(2026, 10, 1));
    expect(days).toEqual({ '2026-09-30': 2, '2026-10-01': 1 });
  });
  it('counts a streak ending today', () => {
    expect(currentStreak(counted('2026-09-29', '2026-09-30', '2026-10-01'), at(2026, 10, 1))).toBe(
      3,
    );
  });
  it('keeps yesterday’s streak alive before today’s answers are in', () => {
    const days = { ...counted('2026-09-29', '2026-09-30'), '2026-10-01': 2 };
    expect(currentStreak(days, at(2026, 10, 1, 8))).toBe(2);
  });
  it('resets after a missed day', () => {
    expect(currentStreak(counted('2026-09-28', '2026-09-29'), at(2026, 10, 1))).toBe(0);
  });
  it('steps across daylight-saving changes by calendar day', () => {
    expect(
      currentStreak(counted('2026-03-07', '2026-03-08', '2026-03-09'), at(2026, 3, 9, 1)),
    ).toBe(3);
  });
});
describe('Lightning', () => {
  it('scores 5 per right answer times the combo multiplier', () => {
    expect(scoreLightningAnswer(0, true)).toEqual({
      combo: 1,
      points: LIGHTNING_POINTS,
      multiplier: 1,
    });
    expect(scoreLightningAnswer(5, true)).toEqual({ combo: 6, points: 15, multiplier: 3 });
    expect(scoreLightningAnswer(4, false)).toEqual({ combo: 0, points: 0, multiplier: 1 });
  });
  it('Lightning time follows extended time and untimed', () => {
    expect(lightningSeconds({ timeMultiplier: 1, untimed: false })).toBe(10);
    expect(lightningSeconds({ timeMultiplier: 1.5, untimed: false })).toBe(15);
    expect(lightningSeconds({ timeMultiplier: 2, untimed: false })).toBe(20);
    expect(lightningSeconds({ timeMultiplier: 2, untimed: true })).toBeNull();
  });
});

describe('pace checks', () => {
  it('give 95 s, scaled by extended time, and none when untimed', () => {
    expect(paceLimitMs({ timeMultiplier: 1, untimed: false })).toBe(95_000);
    expect(paceLimitMs({ timeMultiplier: 1.5, untimed: false })).toBe(142_500);
    expect(paceLimitMs({ timeMultiplier: 2, untimed: true })).toBeNull();
  });
  it('add a 10-point bonus for a right answer within the limit', () => {
    expect(paceBonus(true, 95_000, 95_000)).toBe(PACE_BONUS);
    expect(paceBonus(true, 95_001, 95_000)).toBe(0);
    expect(paceBonus(false, 1_000, 95_000)).toBe(0);
  });
  it('formats durations the way the card shows them', () => {
    expect(formatDuration(48_400)).toBe('48 s');
    expect(formatDuration(59_600)).toBe('1:00');
    expect(formatDuration(130_000)).toBe('2:10');
  });
});
