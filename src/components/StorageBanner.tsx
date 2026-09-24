import type { StoreSnapshot } from '../store/progress-store';

export default function StorageBanner({ snapshot }: { snapshot: StoreSnapshot }) {
  if (snapshot.status === 'unavailable' || snapshot.saveFailed) {
    return (
      <p className="banner banner-warn" role="status">
        Progress won't be saved in this browser because storage is blocked or full. Everything else
        still works.
      </p>
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
