import { getProgressStore, type StoreSnapshot } from '../store/progress-store';

export default function StorageBanner({ snapshot }: { snapshot: StoreSnapshot }) {
  if (snapshot.status === 'unavailable' || snapshot.saveFailed) {
    return (
      <p className="banner banner-warn" role="status">
        Progress won't be saved in this browser because storage is blocked or full. Everything else
        still works.
      </p>
    );
  }
  if (snapshot.status === 'newer') {
    return (
      <p className="banner banner-warn" role="status">
        This site was updated in another tab. Refresh this page to keep saving your progress.
      </p>
    );
  }
  if (snapshot.status === 'locked') {
    return (
      <p className="banner banner-warn" role="status">
        This browser's storage is too full to keep a backup, so saving is paused to protect your
        progress. Everything else still works.
      </p>
    );
  }
  if (snapshot.restorable !== undefined) {
    const key = snapshot.restorable;
    return (
      <div className="banner" role="status">
        <p>We found a copy of your progress from the last day. Want it back?</p>
        <button type="button" className="button" onClick={() => getProgressStore().restore(key)}>
          Restore your progress
        </button>
      </div>
    );
  }
  if (snapshot.status === 'recovered') {
    return (
      <p className="banner" role="status">
        We couldn't read your saved progress, so you're starting fresh. A backup copy was kept in
        this browser.
      </p>
    );
  }
  return null;
}
