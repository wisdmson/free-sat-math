import { useSyncExternalStore } from 'react';
import {
  PROGRESS_KEY,
  browserSession,
  browserStorage,
  emptyProgress,
  loadProgress,
  replaceProgress,
  saveProgress,
  type KeyValueStore,
  type LoadStatus,
  type ReplaceResult,
} from './progress';
import type { Progress } from './schema';

export interface StoreSnapshot {
  progress: Progress;
  status: LoadStatus;
  /** The last write failed (storage full or blocked). */
  saveFailed: boolean;
  /** Set when unreadable data was backed up on load. */
  backupKey?: string;
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
}

export function createProgressStore(
  storage: KeyValueStore | null,
  now: () => Date = () => new Date(),
  session: KeyValueStore | null = null,
): ProgressStore {
  const fromLoad = (): StoreSnapshot => {
    const loaded = loadProgress(storage, now(), session);
    const base = { progress: loaded.progress, status: loaded.status, saveFailed: false };
    return loaded.backupKey === undefined ? base : { ...base, backupKey: loaded.backupKey };
  };
  let snapshot = fromLoad();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(fn) {
      const progress = fn(snapshot.progress);
      // Locked: unreadable data we couldn't back up stays untouched, so nothing is saved over it.
      const saveFailed = snapshot.status === 'locked' ? false : !saveProgress(storage, progress);
      snapshot = { ...snapshot, progress, saveFailed };
      emit();
    },
    replace(next) {
      const result = replaceProgress(storage, next, now());
      if (result.refused) return result;
      snapshot = { ...snapshot, progress: next, saveFailed: !result.saved };
      emit();
      return result;
    },
    reload() {
      snapshot = fromLoad();
      emit();
    },
  };
}

let shared: ProgressStore | null = null;

/** The one store for this page, shared by every island. Browser only. */
export function getProgressStore(): ProgressStore {
  if (shared === null) {
    const store = createProgressStore(browserStorage(), undefined, browserSession());
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
