import { useSyncExternalStore } from 'react';
import {
  PROGRESS_KEY,
  browserSession,
  browserStorage,
  emptyProgress,
  findRestorableBackup,
  loadProgress,
  replaceProgress,
  saveProgress,
  type KeyValueStore,
  type LoadStatus,
  type ReplaceResult,
} from './progress';
import { readProgress } from './migrate';
import type { Progress } from './schema';

export interface StoreSnapshot {
  progress: Progress;
  status: LoadStatus;
  /** The last write failed (storage full or blocked). */
  saveFailed: boolean;
  /** Set when unreadable data was backed up on load. */
  backupKey?: string;
  /** A recent backup worth offering to restore (see findRestorableBackup). */
  restorable?: string;
}

export interface ProgressStore {
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;
  /** Applies a pure update and saves it. */
  update(fn: (p: Progress) => Progress): void;
  /** Backs up the saved data, then replaces it (import and reset). Refused if no backup fits. */
  replace(next: Progress): ReplaceResult;
  /** Re-reads storage (another tab wrote to it). */
  reload(): void;
  /** Replaces progress with a backup (backing up the current record first). */
  restore(key: string): ReplaceResult;
}

export function createProgressStore(
  storage: KeyValueStore | null,
  now: () => Date = () => new Date(),
  session: KeyValueStore | null = null,
  listKeys: () => readonly string[] = () => [],
): ProgressStore {
  const fromLoad = (): StoreSnapshot => {
    const loaded = loadProgress(storage, now(), session);
    const base: StoreSnapshot = {
      progress: loaded.progress,
      status: loaded.status,
      saveFailed: false,
    };
    if (loaded.backupKey !== undefined) base.backupKey = loaded.backupKey;
    const offerable = ['ok', 'fresh', 'recovered'].includes(loaded.status);
    if (storage !== null && offerable) {
      const restorable = findRestorableBackup(storage, listKeys(), loaded.progress, now());
      if (restorable !== null) base.restorable = restorable;
    }
    return base;
  };
  let snapshot = fromLoad();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const replace = (next: Progress): ReplaceResult => {
    if (snapshot.status === 'newer') return { saved: false, refused: true };
    const result = replaceProgress(storage, next, now());
    if (result.refused) return result;
    snapshot = { ...snapshot, progress: next, saveFailed: !result.saved };
    emit();
    return result;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(fn) {
      const progress = fn(snapshot.progress);
      // Locked or newer: someone else's data is in storage, so nothing is saved over it.
      const readOnly = snapshot.status === 'locked' || snapshot.status === 'newer';
      const saveFailed = readOnly ? false : !saveProgress(storage, progress);
      snapshot = { ...snapshot, progress, saveFailed };
      emit();
    },
    replace,
    reload() {
      snapshot = fromLoad();
      emit();
    },
    restore(key) {
      if (storage === null) return { saved: false };
      let data: unknown;
      try {
        data = JSON.parse(storage.getItem(key) ?? '');
      } catch {
        return { saved: false };
      }
      const read = readProgress(data);
      if (read.kind === 'newer' || read.kind === 'unreadable') return { saved: false };
      const result = replace(read.progress);
      if (!result.refused) {
        const next: StoreSnapshot = {
          progress: snapshot.progress,
          status: snapshot.status,
          saveFailed: snapshot.saveFailed,
        };
        if (snapshot.backupKey !== undefined) next.backupKey = snapshot.backupKey;
        snapshot = next;
        emit();
      }
      return result;
    },
  };
}

let shared: ProgressStore | null = null;

/** The one store for this page, shared by every island. Browser only. */
export function getProgressStore(): ProgressStore {
  if (shared === null) {
    const store = createProgressStore(browserStorage(), undefined, browserSession(), () => {
      try {
        return Object.keys(window.localStorage);
      } catch {
        return [];
      }
    });
    window.addEventListener('storage', (e) => {
      if (e.key === PROGRESS_KEY) store.reload();
    });
    shared = store;
  }
  return shared;
}

const SERVER_SNAPSHOT: StoreSnapshot = {
  progress: emptyProgress(),
  status: 'fresh',
  saveFailed: false,
};
const noop = () => () => {};

/** Progress for React components. Server-side rendering sees an empty, fresh snapshot. */
export function useProgress(): StoreSnapshot & { store: ProgressStore | null } {
  const store = typeof window === 'undefined' ? null : getProgressStore();
  const snap = useSyncExternalStore(
    store ? store.subscribe : noop,
    store ? store.getSnapshot : () => SERVER_SNAPSHOT,
    () => SERVER_SNAPSHOT,
  );
  return { ...snap, store };
}
