import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  lightningSoon,
  newFeedState,
  nextCard,
  type Card,
  type FeedState,
  type LightningMaker,
} from '../../engine/feed';
import {
  LIGHTNING_PERFECT_BONUS,
  LIGHTNING_PERFECT_COMBO,
  comboMultiplier,
  levelInfo,
  lightningSeconds,
  paceBonus,
  paceLimitMs,
  scoreLightningAnswer,
  scoreSatAnswer,
} from '../../engine/game';
import type { Problem } from '../../engine/problem';
import { createRng, randomSeed } from '../../engine/rng';
import { addBonusPoints, applyLightningAnswer, applyPlayAnswer } from '../../store/play';
import { setGuessed } from '../../store/progress';
import { getProgressStore, useProgress } from '../../store/progress-store';
import StorageBanner from '../StorageBanner';
import { answerFeedback, levelUpFeedback } from './feedback';
import LightningCard, { type LightningResult } from './LightningCard';
import SatCard, { type CardResult } from './SatCard';

/** Cards built ahead of the current one, so a swipe is instant. */
const LOOKAHEAD = 3;
/** Cards farther than this from the current one render as empty slots (keeps the DOM small). */
const RENDER_WINDOW = 3;

/** `?lightning=first` starts with a Lightning round. Only in builds made with PUBLIC_TEST_HOOKS=1. */
const lightningFirst = () =>
  import.meta.env.PUBLIC_TEST_HOOKS === '1' &&
  new URLSearchParams(window.location.search).get('lightning') === 'first';

/** `?pace=first` makes the first question a pace check. Only in PUBLIC_TEST_HOOKS=1 builds. */
const paceFirst = () =>
  import.meta.env.PUBLIC_TEST_HOOKS === '1' &&
  new URLSearchParams(window.location.search).get('pace') === 'first';

