import type { Difficulty, ProblemId } from '../engine/problem';
import type { SkillId } from '../engine/skills';
import { emptyGame, emptyMental, readProgress, type ReadResult } from './migrate';
import { PROGRESS_SCHEMA_VERSION, type Attempt, type Progress, type Settings } from './schema';

export const PROGRESS_KEY = 'fsm.progress.v1';
export const BACKUP_PREFIX = 'fsm.backup.';
export const MAX_ATTEMPTS = 5000;
/** One copy of the v1 record, kept when it is upgraded to v2. */
export const PRE_V2_BACKUP_KEY = `${BACKUP_PREFIX}pre-v2`;

/** The subset of the Web Storage API we use; lets tests pass a fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function emptyProgress(): Progress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: { targetScore: null, timeMultiplier: 1, untimed: false, sound: false, haptics: true },
    attempts: [],
    bookmarks: [],
    skillState: {},
    testAttempts: [],
    completedFixedTests: [],
    game: emptyGame(),
    mental: emptyMental(),
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

/** sessionStorage if it works, otherwise null. Used to keep the recovery notice up for the visit. */
export function browserSession(): KeyValueStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * - `recovered`: unreadable data was backed up and replaced with a fresh start.
 * - `locked`: unreadable data could not be backed up (storage full), so it is left untouched and
 *   nothing is saved over it.
 * - `older`: another tab running an older version just wrote its own record. Read-only until
 *   this page is refreshed, so the two tabs can't keep rewriting each other's data.
 * - `newer`: saved by a newer version of the site (another tab). Read-only: never backed up or
 *   overwritten.
 */
export type LoadStatus =
  'ok' | 'fresh' | 'recovered' | 'locked' | 'newer' | 'older' | 'unavailable';

export { schemaVersionOf } from './schema-version';

export interface LoadResult {
  progress: Progress;
  status: LoadStatus;
  /** Where unreadable data was copied, when status is 'recovered'. */
  backupKey?: string;
}

/** Session key holding the backup key of a recovery, so later pages in the visit still say so. */
export const RECOVERED_NOTICE_KEY = 'fsm.recovered';

/**
 * Copies raw saved data to a timestamped backup key. Copies made by a deliberate import or
 * reset are labelled so they are never offered back by findRestorableBackup.
 */
function backup(
  storage: KeyValueStore,
  raw: string,
  now: Date,
  label: '' | 'replaced.' = '',
): string | undefined {
  const key = `${BACKUP_PREFIX}${label}${now.toISOString()}`;
  try {
    storage.setItem(key, raw);
    return key;
  } catch {
    return undefined;
  }
}

