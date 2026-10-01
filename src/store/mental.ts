/** Records a finished Gym sprint (spec §2.2, §3.3, §3.4). */
import { GYM_POINTS_PER_CORRECT, addAnswerDay, currentStreak } from '../engine/game';
import type { DrillId } from '../engine/mental/ids';
import type { SprintSummary } from '../engine/mental/sprint';
import type { Progress } from './schema';

export const MAX_SESSIONS = 200;

export function applyGymSession(
  progress: Progress,
  s: { drill: DrillId; summary: SprintSummary; now: Date },
): Progress {
  const { correct, attempted, medianMs, endTier } = s.summary;
  let answerDays = progress.game.answerDays;
  for (let i = 0; i < attempted; i++) answerDays = addAnswerDay(answerDays, s.now);
  const sessions = [
    ...progress.mental.sessions,
    { drill: s.drill, at: s.now.toISOString(), correct, attempted, medianMs },
  ].slice(-MAX_SESSIONS);
  return {
    ...progress,
    mental: {
      tier: { ...progress.mental.tier, [s.drill]: endTier },
      best: {
        ...progress.mental.best,
        [s.drill]: Math.max(progress.mental.best[s.drill] ?? 0, correct),
      },
      sessions,
    },
    game: {
      ...progress.game,
      points: progress.game.points + GYM_POINTS_PER_CORRECT * correct,
      answerDays,
      bestStreak: Math.max(progress.game.bestStreak, currentStreak(answerDays, s.now)),
    },
  };
}
