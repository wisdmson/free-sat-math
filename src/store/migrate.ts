import { schemaVersionOf } from './schema-version';
import { parseProgress, parseProgressV1, tryParse } from './validate';
import {
  PROGRESS_SCHEMA_VERSION,
  type Game,
  type Mental,
  type Progress,
  type ProgressV1,
} from './schema';

export function emptyGame(): Game {
  return { points: 0, bestCombo: 0, answerDays: {}, bestStreak: 0, tipIndex: 0 };
}

export function emptyMental(): Mental {
  return { tier: {}, best: {}, sessions: [] };
}

/** v1 → v2: everything kept, new sections start empty (spec §9.2). */
export function upgradeV1(p: ProgressV1): Progress {
  return {
    ...p,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: { ...p.settings, sound: false, haptics: true },
    game: emptyGame(),
    mental: emptyMental(),
  };
}

export type ReadResult =
  | { kind: 'current'; progress: Progress }
  | { kind: 'upgraded'; progress: Progress }
  | { kind: 'newer' }
  | { kind: 'unreadable'; where: string };

/** Classifies parsed JSON: the current schema, an older one we can upgrade, a newer one, or junk. */
export function readProgress(data: unknown): ReadResult {
  const version = schemaVersionOf(data);
  if (version !== null && version > PROGRESS_SCHEMA_VERSION) return { kind: 'newer' };
  const current = tryParse(parseProgress, data);
  if (current.ok) return { kind: 'current', progress: current.value };
  const v1 = tryParse(parseProgressV1, data);
  if (v1.ok) return { kind: 'upgraded', progress: upgradeV1(v1.value) };
  // Report the failure for the version the data claims to be, so the reason is useful.
  return { kind: 'unreadable', where: version === 1 ? v1.path : current.path };
}
