# Quick Play Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Quick Play: a ▶ Play start screen, then an endless swipe feed of SAT questions with instant feedback, combos, points, levels and a daily streak. Before that, upgrade saved progress to schema v2 safely.

**Architecture:** Pure logic lives in small modules with unit tests. `engine/game.ts` holds points, combos, levels and streaks. `engine/feed.ts` picks the next card. `store/migrate.ts` handles schema v1 → v2. `store/play.ts` records an answer. One React island (`components/play/PlayApp.tsx`) renders the start screen and a full-screen scroll-snap feed. It reuses the existing problem engine, staircase, `MathText`, `AnswerInput`, `Solution` and `DesmosPanel`.

**Tech Stack:** Astro 7.3.5, React 19.3, TypeScript 6.0.3 (strictest), `zod/mini`, Vitest 5 (`unit` and `soak` projects), Playwright 1.63, KaTeX 0.18.9.

**Spec:** `docs/superpowers/specs/2026-09-29-quick-play-and-training-design.md`, which builds on `docs/superpowers/specs/2026-09-24-free-sat-math-design.md`.

**Scope of this plan:** spec §13 build step 1, plus the parts of step 0 that need no owner action (the `newer`-version guard). Three changes from the spec are deliberate:
- **"At most 7 cards stay in the page" (§2.1)** becomes "cards more than 3 away from the current one render as empty slots". Removing slots would shift the scroll-snap position under the student's finger. Empty slots keep the DOM small and the scroll position stable.
- **The visual design pass and the Review sort move to later plans,** as described below.

Two items move out:
- **The visual design pass (§10)** waits until the owner signs in to Mobbin and TypeUI. This plan styles Quick Play with the existing site tokens in its own file, `src/styles/play.css`, so that pass only has to touch that file.
- **The Review "sure but wrong" sort (§2.4)** depends on the Guessed chip, so it moves to the Mindset & Pacing plan.

Later plans:
- Mental Math, NumPad and Lightning cards.
- Mindset & Pacing: pace checks, Test Pace, Reset, the Guessed chip, the You page and the Review sort.
- Installable app.
- 3D hero.

## Global Constraints

- TypeScript strictest config. No `any`. `npm run lint` (ESLint + Prettier) and `npx astro check` are clean.
- Validation uses `zod/mini` only (spec Phase 1 §5).
- Every page ships **≤ 170 KB gzipped JS** (`npm run check:bundle`). Lesson, formula, about and 404 pages ship **no** JS files.
- Every internal link goes through `url()` from `src/lib/paths.ts` (`npm run check:links` with `BASE_PATH`).
- Saved progress never loses data. Unreadable data is backed up once; data from a newer version is never overwritten (spec §9.2).
- No accounts, network calls (except Desmos) or tracking. All text is original.
- Respect `prefers-reduced-motion`. Tap targets are ≥ 48 px, and answer buttons are ≥ 56 px tall (spec §11).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These are the five situations the spec implies but doesn't spell out that are most likely to hurt a student. Each is pinned by a test in the task that owns the code.

1. **A double tap on an answer.** Exactly one attempt is recorded and points are awarded once. *Task 6:* `sat-card.test.tsx`, "a second tap after answering does nothing".
2. **The day rolls over at midnight mid-session.** The answer at 23:59 counts for today and the one at 00:01 for tomorrow, so neither day is double-counted. *Task 4:* `game.test.ts`, "answers on either side of midnight land on different days".
3. **The next question can't be generated.** A retry card appears instead of a blank screen. *Task 5:* `feed.test.ts`, "returns no card when nothing can be generated", and *Task 6:* the retry card renders for a `null` card.
4. **Storage is blocked, full, or owned by a newer tab during play.** The feed keeps working, and the banner says why nothing is saved. *Task 1:* `progress-store.test.ts`, "never writes over data saved by a newer version of the site", and *Task 6:* the feed renders `StorageBanner`.
5. **Upgrading a real v1 record.** Every attempt, bookmark and setting survives, and a pre-v2 copy is kept. *Task 2:* `migrate.test.ts`, "upgrades a v1 record without losing anything", and `upgrade.spec.ts`, "an existing v1 record is upgraded in place".

---

### Task 1: Newer-version guard

**Files:**
- Modify: `src/store/progress.ts`, `src/store/progress-store.ts`, `src/components/StorageBanner.tsx`
- Test: `tests/unit/progress.test.ts`, `tests/unit/progress-store.test.ts`, `tests/e2e/review.spec.ts`

