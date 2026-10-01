/** Quick Play's game rules (spec §3). Pure functions; every number here is tunable. */
import type { Difficulty } from './problem';

export const BASE_POINTS: Readonly<Record<Difficulty, number>> = { easy: 10, medium: 20, hard: 30 };
/** Answers in one local day that keep the streak going. */
export const ANSWERS_PER_DAY = 5;
/** Days of answer counts kept in saved progress. */
export const DAYS_KEPT = 400;

/** ×1 below 3 correct in a row, ×2 for 3–5, ×3 for 6–9, ×5 from 10. */
export function comboMultiplier(combo: number): number {
  if (combo >= 10) return 5;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

/** Scores one SAT answer. `combo` is the run of correct answers before this one. */
export function scoreSatAnswer(
  combo: number,
  correct: boolean,
  difficulty: Difficulty,
): { combo: number; points: number; multiplier: number } {
  if (!correct) return { combo: 0, points: 0, multiplier: 1 };
  const next = combo + 1;
  const multiplier = comboMultiplier(next);
  return { combo: next, points: BASE_POINTS[difficulty] * multiplier, multiplier };
}

/** Running points needed to reach `level`; level 1 starts at 0. */
export function pointsForLevel(level: number): number {
  return (100 * (level - 1) * level) / 2;
}

export function levelInfo(points: number): { level: number; into: number; needed: number } {
  let level = 1;
  while (pointsForLevel(level + 1) <= points) level += 1;
  const start = pointsForLevel(level);
  return { level, into: points - start, needed: pointsForLevel(level + 1) - start };
}

/** The device's local calendar date as 'YYYY-MM-DD'. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The same local time `n` calendar days away (safe across daylight-saving changes). */
function shiftDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/** One more answer today. Days older than DAYS_KEPT are dropped. */
export function addAnswerDay(
  days: Readonly<Record<string, number>>,
  now: Date,
): Record<string, number> {
  const today = dayKey(now);
  const cutoff = dayKey(shiftDays(now, -DAYS_KEPT));
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(days)) if (k > cutoff) next[k] = v;
  next[today] = (next[today] ?? 0) + 1;
  return next;
}

const isCounted = (days: Readonly<Record<string, number>>, key: string) =>
  (days[key] ?? 0) >= ANSWERS_PER_DAY;

/**
 * Consecutive counted days ending today, or ending yesterday when today isn't counted yet,
 * so the streak doesn't read 0 in the morning (spec §3.4).
 */
export function currentStreak(days: Readonly<Record<string, number>>, now: Date): number {
  const start = isCounted(days, dayKey(now)) ? now : shiftDays(now, -1);
  let n = 0;
  while (n <= DAYS_KEPT && isCounted(days, dayKey(shiftDays(start, -n)))) n += 1;
  return n;
}
/** Gym sprints: points per correct answer, no combo (spec §3.3). */
export const GYM_POINTS_PER_CORRECT = 2;
