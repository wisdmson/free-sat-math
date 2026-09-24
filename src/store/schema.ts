// zod/mini is Zod's tree-shakable build: the same validation with a much smaller bundle.
import * as z from 'zod/mini';
import { SKILL_IDS } from '../engine/skills';

export const PROGRESS_SCHEMA_VERSION = 1;

const difficulty = z.enum(['easy', 'medium', 'hard']);
const skillId = z.enum(SKILL_IDS);
const nonEmpty = z.string().check(z.minLength(1));

export const attemptSchema = z.object({
  problemId: nonEmpty,
  skill: skillId,
  difficulty,
  correct: z.boolean(),
  /** "A"-"D" for multiple choice, the typed text for typed answers. */
  response: z.string(),
  timeMs: z.int().check(z.nonnegative()),
  /** ISO timestamp. */
  at: nonEmpty,
  mode: z.enum(['practice', 'test']),
});

export const skillStateSchema = z.object({
  level: difficulty,
  /** Positive: correct answers in a row. Negative: wrong answers in a row. */
  streak: z.int(),
});

export const settingsSchema = z.object({
  targetScore: z.nullable(z.int().check(z.minimum(200), z.maximum(800))),
  timeMultiplier: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  untimed: z.boolean(),
});

export const progressSchema = z.object({
  schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
  settings: settingsSchema,
  attempts: z.array(attemptSchema),
  bookmarks: z.array(nonEmpty),
  skillState: z.partialRecord(skillId, skillStateSchema),
  /** Practice-test results. Their shape is defined in Phase 5; always empty until then. */
  testAttempts: z.array(z.unknown()),
  completedFixedTests: z.array(z.int().check(z.minimum(1), z.maximum(4))),
});

export type Attempt = z.infer<typeof attemptSchema>;
export type SkillState = z.infer<typeof skillStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Progress = z.infer<typeof progressSchema>;
