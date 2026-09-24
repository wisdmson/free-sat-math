import type { SprAnswer } from './answer';
import type { Rng } from './rng';
import type { SkillId } from './skills';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** mcq: multiple choice. spr: student-produced (typed) response. */
export type Format = 'mcq' | 'spr';

export type ChoiceLetter = 'A' | 'B' | 'C' | 'D';
export const LETTERS: readonly ChoiceLetter[] = ['A', 'B', 'C', 'D'];

export interface Choice {
  /** Markdown + LaTeX shown to the student. */
  text: string;
  /** Machine-checkable value (a rational like "7/2", or a generator-specific key). */
  value?: string;
}

export type McqAnswer = { kind: 'choice'; index: 0 | 1 | 2 | 3 };
export type { SprAnswer };

export type ProblemId = string;

export interface Problem {
  id: ProblemId;
  skill: SkillId;
  difficulty: Difficulty;
  format: Format;
  source: 'generated' | 'bank';
  /** Markdown-lite with $...$ math (see engine/markup.ts). */
  stem: string;
  choices?: [Choice, Choice, Choice, Choice];
  answer: McqAnswer | SprAnswer;
  /** Ordered solution steps. */
  solution: string[];
  /** Why a student might have picked each wrong choice. */
  distractorNotes?: Partial<Record<ChoiceLetter, string>>;
  /** LaTeX expressions to preload in the Desmos panel. */
  desmos?: string[];
  /** Hidden generator parameters, read only by the type's verify(). */
  meta?: Record<string, unknown>;
}

/** The part of a problem a generator writes; the harness fills in the rest. */
export type GeneratedBody = Omit<Problem, 'id' | 'skill' | 'difficulty' | 'format' | 'source'>;

export interface ProblemType {
  /** Stable id, e.g. 'alg.systems.solve-system'. */
  id: string;
  /** Bump whenever the output for any seed changes. */
  version: number;
  skill: SkillId;
  /** Formats offered at each difficulty; an empty list means the difficulty is not offered. */
  supports: Readonly<Record<Difficulty, readonly Format[]>>;
  generate(rng: Rng, difficulty: Difficulty, format: Format): GeneratedBody;
  /** Independent correctness check. Must not re-run generate(). */
  verify(problem: Problem): boolean;
}

export interface GeneratedRef {
  kind: 'generated';
  typeId: string;
  version: number;
  difficulty: Difficulty;
  format: Format;
  seed: number;
}
export interface BankRef {
  kind: 'bank';
  slug: string;
}
export type ProblemRef = GeneratedRef | BankRef;

const GENERATED_ID = /^g:([a-z0-9.-]+)@(\d+):(easy|medium|hard):(mcq|spr):(\d+)$/;
const BANK_ID = /^b:([a-z0-9.-]+)$/;

export function formatProblemId(ref: ProblemRef): ProblemId {
  return ref.kind === 'bank'
    ? `b:${ref.slug}`
    : `g:${ref.typeId}@${ref.version}:${ref.difficulty}:${ref.format}:${ref.seed}`;
}

export function parseProblemId(id: string): ProblemRef | null {
  const g = GENERATED_ID.exec(id);
  if (g) {
    const seed = Number(g[5]);
    if (!Number.isSafeInteger(seed) || seed > 0xffffffff) return null;
    return {
      kind: 'generated',
      typeId: g[1] as string,
      version: Number(g[2]),
      difficulty: g[3] as Difficulty,
      format: g[4] as Format,
      seed,
    };
  }
  const b = BANK_ID.exec(id);
  return b ? { kind: 'bank', slug: b[1] as string } : null;
}
