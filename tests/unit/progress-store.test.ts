import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_PREFIX,
  PROGRESS_KEY,
  emptyProgress,
  toggleBookmark,
  type KeyValueStore,
} from '../../src/store/progress';
import { createProgressStore } from '../../src/store/progress-store';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe('createProgressStore', () => {
  it('saves updates and notifies subscribers', () => {
    const storage = memory();
    const store = createProgressStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update((p) => toggleBookmark(p, 'x'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
    expect(JSON.parse(storage.data.get(PROGRESS_KEY)!).bookmarks).toEqual(['x']);
  });

  it('reports a failed save without throwing', () => {
    const storage = memory();
    storage.setItem = () => {
      throw new Error('full');
    };
    const store = createProgressStore(storage);
    store.update((p) => toggleBookmark(p, 'x'));
    expect(store.getSnapshot().saveFailed).toBe(true);
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
  });

  it('works with no storage at all', () => {
    const store = createProgressStore(null);
    expect(store.getSnapshot().status).toBe('unavailable');
    store.update((p) => toggleBookmark(p, 'x'));
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
  });

  it('replace() backs up the old data', () => {
    const storage = memory();
    const store = createProgressStore(storage, () => new Date('2026-09-24T00:00:00.000Z'));
    store.update((p) => toggleBookmark(p, 'x'));
    const r = store.replace(emptyProgress());
    expect(r.saved).toBe(true);
    expect(storage.data.has(r.backupKey!)).toBe(true);
    expect(store.getSnapshot().progress.bookmarks).toEqual([]);
  });

  it('never overwrites unreadable data it could not back up', () => {
    const storage = memory();
    storage.data.set(PROGRESS_KEY, '{not json');
    const write = storage.setItem;
    storage.setItem = (k, v) => {
      if (k.startsWith(BACKUP_PREFIX)) throw new Error('full');
      write(k, v);
    };
    const store = createProgressStore(storage);
    expect(store.getSnapshot().status).toBe('locked');
    store.update((p) => toggleBookmark(p, 'x'));
    expect(storage.data.get(PROGRESS_KEY)).toBe('{not json');
    expect(store.replace(emptyProgress()).refused).toBe(true);
    expect(storage.data.get(PROGRESS_KEY)).toBe('{not json');
  });

  it('replace() leaves everything as it was when the backup fails', () => {
    const storage = memory();
    const store = createProgressStore(storage);
    store.update((p) => toggleBookmark(p, 'x'));
    const write = storage.setItem;
    storage.setItem = (k, v) => {
      if (k.startsWith(BACKUP_PREFIX)) throw new Error('full');
      write(k, v);
    };
    expect(store.replace(emptyProgress())).toEqual({ saved: false, refused: true });
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
    expect(JSON.parse(storage.data.get(PROGRESS_KEY)!).bookmarks).toEqual(['x']);
  });

  it('reload() picks up another tab’s write', () => {
    const storage = memory();
    const store = createProgressStore(storage);
    storage.setItem(
      PROGRESS_KEY,
      JSON.stringify(toggleBookmark(emptyProgress(), 'from-other-tab')),
    );
    store.reload();
    expect(store.getSnapshot().progress.bookmarks).toEqual(['from-other-tab']);
  });
});