type Entry = {
  key: string;
  card: Card | null;
  result?: CardResult;
  lightning?: LightningResult;
  /** When the answer was saved: identifies its attempt for the Guessed? chip. */
  at?: string;
  guessed?: boolean;
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

/** The endless swipe feed. Loaded on demand so the start screen stays light. */
export default function PlayFeed({
  desmosKey,
  onExit,
}: {
  desmosKey: string | null;
  onExit(): void;
}) {
  const snapshot = useProgress();
  const reduced = useReducedMotion();
  const rng = useMemo(() => createRng(randomSeed()), []);
  const feedState = useRef<FeedState | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [current, setCurrent] = useState(0);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  // The drills load on demand, a few cards before the first Lightning round is due, so a short
  // session never downloads them. The test hook loads them first and waits.
  const hook = useMemo(() => lightningFirst(), []);
  const makeLightning = useRef<LightningMaker | undefined>(undefined);
  const lightningLoading = useRef(false);
  const [lightningReady, setLightningReady] = useState(false);
  const loadLightning = useCallback(() => {
    if (lightningLoading.current) return;
    lightningLoading.current = true;
    import('../../engine/mental/lightning').then(
      (m) => {
        makeLightning.current = m.lightningRound;
        setLightningReady(true);
      },
      // Offline or failed: rounds wait and questions continue; try again on a later card.
      () => {
        lightningLoading.current = false;
      },
    );
  }, []);
  useEffect(() => {
    if (hook) loadLightning();
  }, [hook, loadLightning]);

  const extend = useCallback(
    (minLength: number) => {
      const list = entriesRef.current;
      if (list.length >= minLength || list.at(-1)?.card === null) return;
      const store = getProgressStore();
      let state =
        feedState.current ??
        newFeedState(store.getSnapshot().progress.game.tipIndex, lightningFirst(), paceFirst());
      const added: Entry[] = [];
      while (list.length + added.length < minLength) {
        const r = nextCard(store.getSnapshot().progress, state, rng, makeLightning.current);
        if (r.card === null) {
          added.push({ key: `retry-${list.length + added.length}`, card: null });
          break;
        }
        if (r.card.kind === 'tip') {
          const tipIndex = r.state.tipIndex;
          store.update((p) => ({ ...p, game: { ...p.game, tipIndex } }));
        }
        state = r.state;
        added.push({ key: r.card.key, card: r.card });
      }
      feedState.current = state;
      if (lightningSoon(state, LOOKAHEAD + 2)) loadLightning();
      entriesRef.current = [...list, ...added];
      setEntries(entriesRef.current);
    },
    [rng, loadLightning],
  );

  useEffect(() => {
    if (hook && !lightningReady) return;
    extend(current + 1 + LOOKAHEAD);
  }, [current, extend, hook, lightningReady]);

  // The card filling most of the screen is the current one. One observer for the whole session:
  // re-creating it on every new card would re-report the previous card mid-scroll and flip back.
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const root = scroller.current;
    if (root === null || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (items) => {
        for (const it of items) {
          if (it.isIntersecting) setCurrent(Number((it.target as HTMLElement).dataset['index']));
        }
      },
      { root, threshold: 0.6 },
    );
    observer.current = io;
    return () => {
      io.disconnect();
      observer.current = null;
    };
  }, []);
  useEffect(() => {
    // observe() ignores slots it already watches, so only new cards are added.
    scroller.current
      ?.querySelectorAll('[data-index]')
      .forEach((el) => observer.current?.observe(el));
  }, [entries.length]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= entriesRef.current.length) return;
      const slot = scroller.current?.querySelector<HTMLElement>(`[data-index="${i}"]`);
      slot?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      setCurrent(i);
      slot?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    },
    [reduced],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const onButton = e.target instanceof HTMLButtonElement;
      if (
        e.key === 'ArrowDown' ||
        e.key === 'j' ||
        e.key === 'PageDown' ||
        (e.key === ' ' && !onButton)
      ) {
        e.preventDefault();
        goTo(current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(current - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, goTo]);

  const onAnswer = (
    index: number,
    problem: Problem,
    pace: boolean,
    r: { correct: boolean; response: string; timeMs: number },
  ) => {
    if (entriesRef.current[index]?.result !== undefined) return;
    const scored = scoreSatAnswer(comboRef.current, r.correct, problem.difficulty);
    const limit = pace ? paceLimitMs(getProgressStore().getSnapshot().progress.settings) : null;
    const bonus = limit === null ? 0 : paceBonus(r.correct, r.timeMs, limit);
    comboRef.current = scored.combo;
    setCombo(scored.combo);
    const store = getProgressStore();
    const before = levelInfo(store.getSnapshot().progress.game.points).level;
    const now = new Date();
    store.update((p) =>
      applyPlayAnswer(p, {
        problem,
        ...r,
        points: scored.points + bonus,
        combo: scored.combo,
        now,
      }),
    );
    const { settings, game } = store.getSnapshot().progress;
    answerFeedback(r.correct, settings);
    if (levelInfo(game.points).level > before) levelUpFeedback(settings);
    entriesRef.current = entriesRef.current.map((e, i) =>
      i === index
        ? {
            ...e,
            at: now.toISOString(),
            result: { ...r, points: scored.points, multiplier: scored.multiplier, bonus },
          }
        : e,
    );
    setEntries(entriesRef.current);
  };

  const onGuessed = (index: number, problemId: string, guessed: boolean) => {
    const at = entriesRef.current[index]?.at;
    if (at === undefined) return;
    getProgressStore().update((p) => setGuessed(p, problemId, at, guessed));
    entriesRef.current = entriesRef.current.map((e, i) => (i === index ? { ...e, guessed } : e));
    setEntries(entriesRef.current);
  };

  const onLightningAnswer = (index: number, r: { correct: boolean; answered: boolean }): number => {
    // The feed keeps the round's progress, so a card that scrolls away and back can't replay.
    const round = entriesRef.current[index]?.lightning ?? { done: false, right: 0, answered: 0 };
    if (round.done || round.answered >= 3) return 0;
    entriesRef.current = entriesRef.current.map((e, i) =>
      i === index
        ? {
            ...e,
            lightning: {
              done: false,
              right: round.right + (r.correct ? 1 : 0),
              answered: round.answered + 1,
            },
          }
        : e,
    );
    setEntries(entriesRef.current);
    const scored = scoreLightningAnswer(comboRef.current, r.correct);
    comboRef.current = scored.combo;
    setCombo(scored.combo);
    const store = getProgressStore();
    const before = levelInfo(store.getSnapshot().progress.game.points).level;
    store.update((p) =>
      applyLightningAnswer(p, {
        answered: r.answered,
        points: scored.points,
        combo: scored.combo,
        now: new Date(),
      }),
    );
    const { settings, game } = store.getSnapshot().progress;
    answerFeedback(r.correct, settings);
    if (levelInfo(game.points).level > before) levelUpFeedback(settings);
    return scored.points;
  };

  const onLightningDone = (index: number, right: number) => {
    if (right === 3) {
      comboRef.current += LIGHTNING_PERFECT_COMBO;
      setCombo(comboRef.current);
      getProgressStore().update((p) => addBonusPoints(p, LIGHTNING_PERFECT_BONUS));
    }
    entriesRef.current = entriesRef.current.map((e, i) =>
      i === index ? { ...e, lightning: { done: true, right, answered: 3 } } : e,
    );
    setEntries(entriesRef.current);
  };

  const retry = (index: number) => {
    entriesRef.current = entriesRef.current.slice(0, index);
    extend(index + 1 + LOOKAHEAD);
  };

  const { game } = snapshot.progress;
  const lvl = levelInfo(game.points);

  return (
    <div className="play-overlay" role="region" aria-label="Quick Play">
      <header className="play-hud">
        <button type="button" className="play-exit" aria-label="Exit Quick Play" onClick={onExit}>
          ✕
        </button>
        <span className="play-points">{game.points} pts</span>
        <span className="play-level">Level {lvl.level}</span>
        <span className={`play-combo ${combo >= 3 ? 'is-hot' : ''}`} aria-live="polite">
          {combo > 0 ? `Combo ${combo} · ×${comboMultiplier(combo)}` : ''}
        </span>
      </header>
      <StorageBanner snapshot={snapshot} />
      <div className="play-feed" ref={scroller}>
        {entries.map((e, i) => (
          <section
            key={e.key}
            className="play-slot"
            data-index={i}
            data-current={i === current}
            aria-label={`Card ${i + 1}`}
          >
            {Math.abs(i - current) > RENDER_WINDOW ? null : e.card === null ? (
              <div className="play-card">
                <p>We couldn't load the next question.</p>
                <button type="button" className="button primary" onClick={() => retry(i)}>
                  Try again
                </button>
              </div>
            ) : e.card.kind === 'tip' ? (
              <div className="play-card play-tip">
                <h2 tabIndex={-1}>Test-day tip</h2>
                <p>{e.card.text}</p>
              </div>
            ) : e.card.kind === 'lightning' ? (
              <LightningCard
                questions={e.card.questions}
                seconds={lightningSeconds(snapshot.progress.settings)}
                active={i === current}
                result={e.lightning}
                onAnswer={(r) => onLightningAnswer(i, r)}
                onDone={(right) => onLightningDone(i, right)}
              />
            ) : e.card.kind === 'sat' ? (
              <SatCard
                problem={e.card.problem}
                desmosKey={desmosKey}
                result={e.result}
                reduced={reduced}
                active={i === current}
                paceLimitMs={e.card.pace === true ? paceLimitMs(snapshot.progress.settings) : null}
                onAnswer={(r) =>
                  e.card?.kind === 'sat' && onAnswer(i, e.card.problem, e.card.pace === true, r)
                }
                guessed={e.guessed === true}
                chipOpen={current <= i + 1}
                onGuessed={(g) => e.card?.kind === 'sat' && onGuessed(i, e.card.problem.id, g)}
              />
            ) : null}
          </section>
        ))}
      </div>
      <nav className="play-arrows" aria-label="Move between cards">
        <button
          type="button"
          aria-label="Previous card"
          disabled={current === 0}
          onClick={() => goTo(current - 1)}
        >
          ↑
        </button>
        <button type="button" aria-label="Next card" onClick={() => goTo(current + 1)}>
          ↓
        </button>
      </nav>
    </div>
  );
}
