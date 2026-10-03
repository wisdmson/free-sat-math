import { useEffect, useRef, useState } from 'react';

/** Guided breathing (spec §5.2): in 4 s, out 6 s, twice. 20 seconds in all. */
export const BREATHS = [
  { label: 'Breathe in', seconds: 4 },
  { label: 'Breathe out', seconds: 6 },
  { label: 'Breathe in', seconds: 4 },
  { label: 'Breathe out', seconds: 6 },
] as const;
const TOTAL = BREATHS.reduce((s, b) => s + b.seconds, 0);

/** The unstuck checklist (spec §5.2). Test strategy, not health advice. */
export const CHECKLIST = [
  'Reread exactly what the question asks for.',
  'Try the answer choices, or plug in easy numbers.',
  'Graph it in Desmos.',
  "Still stuck: guess, flag, move on. Wrong answers don't lose points on the SAT, so never leave one blank.",
] as const;

/** The breath at `elapsed` seconds and the seconds left in it. */
function breathAt(elapsed: number): { step: number; left: number } {
  let start = 0;
  for (let step = 0; step < BREATHS.length; step++) {
    const len = (BREATHS[step] as (typeof BREATHS)[number]).seconds;
    if (elapsed < start + len) return { step, left: start + len - elapsed };
    start += len;
  }
  return { step: BREATHS.length - 1, left: 0 };
}

/** 20 seconds of breathing, then the unstuck checklist. Opened from Quick Play (spec §5.2). */
export default function ResetRoutine({ reduced, onClose }: { reduced: boolean; onClose(): void }) {
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const done = skipped || elapsed >= TOTAL;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [done]);
  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [done]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { step, left } = breathAt(elapsed);
  const breath = BREATHS[step] as (typeof BREATHS)[number];
  return (
    <div className="reset-routine" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <h2 id="reset-title" tabIndex={-1} ref={heading}>
        {done ? 'Get unstuck' : 'Take 20 seconds'}
      </h2>
      {done ? (
        <>
          <ol className="reset-checklist">
            {CHECKLIST.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <button type="button" className="button primary" onClick={onClose}>
            Back to the questions
          </button>
        </>
      ) : (
        <>
          {!reduced && (
            <div
              key={step}
              className={`reset-circle ${breath.label === 'Breathe in' ? 'is-in' : 'is-out'}`}
              style={{ animationDuration: `${breath.seconds}s` }}
              aria-hidden="true"
            />
          )}
          <p className="reset-step" aria-live="polite">
            {breath.label}
          </p>
          <p className="reset-count" aria-hidden="true">
            {left}
          </p>
          <button type="button" className="button" onClick={() => setSkipped(true)}>
            Skip to the checklist
          </button>
        </>
      )}
    </div>
  );
}
