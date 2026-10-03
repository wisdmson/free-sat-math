/** Picks Quick Play's next card (spec §3.5). Reset offers are inserted by PlayFeed. */
import { TIPS } from '../content/tips';
import { skillAccuracy, type Accuracy } from '../store/progress';
import type { Progress } from '../store/schema';
import { generateVerified } from './build';
import { PACE_CHANCE, paceLimitMs } from './game';
import type { MentalProblem } from './mental/types';
import { startingLevel } from './practice';
import type { Format, Problem } from './problem';
import { availableSkills, problemTypesForSkill } from './registry';
import type { Rng } from './rng';
import type { SkillId } from './skills';

export type Card =
  | { kind: 'sat'; key: string; problem: Problem; pace?: boolean }
  | { kind: 'tip'; key: string; text: string }
  | { kind: 'lightning'; key: string; questions: [MentalProblem, MentalProblem, MentalProblem] }
  /** "Take 20 seconds?" (spec §2.1): inserted by PlayFeed after 3 misses, never by nextCard. */
  | { kind: 'reset'; key: string };

/** A tip after this many questions. */
export const TIP_EVERY = 25;
/** At most one typed answer in any SPR_GAP + 1 questions (MCQ-first for phones). */
export const SPR_GAP = 4;
export const SPR_CHANCE = 0.25;
/** Problems answered this recently are never shown again. */
export const RECENT_ATTEMPTS = 200;
/** A ⚡ Lightning round after every 8 to 12 questions (spec §3.5). */
export const LIGHTNING_GAP_MIN = 8;
export const LIGHTNING_GAP_MAX = 12;

export interface FeedState {
  sinceTip: number;
  recentFormats: Format[];
  issued: string[];
  tipIndex: number;
  cardCount: number;
  /** Questions until the next Lightning round; null means "draw a gap on the next question". */
  untilLightning: number | null;
  /** Test hook: the next question is a pace check. */
  forcePace: boolean;
}

export function newFeedState(
  tipIndex: number,
  lightningFirst = false,
  paceFirst = false,
): FeedState {
  return {
    sinceTip: 0,
    recentFormats: [],
    issued: [],
    tipIndex,
    cardCount: 0,
    untilLightning: lightningFirst ? 0 : null,
    forcePace: paceFirst,
  };
}

/** Builds a Lightning round, or null if it can't (see engine/mental/lightning.ts). */
export type LightningMaker = (
  progress: Progress,
  rng: Rng,
) => [MentalProblem, MentalProblem, MentalProblem] | null;

/** True when a Lightning round is due within `cards` questions: time to load the drills. */
export function lightningSoon(state: FeedState, cards: number): boolean {
  return state.untilLightning !== null && state.untilLightning <= cards;
}

/** 1 until a skill has 5 recent attempts, then 1 + (share wrong): 1 to 2. */
export function skillWeight(acc: Accuracy): number {
  return acc.attempts < 5 ? 1 : 2 - acc.correct / acc.attempts;
}

function pickSkill(progress: Progress, rng: Rng): SkillId | null {
  const skills = availableSkills();
  if (skills.length === 0) return null;
  const weights = skills.map((s) => skillWeight(skillAccuracy(progress, s)));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < skills.length; i++) {
    r -= weights[i] as number;
    if (r < 0) return skills[i] as SkillId;
  }
  return skills[skills.length - 1] as SkillId;
}

function satProblem(progress: Progress, state: FeedState, rng: Rng): Problem | null {
  const skill = pickSkill(progress, rng);
  if (skill === null) return null;
  const level = progress.skillState[skill]?.level ?? startingLevel(progress.settings.targetScore);
  const types = problemTypesForSkill(skill).filter((t) => t.supports[level].length > 0);
  if (types.length === 0) return null;
  const sprAllowed = !state.recentFormats.includes('spr');
  const seen = new Set([
    ...progress.attempts.slice(-RECENT_ATTEMPTS).map((a) => a.problemId),
    ...state.issued,
  ]);
  for (let tries = 0; tries < 8; tries++) {
    const type = rng.pick(types);
    const formats = type.supports[level];
    if (!sprAllowed && !formats.includes('mcq')) continue;
    const spr =
      sprAllowed && formats.includes('spr') && (!formats.includes('mcq') || rng.chance(SPR_CHANCE));
    const problem = generateVerified(type, level, spr ? 'spr' : 'mcq', rng);
    if (problem !== null && !seen.has(problem.id)) return problem;
  }
  return null;
}

/**
 * The next card, or null when no question could be generated (the feed shows a retry card).
 * Without `makeLightning` (drills not loaded yet) a due round waits and questions continue.
 */
export function nextCard(
  progress: Progress,
  input: FeedState,
  rng: Rng,
  makeLightning?: LightningMaker,
): { card: Card | null; state: FeedState } {
  let state = input;
  if (state.sinceTip >= TIP_EVERY) {
    const text = TIPS[state.tipIndex % TIPS.length] as string;
    return {
      card: { kind: 'tip', key: `tip-${state.cardCount}`, text },
      state: {
        ...state,
        sinceTip: 0,
        tipIndex: state.tipIndex + 1,
        cardCount: state.cardCount + 1,
      },
    };
  }
  const until = state.untilLightning ?? rng.int(LIGHTNING_GAP_MIN, LIGHTNING_GAP_MAX);
  if (until <= 0 && makeLightning !== undefined) {
    const gap = rng.int(LIGHTNING_GAP_MIN, LIGHTNING_GAP_MAX);
    const questions = makeLightning(progress, rng);
    if (questions !== null) {
      return {
        card: { kind: 'lightning', key: `lightning-${state.cardCount}`, questions },
        state: { ...state, untilLightning: gap, cardCount: state.cardCount + 1 },
      };
    }
    // A drill failed: skip this round and carry on with questions.
    state = { ...state, untilLightning: gap };
  } else {
    state = { ...state, untilLightning: until };
  }
  const problem = satProblem(progress, state, rng);
  if (problem === null) return { card: null, state };
  // Pace checks (spec §3.5): 1 in 6 questions, never for untimed students.
  const pace =
    paceLimitMs(progress.settings) !== null && (state.forcePace || rng.chance(PACE_CHANCE));
  return {
    card: { kind: 'sat', key: problem.id, problem, ...(pace ? { pace: true } : {}) },
    state: {
      ...state,
      sinceTip: state.sinceTip + 1,
      recentFormats: [...state.recentFormats, problem.format].slice(-SPR_GAP),
      issued: [...state.issued, problem.id],
      cardCount: state.cardCount + 1,
      untilLightning: Math.max(0, (state.untilLightning ?? 0) - 1),
      forcePace: false,
    },
  };
}
