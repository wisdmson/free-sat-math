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
        We couldn't read your saved progress, and this browser's storage is too full to back it up.
        We've left it untouched, so nothing you do now will be saved. Everything else still works.
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
