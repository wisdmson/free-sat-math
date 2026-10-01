import { Rational } from '../rational';
import type { Rng } from '../rng';
import type { DrillId, Tier } from './ids';

/**
 * A typed answer is an exact value. `form` limits how it may be written (a wrong form gets a
 * hint, not a wrong mark); `suffix` is shown after the pad, e.g. "%".
 */
export type MentalAnswer =
  | { kind: 'number'; value: string; form?: 'decimal' | 'fraction'; suffix?: '%' }
  | { kind: 'choice'; choices: [string, string, string, string]; index: 0 | 1 | 2 | 3 };

export interface MentalBody {
  /** Plain text: Unicode superscripts, √ and the − sign. No LaTeX. */
  prompt: string;
  answer: MentalAnswer;
}

export interface MentalProblem extends MentalBody {
  id: string;
  drill: DrillId;
  tier: Tier;
}

export interface Drill {
  id: DrillId;
  /** Bump whenever the output for any seed changes. */
  version: number;
  name: string;
  blurb: string;
  generate(rng: Rng, tier: Tier): MentalBody;
  /** Independent check: re-derives the answer from the prompt text, never from generate(). */
  verify(problem: MentalProblem): boolean;
}

/** The minus sign used in prompts (U+2212), so it never reads as a hyphen. */
export const MINUS = '−';
export const signed = (n: number): string => (n < 0 ? `${MINUS}${-n}` : String(n));
/** A factor in a product: negatives in parentheses, e.g. "(−3)". */
export const paren = (n: number): string => (n < 0 ? `(${MINUS}${-n})` : String(n));

export function numberBody(
  prompt: string,
  value: Rational,
  extra: { form?: 'decimal' | 'fraction'; suffix?: '%' } = {},
): MentalBody {
  return { prompt, answer: { kind: 'number', value: value.toString(), ...extra } };
}

export function choiceBody(
  prompt: string,
  correct: string,
  distractors: readonly [string, string, string],
  rng: Rng,
): MentalBody {
  const choices = rng.shuffle([correct, ...distractors]) as [string, string, string, string];
  return {
    prompt,
    answer: { kind: 'choice', choices, index: choices.indexOf(correct) as 0 | 1 | 2 | 3 },
  };
}

/** verify() helper: four distinct choices with `correct` at the recorded index. */
export function choicesOk(p: MentalProblem, correct: string): boolean {
  return (
    p.answer.kind === 'choice' &&
    new Set(p.answer.choices).size === 4 &&
    p.answer.choices[p.answer.index] === correct
  );
}

/** verify() helper: a typed answer equal to `value`, written in `form`, with `suffix`. */
export function numberOk(
  p: MentalProblem,
  value: Rational,
  form?: 'decimal' | 'fraction',
  suffix?: '%',
): boolean {
  return (
    p.answer.kind === 'number' &&
    Rational.parse(p.answer.value).eq(value) &&
    p.answer.form === form &&
    p.answer.suffix === suffix
  );
}