function readNotice(session: KeyValueStore | null): string | null {
  try {
    return session?.getItem(RECOVERED_NOTICE_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads saved progress. Unreadable data is backed up once (never deleted), then replaced with a
 * fresh start so later page loads don't back it up again. If no backup can be written, the data
 * is left exactly as it is and the status is `locked`.
 */
export function loadProgress(
  storage: KeyValueStore | null,
  now: Date = new Date(),
  session: KeyValueStore | null = null,
): LoadResult {
  if (storage === null) return { progress: emptyProgress(), status: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(PROGRESS_KEY);
  } catch {
    return { progress: emptyProgress(), status: 'unavailable' };
  }
  const notice = readNotice(session);
  if (raw === null) return { progress: emptyProgress(), status: 'fresh' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  const read = readProgress(data);
  if (read.kind === 'newer') return { progress: emptyProgress(), status: 'newer' };
  const withNotice = (progress: Progress): LoadResult =>
    notice === null
      ? { progress, status: 'ok' }
      : { progress, status: 'recovered', backupKey: notice };
  if (read.kind === 'current') return withNotice(read.progress);
  if (read.kind === 'upgraded') {
    // Keep one copy of the v1 original. If no copy fits, show the upgraded record but save
    // nothing, so the original stays exactly as it was (spec §9.2 step 3).
    try {
      if (storage.getItem(PRE_V2_BACKUP_KEY) === null) storage.setItem(PRE_V2_BACKUP_KEY, raw);
    } catch {
      return { progress: read.progress, status: 'locked' };
    }
    saveProgress(storage, read.progress);
    return withNotice(read.progress);
  }
  const backupKey = backup(storage, raw, now);
  if (backupKey === undefined) return { progress: emptyProgress(), status: 'locked' };
  saveProgress(storage, emptyProgress());
  try {
    session?.setItem(RECOVERED_NOTICE_KEY, backupKey);
  } catch {
    // the notice just won't carry over to the next page
  }
  return { progress: emptyProgress(), status: 'recovered', backupKey };
}

export type PeekResult = ReadResult | { kind: 'missing' } | { kind: 'unavailable' };

/** Reads the saved record without writing anything (used when another tab changes it). */
export function peekProgress(storage: KeyValueStore | null): PeekResult {
  if (storage === null) return { kind: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(PROGRESS_KEY);
  } catch {
    return { kind: 'unavailable' };
  }
  if (raw === null) return { kind: 'missing' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  return readProgress(data);
}

export const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A backup from the last day holding real progress, offered when the saved record is empty.
 * Covers a tab that still runs an older version: it can reset the record after a newer version
 * wrote to it, but it always backs the data up first (spec §9.2, known gap).
 */
export function findRestorableBackup(
  storage: KeyValueStore,
  keys: readonly string[],
  current: Progress,
  now: Date,
): string | null {
  if (current.attempts.length > 0 || current.game.points > 0) return null;
  const recent = keys
    .filter((k) => k.startsWith(BACKUP_PREFIX) && k !== PRE_V2_BACKUP_KEY)
    .filter((k) => {
      const t = Date.parse(k.slice(BACKUP_PREFIX.length));
      return Number.isFinite(t) && t <= now.getTime() && now.getTime() - t <= RESTORE_WINDOW_MS;
    })
    .sort()
    .reverse();
  for (const key of recent) {
    let data: unknown;
    try {
      data = JSON.parse(storage.getItem(key) ?? '');
    } catch {
      continue;
    }
    const read = readProgress(data);
    if (read.kind !== 'newer' && read.kind !== 'unreadable' && read.progress.attempts.length > 0) {
      return key;
    }
  }
  return null;
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

/**
 * Marks or unmarks one attempt as a guess (Quick Play's "Guessed?" chip, spec §5.3). The attempt
 * is found by problem and time; if it's no longer stored, nothing changes.
 */
export function setGuessed(
  progress: Progress,
  problemId: ProblemId,
  at: string,
  guessed: boolean,
): Progress {
  const i = progress.attempts.findIndex((a) => a.problemId === problemId && a.at === at);
  if (i < 0) return progress;
  const updated: Attempt = { ...(progress.attempts[i] as Attempt) };
  if (guessed) updated.guessed = true;
  else delete updated.guessed;
  const attempts = [...progress.attempts];
  attempts[i] = updated;
  return { ...progress, attempts };
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
  /**
   * A Quick Play miss not marked as a guess: a gap the student may not know they have (spec §5.3).
   * Practice and test misses are never "sure": those modes have no Guessed? chip to say otherwise.
   */
  sure: boolean;
}

const newestFirst = (x: { at: string }, y: { at: string }) =>
  x.at < y.at ? 1 : x.at > y.at ? -1 : 0;

/** Problems whose most recent attempt was wrong: "sure but wrong" first, then newest first. */
export function missedProblems(progress: Progress): MissedItem[] {
  const latest = new Map<ProblemId, Attempt>();
  for (const a of progress.attempts) latest.set(a.problemId, a);
  return [...latest.values()]
    .filter((a) => !a.correct)
    .map(({ problemId, skill, difficulty, at, guessed, mode }) => ({
      problemId,
      skill,
      difficulty,
      at,
      sure: mode === 'play' && guessed !== true,
    }))
    .sort((x, y) => Number(y.sure) - Number(x.sure) || newestFirst(x, y));
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
  const read = readProgress(data);
  if (read.kind === 'newer') {
    return {
      ok: false,
      reason: 'This file is from a newer version of Free SAT Math. Refresh and try again.',
    };
  }
  if (read.kind === 'unreadable') {
    const where = read.where === '' ? '' : ` (at ${read.where})`;
    return { ok: false, reason: `This file is not a Free SAT Math progress file${where}.` };
  }
  const p = read.progress;
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

export interface ReplaceResult {
  saved: boolean;
  backupKey?: string;
  /** The current data could not be backed up, so nothing was changed. */
  refused?: true;
}

/**
 * Backs up the current saved data, then replaces it. If there is data and the backup can't be
 * written, nothing is replaced: import and reset never lose progress without a copy.
 */
export function replaceProgress(
  storage: KeyValueStore | null,
  next: Progress,
  now: Date = new Date(),
): ReplaceResult {
  if (storage === null) return { saved: false };
  let current: string | null = null;
  try {
    current = storage.getItem(PROGRESS_KEY);
  } catch {
    // unreadable storage: nothing to back up
  }
  let backupKey: string | undefined;
  if (current !== null) {
    backupKey = backup(storage, current, now, 'replaced.');
    if (backupKey === undefined) return { saved: false, refused: true };
  }
  const saved = saveProgress(storage, next);
  return backupKey === undefined ? { saved } : { saved, backupKey };
}
