import { describe, expect, it } from 'vitest';
import {
  BACKUP_PREFIX,
  MAX_ATTEMPTS,
  PROGRESS_KEY,
  emptyProgress,
  exportFileName,
  exportProgress,
  loadProgress,
  missedProblems,
  parseImport,
  recordAttempt,
  replaceProgress,
  saveProgress,
  skillAccuracy,
  toggleBookmark,
  type KeyValueStore,
} from '../../src/store/progress';
import type { Attempt } from '../../src/store/schema';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  /** Only backup writes fail: a nearly full browser can still hold the current record. */
  failBackups = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites || (this.failBackups && k.startsWith(BACKUP_PREFIX)))
      throw new DOMException('quota', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const NOW = new Date('2026-09-24T12:00:00.000Z');
const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  problemId: 'g:alg.systems.solve-system@1:easy:mcq:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  correct: true,
  response: 'A',
  timeMs: 1000,
  at: '2026-09-24T10:00:00.000Z',
  mode: 'practice',
  ...over,
});

describe('loadProgress', () => {
  it('reports unavailable storage', () => {
    expect(loadProgress(null).status).toBe('unavailable');
  });
  it('starts fresh when nothing is saved', () => {
    const r = loadProgress(new MemoryStore());
    expect(r.status).toBe('fresh');
    expect(r.progress).toEqual(emptyProgress());
  });
  it('round-trips saved progress', () => {
    const store = new MemoryStore();
    const p = recordAttempt(emptyProgress(), attempt());
    expect(saveProgress(store, p)).toBe(true);
    expect(loadProgress(store)).toEqual({ progress: p, status: 'ok' });
  });
  it('backs up unreadable data instead of deleting it', () => {
    for (const raw of ['{not json', JSON.stringify({ schemaVersion: 99 })]) {
      const store = new MemoryStore();
      store.setItem(PROGRESS_KEY, raw);
      const r = loadProgress(store, NOW);
      expect(r.status).toBe('recovered');
      expect(r.backupKey).toBe(`${BACKUP_PREFIX}2026-09-24T12:00:00.000Z`);
      expect(store.getItem(r.backupKey!)).toBe(raw);
      expect(r.progress).toEqual(emptyProgress());
    }
  });
  it('backs up unreadable data once, not again on every page load', () => {
    const store = new MemoryStore();
    store.setItem(PROGRESS_KEY, '{not json');
    loadProgress(store, NOW);
    loadProgress(store, new Date('2026-09-24T12:05:00.000Z'));
    const backups = [...store.data.keys()].filter((k) => k.startsWith(BACKUP_PREFIX));
    expect(backups).toHaveLength(1);
  });
  it('keeps telling the student about the recovery for the rest of the session', () => {
    const store = new MemoryStore();
    const session = new MemoryStore();
    store.setItem(PROGRESS_KEY, '{not json');
    const first = loadProgress(store, NOW, session);
    const second = loadProgress(store, new Date('2026-09-24T12:05:00.000Z'), session);
    expect(second.status).toBe('recovered');
    expect(second.backupKey).toBe(first.backupKey);
  });
  it('leaves unreadable data untouched when no backup can be written', () => {
    const store = new MemoryStore();
    store.setItem(PROGRESS_KEY, '{not json');
    store.failBackups = true;
    const r = loadProgress(store, NOW);
    expect(r.status).toBe('locked');
    expect(store.getItem(PROGRESS_KEY)).toBe('{not json');
  });
});

describe('saveProgress', () => {
  it('returns false instead of throwing when storage is full', () => {
    const store = new MemoryStore();
    store.failWrites = true;
    expect(saveProgress(store, emptyProgress())).toBe(false);
    expect(saveProgress(null, emptyProgress())).toBe(false);
  });
});

describe('updates', () => {
  it('keeps only the newest attempts', () => {
    let p = emptyProgress();
    p = {
      ...p,
      attempts: Array.from({ length: MAX_ATTEMPTS }, (_, i) => attempt({ problemId: `id${i}` })),
    };
    p = recordAttempt(p, attempt({ problemId: 'newest' }));
    expect(p.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(p.attempts[0]?.problemId).toBe('id1');
    expect(p.attempts.at(-1)?.problemId).toBe('newest');
  });
  it('toggles bookmarks', () => {
    const on = toggleBookmark(emptyProgress(), 'x');
    expect(on.bookmarks).toEqual(['x']);
    expect(toggleBookmark(on, 'x').bookmarks).toEqual([]);
  });
});

describe('derived views', () => {
  it('lists problems whose latest attempt was wrong, newest first', () => {
    let p = emptyProgress();
    p = recordAttempt(
      p,
      attempt({ problemId: 'a', correct: false, at: '2026-09-24T09:00:00.000Z' }),
    );
    p = recordAttempt(
      p,
      attempt({ problemId: 'b', correct: false, at: '2026-09-24T10:00:00.000Z' }),
    );
    p = recordAttempt(
      p,
      attempt({ problemId: 'a', correct: true, at: '2026-09-24T11:00:00.000Z' }),
    );
    p = recordAttempt(
      p,
      attempt({ problemId: 'c', correct: false, at: '2026-09-24T12:00:00.000Z' }),
    );
    expect(missedProblems(p).map((m) => m.problemId)).toEqual(['c', 'b']);
  });
  it('computes accuracy over the last N attempts', () => {
    let p = emptyProgress();
    for (let i = 0; i < 25; i++) p = recordAttempt(p, attempt({ correct: i >= 5 }));
    expect(skillAccuracy(p, 'alg.systems')).toEqual({ correct: 20, attempts: 20 });
    expect(skillAccuracy(p, 'geo.circles')).toEqual({ correct: 0, attempts: 0 });
  });
});

describe('export and import', () => {
  it('names the file by date', () => {
    expect(exportFileName(NOW)).toBe('free-sat-math-progress-2026-09-24.json');
  });
  it('round-trips through export and parseImport', () => {
    const p = toggleBookmark(recordAttempt(emptyProgress(), attempt()), 'x');
    const r = parseImport(exportProgress(p));
    expect(r).toEqual({ ok: true, progress: p, summary: { attempts: 1, tests: 0, bookmarks: 1 } });
  });
  it('rejects files that are not progress files, with a reason', () => {
    expect(parseImport('nope')).toEqual({ ok: false, reason: 'This file is not valid JSON.' });
    const bad = parseImport(JSON.stringify({ ...emptyProgress(), attempts: [{ problemId: 1 }] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain('attempts.0');
  });
  it('backs up current data before replacing it', () => {
    const store = new MemoryStore();
    saveProgress(store, recordAttempt(emptyProgress(), attempt()));
    const before = store.getItem(PROGRESS_KEY);
    const r = replaceProgress(store, emptyProgress(), NOW);
    expect(r.saved).toBe(true);
    expect(store.getItem(r.backupKey!)).toBe(before);
    expect(loadProgress(store).progress).toEqual(emptyProgress());
  });
  it('refuses to replace saved data when the backup cannot be written', () => {
    const store = new MemoryStore();
    saveProgress(store, recordAttempt(emptyProgress(), attempt()));
    const before = store.getItem(PROGRESS_KEY);
    store.failBackups = true;
    const r = replaceProgress(store, emptyProgress(), NOW);
    expect(r).toEqual({ saved: false, refused: true });
    expect(store.getItem(PROGRESS_KEY)).toBe(before);
  });
});
