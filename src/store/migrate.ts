import { schemaVersionOf } from './schema-version';
import {
  PROGRESS_SCHEMA_VERSION,
  progressSchema,
  progressSchemaV1,
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
  const current = progressSchema.safeParse(data);
  if (current.success) return { kind: 'current', progress: current.data };
  const v1 = progressSchemaV1.safeParse(data);
  if (v1.success) return { kind: 'upgraded', progress: upgradeV1(v1.data) };
  const first = current.error.issues[0];
  return { kind: 'unreadable', where: first ? first.path.join('.') : '' };
}
