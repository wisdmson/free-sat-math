import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateMental } from '../../engine/mental/build';
import { checkMental } from '../../engine/mental/check';
import type { DrillId } from '../../engine/mental/ids';
import { DRILLS, getDrill } from '../../engine/mental/registry';
import {
  SPRINT_MS,
  recordSprintAnswer,
  sprintSummary,
  startSprint,
  type SprintState,
  type SprintSummary,
} from '../../engine/mental/sprint';
import type { MentalProblem } from '../../engine/mental/types';
import { createRng, randomSeed } from '../../engine/rng';
import { applyGymSession } from '../../store/mental';
import { getProgressStore, useProgress } from '../../store/progress-store';
import NumPad from '../NumPad';
import StorageBanner from '../StorageBanner';

type View =
  | { kind: 'pick' }
  | { kind: 'sprint'; drill: DrillId; run: number }
  | { kind: 'done'; drill: DrillId; summary: SprintSummary; previousBest: number };

/** Median seconds per correct answer over the last 20 sessions, as a small line chart. */
function Trend({ drill }: { drill: DrillId }) {
  const { progress } = useProgress();
  const points = progress.mental.sessions
    .filter((s) => s.drill === drill && s.medianMs > 0)
    .slice(-20);
  if (points.length < 2) return <p className="hint">Do a few sprints to see your speed trend.</p>;
  const secs = points.map((s) => s.medianMs / 1000);
  const max = Math.max(...secs);
  const min = Math.min(...secs);
  const span = max - min || 1;
  const path = secs
    .map((v, i) => `${(i / (secs.length - 1)) * 280 + 10},${70 - ((v - min) / span) * 60}`)
    .join(' ');
  return (
    <figure className="gym-trend">
      <svg
        viewBox="0 0 300 80"
        role="img"
        aria-label={`Seconds per correct answer, last ${secs.length} sprints: from ${secs[0]?.toFixed(1)} to ${secs.at(-1)?.toFixed(1)}`}
      >
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <figcaption className="hint">
        Seconds per correct answer, last {secs.length} sprints (lower is faster)
      </figcaption>
    </figure>
  );
}

