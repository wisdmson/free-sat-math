import { lazy, Suspense, useState } from 'react';
import { currentStreak, levelInfo } from '../../engine/game';
import { updateSettings } from '../../store/progress';
import { getProgressStore, useProgress } from '../../store/progress-store';
import StorageBanner from '../StorageBanner';

// The feed (cards, question picker, tips, sound) loads only once the student starts playing.
const PlayFeed = lazy(() => import('./PlayFeed'));

/** Quick Play: the start screen, then the endless feed (spec §2.1). */
export default function PlayApp({ desmosKey }: { desmosKey: string | null }) {
  const snapshot = useProgress();
  const [playing, setPlaying] = useState(
    () => new URLSearchParams(window.location.search).get('go') === '1',
  );
  if (playing) {
    return (
      <Suspense fallback={<p className="hint">Loading questions…</p>}>
        <PlayFeed desmosKey={desmosKey} onExit={() => setPlaying(false)} />
      </Suspense>
    );
  }

  const { game, settings } = snapshot.progress;
  const streak = currentStreak(game.answerDays, new Date());
  const lvl = levelInfo(game.points);
  return (
    <div className="play-start">
      <StorageBanner snapshot={snapshot} />
      <p className="play-streak">
        <span aria-hidden="true">🔥</span> {streak}-day streak
        <span className="hint"> · best {Math.max(game.bestStreak, streak)}</span>
      </p>
      <div className="play-level-card">
        <p>
          <strong>Level {lvl.level}</strong> · {game.points} points
        </p>
        <div
          className="meter"
          role="progressbar"
          aria-label={`Progress to level ${lvl.level + 1}`}
          aria-valuemin={0}
          aria-valuemax={lvl.needed}
          aria-valuenow={lvl.into}
        >
          <span style={{ width: `${(100 * lvl.into) / lvl.needed}%` }} />
        </div>
        <p className="hint">
          {lvl.needed - lvl.into} points to level {lvl.level + 1}
        </p>
      </div>
      <button
        type="button"
        className="button primary play-start-button"
        onClick={() => setPlaying(true)}
      >
        ▶ Play
      </button>
      <label className="inline-option">
        <input
          type="checkbox"
          checked={settings.sound}
          onChange={(e) =>
            getProgressStore().update((p) => updateSettings(p, { sound: e.target.checked }))
          }
        />
        Sound
      </label>
      <p className="hint">
        Answer 5 questions a day to keep your streak. Close any time: every answer saves as you go.
      </p>
    </div>
  );
}
