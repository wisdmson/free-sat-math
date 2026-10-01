/** The Gym's 60-second sprint: pure state, tier adaptation and the summary (spec §2.2, §4.4). */
import type { DrillId, Tier } from './ids';

export const SPRINT_MS = 60_000;
export const UP_AFTER = 3;
export const DOWN_AFTER = 2;

export interface SprintState {
  drill: DrillId;
  tier: Tier;
  /** Positive: right in a row. Negative: wrong in a row. */
  run: number;
  answers: { correct: boolean; ms: number }[];
}

export function startSprint(drill: DrillId, tier: Tier): SprintState {
  return { drill, tier, run: 0, answers: [] };
}

export function recordSprintAnswer(s: SprintState, correct: boolean, ms: number): SprintState {
  const answers = [...s.answers, { correct, ms }];
  if (correct) {
    const run = s.run > 0 ? s.run + 1 : 1;
    if (run >= UP_AFTER) return { ...s, answers, run: 0, tier: Math.min(3, s.tier + 1) as Tier };
    return { ...s, answers, run };
  }
  const run = s.run < 0 ? s.run - 1 : -1;
  if (-run >= DOWN_AFTER) return { ...s, answers, run: 0, tier: Math.max(1, s.tier - 1) as Tier };
  return { ...s, answers, run };
}

export interface SprintSummary {
  correct: number;
  attempted: number;
  /** Median time of correct answers, 0 when none. */
  medianMs: number;
  endTier: Tier;
}

export function sprintSummary(s: SprintState): SprintSummary {
  const times = s.answers
    .filter((a) => a.correct)
    .map((a) => a.ms)
    .sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianMs =
    times.length === 0
      ? 0
      : times.length % 2 === 1
        ? (times[mid] as number)
        : Math.round(((times[mid - 1] as number) + (times[mid] as number)) / 2);
  return {
    correct: s.answers.filter((a) => a.correct).length,
    attempted: s.answers.length,
    medianMs,
    endTier: s.tier,
  };
}
