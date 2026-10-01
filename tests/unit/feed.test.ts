import { describe, expect, it, vi } from 'vitest';
import { TIPS } from '../../src/content/tips';
import { SPR_GAP, TIP_EVERY, newFeedState, nextCard, skillWeight } from '../../src/engine/feed';
import { createRng } from '../../src/engine/rng';
import { emptyProgress, recordAttempt } from '../../src/store/progress';

function run(seed: number, n: number, progress = emptyProgress()) {
  const rng = createRng(seed);
  let state = newFeedState(0);
  const cards = [];
  for (let i = 0; i < n; i++) {
    const r = nextCard(progress, state, rng);
    state = r.state;
    cards.push(r.card);
  }
  return cards;
}

describe('nextCard', () => {
  it('is deterministic for a seed', () => {
    expect(run(42, 30).map((c) => c?.key)).toEqual(run(42, 30).map((c) => c?.key));
  });
  it('inserts a tip after every TIP_EVERY questions, rotating through the list', () => {
    const cards = run(7, TIP_EVERY * 2 + 2);
    expect(cards[TIP_EVERY]).toMatchObject({ kind: 'tip', text: TIPS[0] });
    expect(cards[TIP_EVERY * 2 + 1]).toMatchObject({ kind: 'tip', text: TIPS[1] });
    expect(cards.filter((c) => c?.kind === 'tip')).toHaveLength(2);
  });
  it('never shows more than one typed answer in any run of SPR_GAP + 1 questions', () => {
    const formats = run(3, 600).flatMap((c) => (c?.kind === 'sat' ? [c.problem.format] : []));
    for (let i = 0; i + SPR_GAP < formats.length; i++) {
      expect(
        formats.slice(i, i + SPR_GAP + 1).filter((f) => f === 'spr').length,
      ).toBeLessThanOrEqual(1);
    }
  });
  it('never repeats a problem from the last 200 attempts or this session', () => {
    const first = run(11, 1)[0];
    if (first?.kind !== 'sat') throw new Error('expected a question');
    const progress = recordAttempt(emptyProgress(), {
      problemId: first.problem.id,
      skill: first.problem.skill,
      difficulty: first.problem.difficulty,
      correct: true,
      response: 'A',
      timeMs: 1,
      at: '2026-10-01T00:00:00.000Z',
      mode: 'play',
    });
    const keys = run(11, 200, progress).map((c) => c?.key);
    expect(keys).not.toContain(first.problem.id);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('skillWeight', () => {
  it('favors skills with lower recent accuracy, once there are 5 attempts', () => {
    expect(skillWeight({ correct: 0, attempts: 2 })).toBe(1);
    expect(skillWeight({ correct: 5, attempts: 5 })).toBe(1);
    expect(skillWeight({ correct: 0, attempts: 10 })).toBe(2);
  });
});

describe('when nothing can be generated', () => {
  it('returns no card instead of throwing', async () => {
    vi.resetModules();
    vi.doMock('../../src/engine/registry', async (orig) => ({
      ...(await orig<typeof import('../../src/engine/registry')>()),
      availableSkills: () => [],
    }));
    const feed = await import('../../src/engine/feed');
    const r = feed.nextCard(emptyProgress(), feed.newFeedState(0), createRng(1));
    expect(r.card).toBeNull();
    vi.doUnmock('../../src/engine/registry');
  });
});
