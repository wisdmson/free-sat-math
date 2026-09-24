import { LETTERS, type Problem } from '../engine/problem';
import { answerText } from '../lib/labels';
import MathText from './MathText';

interface Props {
  problem: Problem;
  /** The wrong choice the student picked, if any. */
  wrongIndex: number | null;
}

export default function Solution({ problem, wrongIndex }: Props) {
  const note =
    wrongIndex === null
      ? undefined
      : problem.distractorNotes?.[LETTERS[wrongIndex] as 'A' | 'B' | 'C' | 'D'];
  return (
    <section className="solution" aria-label="Solution">
      {note !== undefined && (
        <p className="distractor-note">
          <strong>About your answer: </strong>
          <MathText text={note} />
        </p>
      )}
      <p className="answer-line">
        <strong>Answer: </strong>
        <MathText text={answerText(problem)} />
      </p>
      <h3>Solution</h3>
      <ol>
        {problem.solution.map((step, i) => (
          <li key={i}>
            <MathText text={step} />
          </li>
        ))}
      </ol>
    </section>
  );
}
