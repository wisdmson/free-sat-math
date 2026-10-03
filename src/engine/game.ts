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
export const LIGHTNING_POINTS = 5;
export const LIGHTNING_PERFECT_BONUS = 25;
/** A perfect Lightning round adds this much extra to the combo (spec §3.2). */
export const LIGHTNING_PERFECT_COMBO = 2;
export const LIGHTNING_SECONDS = 10;

/** One Lightning answer: 5 base points times the combo multiplier (spec §3.1). */
export function scoreLightningAnswer(
  combo: number,
  correct: boolean,
): { combo: number; points: number; multiplier: number } {
  if (!correct) return { combo: 0, points: 0, multiplier: 1 };
  const next = combo + 1;
  const multiplier = comboMultiplier(next);
  return { combo: next, points: LIGHTNING_POINTS * multiplier, multiplier };
}

/** Seconds per Lightning question, or null for no clock (spec §4.4). */
export function lightningSeconds(settings: {
  timeMultiplier: 1 | 1.5 | 2;
  untimed: boolean;
}): number | null {
  return settings.untimed ? null : LIGHTNING_SECONDS * settings.timeMultiplier;
}
/** Pace checks (spec §2.1, §3.1): the real test's average, 22 questions in 35 minutes. */
export const PACE_SECONDS = 95;
export const PACE_BONUS = 10;
/** Chance that an SAT card in the feed is a pace check (spec §3.5). */
export const PACE_CHANCE = 1 / 6;

/** The pace-check limit, scaled by extended time; null when untimed (no pace checks). */
export function paceLimitMs(settings: {
  timeMultiplier: 1 | 1.5 | 2;
  untimed: boolean;
}): number | null {
  return settings.untimed ? null : PACE_SECONDS * 1000 * settings.timeMultiplier;
}

/** +10 for a right pace-check answer within the limit. Bonuses are never multiplied (§3.2). */
export function paceBonus(correct: boolean, timeMs: number, limitMs: number): number {
  return correct && timeMs <= limitMs ? PACE_BONUS : 0;
}

/** "48 s" under a minute, "2:10" from a minute on. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
