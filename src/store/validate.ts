/**
 * Hand-written validation for saved progress (replaces zod/mini: ~7 KB less JS on every page).
 * Builds a fresh object from known keys only, so unknown keys are dropped.
 */
import { DRILL_IDS, TIERS } from '../engine/mental/ids';
import { DIFFICULTIES } from '../engine/problem';
import { SKILL_IDS } from '../engine/skills';
import {
  PROGRESS_SCHEMA_VERSION,
  type Attempt,
  type AttemptV1,
  type Game,
  type Mental,
  type MentalSession,
  type Progress,
  type ProgressV1,
  type Settings,
  type SettingsV1,
  type SkillState,
} from './schema';

/** A value failed validation. `path` is dotted, e.g. "attempts.0.timeMs"; "" means the top. */
export class Invalid extends Error {
  constructor(readonly path: string) {
    super(`Invalid saved progress at ${path === '' ? '(top)' : path}`);
  }
}

type Check<T> = (v: unknown, path: string) => T;
const at = (path: string, key: string | number): string =>
  path === '' ? String(key) : `${path}.${key}`;
const fail = (path: string): never => {
  throw new Invalid(path);
};

const str: Check<string> = (v, p) => (typeof v === 'string' ? v : fail(p));
const nonEmpty: Check<string> = (v, p) => (str(v, p) !== '' ? (v as string) : fail(p));
const bool: Check<boolean> = (v, p) => (typeof v === 'boolean' ? v : fail(p));
const int: Check<number> = (v, p) => (typeof v === 'number' && Number.isInteger(v) ? v : fail(p));
const count: Check<number> = (v, p) => (int(v, p) >= 0 ? (v as number) : fail(p));
const oneOf =
  <T extends string | number>(values: readonly T[]): Check<T> =>
  (v, p) =>
    values.includes(v as T) ? (v as T) : fail(p);
const arrayOf =
  <T>(item: Check<T>): Check<T[]> =>
  (v, p) =>
    Array.isArray(v) ? v.map((x, i) => item(x, at(p, i))) : fail(p);
function fields(v: unknown, p: string): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail(p);
}
const recordOf =
  <K extends string, T>(key: Check<K>, value: Check<T>): Check<Partial<Record<K, T>>> =>
  (v, p) => {
    const out: Partial<Record<K, T>> = {};
    for (const [k, x] of Object.entries(fields(v, p))) out[key(k, at(p, k))] = value(x, at(p, k));
    return out;
  };

const difficulty = oneOf(DIFFICULTIES);
const skillId = oneOf(SKILL_IDS);
const drillId = oneOf(DRILL_IDS);
const tier = oneOf(TIERS);
const dayKey: Check<string> = (v, p) =>
  /^\d{4}-\d{2}-\d{2}$/.test(str(v, p)) ? (v as string) : fail(p);

function attemptFields(o: Record<string, unknown>, p: string) {
  return {
    problemId: nonEmpty(o['problemId'], at(p, 'problemId')),
    skill: skillId(o['skill'], at(p, 'skill')),
    difficulty: difficulty(o['difficulty'], at(p, 'difficulty')),
    correct: bool(o['correct'], at(p, 'correct')),
    response: str(o['response'], at(p, 'response')),
    timeMs: count(o['timeMs'], at(p, 'timeMs')),
    at: nonEmpty(o['at'], at(p, 'at')),
  };
}
const attemptV1: Check<AttemptV1> = (v, p) => {
  const o = fields(v, p);
  return {
    ...attemptFields(o, p),
    mode: oneOf(['practice', 'test'] as const)(o['mode'], at(p, 'mode')),
  };
};
const attempt: Check<Attempt> = (v, p) => {
  const o = fields(v, p);
  const a: Attempt = {
    ...attemptFields(o, p),
    mode: oneOf(['practice', 'test', 'play'] as const)(o['mode'], at(p, 'mode')),
  };
  if (o['guessed'] !== undefined) a.guessed = bool(o['guessed'], at(p, 'guessed'));
  return a;
};
const skillState: Check<SkillState> = (v, p) => {
  const o = fields(v, p);
  return {
    level: difficulty(o['level'], at(p, 'level')),
    streak: int(o['streak'], at(p, 'streak')),
  };
};
const targetScore: Check<number | null> = (v, p) =>
  v === null ? null : int(v, p) >= 200 && (v as number) <= 800 ? (v as number) : fail(p);
