import { describe, expect, it } from 'vitest';
import { recordSprintAnswer, sprintSummary, startSprint } from '../../src/engine/mental/sprint';

describe('sprint', () => {
  it('moves up a tier after 3 right in a row and down after 2 wrong', () => {
    let s = startSprint('mm.arithmetic', 1);
    for (let i = 0; i < 3; i++) s = recordSprintAnswer(s, true, 1000);
    expect(s.tier).toBe(2);
    s = recordSprintAnswer(s, false, 1000);
    s = recordSprintAnswer(s, false, 1000);
    expect(s.tier).toBe(1);
  });
  it('stays within tiers 1 to 3', () => {
    let s = startSprint('mm.arithmetic', 3);
    for (let i = 0; i < 6; i++) s = recordSprintAnswer(s, true, 500);
    expect(s.tier).toBe(3);
    s = startSprint('mm.arithmetic', 1);
    for (let i = 0; i < 4; i++) s = recordSprintAnswer(s, false, 500);
    expect(s.tier).toBe(1);
  });
  it('summarizes with the median time of correct answers', () => {
    let s = startSprint('mm.percent', 2);
    for (const [ok, ms] of [
      [true, 1000],
      [false, 9000],
      [true, 3000],
      [true, 2000],
    ] as const)
      s = recordSprintAnswer(s, ok, ms);
    expect(sprintSummary(s)).toEqual({ correct: 3, attempted: 4, medianMs: 2000, endTier: 2 });
    expect(sprintSummary(startSprint('mm.percent', 1)).medianMs).toBe(0);
  });
});
