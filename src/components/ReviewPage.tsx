import { describeProblemId } from '../engine/registry';
import { SKILLS, getSkill } from '../engine/skills';
import { LEVEL_NAME, shortDate } from '../lib/labels';
import { url } from '../lib/paths';
import { attemptCount, missedProblems, skillAccuracy, toggleBookmark } from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';
import StorageBanner from './StorageBanner';

const problemLink = (id: string) => url(`/problem/?id=${encodeURIComponent(id)}`);

export default function ReviewPage() {
  const snapshot = useProgress();
  const { progress } = snapshot;
  const missed = missedProblems(progress);
  const bookmarks = [...progress.bookmarks].reverse();
  const practiced = SKILLS.filter((s) => attemptCount(progress, s.id) > 0);

  return (
    <div className="review">
      <StorageBanner snapshot={snapshot} />

      <section aria-labelledby="missed-heading">
        <h2 id="missed-heading">Missed problems ({missed.length})</h2>
        {missed.length === 0 ? (
          <p className="empty">
            Nothing here yet. Problems you get wrong show up here so you can retry them.
          </p>
        ) : (
          <ul className="item-list">
            {missed.map((m) => (
              <li key={m.problemId}>
                <span>
                  {getSkill(m.skill).name} · {LEVEL_NAME[m.difficulty]} · {shortDate(m.at)}
                </span>
                <a className="button" href={problemLink(m.problemId)}>
                  Retry
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="bookmarks-heading">
        <h2 id="bookmarks-heading">Bookmarks ({bookmarks.length})</h2>
        {bookmarks.length === 0 ? (
          <p className="empty">Bookmark a problem to keep it here.</p>
        ) : (
          <ul className="item-list">
            {bookmarks.map((id) => {
              const info = describeProblemId(id);
              return (
                <li key={id}>
                  <span>
                    {info === null
                      ? 'This problem is no longer available'
                      : `${getSkill(info.skill).name} · ${LEVEL_NAME[info.difficulty]}`}
                  </span>
                  <span className="button-row">
                    {info !== null && (
                      <a className="button" href={problemLink(id)}>
                        Open
                      </a>
                    )}
                    <button
                      type="button"
                      className="button"
                      onClick={() => getProgressStore().update((p) => toggleBookmark(p, id))}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="accuracy-heading">
        <h2 id="accuracy-heading">Accuracy by skill</h2>
        {practiced.length === 0 ? (
          <p className="empty">Answer a few problems to see how you're doing in each skill.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Problems tried</th>
                <th scope="col">Recent accuracy</th>
              </tr>
            </thead>
            <tbody>
              {practiced.map((s) => {
                const acc = skillAccuracy(progress, s.id);
                return (
                  <tr key={s.id}>
                    <th scope="row">{s.name}</th>
                    <td>{attemptCount(progress, s.id)}</td>
                    <td>
                      {Math.round((100 * acc.correct) / acc.attempts)}% of last {acc.attempts}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
