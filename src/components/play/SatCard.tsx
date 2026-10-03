import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { checkSpr, sanitizeSprTyping } from '../../engine/answer';
import { LETTERS, type Problem } from '../../engine/problem';
import { answerText } from '../../lib/labels';
import MathText from '../MathText';
import NumPad from '../NumPad';

// Loaded on demand so they don't count against the page's first-load JS.
const Solution = lazy(() => import('../Solution'));
const DesmosPanel = lazy(() => import('../DesmosPanel'));

export interface CardResult {
  correct: boolean;
  response: string;
  timeMs: number;
  points: number;
  multiplier: number;
}

interface Props {
  problem: Problem;
  desmosKey: string | null;
  result: CardResult | undefined;
  reduced: boolean;
  /** True while this card is the one on screen. Defaults to true. */
  active?: boolean;
  onAnswer(r: { correct: boolean; response: string; timeMs: number }): void;
  /** Quick Play's "Guessed?" chip (spec §5.3), shown after answering while `chipOpen`. */
  guessed?: boolean;
  chipOpen?: boolean;
  onGuessed?(guessed: boolean): void;
}

/** One full-screen question card: tap an answer (or type and Check), see the result. */
export default function SatCard({
  problem,
  desmosKey,
  result,
  reduced,
  active = true,
  onAnswer,
  guessed = false,
  chipOpen = false,
  onGuessed,
}: Props) {
  const [typed, setTyped] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'why' | 'calc'>('none');
  const answered = useRef(false);
  // Cards are built a few ahead of time; the clock starts when this one first comes on screen.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (active && startedAt.current === null) startedAt.current = performance.now();
  }, [active]);

  const elapsed = () => {
    const now = performance.now();
    return Math.round(now - (startedAt.current ?? now));
  };
  const submit = (correct: boolean, response: string) => {
    if (answered.current || result !== undefined) return;
    answered.current = true;
    onAnswer({ correct, response, timeMs: elapsed() });
  };

  const pickedIndex = result ? LETTERS.indexOf(result.response as (typeof LETTERS)[number]) : -1;
  const rightIndex = problem.answer.kind === 'choice' ? problem.answer.index : -1;
  const state = result === undefined ? '' : result.correct ? 'is-right' : 'is-wrong';

  return (
    <article className={`play-card ${state}`} aria-labelledby={`q-${problem.id}`}>
      <h2 id={`q-${problem.id}`} className="visually-hidden" tabIndex={-1}>
        Question
      </h2>
      <div id={`stem-${problem.id}`}>
        <MathText block text={problem.stem} className="play-stem" />
      </div>

      {problem.choices ? (
        <div className="play-choices" role="group" aria-label="Answer choices">
          {problem.choices.map((choice, i) => {
            const letter = LETTERS[i] as string;
            const cls =
              result === undefined
                ? ''
                : i === rightIndex
                  ? 'is-correct'
                  : i === pickedIndex
                    ? 'is-wrong'
                    : '';
            return (
              <button
                key={letter}
                type="button"
                className={`play-choice ${cls}`}
                data-letter={letter}
                disabled={result !== undefined}
                onClick={() => submit(i === rightIndex, letter)}
              >
                <span className="choice-letter">{letter}</span>
                <MathText text={choice.text} />
              </button>
            );
          })}
        </div>
      ) : (
        <NumPad
          id={`answer-${problem.id}`}
          label="Your answer"
          value={typed}
          onChange={(v) => setTyped(sanitizeSprTyping(v))}
          onSubmit={() => {
            if (problem.answer.kind === 'choice' || typed.trim() === '') return;
            const g = checkSpr(problem.answer, typed);
            if (g.status === 'invalid') setInvalid(g.reason);
            else submit(g.correct, typed.trim());
          }}
          maxLength={6}
          active={active && result === undefined}
          locked={result !== undefined}
        />
      )}

      <div role="status" aria-live="polite" className="play-feedback">
        {invalid !== null && result === undefined && <p className="feedback-invalid">{invalid}</p>}
        {result?.correct && (
          <p className="feedback-correct">
            Correct! +{result.points}
            {result.multiplier > 1 ? ` (×${result.multiplier})` : ''}
          </p>
        )}
        {result && !result.correct && (
          <p className="feedback-wrong">
            Not quite. Answer: <MathText text={answerText(problem)} />
          </p>
        )}
      </div>
      {result !== undefined &&
        onGuessed !== undefined &&
        (chipOpen ? (
          <button
            type="button"
            className={`play-chip ${guessed ? 'is-on' : ''}`}
            aria-pressed={guessed}
            onClick={() => onGuessed(!guessed)}
          >
            <span aria-hidden="true">{guessed ? '✓ ' : ''}</span>
            Guessed?
          </button>
        ) : (
          guessed && <p className="hint">Marked as a guess</p>
        ))}
      {result?.correct && !reduced && <span className="play-burst" aria-hidden="true" />}

      <div className="play-tools">
        {result !== undefined && (
          <button
            type="button"
            className="button"
            onClick={() => setSheet(sheet === 'why' ? 'none' : 'why')}
          >
            Why?
          </button>
        )}
        <button
          type="button"
          className="button"
          onClick={() => setSheet(sheet === 'calc' ? 'none' : 'calc')}
        >
          Calculator
        </button>
      </div>

      {sheet !== 'none' && (
        <div className="play-sheet">
          <button type="button" className="link-button" onClick={() => setSheet('none')}>
            Close
          </button>
          <Suspense fallback={<p className="hint">Loading…</p>}>
            {sheet === 'why' ? (
              <Solution
                problem={problem}
                wrongIndex={result && !result.correct && pickedIndex >= 0 ? pickedIndex : null}
              />
            ) : (
              <DesmosPanel apiKey={desmosKey} expressions={problem.desmos ?? []} />
            )}
          </Suspense>
        </div>
      )}
    </article>
  );
}
