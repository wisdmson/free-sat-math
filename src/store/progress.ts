import type { Difficulty, ProblemId } from '../engine/problem';
import type { SkillId } from '../engine/skills';
import {
  PROGRESS_SCHEMA_VERSION,
  progressSchema,
  type Attempt,
  type Progress,
  type Settings,
} from './schema';

export const PROGRESS_KEY = 'fsm.progress.v1';
export const BACKUP_PREFIX = 'fsm.backup.';
export const MAX_ATTEMPTS = 5000;

/** The subset of the Web Storage API we use; lets tests pass a fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function emptyProgress(): Progress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: { targetScore: null, timeMultiplier: 1, untimed: false },
    attempts: [],
    bookmarks: [],
    skillState: {},
    testAttempts: [],
    completedFixedTests: [],
  };
}

/** localStorage if it works in this browser (it can throw in private modes), otherwise null. */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__fsm_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export type LoadStatus = 'ok' | 'fresh' | 'recovered' | 'unavailable';

export interface LoadResult {
  progress: Progress;
  status: LoadStatus;
  /** Where unreadable data was copied, when status is 'recovered'. */
  backupKey?: string;
}

function backup(storage: KeyValueStore, raw: string, now: Date): string | undefined {
  const key = `${BACKUP_PREFIX}${now.toISOString()}`;
  try {
    storage.setItem(key, raw);
    return key;
  } catch {
    return undefined;
  }
}

/** Reads saved progress. Unreadable data is backed up (never deleted) and replaced with a fresh start. */
export function loadProgress(storage: KeyValueStore | null, now: Date = new Date()): LoadResult {
  if (storage === null) return { progress: emptyProgress(), status: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(PROGRESS_KEY);
  } catch {
    return { progress: emptyProgress(), status: 'unavailable' };
  }
  if (raw === null) return { progress: emptyProgress(), status: 'fresh' };
  try {
    const parsed = progressSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { progress: parsed.data, status: 'ok' };
  } catch {
    // fall through to recovery
  }
  const backupKey = backup(storage, raw, now);
  return backupKey === undefined
    ? { progress: emptyProgress(), status: 'recovered' }
    : { progress: emptyProgress(), status: 'recovered', backupKey };
}

/** Writes progress. Returns false when the browser refuses (quota, private mode). */
export function saveProgress(storage: KeyValueStore | null, progress: Progress): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

// ---- pure updates -------------------------------------------------------------------------

export function recordAttempt(progress: Progress, attempt: Attempt): Progress {
  const attempts = [...progress.attempts, attempt];
  return { ...progress, attempts: attempts.slice(Math.max(0, attempts.length - MAX_ATTEMPTS)) };
}

export function toggleBookmark(progress: Progress, id: ProblemId): Progress {
  const has = progress.bookmarks.includes(id);
  return {
    ...progress,
    bookmarks: has ? progress.bookmarks.filter((b) => b !== id) : [...progress.bookmarks, id],
  };
}

export function setSkillState(
  progress: Progress,
  skill: SkillId,
  state: { level: Difficulty; streak: number },
): Progress {
  return { ...progress, skillState: { ...progress.skillState, [skill]: state } };
}

export function updateSettings(progress: Progress, patch: Partial<Settings>): Progress {
  return { ...progress, settings: { ...progress.settings, ...patch } };
}

// ---- derived views ------------------------------------------------------------------------

export interface MissedItem {
  problemId: ProblemId;
  skill: SkillId;
  difficulty: Difficulty;
  at: string;
}

/** Problems whose most recent attempt was wrong, newest first. */
export function missedProblems(progress: Progress): MissedItem[] {
  const latest = new Map<ProblemId, Attempt>();
  for (const a of progress.attempts) latest.set(a.problemId, a);
  return [...latest.values()]
    .filter((a) => !a.correct)
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
    .map(({ problemId, skill, difficulty, at }) => ({ problemId, skill, difficulty, at }));
}

export interface Accuracy {
  correct: number;
  attempts: number;
}

/** Correct / attempted over a skill's most recent `lastN` attempts (all modes). */
export function skillAccuracy(progress: Progress, skill: SkillId, lastN = 20): Accuracy {
  const recent = progress.attempts.filter((a) => a.skill === skill).slice(-lastN);
  return { correct: recent.filter((a) => a.correct).length, attempts: recent.length };
}

/** Total attempts per skill, all time (within the stored window). */
export function attemptCount(progress: Progress, skill: SkillId): number {
  return progress.attempts.filter((a) => a.skill === skill).length;
}

// ---- export / import ----------------------------------------------------------------------

export function exportFileName(now: Date): string {
  return `free-sat-math-progress-${now.toISOString().slice(0, 10)}.json`;
}

export function exportProgress(progress: Progress): string {
  return `${JSON.stringify(progress, null, 2)}\n`;
}

export type ImportResult =
  | {
      ok: true;
      progress: Progress;
      summary: { attempts: number; tests: number; bookmarks: number };
    }
  | { ok: false; reason: string };

export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'This file is not valid JSON.' };
  }
  const parsed = progressSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first && first.path.length > 0 ? ` (at ${first.path.join('.')})` : '';
    return { ok: false, reason: `This file is not a Free SAT Math progress file${where}.` };
  }
  const p = parsed.data;
  return {
    ok: true,
    progress: p,
    summary: {
      attempts: p.attempts.length,
      tests: p.testAttempts.length,
      bookmarks: p.bookmarks.length,
    },
  };
}

/** Backs up the current saved data, then replaces it. Returns the backup key if one was written. */
export function replaceProgress(
  storage: KeyValueStore | null,
  next: Progress,
  now: Date = new Date(),
): { saved: boolean; backupKey?: string } {
  if (storage === null) return { saved: false };
  let backupKey: string | undefined;
  try {
    const current = storage.getItem(PROGRESS_KEY);
    if (current !== null) backupKey = backup(storage, current, now);
  } catch {
    // nothing to back up
  }
  const saved = saveProgress(storage, next);
  return backupKey === undefined ? { saved } : { saved, backupKey };
}
