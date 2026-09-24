import { useMemo, useState } from 'react';
import {
  RECENT_WINDOW,
  nextProblem,
  pickMixSkill,
  similarProblem,
  startingLevel,
  updateStair,
} from '../engine/practice';
import { DIFFICULTIES, type Difficulty, type Problem } from '../engine/problem';
import { isSkillAvailable } from '../engine/registry';
import { createRng, randomSeed, type Rng } from '../engine/rng';
import { getSkill, isSkillId, type SkillId } from '../engine/skills';
import { LEVEL_NAME } from '../lib/labels';
import { url } from '../lib/paths';
import { recordAttempt, setSkillState, toggleBookmark } from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';
import ProblemView, { type GradedResult } from './ProblemView';
import StorageBanner from './StorageBanner';

export interface PracticeParams {
  skill: SkillId | 'mix';
  level: Difficulty | 'auto';
}

/** Reads ?skill=<id|mix>&level=<easy|medium|hard|auto>. Missing values default to mix and auto. */
export function readPracticeParams(search: string): PracticeParams | null {
  const q = new URLSearchParams(search);
  const rawSkill = q.get('skill') ?? 'mix';
  const rawLevel = q.get('level') ?? 'auto';
  let skill: SkillId | 'mix';
  if (rawSkill === 'mix') skill = 'mix';
  else if (isSkillId(rawSkill)) skill = rawSkill;
  else return null;
  if (rawLevel === 'auto') return { skill, level: 'auto' };
  const level = DIFFICULTIES.find((d) => d === rawLevel);
  return level === undefined ? null : { skill, level };
}

type Current = { kind: 'problem'; problem: Problem } | { kind: 'unavailable' } | { kind: 'failed' };

function draw(params: PracticeParams | null, rng: Rng, recent: readonly string[]): Current {
  if (params === null) return { kind: 'unavailable' };
  const skill = params.skill === 'mix' ? pickMixSkill(rng) : params.skill;
  if (skill === null || !isSkillAvailable(skill)) return { kind: 'unavailable' };
  const { progress } = getProgressStore().getSnapshot();
  const level =
    params.level !== 'auto'
      ? params.level
      : (progress.skillState[skill]?.level ?? startingLevel(progress.settings.targetScore));
  const problem = nextProblem(skill, level, rng, recent);
  return problem === null ? { kind: 'failed' } : { kind: 'problem', problem };
}

export default function PracticeSession({ desmosKey }: { desmosKey: string | null }) {
  const snapshot = useProgress();
  const [params] = useState(() => readPracticeParams(window.location.search));
  const rng = useMemo(() => createRng(randomSeed()), []);
  const [recent, setRecent] = useState<string[]>([]);
  const [current, setCurrent] = useState<Current>(() => draw(params, rng, []));
  const [tally, setTally] = useState({ answered: 0, correct: 0 });

  if (params === null || current.kind === 'unavailable') {
    return (
      <div className="notice">
        <p>That practice link doesn't match a skill that's available yet.</p>
        <a className="button" href={url('/skills/')}>
          Choose a skill
        </a>
      </div>
    );
  }
  if (current.kind === 'failed') {
    return (
      <div className="notice">
        <p>We couldn't create a problem just now.</p>
        <button
          type="button"
          className="button"
          onClick={() => setCurrent(draw(params, rng, recent))}
        >
          Try again
        </button>
      </div>
    );
  }

  const { problem } = current;
  const onGraded = (result: GradedResult) => {
    getProgressStore().update((p) => {
      let next = recordAttempt(p, {
        problemId: problem.id,
        skill: problem.skill,
        difficulty: problem.difficulty,
        correct: result.correct,
        response: result.response,
        timeMs: result.timeMs,
        at: new Date().toISOString(),
        mode: 'practice',
      });
      if (params.level === 'auto') {
        const stair = p.skillState[problem.skill] ?? { level: problem.difficulty, streak: 0 };
        next = setSkillState(next, problem.skill, updateStair(stair, result.correct));
      }
      return next;
    });
    setTally((t) => ({ answered: t.answered + 1, correct: t.correct + (result.correct ? 1 : 0) }));
    setRecent((r) => [...r, problem.id].slice(-RECENT_WINDOW));
  };

  return (
    <div className="practice">
      <StorageBanner snapshot={snapshot} />
      <div className="practice-bar">
        <span>{params.skill === 'mix' ? 'Mixed practice' : getSkill(params.skill).name}</span>
        <span>
          Level: {LEVEL_NAME[problem.difficulty]}
          {params.level === 'auto' ? ' (adjusts to you)' : ''}
        </span>
        <span>
          {tally.correct} of {tally.answered} correct
        </span>
      </div>
      <ProblemView
        key={problem.id}
        problem={problem}
        desmosKey={desmosKey}
        bookmarked={snapshot.progress.bookmarks.includes(problem.id)}
        onToggleBookmark={() => getProgressStore().update((p) => toggleBookmark(p, problem.id))}
        onGraded={onGraded}
        onNext={() => setCurrent(draw(params, rng, recent))}
        onSimilar={() => {
          const similar = similarProblem(problem, rng);
          if (similar !== null) setCurrent({ kind: 'problem', problem: similar });
        }}
      />
    </div>
  );
}
