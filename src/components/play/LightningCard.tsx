import { useEffect, useRef, useState } from 'react';
import { LIGHTNING_PERFECT_BONUS } from '../../engine/game';
import { checkMental } from '../../engine/mental/check';
import type { MentalProblem } from '../../engine/mental/types';
import NumPad from '../NumPad';

export interface LightningResult {
  done: boolean;
  right: number;
}

interface Props {
  questions: readonly [MentalProblem, MentalProblem, MentalProblem];
  /** Seconds per question, or null for no clock. */
  seconds: number | null;
  active: boolean;
  result: LightningResult | undefined;
  /** Returns the points awarded, for the feedback line. */
  onAnswer(r: { correct: boolean; answered: boolean }): number;
  /** Called once, after the third question, with how many were right. */
  onDone(right: number): void;
}

/** ⚡ 3 mental-math questions against the clock (spec §2.1). */
export default function LightningCard({
  questions,
  seconds,
  active,
  result,
  onAnswer,
  onDone,
}: Props) {
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [typed, setTyped] = useState('');
  const [line, setLine] = useState('');
  const [left, setLeft] = useState(seconds === null ? null : seconds * 1000);
  const locked = useRef(false);
  const done = result?.done === true || i >= 3;
  const q = questions[Math.min(i, 2)] as MentalProblem;

  const advance = (correct: boolean, answered: boolean) => {
    if (locked.current || done) return;
    locked.current = true;
    const points = onAnswer({ correct, answered });
    const nextRight = right + (correct ? 1 : 0);
    setRight(nextRight);
    setLine(
      !answered
        ? "Time's up"
        : correct
          ? `✓ +${points}`
          : `✗ ${q.answer.kind === 'number' ? q.answer.value : q.answer.choices[q.answer.index]}`,
    );
    window.setTimeout(() => {
      setTyped('');
      setI((n) => n + 1);
      setLeft(seconds === null ? null : seconds * 1000);
      locked.current = false;
      if (i === 2) onDone(nextRight);
    }, 700);
  };

  // One clock per question, only while this card is on screen.
  useEffect(() => {
    if (seconds === null || !active || done) return;
    const deadline = Date.now() + seconds * 1000;
    const id = window.setInterval(() => {
      const ms = deadline - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) {
        window.clearInterval(id);
        advance(false, false);
      }
    }, 100);
    return () => window.clearInterval(id);
    // advance reads current state through closures that change with i; re-arm per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, active, seconds, done]);

  if (done) {
    const total = result?.right ?? right;
    return (
      <div className="play-card play-lightning">
        <h2 tabIndex={-1}>⚡ Lightning</h2>
        <p className="play-lightning-score">
          {total === 3 ? `Perfect! +${LIGHTNING_PERFECT_BONUS} bonus` : `${total} of 3 right`}
        </p>
      </div>
    );
  }
  return (
    <div className="play-card play-lightning">
      <h2 tabIndex={-1}>⚡ Lightning</h2>
      <div className="gym-bar">
        <span>{i} of 3 done</span>
        {left !== null && <span className="gym-clock">{Math.ceil(left / 1000)}s</span>}
        <span role="status" aria-live="polite">
          {line}
        </span>
      </div>
      <p className="gym-prompt" data-mental-id={q.id}>
        {q.prompt}
      </p>
      {q.answer.kind === 'choice' ? (
        <div className="play-choices" role="group" aria-label="Answer choices">
          {q.answer.choices.map((c, k) => (
            <button
              key={c}
              type="button"
              className="play-choice"
              onClick={() => advance(q.answer.kind === 'choice' && k === q.answer.index, true)}
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <NumPad
          id={`lightning-${q.id}`}
          label="Your answer"
          value={typed}
          onChange={setTyped}
          onSubmit={() => {
            if (typed === '') return;
            const g = checkMental(q, typed);
            if (g.status === 'invalid') setLine(g.reason);
            else advance(g.correct, true);
          }}
          submitLabel="Enter"
          suffix={q.answer.suffix ?? ''}
          active={active}
        />
      )}
    </div>
  );
}