**Interfaces:**
- Produces: `LoadStatus` gains `'newer'`. New export `schemaVersionOf(data: unknown): number | null`. In `'newer'` status the store never saves and `replace()` returns `{ saved: false, refused: true }`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/progress.test.ts`, add `PROGRESS_SCHEMA_VERSION` to the imports:

```ts
import { PROGRESS_SCHEMA_VERSION, type Attempt } from '../../src/store/schema';
```

(This replaces the existing `import type { Attempt } from '../../src/store/schema';` line.)

In the `loadProgress` describe block, change the unreadable fixture so it stays unreadable and isn't mistaken for a newer version:

```ts
    for (const raw of ['{not json', JSON.stringify({ schemaVersion: 1 })]) {
```

Then add:

```ts
  it('leaves data from a newer version of the site untouched and does not back it up', () => {
    const store = new MemoryStore();
    const raw = JSON.stringify({ schemaVersion: PROGRESS_SCHEMA_VERSION + 1, anything: true });
    store.setItem(PROGRESS_KEY, raw);
    const r = loadProgress(store, NOW);
    expect(r.status).toBe('newer');
    expect(store.getItem(PROGRESS_KEY)).toBe(raw);
    expect([...store.data.keys()].filter((k) => k.startsWith(BACKUP_PREFIX))).toEqual([]);
  });
```

In `tests/unit/progress-store.test.ts`, add `import { PROGRESS_SCHEMA_VERSION } from '../../src/store/schema';` and this test:

```ts
  it('never writes over data saved by a newer version of the site', () => {
    const storage = memory();
    const raw = JSON.stringify({ schemaVersion: PROGRESS_SCHEMA_VERSION + 1 });
    storage.data.set(PROGRESS_KEY, raw);
    const store = createProgressStore(storage);
    expect(store.getSnapshot().status).toBe('newer');
    store.update((p) => toggleBookmark(p, 'x'));
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
    expect(store.replace(emptyProgress())).toEqual({ saved: false, refused: true });
    expect(storage.data.get(PROGRESS_KEY)).toBe(raw);
  });
```

In `tests/e2e/review.spec.ts`, in the test "unreadable saved progress is backed up and the student is told", change the seeded value. Version 99 is now treated as "newer", not "unreadable":

```ts
      localStorage.setItem('fsm.progress.v1', '{"schemaVersion": 1, "garbage": true}');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/progress.test.ts tests/unit/progress-store.test.ts`
Expected: FAIL in the two new tests. Status is `'recovered'` instead of `'newer'`, and the store writes over the raw value.

- [ ] **Step 3: Implement**

In `src/store/progress.ts`:

```ts
export type LoadStatus = 'ok' | 'fresh' | 'recovered' | 'locked' | 'newer' | 'unavailable';

/** The integer `schemaVersion` of parsed JSON, or null if it has none. */
export function schemaVersionOf(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const v = (data as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}
```

Extend the `LoadStatus` doc comment with: ``- `newer`: saved by a newer version of the site (another tab). Read-only: never backed up or overwritten.``

Replace the parse block in `loadProgress` (from `try { const parsed = progressSchema.safeParse(JSON.parse(raw));` through the closing `}` of its `catch`) with:

```ts
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  const version = schemaVersionOf(data);
  if (version !== null && version > PROGRESS_SCHEMA_VERSION) {
    return { progress: emptyProgress(), status: 'newer' };
  }
  const parsed = progressSchema.safeParse(data);
  if (parsed.success) {
    return notice === null
      ? { progress: parsed.data, status: 'ok' }
      : { progress: parsed.data, status: 'recovered', backupKey: notice };
  }
```

In `src/store/progress-store.ts`, in `update`:

```ts
      // Locked or newer: someone else's data is in storage, so nothing is saved over it.
      const readOnly = snapshot.status === 'locked' || snapshot.status === 'newer';
      const saveFailed = readOnly ? false : !saveProgress(storage, progress);
```

and at the top of `replace`:

```ts
      if (snapshot.status === 'newer') return { saved: false, refused: true };
```

In `src/components/StorageBanner.tsx`, before the `locked` branch:

```tsx
  if (snapshot.status === 'newer') {
    return (
      <p className="banner banner-warn" role="status">
        This site was updated in another tab. Refresh this page to keep saving your progress.
      </p>
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all unit tests, including the two new ones).

Run: `npm run test:e2e`
Expected: PASS, 48 tests.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/store/progress.ts src/store/progress-store.ts src/components/StorageBanner.tsx \
  tests/unit/progress.test.ts tests/unit/progress-store.test.ts tests/e2e/review.spec.ts
git commit -m "feat(store): never overwrite progress saved by a newer version of the site"
```

---

### Task 2: Schema v2 and the upgrade from v1

**Files:**
- Create: `src/engine/mental/ids.ts`, `src/store/migrate.ts`, `tests/unit/migrate.test.ts`, `tests/e2e/upgrade.spec.ts`
- Modify: `src/store/schema.ts`, `src/store/progress.ts`, `src/components/StorageBanner.tsx`, `tests/unit/progress.test.ts`

**Interfaces:**
- Consumes: `schemaVersionOf` (Task 1).
- Produces:
  - `PROGRESS_SCHEMA_VERSION = 2`.
  - `Progress` gains `game: Game` and `mental: Mental`. `Settings` gains `sound` and `haptics`.
  - `Attempt.mode` gains `'play'`, plus an optional `guessed`.
  - `DRILL_IDS` and `DrillId`.
  - `emptyGame()`, `emptyMental()`, `upgradeV1(p: ProgressV1): Progress`.
  - `readProgress(data: unknown): ReadResult`.
  - `PRE_V2_BACKUP_KEY`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyGame, emptyMental, readProgress, upgradeV1 } from '../../src/store/migrate';
import { PROGRESS_SCHEMA_VERSION, type ProgressV1 } from '../../src/store/schema';

const v1: ProgressV1 = {
  schemaVersion: 1,
  settings: { targetScore: 650, timeMultiplier: 1.5, untimed: false },
  attempts: [
    {
      problemId: 'g:alg.systems.solve-system@1:easy:mcq:7',
      skill: 'alg.systems',
      difficulty: 'easy',
      correct: false,
      response: 'B',
      timeMs: 4100,
      at: '2026-09-20T10:00:00.000Z',
      mode: 'practice',
    },
  ],
  bookmarks: ['g:alg.systems.word-system@1:medium:mcq:3'],
  skillState: { 'alg.systems': { level: 'medium', streak: 2 } },
  testAttempts: [],
  completedFixedTests: [],
};

describe('upgradeV1', () => {
  it('upgrades a v1 record without losing anything', () => {
    const v2 = upgradeV1(v1);
    expect(v2.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(v2.attempts).toEqual(v1.attempts);
    expect(v2.bookmarks).toEqual(v1.bookmarks);
    expect(v2.skillState).toEqual(v1.skillState);
    expect(v2.settings).toEqual({ ...v1.settings, sound: false, haptics: true });
    expect(v2.game).toEqual(emptyGame());
    expect(v2.mental).toEqual(emptyMental());
  });
});

describe('readProgress', () => {
  it('reads current records as they are', () => {
    const v2 = upgradeV1(v1);
    expect(readProgress(JSON.parse(JSON.stringify(v2)))).toEqual({ kind: 'current', progress: v2 });
  });
  it('upgrades valid v1 records', () => {
    const r = readProgress(JSON.parse(JSON.stringify(v1)));
    expect(r.kind).toBe('upgraded');
    if (r.kind === 'upgraded') expect(r.progress.attempts).toHaveLength(1);
  });
  it('reports records from a newer version', () => {
    expect(readProgress({ schemaVersion: PROGRESS_SCHEMA_VERSION + 1 })).toEqual({ kind: 'newer' });
  });
  it('reports anything else as unreadable, with where it failed', () => {
    const r = readProgress({ ...upgradeV1(v1), attempts: [{ problemId: 1 }] });
    expect(r.kind).toBe('unreadable');
    if (r.kind === 'unreadable') expect(r.where).toContain('attempts.0');
    expect(readProgress('nope').kind).toBe('unreadable');
  });
});
```

In `tests/unit/progress.test.ts`, add `PRE_V2_BACKUP_KEY` to the imports from `'../../src/store/progress'`, and these tests in the `loadProgress` block:

```ts
  it('upgrades a v1 record in place and keeps one copy of the original', () => {
    const store = new MemoryStore();
    const v1 = {
      schemaVersion: 1,
      settings: { targetScore: null, timeMultiplier: 1, untimed: false },
      attempts: [{ ...attempt(), mode: 'practice' }],
      bookmarks: [],
      skillState: {},
      testAttempts: [],
      completedFixedTests: [],
    };
    const raw = JSON.stringify(v1);
    store.setItem(PROGRESS_KEY, raw);
    const r = loadProgress(store, NOW);
    expect(r.status).toBe('ok');
    expect(r.progress.attempts).toHaveLength(1);
    expect(store.getItem(PRE_V2_BACKUP_KEY)).toBe(raw);
    expect(JSON.parse(store.getItem(PROGRESS_KEY)!).schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });
  it('shows the upgraded record but saves nothing when the copy cannot be kept', () => {
    const store = new MemoryStore();
    const raw = JSON.stringify({
      schemaVersion: 1,
      settings: { targetScore: null, timeMultiplier: 1, untimed: false },
      attempts: [],
      bookmarks: ['x'],
      skillState: {},
      testAttempts: [],
      completedFixedTests: [],
    });
    store.setItem(PROGRESS_KEY, raw);
    store.failBackups = true;
    const r = loadProgress(store, NOW);
    expect(r.status).toBe('locked');
    expect(r.progress.bookmarks).toEqual(['x']);
    expect(store.getItem(PROGRESS_KEY)).toBe(raw);
  });
```

Also in `tests/unit/progress.test.ts`, extend the import test so v1 files still import:

```ts
  it('accepts progress files from the previous version and upgrades them', () => {
    const v1File = JSON.stringify({
      schemaVersion: 1,
      settings: { targetScore: null, timeMultiplier: 1, untimed: false },
      attempts: [],
      bookmarks: ['b'],
      skillState: {},
      testAttempts: [],
      completedFixedTests: [],
    });
    const r = parseImport(v1File);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.progress.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });
```

`tests/e2e/upgrade.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { fixedProblem } from './helpers';

test('an existing v1 record is upgraded in place', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'easy', 'spr', 7);
  const v1 = {
    schemaVersion: 1,
    settings: { targetScore: null, timeMultiplier: 1, untimed: false },
    attempts: [
      {
        problemId: problem.id,
        skill: problem.skill,
        difficulty: problem.difficulty,
        correct: false,
        response: '1',
        timeMs: 1000,
        at: '2026-09-20T10:00:00.000Z',
        mode: 'practice',
      },
    ],
    bookmarks: [],
    skillState: {},
    testAttempts: [],
    completedFixedTests: [],
  };
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('fsm.progress.v1', raw);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(v1));
  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (1)' })).toBeVisible();
  const saved = await page.evaluate(() => ({
    version: JSON.parse(localStorage.getItem('fsm.progress.v1') ?? '{}').schemaVersion,
    copy: localStorage.getItem('fsm.backup.pre-v2') !== null,
  }));
  expect(saved).toEqual({ version: 2, copy: true });
});

test('a tab running an older version never overwrites newer saved data', async ({ page }) => {
  const newer = '{"schemaVersion": 99, "from": "the future"}';
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('fsm.progress.v1', raw);
      sessionStorage.setItem('seeded', '1');
    }
  }, newer);
  await page.goto('/review/');
  await expect(page.getByText('This site was updated in another tab')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fsm.progress.v1'))).toBe(newer);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/migrate.test.ts tests/unit/progress.test.ts`
Expected: FAIL. `migrate.test.ts` can't import `../../src/store/migrate`, and the v1 tests in `progress.test.ts` fail because v1 is still current.

- [ ] **Step 3: Implement**

`src/engine/mental/ids.ts`:

```ts
/** The six Mental Math drills (spec §4.1). Generators arrive in the Mental Math plan. */
export const DRILL_IDS = [
  'mm.arithmetic',
  'mm.fdp',
  'mm.percent',
  'mm.squares',
  'mm.exponents',
  'mm.shortcuts',
] as const;

export type DrillId = (typeof DRILL_IDS)[number];
```

`src/store/schema.ts` (full replacement):

```ts
// zod/mini is Zod's tree-shakable build: the same validation with a much smaller bundle.
import * as z from 'zod/mini';
import { DRILL_IDS } from '../engine/mental/ids';
import { SKILL_IDS } from '../engine/skills';

export const PROGRESS_SCHEMA_VERSION = 2;

const difficulty = z.enum(['easy', 'medium', 'hard']);
const skillId = z.enum(SKILL_IDS);
const drillId = z.enum(DRILL_IDS);
const nonEmpty = z.string().check(z.minLength(1));
const count = z.int().check(z.nonnegative());
const dayKey = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));

const attemptFields = {
  problemId: nonEmpty,
  skill: skillId,
  difficulty,
  correct: z.boolean(),
  /** "A"-"D" for multiple choice, the typed text for typed answers. */
  response: z.string(),
  timeMs: count,
  /** ISO timestamp. */
  at: nonEmpty,
};

export const attemptSchemaV1 = z.object({ ...attemptFields, mode: z.enum(['practice', 'test']) });
export const attemptSchema = z.object({
  ...attemptFields,
  mode: z.enum(['practice', 'test', 'play']),
  /** Quick Play's "Guessed?" chip (spec §5.3). Absent means "sure". */
  guessed: z.optional(z.boolean()),
});

export const skillStateSchema = z.object({
  level: difficulty,
  /** Positive: correct answers in a row. Negative: wrong answers in a row. */
  streak: z.int(),
});

const settingsFields = {
  targetScore: z.nullable(z.int().check(z.minimum(200), z.maximum(800))),
  timeMultiplier: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  untimed: z.boolean(),
};
export const settingsSchemaV1 = z.object(settingsFields);
export const settingsSchema = z.object({ ...settingsFields, sound: z.boolean(), haptics: z.boolean() });

export const gameSchema = z.object({
  points: count,
  bestCombo: count,
  /** Answers per local calendar day, 'YYYY-MM-DD' → count (spec §3.4). */
  answerDays: z.record(dayKey, count),
  bestStreak: count,
  tipIndex: count,
});

export const mentalSchema = z.object({
  tier: z.partialRecord(drillId, z.union([z.literal(1), z.literal(2), z.literal(3)])),
  best: z.partialRecord(drillId, count),
  sessions: z.array(
    z.object({ drill: drillId, at: nonEmpty, correct: count, attempted: count, medianMs: count }),
  ),
});

const sharedFields = {
  bookmarks: z.array(nonEmpty),
  skillState: z.partialRecord(skillId, skillStateSchema),
  /** Practice-test results. Their shape is defined in Phase 5; always empty until then. */
  testAttempts: z.array(z.unknown()),
  completedFixedTests: z.array(z.int().check(z.minimum(1), z.maximum(4))),
};

export const progressSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  settings: settingsSchemaV1,
  attempts: z.array(attemptSchemaV1),
  ...sharedFields,
});

export const progressSchema = z.object({
  schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
  settings: settingsSchema,
  attempts: z.array(attemptSchema),
  ...sharedFields,
  game: gameSchema,
  mental: mentalSchema,
});

export type Attempt = z.infer<typeof attemptSchema>;
export type SkillState = z.infer<typeof skillStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Game = z.infer<typeof gameSchema>;
export type Mental = z.infer<typeof mentalSchema>;
export type Progress = z.infer<typeof progressSchema>;
export type ProgressV1 = z.infer<typeof progressSchemaV1>;
```

`src/store/migrate.ts`:

```ts
import { schemaVersionOf } from './schema-version';
import {
  PROGRESS_SCHEMA_VERSION,
  progressSchema,
  progressSchemaV1,
  type Game,
  type Mental,
  type Progress,
  type ProgressV1,
} from './schema';

export function emptyGame(): Game {
  return { points: 0, bestCombo: 0, answerDays: {}, bestStreak: 0, tipIndex: 0 };
}

export function emptyMental(): Mental {
  return { tier: {}, best: {}, sessions: [] };
}

/** v1 → v2: everything kept, new sections start empty (spec §9.2). */
export function upgradeV1(p: ProgressV1): Progress {
  return {
    ...p,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: { ...p.settings, sound: false, haptics: true },
    game: emptyGame(),
    mental: emptyMental(),
  };
}

export type ReadResult =
  | { kind: 'current'; progress: Progress }
  | { kind: 'upgraded'; progress: Progress }
  | { kind: 'newer' }
  | { kind: 'unreadable'; where: string };

/** Classifies parsed JSON: the current schema, an older one we can upgrade, a newer one, or junk. */
export function readProgress(data: unknown): ReadResult {
  const version = schemaVersionOf(data);
  if (version !== null && version > PROGRESS_SCHEMA_VERSION) return { kind: 'newer' };
  const current = progressSchema.safeParse(data);
  if (current.success) return { kind: 'current', progress: current.data };
  const v1 = progressSchemaV1.safeParse(data);
  if (v1.success) return { kind: 'upgraded', progress: upgradeV1(v1.data) };
  const first = current.error.issues[0];
  return { kind: 'unreadable', where: first ? first.path.join('.') : '' };
}
```

`schemaVersionOf` moves out of `progress.ts` into `src/store/schema-version.ts`, because `progress.ts` now imports `migrate.ts`:

```ts
/** The integer `schemaVersion` of parsed JSON, or null if it has none. */
export function schemaVersionOf(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const v = (data as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}
```

In `src/store/progress.ts`:

- Remove the `schemaVersionOf` function body and replace it with `export { schemaVersionOf } from './schema-version';`.
- Import `emptyGame, emptyMental, readProgress` from `./migrate`.
- Add `export const PRE_V2_BACKUP_KEY = \`${BACKUP_PREFIX}pre-v2\`;`.
- `emptyProgress()` becomes:

```ts
export function emptyProgress(): Progress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: { targetScore: null, timeMultiplier: 1, untimed: false, sound: false, haptics: true },
    attempts: [],
    bookmarks: [],
    skillState: {},
    testAttempts: [],
    completedFixedTests: [],
    game: emptyGame(),
    mental: emptyMental(),
  };
}
```

- In `loadProgress`, replace the block from `const version = schemaVersionOf(data);` through the `if (parsed.success) { … }` block (both added in Task 1) with:

```ts
  const read = readProgress(data);
  if (read.kind === 'newer') return { progress: emptyProgress(), status: 'newer' };
  const withNotice = (progress: Progress): LoadResult =>
    notice === null
      ? { progress, status: 'ok' }
      : { progress, status: 'recovered', backupKey: notice };
  if (read.kind === 'current') return withNotice(read.progress);
  if (read.kind === 'upgraded') {
    // Keep one copy of the v1 original. If no copy fits, show the upgraded record but save
    // nothing, so the original stays exactly as it was (spec §9.2 step 3).
    try {
      if (storage.getItem(PRE_V2_BACKUP_KEY) === null) storage.setItem(PRE_V2_BACKUP_KEY, raw);
    } catch {
      return { progress: read.progress, status: 'locked' };
    }
    saveProgress(storage, read.progress);
    return withNotice(read.progress);
  }
```

- In `parseImport`, replace the `progressSchema.safeParse` block with:

```ts
  const read = readProgress(data);
  if (read.kind === 'newer') {
    return { ok: false, reason: 'This file is from a newer version of Free SAT Math. Refresh and try again.' };
  }
  if (read.kind === 'unreadable') {
    const where = read.where === '' ? '' : ` (at ${read.where})`;
    return { ok: false, reason: `This file is not a Free SAT Math progress file${where}.` };
  }
  const p = read.progress;
```

- Delete the now-unused `progressSchema` import from `progress.ts` if ESLint reports it.

In `src/components/StorageBanner.tsx`, reword the `locked` banner so it is true in both cases (an unreadable record or a v1 record that couldn't be backed up):

```tsx
      <p className="banner banner-warn" role="status">
        This browser's storage is too full to keep a backup, so saving is paused to protect your
        progress. Everything else still works.
      </p>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all unit tests).

Run: `npm run test:e2e`
Expected: PASS, 52 tests.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean, `- 0 errors`.

```bash
git add src/engine/mental/ids.ts src/store tests/unit/migrate.test.ts tests/unit/progress.test.ts \
  tests/e2e/upgrade.spec.ts src/components/StorageBanner.tsx
git commit -m "feat(store): schema v2 with a lossless upgrade from v1"
```

---

### Task 3: Restore offer after an old tab resets progress

**Files:**
- Modify: `src/store/progress.ts`, `src/store/progress-store.ts`, `src/components/StorageBanner.tsx`
- Test: `tests/unit/progress.test.ts`, `tests/unit/progress-store.test.ts`

**Interfaces:**
- Consumes: `readProgress`, `PRE_V2_BACKUP_KEY` (Task 2).
- Produces:
  - `findRestorableBackup(storage, keys, current, now): string | null`.
  - `StoreSnapshot.restorable?: string`.
  - `ProgressStore.restore(key: string): ReplaceResult`.
  - `createProgressStore(storage, now?, session?, listKeys?)`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/progress.test.ts` (import `findRestorableBackup`):

```ts
describe('findRestorableBackup', () => {
  const real = recordAttempt(emptyProgress(), attempt());
  it('finds a recent backup with real progress when the saved record is empty', () => {
    const store = new MemoryStore();
    const key = `${BACKUP_PREFIX}2026-09-24T11:00:00.000Z`;
    store.setItem(key, JSON.stringify(real));
    expect(findRestorableBackup(store, [key, PROGRESS_KEY], emptyProgress(), NOW)).toBe(key);
  });
  it('offers nothing when the saved record already has progress', () => {
    const store = new MemoryStore();
    const key = `${BACKUP_PREFIX}2026-09-24T11:00:00.000Z`;
    store.setItem(key, JSON.stringify(real));
    expect(findRestorableBackup(store, [key], real, NOW)).toBeNull();
  });
  it('ignores backups older than a day, empty backups and the pre-v2 copy', () => {
    const store = new MemoryStore();
    const old = `${BACKUP_PREFIX}2026-09-22T11:00:00.000Z`;
    const empty = `${BACKUP_PREFIX}2026-09-24T11:30:00.000Z`;
    store.setItem(old, JSON.stringify(real));
    store.setItem(empty, JSON.stringify(emptyProgress()));
    store.setItem(PRE_V2_BACKUP_KEY, JSON.stringify(real));
    expect(findRestorableBackup(store, [old, empty, PRE_V2_BACKUP_KEY], emptyProgress(), NOW)).toBeNull();
  });
});
```

In `tests/unit/progress-store.test.ts`:

```ts
  it('offers a recent backup and restores it on request', () => {
    const storage = memory();
    const key = `${BACKUP_PREFIX}2026-09-24T00:00:00.000Z`;
    storage.data.set(key, JSON.stringify(toggleBookmark(emptyProgress(), 'kept')));
    // Real progress counts as attempts; a bookmark alone is not enough, so add one attempt.
    const withAttempt = JSON.parse(storage.data.get(key)!);
    withAttempt.attempts = [
      {
        problemId: 'g:alg.systems.solve-system@1:easy:mcq:1',
        skill: 'alg.systems',
        difficulty: 'easy',
        correct: true,
        response: 'A',
        timeMs: 1,
        at: '2026-09-24T00:00:00.000Z',
        mode: 'practice',
      },
    ];
    storage.data.set(key, JSON.stringify(withAttempt));
    const store = createProgressStore(
      storage,
      () => new Date('2026-09-24T06:00:00.000Z'),
      null,
      () => [...storage.data.keys()],
    );
    expect(store.getSnapshot().restorable).toBe(key);
    expect(store.restore(key).saved).toBe(true);
    expect(store.getSnapshot().progress.bookmarks).toEqual(['kept']);
    expect(store.getSnapshot().restorable).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/progress.test.ts tests/unit/progress-store.test.ts`
Expected: FAIL because `findRestorableBackup` and `restore` don't exist.

- [ ] **Step 3: Implement**

In `src/store/progress.ts`:

```ts
export const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A backup from the last day holding real progress, offered when the saved record is empty.
 * Covers a tab that still runs an older version: it can reset the record after a newer version
 * wrote to it, but it always backs the data up first (spec §9.2, known gap).
 */
export function findRestorableBackup(
  storage: KeyValueStore,
  keys: readonly string[],
  current: Progress,
  now: Date,
): string | null {
  if (current.attempts.length > 0 || current.game.points > 0) return null;
  const recent = keys
    .filter((k) => k.startsWith(BACKUP_PREFIX) && k !== PRE_V2_BACKUP_KEY)
    .filter((k) => {
      const t = Date.parse(k.slice(BACKUP_PREFIX.length));
      return Number.isFinite(t) && t <= now.getTime() && now.getTime() - t <= RESTORE_WINDOW_MS;
    })
    .sort()
    .reverse();
  for (const key of recent) {
    let data: unknown;
    try {
      data = JSON.parse(storage.getItem(key) ?? '');
    } catch {
      continue;
    }
    const read = readProgress(data);
    if (read.kind !== 'newer' && read.kind !== 'unreadable' && read.progress.attempts.length > 0) {
      return key;
    }
  }
  return null;
}
```

In `src/store/progress-store.ts`:

- `StoreSnapshot` gains `/** A recent backup worth offering to restore (see findRestorableBackup). */ restorable?: string;`.
- `ProgressStore` gains `/** Replaces progress with a backup (backing up the current record first). */ restore(key: string): ReplaceResult;`.
- `createProgressStore` gains a 4th parameter, `listKeys: () => readonly string[] = () => []`. `fromLoad` becomes:

```ts
  const fromLoad = (): StoreSnapshot => {
    const loaded = loadProgress(storage, now(), session);
    const base: StoreSnapshot = { progress: loaded.progress, status: loaded.status, saveFailed: false };
    if (loaded.backupKey !== undefined) base.backupKey = loaded.backupKey;
    if (storage !== null && (loaded.status === 'ok' || loaded.status === 'recovered')) {
      const restorable = findRestorableBackup(storage, listKeys(), loaded.progress, now());
      if (restorable !== null) base.restorable = restorable;
    }
    return base;
  };
```

- Add the method:

```ts
    restore(key) {
      if (storage === null) return { saved: false };
      let data: unknown;
      try {
        data = JSON.parse(storage.getItem(key) ?? '');
      } catch {
        return { saved: false };
      }
      const read = readProgress(data);
      if (read.kind === 'newer' || read.kind === 'unreadable') return { saved: false };
      const result = this.replace(read.progress);
      if (!result.refused) {
        const { restorable: _gone, ...rest } = snapshot;
        snapshot = rest;
        emit();
      }
      return result;
    },
```

  `restore` calls `this.replace`, so `replace` and `restore` must be written as methods of the returned object literal, and that object must be returned directly, never destructured.

- In `getProgressStore`, pass the key lister:

```ts
    const store = createProgressStore(browserStorage(), undefined, browserSession(), () => {
      try {
        return Object.keys(window.localStorage);
      } catch {
        return [];
      }
    });
```

In `src/components/StorageBanner.tsx`, import `getProgressStore` and add before the `recovered` branch:

```tsx
  if (snapshot.restorable !== undefined) {
    const key = snapshot.restorable;
    return (
      <div className="banner" role="status">
        <p>We found a copy of your progress from the last day. Want it back?</p>
        <button type="button" className="button" onClick={() => getProgressStore().restore(key)}>
          Restore your progress
        </button>
      </div>
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/store src/components/StorageBanner.tsx tests/unit/progress.test.ts tests/unit/progress-store.test.ts
git commit -m "feat(store): offer to restore progress an older tab reset"
```

---

### Task 4: Game rules

**Files:**
- Create: `src/engine/game.ts`, `tests/unit/game.test.ts`

**Interfaces:**
- Produces:
  - `BASE_POINTS`, `ANSWERS_PER_DAY = 5`, `DAYS_KEPT = 400`.
  - `comboMultiplier(combo: number): number`.
  - `scoreSatAnswer(combo: number, correct: boolean, difficulty: Difficulty): { combo: number; points: number; multiplier: number }`.
  - `pointsForLevel(level: number): number`.
  - `levelInfo(points: number): { level: number; into: number; needed: number }`.
  - `dayKey(d: Date): string`.
  - `addAnswerDay(days: Readonly<Record<string, number>>, now: Date): Record<string, number>`.
  - `currentStreak(days: Readonly<Record<string, number>>, now: Date): number`.

- [ ] **Step 1: Write the failing test**

`tests/unit/game.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ANSWERS_PER_DAY,
  addAnswerDay,
  comboMultiplier,
  currentStreak,
  dayKey,
  levelInfo,
  pointsForLevel,
  scoreSatAnswer,
} from '../../src/engine/game';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const counted = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, ANSWERS_PER_DAY]));

describe('combos and points', () => {
  it('multiplies by 1, 2, 3 and 5 as the combo grows', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 25].map(comboMultiplier)).toEqual([1, 1, 1, 2, 2, 3, 3, 5, 5]);
  });
  it('awards base points times the multiplier for the new combo', () => {
    expect(scoreSatAnswer(0, true, 'easy')).toEqual({ combo: 1, points: 10, multiplier: 1 });
    expect(scoreSatAnswer(2, true, 'medium')).toEqual({ combo: 3, points: 40, multiplier: 2 });
    expect(scoreSatAnswer(9, true, 'hard')).toEqual({ combo: 10, points: 150, multiplier: 5 });
  });
  it('resets the combo and awards nothing for a wrong answer', () => {
    expect(scoreSatAnswer(7, false, 'hard')).toEqual({ combo: 0, points: 0, multiplier: 1 });
  });
});

describe('levels', () => {
  it('needs 100, 300, 600 running points for levels 2, 3, 4', () => {
    expect([1, 2, 3, 4].map(pointsForLevel)).toEqual([0, 100, 300, 600]);
  });
  it('reports the level and progress into it', () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelInfo(99)).toEqual({ level: 1, into: 99, needed: 100 });
    expect(levelInfo(100)).toEqual({ level: 2, into: 0, needed: 200 });
    expect(levelInfo(450)).toEqual({ level: 3, into: 150, needed: 300 });
  });
});

describe('days and streaks', () => {
  it('uses the local calendar date', () => {
    expect(dayKey(at(2026, 3, 8, 9))).toBe('2026-03-08');
  });
  it('answers on either side of midnight land on different days', () => {
    let days = addAnswerDay({}, at(2026, 10, 1, 23, 59));
    days = addAnswerDay(days, at(2026, 10, 2, 0, 1));
    expect(days).toEqual({ '2026-10-01': 1, '2026-10-02': 1 });
  });
  it('drops days older than the retention window', () => {
    const days = addAnswerDay({ '2024-01-01': 5, '2026-09-30': 2 }, at(2026, 10, 1));
    expect(days).toEqual({ '2026-09-30': 2, '2026-10-01': 1 });
  });
  it('counts a streak ending today', () => {
    expect(currentStreak(counted('2026-09-29', '2026-09-30', '2026-10-01'), at(2026, 10, 1))).toBe(3);
  });
  it('keeps yesterday’s streak alive before today’s answers are in', () => {
    const days = { ...counted('2026-09-29', '2026-09-30'), '2026-10-01': 2 };
    expect(currentStreak(days, at(2026, 10, 1, 8))).toBe(2);
  });
  it('resets after a missed day', () => {
    expect(currentStreak(counted('2026-09-28', '2026-09-29'), at(2026, 10, 1))).toBe(0);
  });
  it('steps across daylight-saving changes by calendar day', () => {
    expect(currentStreak(counted('2026-03-07', '2026-03-08', '2026-03-09'), at(2026, 3, 9, 1))).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/game.test.ts`
Expected: FAIL because `src/engine/game.ts` doesn't exist.

- [ ] **Step 3: Implement**

`src/engine/game.ts`:

```ts
/** Quick Play's game rules (spec §3). Pure functions; every number here is tunable. */
import type { Difficulty } from './problem';

export const BASE_POINTS: Readonly<Record<Difficulty, number>> = { easy: 10, medium: 20, hard: 30 };
/** Answers in one local day that keep the streak going. */
export const ANSWERS_PER_DAY = 5;
/** Days of answer counts kept in saved progress. */
export const DAYS_KEPT = 400;

/** ×1 below 3 correct in a row, ×2 for 3–5, ×3 for 6–9, ×5 from 10. */
export function comboMultiplier(combo: number): number {
  if (combo >= 10) return 5;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

/** Scores one SAT answer. `combo` is the run of correct answers before this one. */
export function scoreSatAnswer(
  combo: number,
  correct: boolean,
  difficulty: Difficulty,
): { combo: number; points: number; multiplier: number } {
  if (!correct) return { combo: 0, points: 0, multiplier: 1 };
  const next = combo + 1;
  const multiplier = comboMultiplier(next);
  return { combo: next, points: BASE_POINTS[difficulty] * multiplier, multiplier };
}

/** Running points needed to reach `level`; level 1 starts at 0. */
export function pointsForLevel(level: number): number {
  return (100 * (level - 1) * level) / 2;
}

export function levelInfo(points: number): { level: number; into: number; needed: number } {
  let level = 1;
  while (pointsForLevel(level + 1) <= points) level += 1;
  const start = pointsForLevel(level);
  return { level, into: points - start, needed: pointsForLevel(level + 1) - start };
}

/** The device's local calendar date as 'YYYY-MM-DD'. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The same local time `n` calendar days away (safe across daylight-saving changes). */
function shiftDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/** One more answer today. Days older than DAYS_KEPT are dropped. */
export function addAnswerDay(
  days: Readonly<Record<string, number>>,
  now: Date,
): Record<string, number> {
  const today = dayKey(now);
  const cutoff = dayKey(shiftDays(now, -DAYS_KEPT));
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(days)) if (k > cutoff) next[k] = v;
  next[today] = (next[today] ?? 0) + 1;
  return next;
}

const isCounted = (days: Readonly<Record<string, number>>, key: string) =>
  (days[key] ?? 0) >= ANSWERS_PER_DAY;

/**
 * Consecutive counted days ending today, or ending yesterday when today isn't counted yet,
 * so the streak doesn't read 0 in the morning (spec §3.4).
 */
export function currentStreak(days: Readonly<Record<string, number>>, now: Date): number {
  const start = isCounted(days, dayKey(now)) ? now : shiftDays(now, -1);
  let n = 0;
  while (n <= DAYS_KEPT && isCounted(days, dayKey(shiftDays(start, -n)))) n += 1;
  return n;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project unit tests/unit/game.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/engine/game.ts tests/unit/game.test.ts
git commit -m "feat(engine): Quick Play points, combos, levels and streaks"
```

---

### Task 5: Feed composer, tips and recording a play answer

**Files:**
- Create: `src/content/tips.ts`, `src/engine/feed.ts`, `src/store/play.ts`, `tests/unit/feed.test.ts`, `tests/unit/play-store.test.ts`

**Interfaces:**
- Consumes:
  - `startingLevel`, `updateStair` (Phase 1 `engine/practice.ts`);
  - `generateVerified` (`engine/build.ts`);
  - `availableSkills`, `problemTypesForSkill` (`engine/registry.ts`);
  - `skillAccuracy`, `recordAttempt`, `setSkillState` (`store/progress.ts`);
  - `addAnswerDay`, `currentStreak` (Task 4).
- Produces:
  - `TIPS: readonly string[]` (20 entries);
  - `Card`, `FeedState`, `newFeedState(tipIndex)`, `nextCard(progress, state, rng)`, `skillWeight(acc)`;
  - `applyPlayAnswer(progress, answer): Progress`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/feed.test.ts`:

```ts
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
      expect(formats.slice(i, i + SPR_GAP + 1).filter((f) => f === 'spr').length).toBeLessThanOrEqual(1);
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
```

`tests/unit/play-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { getProblemType } from '../../src/engine/registry';
import { applyPlayAnswer } from '../../src/store/play';
import { emptyProgress } from '../../src/store/progress';

const problem = buildProblem(getProblemType('alg.systems.solve-system')!, 'medium', 'mcq', 5);
const base = { problem, response: 'A', timeMs: 3000, now: new Date(2026, 9, 1, 15) };

describe('applyPlayAnswer', () => {
  it('records the attempt, points, best combo, day count and staircase', () => {
    const p = applyPlayAnswer(emptyProgress(), { ...base, correct: true, points: 40, combo: 3 });
    expect(p.attempts).toHaveLength(1);
    expect(p.attempts[0]).toMatchObject({ mode: 'play', correct: true, problemId: problem.id });
    expect(p.game.points).toBe(40);
    expect(p.game.bestCombo).toBe(3);
    expect(p.game.answerDays).toEqual({ '2026-10-01': 1 });
    expect(p.skillState['alg.systems']).toEqual({ level: 'medium', streak: 1 });
  });
  it('raises the best streak when today completes a streak day', () => {
    let p = emptyProgress();
    for (let i = 0; i < 5; i++) p = applyPlayAnswer(p, { ...base, correct: false, points: 0, combo: 0 });
    expect(p.game.bestStreak).toBe(1);
    expect(p.game.bestCombo).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/feed.test.ts tests/unit/play-store.test.ts`
Expected: FAIL because the modules don't exist.

- [ ] **Step 3: Implement**

`src/content/tips.ts`:

```ts
/** Test-day tips shown as cards in Quick Play (spec §5.4). Original wording; keep each short. */
export const TIPS: readonly string[] = [
  'Answer every question. A blank scores the same as a wrong answer.',
  'Desmos can check your algebra: graph both sides and look for where they meet.',
  'Read the last line of the question first, so you know what you are solving for.',
  'Stuck after a minute? Flag it, guess, and come back if there is time.',
  'Plug the answer choices back into the equation. One of them has to work.',
  'Pick an easy number like 2 or 10 for a variable and test each choice.',
  'Circle the units. Questions love to switch between minutes and hours.',
  'Check whether the question wants x, y, or something like x + y.',
  'If two answer choices are opposites, the sign is what the question is testing.',
  'Estimate first. A quick ballpark rules out choices that are far off.',
  'Write down the equation from a word problem before doing any math.',
  'For "how many solutions" questions, compare slopes first.',
  'Draw the picture for any geometry question, even when one is given.',
  'Keep an eye on "not" and "except" in the question stem.',
  'Your first module sets the difficulty of the second, so accuracy early pays off.',
  'Typed answers can be fractions or decimals. Never round a fraction you can enter exactly.',
  'A negative typed answer can be up to 6 characters, including the minus sign.',
  'Breathe out slowly when you feel rushed. It resets your focus in seconds.',
  'Skim the formula sheet before the test so you know what is on it.',
  'The last few questions are not always the hardest. Leave time to try them.',
];
```

`src/engine/feed.ts`:

```ts
/** Picks Quick Play's next card (spec §3.5). Lightning and pace cards arrive in later plans. */
import { TIPS } from '../content/tips';
import { skillAccuracy, type Accuracy } from '../store/progress';
import type { Progress } from '../store/schema';
import { generateVerified } from './build';
import { startingLevel } from './practice';
import type { Format, Problem } from './problem';
import { availableSkills, problemTypesForSkill } from './registry';
import type { Rng } from './rng';
import type { SkillId } from './skills';

export type Card =
  | { kind: 'sat'; key: string; problem: Problem }
  | { kind: 'tip'; key: string; text: string };

/** A tip after this many questions. */
export const TIP_EVERY = 25;
/** At most one typed answer in any SPR_GAP + 1 questions (MCQ-first for phones). */
export const SPR_GAP = 4;
export const SPR_CHANCE = 0.25;
/** Problems answered this recently are never shown again. */
export const RECENT_ATTEMPTS = 200;

export interface FeedState {
  sinceTip: number;
  recentFormats: Format[];
  issued: string[];
  tipIndex: number;
  cardCount: number;
}

export function newFeedState(tipIndex: number): FeedState {
  return { sinceTip: 0, recentFormats: [], issued: [], tipIndex, cardCount: 0 };
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

/** The next card, or null when no question could be generated (the feed shows a retry card). */
export function nextCard(
  progress: Progress,
  state: FeedState,
  rng: Rng,
): { card: Card | null; state: FeedState } {
  if (state.sinceTip >= TIP_EVERY) {
    const text = TIPS[state.tipIndex % TIPS.length] as string;
    return {
      card: { kind: 'tip', key: `tip-${state.cardCount}`, text },
      state: { ...state, sinceTip: 0, tipIndex: state.tipIndex + 1, cardCount: state.cardCount + 1 },
    };
  }
  const problem = satProblem(progress, state, rng);
  if (problem === null) return { card: null, state };
  return {
    card: { kind: 'sat', key: problem.id, problem },
    state: {
      ...state,
      sinceTip: state.sinceTip + 1,
      recentFormats: [...state.recentFormats, problem.format].slice(-SPR_GAP),
      issued: [...state.issued, problem.id],
      cardCount: state.cardCount + 1,
    },
  };
}
```

`src/store/play.ts`:

```ts
/** Records one Quick Play answer: attempt, staircase, points, best combo and streak days. */
import { addAnswerDay, currentStreak } from '../engine/game';
import { updateStair } from '../engine/practice';
import type { Problem } from '../engine/problem';
import { recordAttempt, setSkillState } from './progress';
import type { Progress } from './schema';

export interface PlayAnswer {
  problem: Problem;
  correct: boolean;
  response: string;
  timeMs: number;
  points: number;
  /** The combo after this answer. */
  combo: number;
  now: Date;
}

export function applyPlayAnswer(progress: Progress, a: PlayAnswer): Progress {
  const { problem } = a;
  let next = recordAttempt(progress, {
    problemId: problem.id,
    skill: problem.skill,
    difficulty: problem.difficulty,
    correct: a.correct,
    response: a.response,
    timeMs: a.timeMs,
    at: a.now.toISOString(),
    mode: 'play',
  });
  const stair = progress.skillState[problem.skill] ?? { level: problem.difficulty, streak: 0 };
  next = setSkillState(next, problem.skill, updateStair(stair, a.correct));
  const answerDays = addAnswerDay(progress.game.answerDays, a.now);
  return {
    ...next,
    game: {
      ...next.game,
      points: next.game.points + a.points,
      bestCombo: Math.max(next.game.bestCombo, a.combo),
      answerDays,
      bestStreak: Math.max(next.game.bestStreak, currentStreak(answerDays, a.now)),
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/content/tips.ts src/engine/feed.ts src/store/play.ts tests/unit/feed.test.ts tests/unit/play-store.test.ts
git commit -m "feat(play): feed composer, tips and recording play answers"
```

---

### Task 6: The Quick Play page

**Files:**
- Create: `src/components/play/PlayApp.tsx`, `src/components/play/SatCard.tsx`, `src/components/play/feedback.ts`, `src/styles/play.css`, `src/pages/play/index.astro`
- Test: `tests/unit/sat-card.test.tsx`, `tests/e2e/play.spec.ts`

**Interfaces:**
- Consumes: Tasks 2, 4 and 5; `checkSpr`; `LETTERS`; `answerText` (`lib/labels`); `MathText`, `AnswerInput`, `Solution`, `DesmosPanel`, `StorageBanner`; `useProgress`, `getProgressStore`, `updateSettings`.
- Produces:
  - **Island:** `PlayApp` with `client:only="react"`, at `/play/`. `?go=1` skips the start screen.
  - **Test hooks** (used by Task 7 and later plans):
    - Feed slots are `[data-index]`; the current one has `data-current="true"`.
    - Choice buttons carry `data-letter`.
    - The stem keeps `id="stem-<problem id>"`.
    - The HUD combo text reads `Combo N · ×M`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/sat-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SatCard from '../../src/components/play/SatCard';
import type { Problem } from '../../src/engine/problem';

const mcq: Problem = {
  id: 'g:test@1:easy:mcq:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  format: 'mcq',
  source: 'generated',
  stem: 'What is $1 + 1$?',
  choices: [{ text: '$1$' }, { text: '$2$' }, { text: '$3$' }, { text: '$4$' }],
  answer: { kind: 'choice', index: 1 },
  solution: ['Add.'],
};

describe('SatCard', () => {
  it('answers with one tap and reports the result', async () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <SatCard problem={mcq} desmosKey={null} result={undefined} reduced onAnswer={onAnswer} />,
    );
    await userEvent.click(container.querySelector('[data-letter="B"]')!);
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true, response: 'B' }));
  });
  it('a second tap after answering does nothing', async () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <SatCard problem={mcq} desmosKey={null} result={undefined} reduced onAnswer={onAnswer} />,
    );
    await userEvent.click(container.querySelector('[data-letter="A"]')!);
    await userEvent.click(container.querySelector('[data-letter="B"]')!);
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
  it('shows the result, the answer and a Why? button once answered', async () => {
    render(
      <SatCard
        problem={mcq}
        desmosKey={null}
        result={{ correct: false, response: 'A', timeMs: 1, points: 0, multiplier: 1 }}
        reduced
        onAnswer={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    await userEvent.click(screen.getByRole('button', { name: 'Why?' }));
    // Solution is lazy-loaded, so wait for it.
    expect(await screen.findByRole('region', { name: 'Solution' })).toBeVisible();
  });
});
```

`tests/e2e/play.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { LETTERS } from '../../src/engine/problem';
import { problemFromId } from '../../src/engine/registry';

const current = (page: Page) => page.locator('[data-current="true"]');

async function answerCurrent(page: Page, correct: boolean) {
  const stem = current(page).locator('[id^="stem-g:"]');
  await expect(stem).toBeVisible();
  const id = (await stem.getAttribute('id'))!.slice('stem-'.length);
  const problem = problemFromId(id)!.problem;
  if (problem.answer.kind === 'choice') {
    const index = correct ? problem.answer.index : (problem.answer.index + 1) % 4;
    await current(page).locator(`[data-letter="${LETTERS[index]}"]`).click();
  } else {
    const right = answerValue(problem)!;
    await current(page).getByLabel('Your answer').fill(correct ? right : right === '1' ? '2' : '1');
    await current(page).getByRole('button', { name: 'Check' }).click();
  }
  await expect(current(page).getByRole('status')).toContainText(correct ? 'Correct' : 'Not quite');
}

const next = (page: Page) => page.getByRole('button', { name: 'Next card' }).click();

test('Play starts the feed and a right answer earns points', async ({ page }) => {
  await page.goto('/play/');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await answerCurrent(page, true);
  await expect(page.getByText(/^\d+ pts$/)).not.toHaveText('0 pts');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fsm.progress.v1')!));
  expect(saved.attempts[0].mode).toBe('play');
  expect(saved.game.points).toBeGreaterThan(0);
});

test('a skip keeps the combo going', async ({ page }) => {
  await page.goto('/play/?go=1');
  await answerCurrent(page, true);
  await next(page);
  await answerCurrent(page, true);
  await next(page);
  await next(page); // skip without answering
  await answerCurrent(page, true);
  await expect(page.getByText('Combo 3 · ×2')).toBeVisible();
});

test('five answers in a day start a streak, and nothing is lost on reload', async ({ page }) => {
  await page.goto('/play/?go=1');
  for (let i = 0; i < 5; i++) {
    await answerCurrent(page, i % 2 === 0);
    await next(page);
  }
  // A fresh visit to the start screen (no ?go=1) reads everything back from storage.
  await page.goto('/play/');
  await expect(page.getByText('1-day streak')).toBeVisible();
});

test('the feed works with the keyboard alone', async ({ page }) => {
  await page.goto('/play/?go=1');
  await expect(current(page).locator('[id^="stem-g:"]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-index="1"]')).toHaveAttribute('data-current', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-index="0"]')).toHaveAttribute('data-current', 'true');
});

test('reduced motion turns the burst off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play/?go=1');
  await answerCurrent(page, true);
  await expect(page.locator('.play-burst')).toHaveCount(0);
});

test('Quick Play fits a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/play/', '/play/?go=1']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/sat-card.test.tsx`
Expected: FAIL because `SatCard` doesn't exist.

Run: `npm run test:e2e`
Expected: FAIL in the new `play.spec.ts` tests (`/play/` is a 404). The 52 existing tests still pass.

- [ ] **Step 3: Implement**

`src/components/play/feedback.ts`:

```ts
/** Vibration and sound for Quick Play answers. Both optional, both fail silently (spec §2.1). */
let audio: AudioContext | null = null;

function tones(freqs: readonly number[]): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx === undefined) return;
    audio ??= new Ctx();
    const ctx = audio;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.09;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.13);
    });
  } catch {
    // Audio unavailable: play silently.
  }
}

export function answerFeedback(correct: boolean, settings: { sound: boolean; haptics: boolean }): void {
  if (correct && settings.haptics && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(20);
    } catch {
      // Not supported (e.g. iPhone): nothing happens.
    }
  }
  if (settings.sound) tones(correct ? [660, 880] : [220]);
}

export function levelUpFeedback(settings: { sound: boolean }): void {
  if (settings.sound) tones([523, 659, 784]);
}
```

`src/components/play/SatCard.tsx`:

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { checkSpr } from '../../engine/answer';
import { LETTERS, type Problem } from '../../engine/problem';
import { answerText } from '../../lib/labels';
import AnswerInput from '../AnswerInput';
import MathText from '../MathText';

// Loaded on demand so they don't count against the page's first-load JS.
const Solution = lazy(() => import('../Solution'));
const DesmosPanel = lazy(() => import('../DesmosPanel'));

export interface CardResult {
  correct: boolean;
  response: string;
  timeMs: number;
  points: number;
  multiplier: number;
}

interface Props {
  problem: Problem;
  desmosKey: string | null;
  result: CardResult | undefined;
  reduced: boolean;
  onAnswer(r: { correct: boolean; response: string; timeMs: number }): void;
}

/** One full-screen question card: tap an answer (or type and Check), see the result. */
export default function SatCard({ problem, desmosKey, result, reduced, onAnswer }: Props) {
  const [typed, setTyped] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'why' | 'calc'>('none');
  const answered = useRef(false);
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  const elapsed = () => Math.round(performance.now() - startedAt.current);
  const submit = (correct: boolean, response: string) => {
    if (answered.current || result !== undefined) return;
    answered.current = true;
    onAnswer({ correct, response, timeMs: elapsed() });
  };

  const pickedIndex = result ? LETTERS.indexOf(result.response as (typeof LETTERS)[number]) : -1;
  const rightIndex = problem.answer.kind === 'choice' ? problem.answer.index : -1;
  const state = result === undefined ? '' : result.correct ? 'is-right' : 'is-wrong';

  return (
    <article className={`play-card ${state}`} aria-labelledby={`q-${problem.id}`}>
      <h2 id={`q-${problem.id}`} className="visually-hidden" tabIndex={-1}>
        Question
      </h2>
      <div id={`stem-${problem.id}`}>
        <MathText block text={problem.stem} className="play-stem" />
      </div>

      {problem.choices ? (
        <div className="play-choices" role="group" aria-label="Answer choices">
          {problem.choices.map((choice, i) => {
            const letter = LETTERS[i] as string;
            const cls =
              result === undefined
                ? ''
                : i === rightIndex
                  ? 'is-correct'
                  : i === pickedIndex
                    ? 'is-wrong'
                    : '';
            return (
              <button
                key={letter}
                type="button"
                className={`play-choice ${cls}`}
                data-letter={letter}
                disabled={result !== undefined}
                onClick={() => submit(i === rightIndex, letter)}
              >
                <span className="choice-letter">{letter}</span>
                <MathText text={choice.text} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="play-typed">
          <AnswerInput
            id={`answer-${problem.id}`}
            value={typed}
            onChange={setTyped}
            onSubmit={() => {
              if (problem.answer.kind !== 'spr' || typed.trim() === '') return;
              const g = checkSpr(problem.answer, typed);
              if (g.status === 'invalid') setInvalid(g.reason);
              else submit(g.correct, typed.trim());
            }}
            locked={result !== undefined}
          />
          {result === undefined && (
            <button
              type="button"
              className="button primary"
              disabled={typed.trim() === ''}
              onClick={() => {
                if (problem.answer.kind !== 'spr') return;
                const g = checkSpr(problem.answer, typed);
                if (g.status === 'invalid') setInvalid(g.reason);
                else submit(g.correct, typed.trim());
              }}
            >
              Check
            </button>
          )}
        </div>
      )}

      <div role="status" aria-live="polite" className="play-feedback">
        {invalid !== null && result === undefined && <p className="feedback-invalid">{invalid}</p>}
        {result?.correct && (
          <p className="feedback-correct">
            Correct! +{result.points}
            {result.multiplier > 1 ? ` (×${result.multiplier})` : ''}
          </p>
        )}
        {result && !result.correct && (
          <p className="feedback-wrong">
            Not quite. Answer: <MathText text={answerText(problem)} />
          </p>
        )}
      </div>
      {result?.correct && !reduced && <span className="play-burst" aria-hidden="true" />}

      <div className="play-tools">
        {result !== undefined && (
          <button type="button" className="button" onClick={() => setSheet(sheet === 'why' ? 'none' : 'why')}>
            Why?
          </button>
        )}
        <button type="button" className="button" onClick={() => setSheet(sheet === 'calc' ? 'none' : 'calc')}>
          Calculator
        </button>
      </div>

      {sheet !== 'none' && (
        <div className="play-sheet">
          <button type="button" className="link-button" onClick={() => setSheet('none')}>
            Close
          </button>
          <Suspense fallback={<p className="hint">Loading…</p>}>
            {sheet === 'why' ? (
              <Solution problem={problem} wrongIndex={result && !result.correct && pickedIndex >= 0 ? pickedIndex : null} />
            ) : (
              <DesmosPanel apiKey={desmosKey} expressions={problem.desmos ?? []} />
            )}
          </Suspense>
        </div>
      )}
    </article>
  );
}
```

`src/components/play/PlayApp.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newFeedState, nextCard, type Card, type FeedState } from '../../engine/feed';
import { comboMultiplier, currentStreak, levelInfo, scoreSatAnswer } from '../../engine/game';
import type { Problem } from '../../engine/problem';
import { createRng, randomSeed } from '../../engine/rng';
import { applyPlayAnswer } from '../../store/play';
import { updateSettings } from '../../store/progress';
import { getProgressStore, useProgress } from '../../store/progress-store';
import StorageBanner from '../StorageBanner';
import { answerFeedback, levelUpFeedback } from './feedback';
import SatCard, { type CardResult } from './SatCard';

/** Cards built ahead of the current one, so a swipe is instant. */
const LOOKAHEAD = 3;
/** Cards farther than this from the current one render as empty slots (keeps the DOM small). */
const RENDER_WINDOW = 3;

type Entry = { key: string; card: Card | null; result?: CardResult };

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

function Feed({ desmosKey, onExit }: { desmosKey: string | null; onExit(): void }) {
  const snapshot = useProgress();
  const reduced = useReducedMotion();
  const rng = useMemo(() => createRng(randomSeed()), []);
  const feedState = useRef<FeedState | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [current, setCurrent] = useState(0);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const extend = useCallback(
    (minLength: number) => {
      const list = entriesRef.current;
      if (list.length >= minLength || list.at(-1)?.card === null) return;
      const store = getProgressStore();
      let state = feedState.current ?? newFeedState(store.getSnapshot().progress.game.tipIndex);
      const added: Entry[] = [];
      while (list.length + added.length < minLength) {
        const r = nextCard(store.getSnapshot().progress, state, rng);
        if (r.card === null) {
          added.push({ key: `retry-${list.length + added.length}`, card: null });
          break;
        }
        if (r.card.kind === 'tip') {
          const tipIndex = r.state.tipIndex;
          store.update((p) => ({ ...p, game: { ...p.game, tipIndex } }));
        }
        state = r.state;
        added.push({ key: r.card.key, card: r.card });
      }
      feedState.current = state;
      entriesRef.current = [...list, ...added];
      setEntries(entriesRef.current);
    },
    [rng],
  );

  useEffect(() => extend(current + 1 + LOOKAHEAD), [current, extend]);

  // The card filling most of the screen is the current one.
  useEffect(() => {
    const root = scroller.current;
    if (root === null || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (items) => {
        for (const it of items) {
          if (it.isIntersecting) setCurrent(Number((it.target as HTMLElement).dataset['index']));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [entries.length]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= entriesRef.current.length) return;
      const slot = scroller.current?.querySelector<HTMLElement>(`[data-index="${i}"]`);
      slot?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      setCurrent(i);
      slot?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    },
    [reduced],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const onButton = e.target instanceof HTMLButtonElement;
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'PageDown' || (e.key === ' ' && !onButton)) {
        e.preventDefault();
        goTo(current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(current - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, goTo]);

  const onAnswer = (index: number, problem: Problem, r: { correct: boolean; response: string; timeMs: number }) => {
    if (entriesRef.current[index]?.result !== undefined) return;
    const scored = scoreSatAnswer(comboRef.current, r.correct, problem.difficulty);
    comboRef.current = scored.combo;
    setCombo(scored.combo);
    const store = getProgressStore();
    const before = levelInfo(store.getSnapshot().progress.game.points).level;
    store.update((p) =>
      applyPlayAnswer(p, { problem, ...r, points: scored.points, combo: scored.combo, now: new Date() }),
    );
    const { settings, game } = store.getSnapshot().progress;
    answerFeedback(r.correct, settings);
    if (levelInfo(game.points).level > before) levelUpFeedback(settings);
    entriesRef.current = entriesRef.current.map((e, i) =>
      i === index ? { ...e, result: { ...r, points: scored.points, multiplier: scored.multiplier } } : e,
    );
    setEntries(entriesRef.current);
  };

  const retry = (index: number) => {
    entriesRef.current = entriesRef.current.slice(0, index);
    extend(index + 1 + LOOKAHEAD);
  };

  const { game } = snapshot.progress;
  const lvl = levelInfo(game.points);

  return (
    <div className="play-overlay" role="region" aria-label="Quick Play">
      <header className="play-hud">
        <button type="button" className="play-exit" aria-label="Exit Quick Play" onClick={onExit}>
          ✕
        </button>
        <span className="play-points">{game.points} pts</span>
        <span className="play-level">Level {lvl.level}</span>
        <span className={`play-combo ${combo >= 3 ? 'is-hot' : ''}`} aria-live="polite">
          {combo > 0 ? `Combo ${combo} · ×${comboMultiplier(combo)}` : ''}
        </span>
      </header>
      <StorageBanner snapshot={snapshot} />
      <div className="play-feed" ref={scroller}>
        {entries.map((e, i) => (
          <section
            key={e.key}
            className="play-slot"
            data-index={i}
            data-current={i === current}
            aria-label={`Card ${i + 1}`}
          >
            {Math.abs(i - current) > RENDER_WINDOW ? null : e.card === null ? (
              <div className="play-card">
                <p>We couldn't load the next question.</p>
                <button type="button" className="button primary" onClick={() => retry(i)}>
                  Try again
                </button>
              </div>
            ) : e.card.kind === 'tip' ? (
              <div className="play-card play-tip">
                <h2 tabIndex={-1}>Test-day tip</h2>
                <p>{e.card.text}</p>
              </div>
            ) : (
              <SatCard
                problem={e.card.problem}
                desmosKey={desmosKey}
                result={e.result}
                reduced={reduced}
                onAnswer={(r) => e.card?.kind === 'sat' && onAnswer(i, e.card.problem, r)}
              />
            )}
          </section>
        ))}
      </div>
      <nav className="play-arrows" aria-label="Move between cards">
        <button type="button" aria-label="Previous card" disabled={current === 0} onClick={() => goTo(current - 1)}>
          ↑
        </button>
        <button type="button" aria-label="Next card" onClick={() => goTo(current + 1)}>
          ↓
        </button>
      </nav>
    </div>
  );
}

/** Quick Play: the start screen, then the endless feed (spec §2.1). */
export default function PlayApp({ desmosKey }: { desmosKey: string | null }) {
  const snapshot = useProgress();
  const [playing, setPlaying] = useState(
    () => new URLSearchParams(window.location.search).get('go') === '1',
  );
  if (playing) return <Feed desmosKey={desmosKey} onExit={() => setPlaying(false)} />;

  const { game, settings } = snapshot.progress;
  const streak = currentStreak(game.answerDays, new Date());
  const lvl = levelInfo(game.points);
  return (
    <div className="play-start">
      <StorageBanner snapshot={snapshot} />
      <p className="play-streak">
        <span aria-hidden="true">🔥</span> {streak}-day streak
        <span className="hint"> · best {Math.max(game.bestStreak, streak)}</span>
      </p>
      <div className="play-level-card">
        <p>
          <strong>Level {lvl.level}</strong> · {game.points} points
        </p>
        <div
          className="meter"
          role="progressbar"
          aria-label={`Progress to level ${lvl.level + 1}`}
          aria-valuemin={0}
          aria-valuemax={lvl.needed}
          aria-valuenow={lvl.into}
        >
          <span style={{ width: `${(100 * lvl.into) / lvl.needed}%` }} />
        </div>
        <p className="hint">{lvl.needed - lvl.into} points to level {lvl.level + 1}</p>
      </div>
      <button type="button" className="button primary play-start-button" onClick={() => setPlaying(true)}>
        ▶ Play
      </button>
      <label className="inline-option">
        <input
          type="checkbox"
          checked={settings.sound}
          onChange={(e) => getProgressStore().update((p) => updateSettings(p, { sound: e.target.checked }))}
        />
        Sound
      </label>
      <p className="hint">
        Answer 5 questions a day to keep your streak. Close any time: every answer saves as you go.
      </p>
    </div>
  );
}
```

`src/styles/play.css`:

```css
/* Quick Play. Uses the site tokens from global.css; the visual design pass (spec §10) restyles this file. */
.play-start {
  display: grid;
  gap: 1rem;
  max-width: 28rem;
}
.play-streak {
  font-size: 1.25rem;
  font-weight: 700;
}
.play-level-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.meter {
  height: 0.6rem;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.meter span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.play-start-button {
  min-height: 3.5rem;
  font-size: 1.25rem;
}

.play-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  display: grid;
  grid-template-rows: auto auto 1fr;
}
.play-hud {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: calc(0.5rem + env(safe-area-inset-top, 0px)) 1rem 0.5rem;
  border-bottom: 1px solid var(--border);
  font-weight: 700;
}
.play-exit {
  min-width: 3rem;
  min-height: 3rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.play-combo {
  margin-left: auto;
  color: var(--muted);
}
.play-combo.is-hot {
  color: var(--accent);
}
.play-feed {
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  overscroll-behavior: contain;
}
.play-slot {
  height: 100%;
  min-height: 100%;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  display: grid;
  place-items: center;
  padding: 1rem 1rem calc(5.5rem + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
}
.play-card {
  position: relative;
  width: 100%;
  max-width: 40rem;
  display: grid;
  gap: 1rem;
}
.play-stem {
  font-size: 1.15rem;
}
.play-choices {
  display: grid;
  gap: 0.6rem;
}
.play-choice {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.5rem;
  width: 100%;
  padding: 0.6rem 0.9rem;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 1.05rem;
  text-align: left;
  cursor: pointer;
}
.play-choice.is-correct {
  border-color: var(--good);
  background: var(--good-soft);
}
.play-choice.is-wrong {
  border-color: var(--bad);
  background: var(--bad-soft);
}
.play-choice:disabled {
  cursor: default;
}
.play-tools {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.play-sheet {
  display: grid;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.play-tip h2 {
  font-size: 1.1rem;
}
.play-arrows {
  position: fixed;
  right: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 51;
  display: grid;
  gap: 0.5rem;
}
.play-arrows button {
  width: 3rem;
  height: 3rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 1.25rem;
  cursor: pointer;
}
.play-arrows button:disabled {
  opacity: 0.4;
}

@media (prefers-reduced-motion: no-preference) {
  .play-card.is-wrong {
    animation: play-shake 0.35s ease-in-out;
  }
  .play-burst {
    position: absolute;
    inset: -1rem;
    border-radius: var(--radius);
    pointer-events: none;
    box-shadow: 0 0 0 0 var(--good);
    animation: play-burst 0.6s ease-out forwards;
  }
}
@keyframes play-shake {
  25% {
    transform: translateX(-6px);
  }
  75% {
    transform: translateX(6px);
  }
}
@keyframes play-burst {
  to {
    box-shadow: 0 0 0 1.25rem transparent;
  }
}
```

`src/pages/play/index.astro`:

```astro
---
import PlayApp from '../../components/play/PlayApp';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { desmosApiKey } from '../../site.config';
import '../../styles/play.css';
---

<BaseLayout
  title="Quick Play"
  description="Quick SAT Math questions you can answer in spare minutes, with combos, levels and a daily streak."
>
  <h1>Quick Play</h1>
  <PlayApp client:only="react" desmosKey={desmosApiKey()} />
  <noscript>
    <p class="notice">Quick Play needs JavaScript turned on.</p>
  </noscript>
</BaseLayout>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including the 3 `sat-card.test.tsx` tests.

Run: `npm run test:e2e`
Expected: PASS, 64 tests (52 + 6 new × 2 projects).

Run: `BASE_PATH=/free-sat-math npm run build && npm run check:bundle`
Expected: `play/index.html` is listed, and it ends `All pages within 170 KB.`

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/components/play src/styles/play.css src/pages/play tests/unit/sat-card.test.tsx tests/e2e/play.spec.ts
git commit -m "feat(play): Quick Play start screen and swipe feed"
```

---

### Task 7: The floating Play button and home entry

**Files:**
- Modify: `src/layouts/BaseLayout.astro`, `src/styles/global.css`, `src/pages/index.astro`
- Test: `tests/e2e/play.spec.ts`

**Interfaces:**
- Consumes: the `/play/?go=1` route (Task 6).
- Produces: the `.play-fab` link, shown on every page except `/play/`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/play.spec.ts`:

```ts
test('the floating Play button jumps straight into a question', async ({ page }) => {
  await page.goto('/skills/');
  await page.getByRole('link', { name: 'Quick Play' }).click();
  await expect(page).toHaveURL(/\/play\/\?go=1$/);
  await expect(current(page).locator('[id^="stem-g:"]')).toBeVisible();
});

test('the floating Play button is not shown on the Quick Play page', async ({ page }) => {
  await page.goto('/play/');
  await expect(page.locator('.play-fab')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:e2e`
Expected: FAIL in the two new tests, because there is no "Quick Play" link on `/skills/`.

- [ ] **Step 3: Implement**

In `src/layouts/BaseLayout.astro`, compute in the frontmatter:

```ts
const onPlay = here.startsWith(url('/play/'));
```

and add just before `</body>`:

```astro
    {
      !onPlay && (
        <a class="play-fab" href={url('/play/?go=1')} aria-label="Quick Play">
          <span aria-hidden="true">⚡</span> Play
        </a>
      )
    }
```

In `src/styles/global.css`, append:

```css
.play-fab {
  position: fixed;
  right: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 3rem;
  padding: 0 1.1rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
}
.play-fab:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.site-footer {
  padding-bottom: 5rem;
}
```

(The extra footer padding keeps the button from covering the footer links on short pages.)

In `src/pages/index.astro`, next to the "Start practicing" button:

```astro
  <p class="button-row">
    <a class="button primary" href={url('/practice/?skill=mix&level=auto')}>
      Start practicing
    </a>
    <a class="button" href={url('/play/')}>▶ Quick Play</a>
  </p>
```

(This replaces the existing `<p>` that wraps "Start practicing".)

- [ ] **Step 4: Run everything the way CI does**

Run: `npm run verify`
Expected, in order:
- Prettier is clean;
- all unit tests pass;
- the soak test passes (15);
- `astro check` reports 0 errors;
- the build completes;
- `All pages within 170 KB.`;
- `All site links start with /free-sat-math/`;
- 68 browser tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro src/styles/global.css src/pages/index.astro tests/e2e/play.spec.ts
git commit -m "feat(site): floating Quick Play button and home entry"
```

Hand-off: report the branch state, and the Mental Math plan is next. Pushing to `main` deploys Quick Play, and that needs the owner's go-ahead.
