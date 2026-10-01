/** Saved-progress types. Validation is hand-written in validate.ts (no runtime library). */
import type { DrillId, Tier } from '../engine/mental/ids';
import type { Difficulty } from '../engine/problem';
import type { SkillId } from '../engine/skills';

export const PROGRESS_SCHEMA_VERSION = 2;

interface AttemptFields {
  problemId: string;
  skill: SkillId;
  difficulty: Difficulty;
  correct: boolean;
  /** "A"-"D" for multiple choice, the typed text for typed answers. */
  response: string;
  timeMs: number;
  /** ISO timestamp. */
  at: string;
}
export interface AttemptV1 extends AttemptFields {
  mode: 'practice' | 'test';
}
export interface Attempt extends AttemptFields {
  mode: 'practice' | 'test' | 'play';
  /** Quick Play's "Guessed?" chip (spec §5.3). Absent means "sure". */
  guessed?: boolean;
}
export interface SkillState {
  level: Difficulty;
  /** Positive: correct answers in a row. Negative: wrong answers in a row. */
  streak: number;
}
export interface SettingsV1 {
  targetScore: number | null;
  timeMultiplier: 1 | 1.5 | 2;
  untimed: boolean;
}
export interface Settings extends SettingsV1 {
  sound: boolean;
  haptics: boolean;
}
export interface Game {
  points: number;
  bestCombo: number;
  /** Answers per local calendar day, 'YYYY-MM-DD' → count (spec §3.4). */
  answerDays: Record<string, number>;
  bestStreak: number;
  tipIndex: number;
}
export interface MentalSession {
  drill: DrillId;
  at: string;
  correct: number;
  attempted: number;
  medianMs: number;
}
export interface Mental {
  tier: Partial<Record<DrillId, Tier>>;
  best: Partial<Record<DrillId, number>>;
  sessions: MentalSession[];
}
interface SharedFields {
  bookmarks: string[];
  skillState: Partial<Record<SkillId, SkillState>>;
  /** Practice-test results. Their shape is defined in Phase 5; always empty until then. */
  testAttempts: unknown[];
  completedFixedTests: number[];
}
export interface ProgressV1 extends SharedFields {
  schemaVersion: 1;
  settings: SettingsV1;
  attempts: AttemptV1[];
}
export interface Progress extends SharedFields {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  settings: Settings;
  attempts: Attempt[];
  game: Game;
  mental: Mental;
}
