import { tex } from '../../format';
import type {
  Choice,
  ChoiceLetter,
  Format,
  GeneratedBody,
  McqAnswer,
  Problem,
} from '../../problem';
import { LETTERS } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';

/** A wrong value and the mistake that produces it. */
export interface Candidate {
  value: Rational;
  note: string;
}

export interface NiceRule {
  /** Only whole numbers (e.g. counts of objects). */
  integerOnly?: boolean;
  /** Smallest allowed value, inclusive. */
  min?: number;
  /** Largest allowed absolute value. Default 9999. */
  maxAbs?: number;
  /** Largest allowed denominator. Default 12. */
  maxDen?: number;
}

export function isNice(v: Rational, rule: NiceRule = {}): boolean {
  if (rule.integerOnly === true && !v.isInteger()) return false;
  if (v.den > (rule.maxDen ?? 12)) return false;
  if (Math.abs(v.toNumber()) > (rule.maxAbs ?? 9999)) return false;
  if (rule.min !== undefined && v.toNumber() < rule.min) return false;
  return true;
}

/**
 * The first three candidates that differ from the answer and from each other and pass the rule.
 * List a type's named mistakes first and fallbackCandidates() last.
 * Throws when fewer than three survive; the harness then moves on to the next seed.
 */
export function pickDistractors(
  answer: Rational,
  candidates: readonly Candidate[],
  rule: NiceRule = {},
): Candidate[] {
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (out.length === 3) break;
    if (c.value.eq(answer) || out.some((o) => o.value.eq(c.value)) || !isNice(c.value, rule))
      continue;
    out.push(c);
  }
  if (out.length < 3) throw new Error('Not enough distinct distractors');
  return out;
}

/**
 * Common slips, used after a type's own named mistakes. The offsets are shuffled so the
 * correct answer is not always the middle of a run like 37, 38, 39.
 */
export function fallbackCandidates(answer: Rational, rng: Rng): Candidate[] {
  const slip = 'An arithmetic slip: redo the last computation carefully.';
  return [
    { value: answer.neg(), note: 'A sign error: the size is right but the sign is wrong.' },
    ...rng.shuffle([1, -1, 2, -2, 3, -3]).map((k) => ({ value: answer.add(r(k)), note: slip })),
    { value: answer.mul(r(2)), note: 'The value was doubled somewhere along the way.' },
  ];
}

export interface BuiltChoices {
  choices: [Choice, Choice, Choice, Choice];
  answer: McqAnswer;
  distractorNotes: Partial<Record<ChoiceLetter, string>>;
}

interface Item {
  text: string;
  value?: string;
  /** null marks the correct choice. */
  note: string | null;
}

function assemble(items: readonly Item[]): BuiltChoices {
  if (items.length !== 4) throw new Error('A multiple-choice problem needs exactly 4 choices');
  const correct = items.flatMap((it, i) => (it.note === null ? [i] : []));
  if (correct.length !== 1) throw new Error('Exactly one choice must be correct');
  const distractorNotes: Partial<Record<ChoiceLetter, string>> = {};
  items.forEach((it, i) => {
    if (it.note !== null) distractorNotes[LETTERS[i] as ChoiceLetter] = it.note;
  });
  const choices = items.map((it) =>
    it.value === undefined ? { text: it.text } : { text: it.text, value: it.value },
  ) as [Choice, Choice, Choice, Choice];
  return {
    choices,
    answer: { kind: 'choice', index: correct[0] as 0 | 1 | 2 | 3 },
    distractorNotes,
  };
}

/** Four numeric choices in ascending order. */
export function numericChoices(answer: Rational, distractors: readonly Candidate[]): BuiltChoices {
  const items = [
    { value: answer, note: null as string | null },
    ...distractors.map((d) => ({ value: d.value, note: d.note as string | null })),
  ].sort((p, q) => p.value.cmp(q.value));
  return assemble(
    items.map((c) => ({ text: `$${tex(c.value)}$`, value: c.value.toString(), note: c.note })),
  );
}

/** Four text choices in seeded random order. */
export function shuffledChoices(
  rng: Rng,
  correct: { text: string; value?: string },
  distractors: ReadonlyArray<{ text: string; value?: string; note: string }>,
): BuiltChoices {
  return assemble(rng.shuffle<Item>([{ ...correct, note: null }, ...distractors]));
}

/** Four text choices in a fixed, meaningful order. Give the correct one note: null. */
export function fixedChoices(items: readonly Item[]): BuiltChoices {
  return assemble(items);
}

/** The answer fields for a numeric answer, in either format. */
export function numericAnswer(
  format: Format,
  answer: Rational,
  distractors: () => Candidate[],
): Pick<GeneratedBody, 'choices' | 'answer' | 'distractorNotes'> {
  if (format === 'spr') return { answer: { kind: 'values', values: [answer.toString()] } };
  return numericChoices(answer, distractors());
}

/** The correct value recorded on a problem: the correct choice's value, or the first typed value. */
export function answerValue(problem: Problem): string | null {
  if (problem.answer.kind === 'choice')
    return problem.choices?.[problem.answer.index]?.value ?? null;
  if (problem.answer.kind === 'values') return problem.answer.values[0] ?? null;
  return null;
}
