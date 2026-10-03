import { useEffect } from 'react';

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '.', '/', '⌫'] as const;
const KEYBOARD: Readonly<Record<string, string>> = { '-': '−', Backspace: '⌫', '.': '.', '/': '/' };

const CONTROLS =
  'a[href], button, input, select, textarea, summary, [role="button"], [contenteditable="true"]';

/** True when Enter on `t` would activate a control other than this pad's keys. */
function activatesSomethingElse(t: EventTarget | null): boolean {
  return t instanceof Element && t.closest(CONTROLS) !== null && t.closest('.numpad') === null;
}

/** Applies one pad key. Keeps one "." or one "/", a leading minus only, and the length cap. */
export function padInput(current: string, key: string, maxLength: number): string {
  if (key === '⌫') return current.slice(0, -1);
  if (key === '−') return current.startsWith('-') ? current.slice(1) : `-${current}`;
  const body = current.replace('-', '');
  if (key === '.' && (body.includes('.') || body.includes('/'))) return current;
  if (
    key === '/' &&
    (body === '' || body.includes('/') || body.includes('.') || body.endsWith('.'))
  )
    return current;
  if (!/^[0-9./]$/.test(key)) return current;
  return current.length >= maxLength ? current : current + key;
}

interface Props {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  submitLabel?: string;
  /** Shown after the value, e.g. "%". */
  suffix?: string;
  maxLength?: number;
  /** Only the pad on screen listens to the keyboard (feed cards are pre-rendered). */
  active?: boolean;
  locked?: boolean;
}

/** Big on-screen keys, so the phone keyboard never covers the question (spec §4.3). */
export default function NumPad({
  id,
  label,
  value,
  onChange,
  onSubmit,
  submitLabel = 'Check',
  suffix = '',
  maxLength = 8,
  active = true,
  locked = false,
}: Props) {
  useEffect(() => {
    if (!active || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter') {
        // Enter on another control (Next card, a link, Why?…) belongs to that control.
        if (activatesSomethingElse(t)) return;
        e.preventDefault();
        onSubmit();
        return;
      }
      const key = /^[0-9]$/.test(e.key) ? e.key : KEYBOARD[e.key];
      if (key === undefined) return;
      e.preventDefault();
      onChange(padInput(value, key, maxLength));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, locked, value, onChange, onSubmit, maxLength]);

  return (
    <div className="numpad">
      {/* A read-only box, not an <input>: no phone keyboard opens over the question (spec §4.3). */}
      <div
        id={id}
        className="numpad-display"
        role="textbox"
        aria-readonly="true"
        aria-label={label}
      >
        {value.replace('-', '−')}
        {value !== '' && suffix}
      </div>
      <div className="numpad-keys" role="group" aria-label="Number pad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="numpad-key"
            disabled={locked}
            aria-label={k === '⌫' ? 'Delete' : k === '−' ? 'Minus' : k}
            onClick={() => onChange(padInput(value, k, maxLength))}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          className="numpad-key numpad-submit"
          disabled={locked || value === ''}
          onClick={onSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
