// zod/mini is Zod's tree-shakable build: the same validation with a much smaller bundle.
import * as z from 'zod/mini';
import { DRILL_IDS } from '../engine/mental/ids';
import { SKILL_IDS } from '../engine/skills';

export const PROGRESS_SCHEMA_VERSION = 2;

const difficulty = z.enum(['easy', 'medium', 'hard']);
const skillId = z.enum(SKILL_IDS);
const drillId = z.enum(DRILL_IDS);
const nonEmpty = z.string().check(z.minLength(1));
const count = z.int().check(z.nonnegative());
const dayKey = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));

const attemptFields = {
  problemId: nonEmpty,
  skill: skillId,
  difficulty,
  correct: z.boolean(),
  /** "A"-"D" for multiple choice, the typed text for typed answers. */
  response: z.string(),
  timeMs: count,
  /** ISO timestamp. */
  at: nonEmpty,
};

export const attemptSchemaV1 = z.object({ ...attemptFields, mode: z.enum(['practice', 'test']) });
export const attemptSchema = z.object({
  ...attemptFields,
  mode: z.enum(['practice', 'test', 'play']),
  /** Quick Play's "Guessed?" chip (spec §5.3). Absent means "sure". */
  guessed: z.optional(z.boolean()),
});

export const skillStateSchema = z.object({
  level: difficulty,
  /** Positive: correct answers in a row. Negative: wrong answers in a row. */
  streak: z.int(),
});

const settingsFields = {
  targetScore: z.nullable(z.int().check(z.minimum(200), z.maximum(800))),
  timeMultiplier: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  untimed: z.boolean(),
};
export const settingsSchemaV1 = z.object(settingsFields);
export const settingsSchema = z.object({
  ...settingsFields,
  sound: z.boolean(),
  haptics: z.boolean(),
});

export const gameSchema = z.object({
  points: count,
  bestCombo: count,
  /** Answers per local calendar day, 'YYYY-MM-DD' → count (spec §3.4). */
  answerDays: z.record(dayKey, count),
  bestStreak: count,
  tipIndex: count,
});

export const mentalSchema = z.object({
  tier: z.partialRecord(drillId, z.union([z.literal(1), z.literal(2), z.literal(3)])),
  best: z.partialRecord(drillId, count),
  sessions: z.array(
    z.object({ drill: drillId, at: nonEmpty, correct: count, attempted: count, medianMs: count }),
  ),
});

const sharedFields = {
  bookmarks: z.array(nonEmpty),
  skillState: z.partialRecord(skillId, skillStateSchema),
  /** Practice-test results. Their shape is defined in Phase 5; always empty until then. */
  testAttempts: z.array(z.unknown()),
  completedFixedTests: z.array(z.int().check(z.minimum(1), z.maximum(4))),
};

export const progressSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  settings: settingsSchemaV1,
  attempts: z.array(attemptSchemaV1),
  ...sharedFields,
});

export const progressSchema = z.object({
  schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
  settings: settingsSchema,
  attempts: z.array(attemptSchema),
  ...sharedFields,
  game: gameSchema,
  mental: mentalSchema,
});

export type Attempt = z.infer<typeof attemptSchema>;
export type SkillState = z.infer<typeof skillStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Game = z.infer<typeof gameSchema>;
export type Mental = z.infer<typeof mentalSchema>;
export type Progress = z.infer<typeof progressSchema>;
export type ProgressV1 = z.infer<typeof progressSchemaV1>;
