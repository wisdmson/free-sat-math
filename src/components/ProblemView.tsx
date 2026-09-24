import { useEffect, useRef, useState } from 'react';
import { checkSpr, type Grade } from '../engine/answer';
import { LETTERS, type Problem } from '../engine/problem';
import { getSkill } from '../engine/skills';
import { LEVEL_NAME } from '../lib/labels';
import { url } from '../lib/paths';
import AnswerInput from './AnswerInput';
import ChoiceList from './ChoiceList';
import DesmosPanel from './DesmosPanel';
import FormulaSheet from './FormulaSheet';
import MathText from './MathText';
import Solution from './Solution';

export interface GradedResult {
  correct: boolean;
  /** "A"-"D" or the typed text. */
  response: string;
  timeMs: number;
}

interface Props {
  problem: Problem;
  desmosKey: string | null;
  bookmarked: boolean;
  onToggleBookmark(): void;
  onGraded(result: GradedResult): void;
  onNext?: () => void;
  onSimilar?: () => void;
}

/** One problem: answer, check, see the solution. Give it key={problem.id} so it resets per problem. */
export default function ProblemView({
  problem,
  desmosKey,
  bookmarked,
  onToggleBookmark,
  onGraded,
  onNext,
  onSimilar,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [grade, setGrade] = useState<Grade | null>(null);
  const [tool, setTool] = useState<'none' | 'formulas' | 'desmos'>('none');
  const [copied, setCopied] = useState(false);
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  const checked = grade?.status === 'checked';
  const isMcq = problem.answer.kind === 'choice';
  const ready = isMcq ? selected !== null : typed.trim() !== '';

  const check = () => {
    if (checked || !ready) return;
    let result: Grade;
    let response: string;
    if (problem.answer.kind === 'choice') {
      result = { status: 'checked', correct: selected === problem.answer.index };
      response = LETTERS[selected as number] as string;
    } else {
      result = checkSpr(problem.answer, typed);
      response = typed.trim();
    }
    setGrade(result);
    if (result.status === 'checked') {
      onGraded({
        correct: result.correct,
        response,
        timeMs: Math.round(performance.now() - startedAt.current),
      });
    }
  };

  const copyLink = async () => {
    const link = new URL(
      url(`/problem/?id=${encodeURIComponent(problem.id)}`),
      window.location.origin,
    ).href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  const revealIndex = checked && problem.answer.kind === 'choice' ? problem.answer.index : null;
  const wrongIndex = revealIndex !== null && selected !== revealIndex ? selected : null;

  return (
    <article className="problem" aria-labelledby={`stem-${problem.id}`}>
      <header className="problem-meta">
        <span>
          {getSkill(problem.skill).name} · {LEVEL_NAME[problem.difficulty]}
        </span>
        <button
          type="button"
          className="link-button"
          aria-pressed={bookmarked}
          onClick={onToggleBookmark}
        >
          {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
        </button>
      </header>

      <div id={`stem-${problem.id}`}>
        <MathText block text={problem.stem} className="problem-stem" />
      </div>

      {problem.choices ? (
        <ChoiceList
          problemId={problem.id}
          choices={problem.choices}
          selected={selected}
          onSelect={setSelected}
          revealIndex={revealIndex}
        />
      ) : (
        <AnswerInput
          id={`answer-${problem.id}`}
          value={typed}
          onChange={setTyped}
          onSubmit={check}
          locked={checked}
        />
      )}

      <div className="problem-actions">
        {!checked ? (
          <button type="button" className="button primary" disabled={!ready} onClick={check}>
            Check
          </button>
        ) : (
          <>
            {onNext && (
              <button type="button" className="button primary" onClick={onNext}>
                Next problem
              </button>
            )}
            {onSimilar && (
              <button type="button" className="button" onClick={onSimilar}>
                Try a similar one
              </button>
            )}
          </>
        )}
      </div>

      <div role="status" aria-live="polite" className="feedback">
        {grade?.status === 'invalid' && <p className="feedback-invalid">{grade.reason}</p>}
        {grade?.status === 'checked' &&
          (grade.correct ? (
            <p className="feedback-correct">Correct!</p>
          ) : (
            <p className="feedback-wrong">Not quite. Here's how to solve it.</p>
          ))}
      </div>

      {checked && <Solution problem={problem} wrongIndex={wrongIndex} />}

      <footer className="problem-tools">
        <button
          type="button"
          className="button"
          aria-expanded={tool === 'formulas'}
          onClick={() => setTool(tool === 'formulas' ? 'none' : 'formulas')}
        >
          Formula sheet
        </button>
        <button
          type="button"
          className="button"
          aria-expanded={tool === 'desmos'}
          onClick={() => setTool(tool === 'desmos' ? 'none' : 'desmos')}
        >
          Calculator
        </button>
        <button type="button" className="button" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </footer>
      {tool === 'formulas' && <FormulaSheet />}
      {tool === 'desmos' && <DesmosPanel apiKey={desmosKey} expressions={problem.desmos ?? []} />}
    </article>
  );
}
