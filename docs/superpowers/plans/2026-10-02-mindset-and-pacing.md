# Mindset & Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach test-day habits inside Quick Play:
- **Phase 1, Sure or guess:** a "Guessed?" chip after each answer; Review lists "sure but wrong" misses first.
- **Phase 2, Pace checks and the Reset routine:** a 95-second pace ring on some cards with a +10 bonus, and a "Take 20 seconds?" offer after 3 misses in a row that opens a breathing-and-checklist routine.
- Phase 3 (Test Pace in the Gym) and Phase 4 (the You page) are outlined at the end. They get their own detailed plan after the owner reviews Phases 1–2.

**Architecture:**
- The guess flag lives on the attempt that already exists in schema v2 (`guessed?`), so there's no schema change.
- Pace checks are ordinary SAT cards with `pace: true`, chosen by the seeded feed, with the rules in `src/engine/game.ts`.
- The reset offer is inserted by `PlayFeed` right after the third miss.
- The routine itself is a lazily loaded dialog, so it costs nothing until it's opened.

**Tech Stack:** Astro 7, React 19, TypeScript (strictest), Vitest 5, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-29-quick-play-and-training-design.md`, sections §2.1 (pace check and reset offer cards, Guessed? chip), §2.4 (Review order), §3.1 (pace bonus), §3.5 (feed composition), §5.2 (Reset routine), §5.3 (Sure or guess) and §11 (accessibility).

**Owner approval:** the owner approved writing this plan and building Phases 1–2 straight away (2026-10-02). Phases 3–4 wait for their review.

**Decisions this plan makes (the owner can overrule them):**
1. **Untimed means no pace checks.** Pace checks only make sense with a clock, and untimed students asked for no clocks. Extended time scales 95 s to 2:23 or 3:10.
2. **The "3 misses in a row" for the reset offer counts SAT answers only.** Lightning answers neither add to nor break the run, because a mental-math slip isn't the test-day stuck feeling the reset is for.
3. **The Guessed? chip can be tapped again to undo** while it's still open (spec: until two cards on). The spec only says tapping sets it; undo prevents a mis-tap from sticking.
4. **The pace clock never submits.** It only shows time, matching spec §11.

## Global Constraints

- TypeScript strictest; no `any`; `npm run lint` and `npx astro check` clean.
- **Startup JS ≤ 170 KB gzipped on every page** (`npm run check:bundle`). The Reset routine is loaded on demand.
- Saved progress never loses data. No schema bump: `Attempt.guessed?` already exists (schema v2).
- Respect `prefers-reduced-motion` (no animated ring or breathing circle; text carries the same information), extended time and untimed.
- Every control has an accessible name. State is never shown by color alone. Everything works at 360 px.
- Wording is test strategy, not health advice (spec §5.2). All text is original.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The reset offer is inserted while cards ahead are already built.** Answers, guesses and the current card must stay with the right cards. *Task 6:* e2e "three misses in a row offer a reset…" answers around the insertion point.
2. **Typing while the reset dialog is open** must not reach a number pad behind it. *Task 6:* PlayFeed passes `active={… && !resetOpen}`. The reset-routine unit test checks Escape closes the dialog.
3. **A pace card built ahead of time** must not start its clock until it's on screen. *Task 5:* the sat-card test drives the clock and checks `timeMs`.
4. **Untimed students** never get pace checks. *Task 4:* feed test "never makes pace checks when the student is untimed".
5. **A guess marked after its attempt was trimmed** from the 1,000-attempt history must be a harmless no-op. *Task 1:* progress test "marks and unmarks one attempt as a guess" (unknown attempt case).

---

## Phase 1: Sure or guess

### Task 1: Guess flag and "sure but wrong" order in the store

**Files:**
- Modify: `src/store/progress.ts`
- Test: `tests/unit/progress.test.ts`

**Interfaces:**
- Produces: `setGuessed(progress, problemId, at, guessed): Progress`, and `MissedItem.sure: boolean`. `missedProblems` lists sure-but-wrong first, newest first within each group.

- [ ] **Step 1: Write the failing tests**

Add `setGuessed` to the import list in `tests/unit/progress.test.ts`, then append:

```ts
describe('guesses', () => {
  it('marks and unmarks one attempt as a guess', () => {
    let p = recordAttempt(
      emptyProgress(),
      attempt({ problemId: 'a', at: '2026-09-24T09:00:00.000Z', mode: 'play' }),
    );
    p = recordAttempt(p, attempt({ problemId: 'a', at: '2026-09-24T10:00:00.000Z', mode: 'play' }));
    p = setGuessed(p, 'a', '2026-09-24T10:00:00.000Z', true);
    expect(p.attempts.map((a) => a.guessed)).toEqual([undefined, true]);
    p = setGuessed(p, 'a', '2026-09-24T10:00:00.000Z', false);
    expect(p.attempts[1]).not.toHaveProperty('guessed');
    // An attempt that is no longer stored: nothing changes.
    expect(setGuessed(p, 'gone', '2026-01-01T00:00:00.000Z', true)).toEqual(p);
  });
  it('lists sure-but-wrong misses first, newest first within each group', () => {
    let p = emptyProgress();
    p = recordAttempt(p, attempt({ problemId: 'old-sure', correct: false, at: '2026-09-24T08:00:00.000Z' }));
    p = recordAttempt(
      p,
      attempt({ problemId: 'new-guess', correct: false, at: '2026-09-24T12:00:00.000Z', guessed: true }),
    );
    p = recordAttempt(p, attempt({ problemId: 'mid-sure', correct: false, at: '2026-09-24T10:00:00.000Z' }));
    expect(missedProblems(p).map((m) => [m.problemId, m.sure])).toEqual([
      ['mid-sure', true],
      ['old-sure', true],
      ['new-guess', false],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/progress.test.ts`
Expected: FAIL. `setGuessed` is not exported, and `m.sure` is undefined.

- [ ] **Step 3: Implement**

In `src/store/progress.ts`, replace `MissedItem` and `missedProblems` with:

```ts
export interface MissedItem {
  problemId: ProblemId;
  skill: SkillId;
  difficulty: Difficulty;
  at: string;
  /** The miss wasn't marked as a guess: a gap the student may not know they have (spec §5.3). */
  sure: boolean;
}

const newestFirst = (x: { at: string }, y: { at: string }) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0);

/** Problems whose most recent attempt was wrong: "sure but wrong" first, then newest first. */
export function missedProblems(progress: Progress): MissedItem[] {
  const latest = new Map<ProblemId, Attempt>();
  for (const a of progress.attempts) latest.set(a.problemId, a);
  return [...latest.values()]
    .filter((a) => !a.correct)
    .map(({ problemId, skill, difficulty, at, guessed }) => ({
      problemId,
      skill,
      difficulty,
      at,
      sure: guessed !== true,
    }))
    .sort((x, y) => Number(y.sure) - Number(x.sure) || newestFirst(x, y));
}
```

and add after `recordAttempt`:

```ts
/**
 * Marks or unmarks one attempt as a guess (Quick Play's "Guessed?" chip, spec §5.3). The attempt
 * is found by problem and time; if it's no longer stored, nothing changes.
 */
export function setGuessed(
  progress: Progress,
  problemId: ProblemId,
  at: string,
  guessed: boolean,
): Progress {
  const i = progress.attempts.findIndex((a) => a.problemId === problemId && a.at === at);
  if (i < 0) return progress;
  const updated: Attempt = { ...(progress.attempts[i] as Attempt) };
  if (guessed) updated.guessed = true;
  else delete updated.guessed;
  const attempts = [...progress.attempts];
  attempts[i] = updated;
  return { ...progress, attempts };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/progress.test.ts`
Expected: PASS, including the existing "missed problems" test (`['c', 'b']`, both sure).

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/store/progress.ts tests/unit/progress.test.ts
git commit -m "feat(store): guess flag on attempts; sure-but-wrong misses first"
```

### Task 2: The "Guessed?" chip in Quick Play

**Files:**
- Modify: `src/components/play/SatCard.tsx`, `src/components/play/PlayFeed.tsx`, `src/styles/play.css`
- Test: `tests/unit/sat-card.test.tsx`, `tests/e2e/play.spec.ts`

**Interfaces:**
- Consumes: `setGuessed` (Task 1).
- Produces: SatCard props `guessed?: boolean`, `chipOpen?: boolean`, `onGuessed?(guessed: boolean): void`. PlayFeed's `Entry` gains `at?: string` and `guessed?: boolean`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('SatCard')` in `tests/unit/sat-card.test.tsx`:

```tsx
  it('offers a Guessed? chip after answering, while it is open', async () => {
    const onGuessed = vi.fn();
    const answered = { correct: false, response: 'A', timeMs: 1, points: 0, multiplier: 1 };
    const props = { problem: mcq, desmosKey: null, result: answered, reduced: true, onAnswer: () => {} };
    const { rerender } = render(<SatCard {...props} chipOpen onGuessed={onGuessed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guessed?', pressed: false }));
    expect(onGuessed).toHaveBeenCalledWith(true);
    rerender(<SatCard {...props} chipOpen guessed onGuessed={onGuessed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guessed?', pressed: true }));
    expect(onGuessed).toHaveBeenLastCalledWith(false);
    rerender(<SatCard {...props} chipOpen={false} guessed onGuessed={onGuessed} />);
    expect(screen.queryByRole('button', { name: 'Guessed?' })).toBeNull();
    expect(screen.getByText('Marked as a guess')).toBeVisible();
  });
  it('shows no Guessed? chip before an answer', () => {
    render(
      <SatCard problem={mcq} desmosKey={null} result={undefined} reduced chipOpen onGuessed={() => {}} onAnswer={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Guessed?' })).toBeNull();
  });
```

Append to `tests/e2e/play.spec.ts`:

```ts
test('marking an answer as a guess saves it', async ({ page }) => {
  await page.goto('/play/?go=1');
  await answerCurrent(page, false);
  await current(page).getByRole('button', { name: 'Guessed?' }).click();
  await expect(current(page).getByRole('button', { name: 'Guessed?', pressed: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fsm.progress.v1')!));
  expect(saved.attempts.at(-1).guessed).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/sat-card.test.tsx`
Expected: FAIL. No button named "Guessed?".

- [ ] **Step 3: Implement**

In `src/components/play/SatCard.tsx`:
- Add to `Props`:

```ts
  /** Quick Play's "Guessed?" chip (spec §5.3), shown after answering while `chipOpen`. */
  guessed?: boolean;
  chipOpen?: boolean;
  onGuessed?(guessed: boolean): void;
```

- Destructure `guessed = false, chipOpen = false, onGuessed` in the function signature.
- Right after the `<div role="status" …>` feedback block, add:

```tsx
      {result !== undefined &&
        onGuessed !== undefined &&
        (chipOpen ? (
          <button
            type="button"
            className={`play-chip ${guessed ? 'is-on' : ''}`}
            aria-pressed={guessed}
            onClick={() => onGuessed(!guessed)}
          >
            <span aria-hidden="true">{guessed ? '✓ ' : ''}</span>
            Guessed?
          </button>
        ) : (
          guessed && <p className="hint">Marked as a guess</p>
        ))}
```

In `src/components/play/PlayFeed.tsx`:
- Import `setGuessed` from `'../../store/progress'`.
- Change the `Entry` type to:

```ts
type Entry = {
  key: string;
  card: Card | null;
  result?: CardResult;
  lightning?: LightningResult;
  /** When the answer was saved: identifies its attempt for the Guessed? chip. */
  at?: string;
  guessed?: boolean;
};
```

- In `onAnswer`, add `const now = new Date();` before `store.update`, pass `now` instead of `new Date()`, and add `at: now.toISOString()` to the entry it stores (next to `result`).
- Add:

```ts
  const onGuessed = (index: number, problemId: string, guessed: boolean) => {
    const at = entriesRef.current[index]?.at;
    if (at === undefined) return;
    getProgressStore().update((p) => setGuessed(p, problemId, at, guessed));
    entriesRef.current = entriesRef.current.map((e, i) => (i === index ? { ...e, guessed } : e));
    setEntries(entriesRef.current);
  };
```

- Pass these props to `SatCard` (the chip stays tappable until the student is two cards past it):

```tsx
                guessed={e.guessed === true}
                chipOpen={current <= i + 1}
                onGuessed={(g) => e.card?.kind === 'sat' && onGuessed(i, e.card.problem.id, g)}
```

Append to `src/styles/play.css`:

```css
.play-chip {
  justify-self: start;
  min-height: 2.75rem;
  padding: 0.35rem 1rem;
  border: 2px dashed var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.play-chip.is-on {
  border-style: solid;
  border-color: var(--accent);
  background: var(--accent-soft);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/sat-card.test.tsx` and `npx playwright test tests/e2e/play.spec.ts -g "guess"`
Expected: PASS.

- [ ] **Step 5: Lint, type-check and commit**

```bash
git add src/components/play/SatCard.tsx src/components/play/PlayFeed.tsx src/styles/play.css \
  tests/unit/sat-card.test.tsx tests/e2e/play.spec.ts
git commit -m "feat(play): Guessed? chip after each answer"
```

### Task 3: "You were sure" on Review

**Files:**
- Modify: `src/components/ReviewPage.tsx`, `src/styles/global.css`
- Test: `tests/e2e/review.spec.ts`

- [ ] **Step 1: Write the failing test**

Add `import { emptyProgress } from '../../src/store/progress';` and append to `tests/e2e/review.spec.ts`:

```ts
test('sure-but-wrong misses come first in review, labeled', async ({ page }) => {
  const sure = fixedProblem('alg.systems.solve-system', 'easy', 'mcq', 21);
  const guess = fixedProblem('alg.systems.solve-system', 'medium', 'mcq', 22);
  const progress = emptyProgress();
  const base = { skill: 'alg.systems', correct: false, response: 'A', timeMs: 1000, mode: 'play' } as const;
  progress.attempts = [
    { ...base, problemId: sure.id, difficulty: 'easy', at: '2026-10-01T10:00:00.000Z' },
    { ...base, problemId: guess.id, difficulty: 'medium', at: '2026-10-01T11:00:00.000Z', guessed: true },
  ];
  await page.addInitScript((data) => localStorage.setItem('fsm.progress.v1', data), JSON.stringify(progress));
  await page.goto('/review/');
  const items = page.locator('section[aria-labelledby="missed-heading"] li');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('You were sure');
  await expect(items.nth(0)).toContainText('Easy');
  await expect(items.nth(1)).not.toContainText('You were sure');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/review.spec.ts -g "sure-but-wrong" --project=desktop`
Expected: FAIL. The guessed miss is listed first (newest), with no label.

- [ ] **Step 3: Implement**

In `src/components/ReviewPage.tsx`, inside the missed `<li>`, change the first `<span>` to:

```tsx
                <span>
                  {m.sure && <span className="sure-label">You were sure</span>}
                  {getSkill(m.skill).name} · {LEVEL_NAME[m.difficulty]} · {shortDate(m.at)}
                </span>
```

Append to `src/styles/global.css`:

```css
.sure-label {
  display: inline-block;
  margin-right: 0.5rem;
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  background: var(--warn-soft);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/review.spec.ts --project=desktop`
Expected: PASS (all review tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ReviewPage.tsx src/styles/global.css tests/e2e/review.spec.ts
git commit -m "feat(review): sure-but-wrong misses first, labeled"
```

---

## Phase 2: Pace checks and the Reset routine

### Task 4: Pace rules and pace cards in the feed

**Files:**
- Modify: `src/engine/game.ts`, `src/engine/feed.ts`
- Test: `tests/unit/game.test.ts`, `tests/unit/feed.test.ts`

**Interfaces:**
- Produces:
  - `PACE_SECONDS = 95`, `PACE_BONUS = 10`, `PACE_CHANCE = 1/6`;
  - `paceLimitMs(settings): number | null`, `paceBonus(correct, timeMs, limitMs): number`, `formatDuration(ms): string`;
  - the SAT `Card` gains `pace?: boolean`;
  - `newFeedState(tipIndex, lightningFirst?, paceFirst?)`.

- [ ] **Step 1: Write the failing tests**

Add `PACE_BONUS, formatDuration, paceBonus, paceLimitMs` to the import in `tests/unit/game.test.ts`, then append:

```ts
describe('pace checks', () => {
  it('give 95 s, scaled by extended time, and none when untimed', () => {
    expect(paceLimitMs({ timeMultiplier: 1, untimed: false })).toBe(95_000);
    expect(paceLimitMs({ timeMultiplier: 1.5, untimed: false })).toBe(142_500);
    expect(paceLimitMs({ timeMultiplier: 2, untimed: true })).toBeNull();
  });
  it('add a 10-point bonus for a right answer within the limit', () => {
    expect(paceBonus(true, 95_000, 95_000)).toBe(PACE_BONUS);
    expect(paceBonus(true, 95_001, 95_000)).toBe(0);
    expect(paceBonus(false, 1_000, 95_000)).toBe(0);
  });
  it('formats durations the way the card shows them', () => {
    expect(formatDuration(48_400)).toBe('48 s');
    expect(formatDuration(59_600)).toBe('1:00');
    expect(formatDuration(130_000)).toBe('2:10');
  });
});
```

Append inside `describe('nextCard')` in `tests/unit/feed.test.ts`:

```ts
  it('turns about 1 in 6 questions into pace checks', () => {
    const sat = run(9, 300).filter((c) => c?.kind === 'sat');
    const share = sat.filter((c) => c?.kind === 'sat' && c.pace === true).length / sat.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.28);
  });
  it('never makes pace checks when the student is untimed', () => {
    const progress = emptyProgress();
    progress.settings.untimed = true;
    expect(run(9, 120, progress).some((c) => c?.kind === 'sat' && c.pace === true)).toBe(false);
  });
  it('can start with a pace check (test hook)', () => {
    const r = nextCard(emptyProgress(), newFeedState(0, false, true), createRng(4));
    expect(r.card).toMatchObject({ kind: 'sat', pace: true });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/game.test.ts tests/unit/feed.test.ts`
Expected: FAIL. `paceLimitMs` is not a function, and no card has `pace`.

- [ ] **Step 3: Implement**

Append to `src/engine/game.ts`:

```ts
/** Pace checks (spec §2.1, §3.1): the real test's average, 22 questions in 35 minutes. */
export const PACE_SECONDS = 95;
export const PACE_BONUS = 10;
/** Chance that an SAT card in the feed is a pace check (spec §3.5). */
export const PACE_CHANCE = 1 / 6;

/** The pace-check limit, scaled by extended time; null when untimed (no pace checks). */
export function paceLimitMs(settings: {
  timeMultiplier: 1 | 1.5 | 2;
  untimed: boolean;
}): number | null {
  return settings.untimed ? null : PACE_SECONDS * 1000 * settings.timeMultiplier;
}

/** +10 for a right pace-check answer within the limit. Bonuses are never multiplied (§3.2). */
export function paceBonus(correct: boolean, timeMs: number, limitMs: number): number {
  return correct && timeMs <= limitMs ? PACE_BONUS : 0;
}

/** "48 s" under a minute, "2:10" from a minute on. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

In `src/engine/feed.ts`:
- Import `PACE_CHANCE, paceLimitMs` from `'./game'`.
- Change the header comment's last sentence to "Reset offers are inserted by PlayFeed."
- Change the SAT card type to `{ kind: 'sat'; key: string; problem: Problem; pace?: boolean }`.
- Add the reset card `| { kind: 'reset'; key: string }` to `Card` (built by PlayFeed, never by `nextCard`).
- Add `forcePace: boolean;` to `FeedState` with the comment `/** Test hook: the next question is a pace check. */`.
- Change `newFeedState`:

```ts
export function newFeedState(tipIndex: number, lightningFirst = false, paceFirst = false): FeedState {
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
```

- In `nextCard`'s SAT branch, after `if (problem === null) …`:

```ts
  const pace =
    paceLimitMs(progress.settings) !== null && (state.forcePace || rng.chance(PACE_CHANCE));
```

  Then build the card as `{ kind: 'sat', key: problem.id, problem, ...(pace ? { pace: true } : {}) }`, and add `forcePace: false,` to the returned state.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --maxWorkers=2`
Expected: PASS (every feed test, including Lightning and tips).

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts src/engine/feed.ts tests/unit/game.test.ts tests/unit/feed.test.ts
git commit -m "feat(feed): pace-check cards (1 in 6, none when untimed) and pace rules"
```

### Task 5: The pace ring and bonus

**Files:**
- Modify: `src/components/play/SatCard.tsx`, `src/components/play/PlayFeed.tsx`, `src/styles/play.css`
- Test: `tests/unit/sat-card.test.tsx`, `tests/e2e/play.spec.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - SatCard props `paceLimitMs?: number | null` and `onReset?(): void`;
  - `CardResult.bonus?: number`;
  - the test hook `?pace=first` (only in `PUBLIC_TEST_HOOKS=1` builds).

- [ ] **Step 1: Write the failing tests**

Append inside `describe('SatCard')` in `tests/unit/sat-card.test.tsx`:

```tsx
  it('a pace check shows its target, then the time against it', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const onAnswer = vi.fn();
    const props = { problem: mcq, desmosKey: null, reduced: true, paceLimitMs: 95_000, onReset: () => {}, onAnswer };
    const { container, rerender } = render(<SatCard {...props} result={undefined} />);
    expect(screen.getByText('Pace check')).toBeVisible();
    expect(screen.getByText(/aim for 1:35/)).toBeVisible();
    clock.mockReturnValue(48_000);
    await userEvent.click(container.querySelector('[data-letter="B"]')!);
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ timeMs: 48_000 }));
    rerender(<SatCard {...props} result={{ correct: true, response: 'B', timeMs: 48_000, points: 20, multiplier: 1, bonus: 10 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('48 s · on pace ✅');
    expect(screen.getByRole('status')).toHaveTextContent('+10 pace bonus');
    rerender(<SatCard {...props} result={{ correct: false, response: 'A', timeMs: 130_000, points: 0, multiplier: 1 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('2:10 · over pace ⚠️');
    clock.mockRestore();
  });
  it('the Reset button on a pace check opens the reset routine', async () => {
    const onReset = vi.fn();
    render(
      <SatCard problem={mcq} desmosKey={null} result={undefined} reduced paceLimitMs={95_000} onReset={onReset} onAnswer={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
```

Append to `tests/e2e/play.spec.ts`:

```ts
test('a pace check shows the time against 95 s and adds the bonus', async ({ page }) => {
  await page.goto('/play/?go=1&pace=first');
  await expect(current(page).getByText('Pace check')).toBeVisible();
  await answerCurrent(page, true);
  await expect(current(page).getByRole('status')).toContainText('on pace ✅');
  await expect(current(page).getByRole('status')).toContainText('+10 pace bonus');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/sat-card.test.tsx`
Expected: FAIL. No "Pace check" text and no Reset button.

- [ ] **Step 3: Implement**

In `src/components/play/SatCard.tsx`:
- Import `formatDuration` from `'../../engine/game'`.
- Add `bonus?: number;` to `CardResult`.
- Add these props: `paceLimitMs?: number | null` (comment: `/** Set on a pace check: the time to beat (spec §2.1). */`) and `onReset?(): void`. Destructure `paceLimitMs = null, onReset`.
- Add the live clock under the existing `startedAt` effect:

```tsx
  // Pace checks show elapsed time while the card is on screen and unanswered. It never submits.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (paceLimitMs === null || !active || result !== undefined) return;
    const id = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(performance.now() - startedAt.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [paceLimitMs, active, result]);
```

- Directly after the `<h2 … className="visually-hidden">` heading, add:

```tsx
      {paceLimitMs !== null && (
        <div className="pace-head">
          <p className="pace-label">
            <span aria-hidden="true">⏱ </span>Pace check
            <span className="hint"> · aim for {formatDuration(paceLimitMs)}</span>
          </p>
          {result === undefined && (
            <span className="pace-clock" aria-hidden="true">
              {!reduced && (
                <svg viewBox="0 0 36 36" className="pace-ring">
                  <circle cx="18" cy="18" r="15.9" pathLength="100" className="pace-ring-track" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    pathLength="100"
                    className={`pace-ring-fill ${elapsed > paceLimitMs ? 'is-over' : ''}`}
                    strokeDasharray={`${Math.min(100, (100 * elapsed) / paceLimitMs)} 100`}
                  />
                </svg>
              )}
              {formatDuration(elapsed)}
            </span>
          )}
        </div>
      )}
```

- In the feedback block, change the correct line to:

```tsx
          <p className="feedback-correct">
            Correct! +{result.points}
            {result.multiplier > 1 ? ` (×${result.multiplier})` : ''}
            {result.bonus ? ` +${result.bonus} pace bonus` : ''}
          </p>
```

  and add, after the wrong line, still inside the status div:

```tsx
        {result !== undefined && paceLimitMs !== null && (
          <p className="pace-verdict">
            {result.timeMs <= paceLimitMs
              ? `${formatDuration(result.timeMs)} · on pace ✅`
              : `${formatDuration(result.timeMs)} · over pace ⚠️ — on test day, flag it, guess, and move on.`}
          </p>
        )}
```

- In `.play-tools`, before the Calculator button, add:

```tsx
        {paceLimitMs !== null && onReset !== undefined && (
          <button type="button" className="button" onClick={onReset}>
            Reset
          </button>
        )}
```

In `src/components/play/PlayFeed.tsx`:
- Import `paceBonus, paceLimitMs` from `'../../engine/game'`.
- Add next to `lightningFirst`:

```ts
/** `?pace=first` makes the first question a pace check. Only in PUBLIC_TEST_HOOKS=1 builds. */
const paceFirst = () =>
  import.meta.env.PUBLIC_TEST_HOOKS === '1' &&
  new URLSearchParams(window.location.search).get('pace') === 'first';
```

- In `extend`, pass `paceFirst()` as the third argument to `newFeedState`.
- Change `onAnswer` to take `pace: boolean` after `problem`, and compute the bonus:

```ts
    const limit = pace ? paceLimitMs(getProgressStore().getSnapshot().progress.settings) : null;
    const bonus = limit === null ? 0 : paceBonus(r.correct, r.timeMs, limit);
```

  Use `points: scored.points + bonus` in `applyPlayAnswer`, and store `result: { ...r, points: scored.points, multiplier: scored.multiplier, bonus }`.
- Pass to `SatCard`: `paceLimitMs={e.card.pace === true ? paceLimitMs(snapshot.progress.settings) : null}`. Its `onAnswer` becomes `(r) => e.card?.kind === 'sat' && onAnswer(i, e.card.problem, e.card.pace === true, r)`. `onReset` is wired in Task 6.

Append to `src/styles/play.css`:

```css
.pace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.pace-label {
  margin: 0;
  font-weight: 700;
}
.pace-clock {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.pace-ring {
  width: 2rem;
  height: 2rem;
  transform: rotate(-90deg);
}
.pace-ring-track,
.pace-ring-fill {
  fill: none;
  stroke-width: 3.5;
}
.pace-ring-track {
  stroke: var(--border);
}
.pace-ring-fill {
  stroke: var(--good);
  stroke-linecap: round;
}
.pace-ring-fill.is-over {
  stroke: var(--bad);
}
.pace-verdict {
  margin: 0;
  font-weight: 600;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --maxWorkers=2` and `npx playwright test tests/e2e/play.spec.ts -g "pace check"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/play/SatCard.tsx src/components/play/PlayFeed.tsx src/styles/play.css \
  tests/unit/sat-card.test.tsx tests/e2e/play.spec.ts
git commit -m "feat(play): pace-check ring, verdict and +10 bonus"
```

### Task 6: The Reset routine and the reset offer

**Files:**
- Create: `src/components/play/ResetRoutine.tsx`, `tests/unit/reset-routine.test.tsx`
- Modify: `src/components/play/PlayFeed.tsx`, `src/styles/play.css`
- Test: `tests/e2e/play.spec.ts`

**Interfaces:**
- Produces: `ResetRoutine({ reduced, onClose })` (default export, loaded lazily), `BREATHS`, `CHECKLIST`. PlayFeed shows a reset offer card once per session after 3 SAT misses in a row, and opens the routine from it and from pace checks' Reset button.

- [ ] **Step 1: Write the failing tests**

`tests/unit/reset-routine.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResetRoutine, { CHECKLIST } from '../../src/components/play/ResetRoutine';

describe('ResetRoutine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('breathes for 20 seconds (in 4, out 6, twice), then shows the unstuck checklist', () => {
    render(<ResetRoutine reduced={false} onClose={() => {}} />);
    expect(screen.getByText('Breathe in')).toBeVisible();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByText('Breathe out')).toBeVisible();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByText('Breathe in')).toBeVisible();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('heading', { name: 'Get unstuck' })).toBeVisible();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([...CHECKLIST]);
  });
  it('uses a text countdown instead of the circle with reduced motion', () => {
    const { container } = render(<ResetRoutine reduced onClose={() => {}} />);
    expect(container.querySelector('.reset-circle')).toBeNull();
    expect(screen.getByText('4')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('3')).toBeVisible();
  });
  it('can skip to the checklist, and closes with its button or Escape', () => {
    const onClose = vi.fn();
    render(<ResetRoutine reduced onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the checklist' }));
    expect(screen.getByRole('heading', { name: 'Get unstuck' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the questions' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

Append to `tests/e2e/play.spec.ts`:

```ts
test('three misses in a row offer a reset that ends with the unstuck checklist', async ({ page }) => {
  await page.goto('/play/?go=1');
  for (let i = 0; i < 3; i++) {
    await answerCurrent(page, false);
    await next(page);
  }
  await expect(current(page).getByRole('heading', { name: 'Take 20 seconds?' })).toBeVisible();
  await current(page).getByRole('button', { name: 'Start the reset' }).click();
  const dialog = page.getByRole('dialog', { name: 'Take 20 seconds' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip to the checklist' }).click();
  await expect(page.getByRole('dialog', { name: 'Get unstuck' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to the questions' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The three answered cards keep their results.
  await page.getByRole('button', { name: 'Previous card' }).click();
  await expect(current(page).getByRole('status')).toContainText('Not quite');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/reset-routine.test.tsx`
Expected: FAIL. It can't resolve `ResetRoutine`.

- [ ] **Step 3: Implement**

`src/components/play/ResetRoutine.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

/** Guided breathing (spec §5.2): in 4 s, out 6 s, twice. 20 seconds in all. */
export const BREATHS = [
  { label: 'Breathe in', seconds: 4 },
  { label: 'Breathe out', seconds: 6 },
  { label: 'Breathe in', seconds: 4 },
  { label: 'Breathe out', seconds: 6 },
] as const;
const TOTAL = BREATHS.reduce((s, b) => s + b.seconds, 0);

/** The unstuck checklist (spec §5.2). Test strategy, not health advice. */
export const CHECKLIST = [
  'Reread exactly what the question asks for.',
  'Try the answer choices, or plug in easy numbers.',
  'Graph it in Desmos.',
  "Still stuck: guess, flag, move on. Wrong answers don't lose points on the SAT, so never leave one blank.",
] as const;

/** The breath at `elapsed` seconds and the seconds left in it. */
function breathAt(elapsed: number): { step: number; left: number } {
  let start = 0;
  for (let step = 0; step < BREATHS.length; step++) {
    const len = (BREATHS[step] as (typeof BREATHS)[number]).seconds;
    if (elapsed < start + len) return { step, left: start + len - elapsed };
    start += len;
  }
  return { step: BREATHS.length - 1, left: 0 };
}

/** 20 seconds of breathing, then the unstuck checklist. Opened from Quick Play (spec §5.2). */
export default function ResetRoutine({ reduced, onClose }: { reduced: boolean; onClose(): void }) {
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const done = skipped || elapsed >= TOTAL;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [done]);
  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [done]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { step, left } = breathAt(elapsed);
  const breath = BREATHS[step] as (typeof BREATHS)[number];
  return (
    <div className="reset-routine" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <h2 id="reset-title" tabIndex={-1} ref={heading}>
        {done ? 'Get unstuck' : 'Take 20 seconds'}
      </h2>
      {done ? (
        <>
          <ol className="reset-checklist">
            {CHECKLIST.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <button type="button" className="button primary" onClick={onClose}>
            Back to the questions
          </button>
        </>
      ) : (
        <>
          {!reduced && (
            <div
              key={step}
              className={`reset-circle ${breath.label === 'Breathe in' ? 'is-in' : 'is-out'}`}
              style={{ animationDuration: `${breath.seconds}s` }}
              aria-hidden="true"
            />
          )}
          <p className="reset-step" aria-live="polite">
            {breath.label}
          </p>
          <p className="reset-count" aria-hidden="true">
            {left}
          </p>
          <button type="button" className="button" onClick={() => setSkipped(true)}>
            Skip to the checklist
          </button>
        </>
      )}
    </div>
  );
}
```

In `src/components/play/PlayFeed.tsx`:
- Change the React import to also include `lazy, Suspense`, and add `const ResetRoutine = lazy(() => import('./ResetRoutine'));` below the imports.
- Add the state and handlers after `comboRef`:

```ts
  // The reset routine (spec §5.2): offered once per session after 3 SAT misses in a row.
  const [resetOpen, setResetOpen] = useState(false);
  const missRun = useRef(0);
  const resetOffered = useRef(false);
  const currentRef = useRef(0);
  currentRef.current = current;
  const openReset = useCallback(() => setResetOpen(true), []);
  const closeReset = useCallback(() => {
    setResetOpen(false);
    scroller.current
      ?.querySelector<HTMLElement>(`[data-index="${currentRef.current}"] h2`)
      ?.focus({ preventScroll: true });
  }, []);
```

- In the keyboard effect, return early when `resetOpen` (add it to the dependency list): `if (resetOpen || isTyping(e.target)) return;`.
- At the end of `onAnswer`, replace the `entriesRef.current = …map…` assignment with:

```ts
    missRun.current = r.correct ? 0 : missRun.current + 1;
    let list = entriesRef.current.map((e, i) =>
      i === index
        ? { ...e, at: now.toISOString(), result: { ...r, points: scored.points, multiplier: scored.multiplier, bonus } }
        : e,
    );
    if (missRun.current >= 3 && !resetOffered.current) {
      resetOffered.current = true;
      const offer: Entry = { key: 'reset-offer', card: { kind: 'reset', key: 'reset-offer' } };
      list = [...list.slice(0, index + 1), offer, ...list.slice(index + 1)];
    }
    entriesRef.current = list;
    setEntries(entriesRef.current);
```

- Render the reset card. Add a branch before the Lightning branch:

```tsx
            ) : e.card.kind === 'reset' ? (
              <div className="play-card play-reset-offer">
                <h2 tabIndex={-1}>Take 20 seconds?</h2>
                <p>
                  Three misses in a row happens to everyone. A short reset and a checklist can get
                  you unstuck.
                </p>
                <button type="button" className="button primary" onClick={openReset}>
                  Start the reset
                </button>
                <p className="hint">Or swipe up to keep going.</p>
              </div>
```

- Pass `onReset={openReset}` to `SatCard`, and change both cards' `active` to `i === current && !resetOpen`.
- After the `.play-arrows` nav, add:

```tsx
      {resetOpen && (
        <div className="reset-backdrop">
          <Suspense fallback={<p className="hint">Loading…</p>}>
            <ResetRoutine reduced={reduced} onClose={closeReset} />
          </Suspense>
        </div>
      )}
```

Append to `src/styles/play.css`:

```css
.play-reset-offer h2 {
  font-size: 1.4rem;
}
.reset-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(10 15 25 / 0.55);
}
.reset-routine {
  display: grid;
  justify-items: center;
  gap: 1rem;
  width: min(100%, 26rem);
  padding: 1.5rem;
  border-radius: var(--radius-feature, 24px);
  background: var(--surface);
  color: var(--text);
  text-align: center;
}
.reset-circle {
  width: 9rem;
  height: 9rem;
  border-radius: 50%;
  background: var(--accent-soft);
  border: 3px solid var(--accent);
  animation-timing-function: ease-in-out;
  animation-fill-mode: both;
}
.reset-circle.is-in {
  animation-name: reset-grow;
}
.reset-circle.is-out {
  animation-name: reset-shrink;
}
@keyframes reset-grow {
  from {
    transform: scale(0.6);
  }
  to {
    transform: scale(1);
  }
}
@keyframes reset-shrink {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(0.6);
  }
}
.reset-step {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
}
.reset-count {
  margin: 0;
  font-size: 2rem;
  font-variant-numeric: tabular-nums;
}
.reset-checklist {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding-left: 1.25rem;
  text-align: left;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --maxWorkers=2`, then `npm run test:e2e`
Expected: PASS. Then: `BASE_PATH=/free-sat-math npm run build && npm run check:bundle`
Expected: `play/index.html` ≤ 170 KB at startup (the routine is a separate on-demand chunk), and `All pages within 170 KB at startup.`

- [ ] **Step 5: Commit**

```bash
git add src/components/play/ResetRoutine.tsx src/components/play/PlayFeed.tsx src/styles/play.css \
  tests/unit/reset-routine.test.tsx tests/e2e/play.spec.ts
git commit -m "feat(play): reset offer after 3 misses, and the 20-second reset routine"
```

---

## Phases 3–4 (outline; a detailed plan follows the owner's review)

### Phase 3: Test Pace in the Gym (spec §5.1)

- A second Gym mode, **Test Pace**: 5 SAT questions with one shared clock of 5 × 95 s = 7:55, scaled by extended time. Untimed students see the mode without a clock.
- **Flag & skip** moves on and remembers the question; flagged questions come back after question 5. Time's up: unanswered questions count as unanswered, never wrong.
- Results: time on each question against 95 s, plus the lesson "flagging hard questions saves time for easy ones".
- Answers count toward the daily streak (§3.4). Pieces: a pure `src/engine/testPace.ts` state machine (unit-tested with fake time), a `TestPace` component reusing `SatCard` (lazily loaded so `/train/` stays light), and e2e with `page.clock`.

### Phase 4: The You page (spec §2.3)

- `/you/`: streak, best streak and a 7-day done/not-done row; level and points; drill personal bests; average time per question per SAT skill against 95 s; sure-vs-guessed accuracy over the last 200 attempts (shown once there are 10 of each); the count of "sure but wrong" answers with a link to Review; sound and vibration toggles; a Reset button that opens the routine; and a placeholder for the Install app button (the PWA plan adds it).
- Pieces: pure selectors in `src/store/stats.ts` (unit-tested), a `YouPage` island, a "You" nav link, and e2e at 360 px.
