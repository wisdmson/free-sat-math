import { describe, expect, it } from 'vitest';
import { applyGymSession } from '../../src/store/mental';
import { emptyProgress } from '../../src/store/progress';

const now = new Date(2026, 9, 1, 16);

describe('applyGymSession', () => {
  it('saves the session, best, tier, points and today’s answers', () => {
    const p = applyGymSession(emptyProgress(), {
      drill: 'mm.squares',
      summary: { correct: 12, attempted: 15, medianMs: 2400, endTier: 2 },
      now,
    });
    expect(p.mental.sessions).toEqual([
      { drill: 'mm.squares', at: now.toISOString(), correct: 12, attempted: 15, medianMs: 2400 },
    ]);
    expect(p.mental.best['mm.squares']).toBe(12);
    expect(p.mental.tier['mm.squares']).toBe(2);
    expect(p.game.points).toBe(24);
    expect(p.game.answerDays['2026-10-01']).toBe(15);
    expect(p.game.bestStreak).toBe(1);
  });
  it('keeps the higher personal best and caps saved sessions at 200', () => {
    let p = emptyProgress();
    for (let i = 0; i < 205; i++) {
      p = applyGymSession(p, {
        drill: 'mm.percent',
        summary: { correct: i === 3 ? 30 : 5, attempted: 6, medianMs: 1000, endTier: 1 },
        now,
      });
    }
    expect(p.mental.best['mm.percent']).toBe(30);
    expect(p.mental.sessions).toHaveLength(200);
  });
});