function Sprint({ drill, onDone }: { drill: DrillId; onDone(s: SprintSummary): void }) {
  const store = getProgressStore();
  const rng = useMemo(() => createRng(randomSeed()), []);
  const startTier = store.getSnapshot().progress.mental.tier[drill] ?? 1;
  const state = useRef<SprintState>(startSprint(drill, startTier));
  // Set when the sprint mounts (clocks are read in effects, never during render).
  const endsAt = useRef(Infinity);
  const shownAt = useRef(0);
  const finished = useRef(false);
  const [problem, setProblem] = useState<MentalProblem | null>(() =>
    generateMental(getDrill(drill)!, startTier, rng),
  );
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState('');
  const [flash, setFlash] = useState<'' | '✓' | '✗'>('');
  const [left, setLeft] = useState(SPRINT_MS);
  const [right, setRight] = useState(0);

  // The parent passes a new onDone on every render (e.g. when another tab saves progress). Keep
  // the latest in a ref so the clock below is set up once and a sprint is always 60 s.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDoneRef.current(sprintSummary(state.current));
  }, []);

  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The drill list is long on phones: bring the question into view.
    top.current?.scrollIntoView({ block: 'start' });
    endsAt.current = Date.now() + SPRINT_MS;
    shownAt.current = performance.now();
    const id = window.setInterval(() => {
      const ms = endsAt.current - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) finish();
    }, 200);
    return () => window.clearInterval(id);
  }, [finish]);

  const answer = (correct: boolean) => {
    if (finished.current || Date.now() >= endsAt.current) return finish();
    state.current = recordSprintAnswer(
      state.current,
      correct,
      Math.round(performance.now() - shownAt.current),
    );
    if (correct) setRight((n) => n + 1);
    setFlash(correct ? '✓' : '✗');
    setTyped('');
    setHint('');
    setProblem(generateMental(getDrill(drill)!, state.current.tier, rng));
    shownAt.current = performance.now();
  };

  if (problem === null) return <p className="notice">We couldn't create a question just now.</p>;
  return (
    <div className="gym-sprint" ref={top}>
      <div className="gym-bar">
        <span className="gym-clock">{Math.ceil(left / 1000)}s</span>
        <span>{right} correct</span>
        <span
          role="status"
          aria-live="polite"
          className={`gym-flash ${flash === '✓' ? 'is-right' : flash === '✗' ? 'is-wrong' : ''}`}
        >
          {flash}
        </span>
      </div>
      <p className="gym-prompt" data-mental-id={problem.id}>
        {problem.prompt}
      </p>
      {problem.answer.kind === 'choice' ? (
        <div className="play-choices" role="group" aria-label="Answer choices">
          {problem.answer.choices.map((c, i) => (
            <button
              key={c}
              type="button"
              className="play-choice"
              onClick={() => answer(problem.answer.kind === 'choice' && i === problem.answer.index)}
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <>
          <NumPad
            id="gym-answer"
            label="Your answer"
            value={typed}
            onChange={setTyped}
            onSubmit={() => {
              if (typed === '') return;
              const g = checkMental(problem, typed);
              if (g.status === 'invalid') setHint(g.reason);
              else answer(g.correct);
            }}
            submitLabel="Enter"
            suffix={problem.answer.suffix ?? ''}
          />
          {hint !== '' && <p className="feedback-invalid">{hint}</p>}
        </>
      )}
    </div>
  );
}

/** The Mental Math Gym: pick a drill, sprint for 60 seconds, see your best (spec §2.2). */
export default function GymApp() {
  const snapshot = useProgress();
  const [view, setView] = useState<View>({ kind: 'pick' });
  const { mental } = snapshot.progress;

  if (view.kind === 'sprint') {
    return (
      <Sprint
        key={view.run}
        drill={view.drill}
        onDone={(summary) => {
          const previousBest =
            getProgressStore().getSnapshot().progress.mental.best[view.drill] ?? 0;
          getProgressStore().update((p) =>
            applyGymSession(p, { drill: view.drill, summary, now: new Date() }),
          );
          setView({ kind: 'done', drill: view.drill, summary, previousBest });
        }}
      />
    );
  }
  if (view.kind === 'done') {
    const { summary, previousBest } = view;
    const accuracy =
      summary.attempted === 0 ? 0 : Math.round((100 * summary.correct) / summary.attempted);
    const isNewBest = summary.correct > previousBest;
    return (
      <div className="gym-done">
        <StorageBanner snapshot={snapshot} />
        <p className="eyebrow">{getDrill(view.drill)?.name}</p>
        <h2 className="gym-score">{summary.correct} correct</h2>
        <p className="gym-stats">
          {summary.attempted} answered · {accuracy}% accurate
        </p>
        <p className={`gym-best ${isNewBest ? 'is-new' : ''}`}>
          {isNewBest ? (
            <>
              <span aria-hidden="true">🎉 </span>New personal best!
            </>
          ) : (
            `Personal best: ${previousBest}`
          )}
        </p>
        <Trend drill={view.drill} />
        <div className="button-row">
          <button
            type="button"
            className="button primary"
            onClick={() => setView({ kind: 'sprint', drill: view.drill, run: Date.now() })}
          >
            Go again
          </button>
          <button type="button" className="button" onClick={() => setView({ kind: 'pick' })}>
            Pick a drill
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="gym-pick">
      <StorageBanner snapshot={snapshot} />
      <p className="lead">Pick a drill. You get 60 seconds: answer as many as you can.</p>
      <div className="gym-grid">
        {DRILLS.map((d) => (
          <button
            key={d.id}
            type="button"
            className="gym-drill"
            onClick={() => setView({ kind: 'sprint', drill: d.id, run: Date.now() })}
          >
            <strong>{d.name}</strong>
            <span>{d.blurb}</span>
            <span className="hint">
              Best {mental.best[d.id] ?? 0} · Level {mental.tier[d.id] ?? 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
