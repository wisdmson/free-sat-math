import { describe, expect, it, vi } from 'vitest';
import { TIPS } from '../../src/content/tips';
import {
  SPR_GAP,
  TIP_EVERY,
  newFeedState,
  nextCard,
  skillWeight,
  type LightningMaker,
} from '../../src/engine/feed';
import { lightningRound } from '../../src/engine/mental/lightning';
import { createRng } from '../../src/engine/rng';
import { emptyProgress, recordAttempt } from '../../src/store/progress';

function run(seed: number, n: number, progress = emptyProgress(), maker?: LightningMaker) {
  const rng = createRng(seed);
  let state = newFeedState(0);
  const cards = [];
  for (let i = 0; i < n; i++) {
    const r = nextCard(progress, state, rng, maker);
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
    const cards = run(7, 90);
    const tips = cards.flatMap((c, i) => (c?.kind === 'tip' ? [i] : []));
    const questionsBefore = (i: number) =>
      cards.slice(0, i).filter((c) => c?.kind === 'sat').length;
    expect(tips.length).toBeGreaterThanOrEqual(2);
    expect(questionsBefore(tips[0] as number)).toBe(TIP_EVERY);
    expect(cards[tips[0] as number]).toMatchObject({ text: TIPS[0] });
    expect(cards[tips[1] as number]).toMatchObject({ text: TIPS[1] });
  });
  it('inserts a Lightning round of 3 verified mental-math questions every 8 to 12 questions', async () => {
    const { getDrill } = await import('../../src/engine/mental/registry');
    const cards = run(5, 120, emptyProgress(), lightningRound);
    let since = 0;
    for (const c of cards) {
      if (c?.kind === 'sat') since++;
      if (c?.kind === 'lightning') {
        expect(since).toBeGreaterThanOrEqual(8);
        expect(since).toBeLessThanOrEqual(12);
        expect(c.questions).toHaveLength(3);
        for (const q of c.questions) expect(getDrill(q.drill)!.verify(q)).toBe(true);
        since = 0;
      }
    }
    expect(cards.filter((c) => c?.kind === 'lightning').length).toBeGreaterThanOrEqual(8);
  });
  it('can start with a Lightning round (test hook)', () => {
    const r = nextCard(emptyProgress(), newFeedState(0, true), createRng(3), lightningRound);
    expect(r.card?.kind).toBe('lightning');
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

describe('Lightning fallback', () => {
  it('skips a Lightning round it can’t build', () => {
    const r = nextCard(emptyProgress(), newFeedState(0, true), createRng(1), () => null);
    expect(r.card?.kind).toBe('sat');
    expect(r.state.untilLightning).toBeGreaterThanOrEqual(7);
  });
  it('waits for the drills to load, then plays the round on the next card', () => {
    const rng = createRng(2);
    const first = nextCard(emptyProgress(), newFeedState(0, true), rng);
    expect(first.card?.kind).toBe('sat');
    const second = nextCard(emptyProgress(), first.state, rng, lightningRound);
    expect(second.card?.kind).toBe('lightning');
  });
});
