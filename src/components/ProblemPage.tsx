import { useEffect, useMemo, useState } from 'react';
import { similarProblem } from '../engine/practice';
import { problemFromId } from '../engine/registry';
import { createRng, randomSeed } from '../engine/rng';
import { url } from '../lib/paths';
import { recordAttempt, toggleBookmark } from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';
import ProblemView from './ProblemView';
import StorageBanner from './StorageBanner';

const idFromLocation = () => new URLSearchParams(window.location.search).get('id') ?? '';

/** /problem/?id=... : one problem by id (shared links and review retries). */
export default function ProblemPage({ desmosKey }: { desmosKey: string | null }) {
  const snapshot = useProgress();
  const rng = useMemo(() => createRng(randomSeed()), []);
  const [id, setId] = useState(idFromLocation);
  const found = useMemo(() => problemFromId(id), [id]);

  useEffect(() => {
    const onPop = () => setId(idFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (found === null) {
    return (
      <div className="notice">
        <h1>Problem not found</h1>
        <p>This link doesn't match a problem on this site. It may be mistyped or out of date.</p>
        <p>
          <a href={url('/skills/')}>Browse skills</a> ·{' '}
          <a href={url('/review/')}>Your review list</a>
        </p>
      </div>
    );
  }

  const { problem, updated } = found;
  return (
    <div>
      <StorageBanner snapshot={snapshot} />
      {updated && <p className="banner">This problem was updated since you last saw it.</p>}
      <ProblemView
        key={problem.id}
        problem={problem}
        desmosKey={desmosKey}
        bookmarked={snapshot.progress.bookmarks.includes(problem.id)}
        onToggleBookmark={() => getProgressStore().update((p) => toggleBookmark(p, problem.id))}
        onGraded={(result) =>
          getProgressStore().update((p) =>
            recordAttempt(p, {
              problemId: problem.id,
              skill: problem.skill,
              difficulty: problem.difficulty,
              correct: result.correct,
              response: result.response,
              timeMs: result.timeMs,
              at: new Date().toISOString(),
              mode: 'practice',
            }),
          )
        }
        onSimilar={() => {
          const similar = similarProblem(problem, rng);
          if (similar === null) return;
          window.history.pushState(null, '', url(`/problem/?id=${encodeURIComponent(similar.id)}`));
          setId(similar.id);
        }}
      />
    </div>
  );
}
