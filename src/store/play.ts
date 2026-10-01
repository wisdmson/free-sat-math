/** Records one Quick Play answer: attempt, staircase, points, best combo and streak days. */
import { addAnswerDay, currentStreak } from '../engine/game';
import { updateStair } from '../engine/practice';
import type { Problem } from '../engine/problem';
import { recordAttempt, setSkillState } from './progress';
import type { Progress } from './schema';

export interface PlayAnswer {
  problem: Problem;
  correct: boolean;
  response: string;
  timeMs: number;
  points: number;
  /** The combo after this answer. */
  combo: number;
  now: Date;
}

export function applyPlayAnswer(progress: Progress, a: PlayAnswer): Progress {
  const { problem } = a;
  let next = recordAttempt(progress, {
    problemId: problem.id,
    skill: problem.skill,
    difficulty: problem.difficulty,
    correct: a.correct,
    response: a.response,
    timeMs: a.timeMs,
    at: a.now.toISOString(),
    mode: 'play',
  });
  const stair = progress.skillState[problem.skill] ?? { level: problem.difficulty, streak: 0 };
  next = setSkillState(next, problem.skill, updateStair(stair, a.correct));
  const answerDays = addAnswerDay(progress.game.answerDays, a.now);
  return {
    ...next,
    game: {
      ...next.game,
      points: next.game.points + a.points,
      bestCombo: Math.max(next.game.bestCombo, a.combo),
      answerDays,
      bestStreak: Math.max(next.game.bestStreak, currentStreak(answerDays, a.now)),
    },
  };
}
