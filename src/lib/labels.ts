import { tex } from '../engine/format';
import { LETTERS, type Difficulty, type Problem } from '../engine/problem';
import { Rational } from '../engine/rational';

export const LEVEL_NAME: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/** The correct answer as display text with $math$: "B", "$\frac{7}{2}$", or a range. */
export function answerText(problem: Problem): string {
  const a = problem.answer;
  if (a.kind === 'choice') return LETTERS[a.index] as string;
  if (a.kind === 'values') return a.values.map((v) => `$${tex(Rational.parse(v))}$`).join(' or ');
  return `any value from $${tex(Rational.parse(a.min))}$ to $${tex(Rational.parse(a.max))}$`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
