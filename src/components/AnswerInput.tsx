import { sanitizeSprTyping } from '../engine/answer';

interface Props {
  id: string;
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  locked: boolean;
}

export default function AnswerInput({ id, value, onChange, onSubmit, locked }: Props) {
  return (
    <div className="spr">
      <label htmlFor={id}>Your answer</label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={locked}
        aria-describedby={`${id}-help`}
        onChange={(e) => onChange(sanitizeSprTyping(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
      />
      <p id={`${id}-help`} className="hint">
        Up to 5 characters (6 if negative). Fractions like 7/2 and decimals like 3.5 both work.
      </p>
    </div>
  );
}
