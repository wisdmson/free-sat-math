import { LETTERS, type Choice } from '../engine/problem';
import MathText from './MathText';

interface Props {
  problemId: string;
  choices: readonly Choice[];
  selected: number | null;
  onSelect(index: number): void;
  /** After checking: the correct index, and inputs are locked. */
  revealIndex: number | null;
}

export default function ChoiceList({ problemId, choices, selected, onSelect, revealIndex }: Props) {
  const locked = revealIndex !== null;
  return (
    <fieldset className="choices" disabled={locked}>
      <legend className="visually-hidden">Answer choices</legend>
      {choices.map((choice, i) => {
        const letter = LETTERS[i] as string;
        const state = !locked
          ? selected === i
            ? 'is-selected'
            : ''
          : i === revealIndex
            ? 'is-correct'
            : selected === i
              ? 'is-wrong'
              : '';
        return (
          <label key={letter} className={`choice ${state}`}>
            <input
              type="radio"
              name={`choice-${problemId}`}
              value={letter}
              checked={selected === i}
              onChange={() => onSelect(i)}
            />
            <span className="choice-letter">{letter}</span>
            <MathText text={choice.text} className="choice-text" />
            {locked && i === revealIndex && (
              <span className="visually-hidden"> (correct answer)</span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