const settingsV1: Check<SettingsV1> = (v, p) => {
  const o = fields(v, p);
  return {
    targetScore: targetScore(o['targetScore'], at(p, 'targetScore')),
    timeMultiplier: oneOf([1, 1.5, 2] as const)(o['timeMultiplier'], at(p, 'timeMultiplier')),
    untimed: bool(o['untimed'], at(p, 'untimed')),
  };
};
const settings: Check<Settings> = (v, p) => {
  const o = fields(v, p);
  return {
    ...settingsV1(v, p),
    sound: bool(o['sound'], at(p, 'sound')),
    haptics: bool(o['haptics'], at(p, 'haptics')),
  };
};
const game: Check<Game> = (v, p) => {
  const o = fields(v, p);
  return {
    points: count(o['points'], at(p, 'points')),
    bestCombo: count(o['bestCombo'], at(p, 'bestCombo')),
    answerDays: recordOf(dayKey, count)(o['answerDays'], at(p, 'answerDays')) as Record<
      string,
      number
    >,
    bestStreak: count(o['bestStreak'], at(p, 'bestStreak')),
    tipIndex: count(o['tipIndex'], at(p, 'tipIndex')),
  };
};
const session: Check<MentalSession> = (v, p) => {
  const o = fields(v, p);
  return {
    drill: drillId(o['drill'], at(p, 'drill')),
    at: nonEmpty(o['at'], at(p, 'at')),
    correct: count(o['correct'], at(p, 'correct')),
    attempted: count(o['attempted'], at(p, 'attempted')),
    medianMs: count(o['medianMs'], at(p, 'medianMs')),
  };
};
const mental: Check<Mental> = (v, p) => {
  const o = fields(v, p);
  return {
    tier: recordOf(drillId, tier)(o['tier'], at(p, 'tier')),
    best: recordOf(drillId, count)(o['best'], at(p, 'best')),
    sessions: arrayOf(session)(o['sessions'], at(p, 'sessions')),
  };
};
const fixedTest: Check<number> = (v, p) =>
  int(v, p) >= 1 && (v as number) <= 4 ? (v as number) : fail(p);
function shared(o: Record<string, unknown>) {
  return {
    bookmarks: arrayOf(nonEmpty)(o['bookmarks'], 'bookmarks'),
    skillState: recordOf(skillId, skillState)(o['skillState'], 'skillState'),
    testAttempts: Array.isArray(o['testAttempts'])
      ? (o['testAttempts'] as unknown[])
      : fail('testAttempts'),
    completedFixedTests: arrayOf(fixedTest)(o['completedFixedTests'], 'completedFixedTests'),
  };
}

export function parseProgress(data: unknown): Progress {
  const o = fields(data, '');
  if (o['schemaVersion'] !== PROGRESS_SCHEMA_VERSION) fail('schemaVersion');
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: settings(o['settings'], 'settings'),
    attempts: arrayOf(attempt)(o['attempts'], 'attempts'),
    ...shared(o),
    game: game(o['game'], 'game'),
    mental: mental(o['mental'], 'mental'),
  };
}

export function parseProgressV1(data: unknown): ProgressV1 {
  const o = fields(data, '');
  if (o['schemaVersion'] !== 1) fail('schemaVersion');
  return {
    schemaVersion: 1,
    settings: settingsV1(o['settings'], 'settings'),
    attempts: arrayOf(attemptV1)(o['attempts'], 'attempts'),
    ...shared(o),
  };
}

/** Runs a parser and turns a validation failure into its path. */
export function tryParse<T>(
  parse: (data: unknown) => T,
  data: unknown,
): { ok: true; value: T } | { ok: false; path: string } {
  try {
    return { ok: true, value: parse(data) };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, path: err.path };
    throw err;
  }
}
