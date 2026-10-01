# Mental Math Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six Mental Math drills, the on-screen number pad, the Mental Math Gym (`/train/`, 60-second sprints) and ⚡ Lightning rounds inside Quick Play. Before that, make room in the JavaScript budget and close the budget checker's blind spot for lazily loaded code.

**Architecture:**
- **Drills (`src/engine/mental/`):** each drill is a seeded, answer-first generator with an independent `verify()` that re-derives the answer from the prompt text. Prompts are plain text with Unicode superscripts and the √ and − signs, so mental math never needs KaTeX.
- **Gym:** its own light island at `/train/`.
- **Lightning:** a new card kind in the Quick Play feed.
- **Budget:** saved progress is validated by a small hand-written validator instead of zod (about 7 KB less on every interactive page). `check-bundle` now also counts the lazy chunks a page loads at startup.

**Tech Stack:** Astro 7.3.5, React 19.3, TypeScript 6.0.3 (strictest), Vitest 5 (`unit` and `soak`), Playwright 1.63 (including `page.clock`).

**Spec:** `docs/superpowers/specs/2026-09-29-quick-play-and-training-design.md`, sections §2.1 (Lightning cards), §2.2 (Gym), §3.1–§3.3 (Lightning and Gym points), §3.5 (feed composition) and §4 (Mental Math). It builds on `docs/superpowers/specs/2026-09-24-free-sat-math-design.md`.

**Decisions this plan makes. The owner reviews them with the plan:**
1. **zod goes.** Phase 1 §5 chose `zod/mini` for a small bundle. A hand-written validator is smaller still: zod plus the schemas measure 8.3 KB gzipped, against roughly 1.5 KB for the replacement. That 7 KB is what lets Lightning and the number pad fit on the Quick Play path, and it gives the practice page room again (169.2 → ~162 KB).
2. **The budget counts what loads at startup.**
   - A page's budget covers the scripts its HTML loads, plus the lazy chunks it imports as soon as it starts (listed in `STARTUP_LAZY`; today only Quick Play's feed).
   - Chunks loaded later on a tap, like the solution sheet or Desmos, are reported but not budgeted.
   - This closes the gap the Quick Play review found (`/play/?go=1` loaded 171.3 KB without failing the check).
3. **No KaTeX in mental math.** Prompts like `2⁵ · 2³`, `√196` and `3/8 as a percent` read well as plain text, and keeping KaTeX off `/train/` keeps the Gym very light.
4. **Repeating decimals are a 4-way choice of decimals.** Example: "2/3 as a decimal" offers 0.6666…, 0.6, 0.66 and 1.5. Spec §4.1 says "repeating shown as fraction choice"; §4.2 only requires that a repeating value is never typed, and this reads more naturally.
5. **The pad's submit key says "Check" (SAT cards) or "Enter" (drills) instead of ✓.** A word is clearer for screen readers and first-time players. It keeps the spec's 56 px key size.
6. **The test hook is `?lightning=first`**, not `?seed=` (spec §7). It forces a Lightning card directly, so the test doesn't depend on a seed's gap. It is honored only in builds made with `PUBLIC_TEST_HOOKS=1`.
7. **No new mockup round for the Lightning card** (spec §6 asks for mockups before UI tasks). It reuses the Quick Play card styles the owner has already seen live. The visual design pass (Mobbin/TypeUI) restyles all of it later.

## Global Constraints

- TypeScript strictest config. No `any`. `npm run lint` and `npx astro check` are clean.
- **Saved-progress validation is hand-written in `src/store/validate.ts`. No runtime validation library ships** (decision 1).
- **Startup JS ≤ 170 KB gzipped on every page** (`npm run check:bundle`, decision 2). Lesson, formula, about and 404 pages ship no JS files.
- Every internal link goes through `url()` (`npm run check:links`).
- **Every drill is answer-first:**
  - `verify()` re-derives the answer from the prompt and never calls `generate()`;
  - each drill × tier passes 5,000 soak seeds;
  - golden files guard output, and bumping a drill's `version` updates its golden file.
- Saved progress never loses data. New data uses the schema v2 fields that already exist (`game`, `mental`); no schema bump.
- Respect `prefers-reduced-motion`. Number-pad keys and answer buttons are ≥ 56 px. Every timer respects **extended time** (`timeMultiplier`) and **untimed** (spec §4.4).
- All text is original. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A typed answer in an equivalent form.** `0.75` vs `3/4` are both right unless the prompt asks for a decimal or a fraction. A wrong form gets a hint, not a wrong mark. *Task 3:* `mental-check.test.ts`, "asks for the requested form instead of marking it wrong".
2. **Two number pads mounted at once** (feed look-ahead). Only the card on screen receives keyboard typing. *Task 5:* `numpad.test.tsx`, "an inactive pad ignores the keyboard".
3. **The Gym clock runs out mid-answer, or the tab is hidden.** The sprint ends at 60 s of wall-clock time, and answers after the end are not counted. *Task 6:* `train.spec.ts`, "the sprint ends after 60 seconds and keeps the personal best".
4. **Untimed and extended-time settings.** Lightning shows no clock when untimed and gives 15 or 20 s with extended time. *Task 7:* `game.test.ts`, "Lightning time follows extended time and untimed".
5. **A drill can't produce a question** (e.g. a future bug). Lightning is skipped and the feed carries on with SAT questions. *Task 7:* `feed.test.ts`, "skips a Lightning round it can't build".

---

### Task 1: Replace zod with a hand-written validator

**Files:**
- Create: `src/store/validate.ts`, `tests/unit/validate.test.ts`
- Modify: `src/store/schema.ts` (types only), `src/store/migrate.ts`, `src/engine/mental/ids.ts`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces:
  - `parseProgress(data: unknown): Progress` and `parseProgressV1(data: unknown): ProgressV1`. Both throw `Invalid` (whose `path` is dotted, like `attempts.0.timeMs`).
  - `tryParse(parse, data)`.
  - `Tier` and `TIERS` in `src/engine/mental/ids.ts`.
  - The `Progress` and `ProgressV1` types keep exactly the same shape as before.

- [ ] **Step 1: Write the failing test**

`tests/unit/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyProgress } from '../../src/store/progress';
import { Invalid, parseProgress, parseProgressV1, tryParse } from '../../src/store/validate';

const valid = () => JSON.parse(JSON.stringify(emptyProgress()));
const attempt = {
  problemId: 'g:alg.systems.solve-system@1:easy:mcq:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  correct: true,
  response: 'A',
  timeMs: 900,
  at: '2026-10-01T00:00:00.000Z',
  mode: 'play',
};
const failsAt = (data: unknown) => {
  const r = tryParse(parseProgress, data);
  return r.ok ? null : r.path;
};

describe('parseProgress', () => {
  it('accepts an empty record and a full one', () => {
    expect(parseProgress(valid())).toEqual(emptyProgress());
    const full = valid();
    full.attempts = [{ ...attempt, guessed: true }];
    full.bookmarks = ['x'];
    full.skillState = { 'alg.systems': { level: 'hard', streak: -1 } };
    full.settings.targetScore = 650;
    full.game.answerDays = { '2026-10-01': 5 };
    full.mental = {
      tier: { 'mm.percent': 3 },
      best: { 'mm.percent': 14 },
      sessions: [{ drill: 'mm.percent', at: '2026-10-01T00:00:00.000Z', correct: 14, attempted: 16, medianMs: 2300 }],
    };
    expect(parseProgress(full)).toEqual(full);
  });
  it('drops keys it does not know, like zod did', () => {
    const data = { ...valid(), extra: 1, settings: { ...valid().settings, junk: true } };
    expect(parseProgress(data)).toEqual(emptyProgress());
  });
  it('reports where a record is wrong', () => {
    const at = (patch: (d: ReturnType<typeof valid>) => void) => {
      const d = valid();
      patch(d);
      return failsAt(d);
    };
    expect(at((d) => (d.schemaVersion = 1))).toBe('schemaVersion');
    expect(at((d) => (d.attempts = [{ ...attempt, timeMs: -1 }]))).toBe('attempts.0.timeMs');
    expect(at((d) => (d.attempts = [{ ...attempt, mode: 'quiz' }]))).toBe('attempts.0.mode');
    expect(at((d) => (d.attempts = [{ ...attempt, guessed: 'yes' }]))).toBe('attempts.0.guessed');
    expect(at((d) => (d.skillState = { 'not.a.skill': { level: 'easy', streak: 0 } }))).toBe(
      'skillState.not.a.skill',
    );
    expect(at((d) => (d.settings.targetScore = 150))).toBe('settings.targetScore');
    expect(at((d) => (d.settings.timeMultiplier = 3))).toBe('settings.timeMultiplier');
    expect(at((d) => (d.game.answerDays = { yesterday: 3 }))).toBe('game.answerDays.yesterday');
    expect(at((d) => (d.mental.tier = { 'mm.percent': 4 }))).toBe('mental.tier.mm.percent');
    expect(at((d) => (d.completedFixedTests = [5]))).toBe('completedFixedTests.0');
    expect(failsAt('nope')).toBe('');
  });
});

describe('parseProgressV1', () => {
  it('accepts a v1 record and rejects v2-only fields being required', () => {
    const v1 = {
      schemaVersion: 1,
      settings: { targetScore: null, timeMultiplier: 1, untimed: false },
      attempts: [{ ...attempt, mode: 'practice' }],
      bookmarks: [],
      skillState: {},
      testAttempts: [],
      completedFixedTests: [],
    };
    expect(parseProgressV1(v1).attempts).toHaveLength(1);
    expect(() => parseProgressV1({ ...v1, attempts: [{ ...attempt, mode: 'play' }] })).toThrow(Invalid);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/validate.test.ts`
Expected: FAIL. It can't resolve `../../src/store/validate`.

- [ ] **Step 3: Implement**

Append to `src/engine/mental/ids.ts`:

```ts
/** Drill difficulty tiers (spec §4.1). */
export type Tier = 1 | 2 | 3;
export const TIERS: readonly Tier[] = [1, 2, 3];
```

`src/store/schema.ts` (full replacement; types only):

```ts
/** Saved-progress types. Validation is hand-written in validate.ts (no runtime library). */
import type { DrillId, Tier } from '../engine/mental/ids';
import type { Difficulty } from '../engine/problem';
import type { SkillId } from '../engine/skills';

export const PROGRESS_SCHEMA_VERSION = 2;

interface AttemptFields {
  problemId: string;
  skill: SkillId;
  difficulty: Difficulty;
  correct: boolean;
  /** "A"-"D" for multiple choice, the typed text for typed answers. */
  response: string;
  timeMs: number;
  /** ISO timestamp. */
  at: string;
}
export interface AttemptV1 extends AttemptFields {
  mode: 'practice' | 'test';
}
export interface Attempt extends AttemptFields {
  mode: 'practice' | 'test' | 'play';
  /** Quick Play's "Guessed?" chip (spec §5.3). Absent means "sure". */
  guessed?: boolean;
}
export interface SkillState {
  level: Difficulty;
  /** Positive: correct answers in a row. Negative: wrong answers in a row. */
  streak: number;
}
export interface SettingsV1 {
  targetScore: number | null;
  timeMultiplier: 1 | 1.5 | 2;
  untimed: boolean;
}
export interface Settings extends SettingsV1 {
  sound: boolean;
  haptics: boolean;
}
export interface Game {
  points: number;
  bestCombo: number;
  /** Answers per local calendar day, 'YYYY-MM-DD' → count (spec §3.4). */
  answerDays: Record<string, number>;
  bestStreak: number;
  tipIndex: number;
}
export interface MentalSession {
  drill: DrillId;
  at: string;
  correct: number;
  attempted: number;
  medianMs: number;
}
export interface Mental {
  tier: Partial<Record<DrillId, Tier>>;
  best: Partial<Record<DrillId, number>>;
  sessions: MentalSession[];
}
interface SharedFields {
  bookmarks: string[];
  skillState: Partial<Record<SkillId, SkillState>>;
  /** Practice-test results. Their shape is defined in Phase 5; always empty until then. */
  testAttempts: unknown[];
  completedFixedTests: number[];
}
export interface ProgressV1 extends SharedFields {
  schemaVersion: 1;
  settings: SettingsV1;
  attempts: AttemptV1[];
}
export interface Progress extends SharedFields {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  settings: Settings;
  attempts: Attempt[];
  game: Game;
  mental: Mental;
}
```

`src/store/validate.ts`:

```ts
/**
 * Hand-written validation for saved progress (replaces zod/mini: ~7 KB less JS on every page).
 * Builds a fresh object from known keys only, so unknown keys are dropped.
 */
import { DRILL_IDS, TIERS } from '../engine/mental/ids';
import { DIFFICULTIES } from '../engine/problem';
import { SKILL_IDS } from '../engine/skills';
import {
  PROGRESS_SCHEMA_VERSION,
  type Attempt,
  type AttemptV1,
  type Game,
  type Mental,
  type MentalSession,
  type Progress,
  type ProgressV1,
  type Settings,
  type SettingsV1,
  type SkillState,
} from './schema';

/** A value failed validation. `path` is dotted, e.g. "attempts.0.timeMs"; "" means the top. */
export class Invalid extends Error {
  constructor(readonly path: string) {
    super(`Invalid saved progress at ${path === '' ? '(top)' : path}`);
  }
}

type Check<T> = (v: unknown, path: string) => T;
const at = (path: string, key: string | number): string =>
  path === '' ? String(key) : `${path}.${key}`;
const fail = (path: string): never => {
  throw new Invalid(path);
};

const str: Check<string> = (v, p) => (typeof v === 'string' ? v : fail(p));
const nonEmpty: Check<string> = (v, p) => (str(v, p) !== '' ? (v as string) : fail(p));
const bool: Check<boolean> = (v, p) => (typeof v === 'boolean' ? v : fail(p));
const int: Check<number> = (v, p) =>
  typeof v === 'number' && Number.isInteger(v) ? v : fail(p);
const count: Check<number> = (v, p) => (int(v, p) >= 0 ? (v as number) : fail(p));
const oneOf =
  <T extends string | number>(values: readonly T[]): Check<T> =>
  (v, p) =>
    values.includes(v as T) ? (v as T) : fail(p);
const arrayOf =
  <T>(item: Check<T>): Check<T[]> =>
  (v, p) =>
    Array.isArray(v) ? v.map((x, i) => item(x, at(p, i))) : fail(p);
function fields(v: unknown, p: string): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail(p);
}
const recordOf =
  <K extends string, T>(key: Check<K>, value: Check<T>): Check<Partial<Record<K, T>>> =>
  (v, p) => {
    const out: Partial<Record<K, T>> = {};
    for (const [k, x] of Object.entries(fields(v, p))) out[key(k, at(p, k))] = value(x, at(p, k));
    return out;
  };

const difficulty = oneOf(DIFFICULTIES);
const skillId = oneOf(SKILL_IDS);
const drillId = oneOf(DRILL_IDS);
const tier = oneOf(TIERS);
const dayKey: Check<string> = (v, p) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v, p)) ? (v as string) : fail(p));

function attemptFields(o: Record<string, unknown>, p: string) {
  return {
    problemId: nonEmpty(o['problemId'], at(p, 'problemId')),
    skill: skillId(o['skill'], at(p, 'skill')),
    difficulty: difficulty(o['difficulty'], at(p, 'difficulty')),
    correct: bool(o['correct'], at(p, 'correct')),
    response: str(o['response'], at(p, 'response')),
    timeMs: count(o['timeMs'], at(p, 'timeMs')),
    at: nonEmpty(o['at'], at(p, 'at')),
  };
}
const attemptV1: Check<AttemptV1> = (v, p) => {
  const o = fields(v, p);
  return { ...attemptFields(o, p), mode: oneOf(['practice', 'test'] as const)(o['mode'], at(p, 'mode')) };
};
const attempt: Check<Attempt> = (v, p) => {
  const o = fields(v, p);
  const a: Attempt = {
    ...attemptFields(o, p),
    mode: oneOf(['practice', 'test', 'play'] as const)(o['mode'], at(p, 'mode')),
  };
  if (o['guessed'] !== undefined) a.guessed = bool(o['guessed'], at(p, 'guessed'));
  return a;
};
const skillState: Check<SkillState> = (v, p) => {
  const o = fields(v, p);
  return { level: difficulty(o['level'], at(p, 'level')), streak: int(o['streak'], at(p, 'streak')) };
};
const targetScore: Check<number | null> = (v, p) =>
  v === null ? null : int(v, p) >= 200 && (v as number) <= 800 ? (v as number) : fail(p);
const settingsV1: Check<SettingsV1> = (v, p) => {
  const o = fields(v, p);
  return {
    targetScore: targetScore(o['targetScore'], at(p, 'targetScore')),
    timeMultiplier: oneOf([1, 1.5, 2] as const)(o['timeMultiplier'], at(p, 'timeMultiplier')),
    untimed: bool(o['untimed'], at(p, 'untimed')),
  };
};
const settings: Check<Settings> = (v, p) => {
  const o = fields(v, p);
  return {
    ...settingsV1(v, p),
    sound: bool(o['sound'], at(p, 'sound')),
    haptics: bool(o['haptics'], at(p, 'haptics')),
  };
};
const game: Check<Game> = (v, p) => {
  const o = fields(v, p);
  return {
    points: count(o['points'], at(p, 'points')),
    bestCombo: count(o['bestCombo'], at(p, 'bestCombo')),
    answerDays: recordOf(dayKey, count)(o['answerDays'], at(p, 'answerDays')) as Record<string, number>,
    bestStreak: count(o['bestStreak'], at(p, 'bestStreak')),
    tipIndex: count(o['tipIndex'], at(p, 'tipIndex')),
  };
};
const session: Check<MentalSession> = (v, p) => {
  const o = fields(v, p);
  return {
    drill: drillId(o['drill'], at(p, 'drill')),
    at: nonEmpty(o['at'], at(p, 'at')),
    correct: count(o['correct'], at(p, 'correct')),
    attempted: count(o['attempted'], at(p, 'attempted')),
    medianMs: count(o['medianMs'], at(p, 'medianMs')),
  };
};
const mental: Check<Mental> = (v, p) => {
  const o = fields(v, p);
  return {
    tier: recordOf(drillId, tier)(o['tier'], at(p, 'tier')),
    best: recordOf(drillId, count)(o['best'], at(p, 'best')),
    sessions: arrayOf(session)(o['sessions'], at(p, 'sessions')),
  };
};
const fixedTest: Check<number> = (v, p) => (int(v, p) >= 1 && (v as number) <= 4 ? (v as number) : fail(p));
function shared(o: Record<string, unknown>) {
  return {
    bookmarks: arrayOf(nonEmpty)(o['bookmarks'], 'bookmarks'),
    skillState: recordOf(skillId, skillState)(o['skillState'], 'skillState'),
    testAttempts: Array.isArray(o['testAttempts']) ? (o['testAttempts'] as unknown[]) : fail('testAttempts'),
    completedFixedTests: arrayOf(fixedTest)(o['completedFixedTests'], 'completedFixedTests'),
  };
}

export function parseProgress(data: unknown): Progress {
  const o = fields(data, '');
  if (o['schemaVersion'] !== PROGRESS_SCHEMA_VERSION) fail('schemaVersion');
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: settings(o['settings'], 'settings'),
    attempts: arrayOf(attempt)(o['attempts'], 'attempts'),
    ...shared(o),
    game: game(o['game'], 'game'),
    mental: mental(o['mental'], 'mental'),
  };
}

export function parseProgressV1(data: unknown): ProgressV1 {
  const o = fields(data, '');
  if (o['schemaVersion'] !== 1) fail('schemaVersion');
  return {
    schemaVersion: 1,
    settings: settingsV1(o['settings'], 'settings'),
    attempts: arrayOf(attemptV1)(o['attempts'], 'attempts'),
    ...shared(o),
  };
}

/** Runs a parser and turns a validation failure into its path. */
export function tryParse<T>(
  parse: (data: unknown) => T,
  data: unknown,
): { ok: true; value: T } | { ok: false; path: string } {
  try {
    return { ok: true, value: parse(data) };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, path: err.path };
    throw err;
  }
}
```

In `src/store/migrate.ts`:
- Replace the `progressSchema` and `progressSchemaV1` imports with `import { parseProgress, parseProgressV1, tryParse } from './validate';`.
- Replace the body of `readProgress` after the `newer` check with:

```ts
  const current = tryParse(parseProgress, data);
  if (current.ok) return { kind: 'current', progress: current.value };
  const v1 = tryParse(parseProgressV1, data);
  if (v1.ok) return { kind: 'upgraded', progress: upgradeV1(v1.value) };
  // Report the failure for the version the data claims to be, so the reason is useful.
  return { kind: 'unreadable', where: version === 1 ? v1.path : current.path };
```

Then remove zod:

```bash
npm uninstall zod
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/validate.test.ts`
Expected: PASS, 5 tests.

Run: `npm test`
Expected: PASS (every existing test, including `migrate.test.ts` and the import tests in `progress.test.ts`).

Run: `BASE_PATH=/free-sat-math npm run build && npm run check:bundle`
Expected: `practice/index.html` and `problem/index.html` about 7 KB smaller than before (~162 KB), and `All pages within 170 KB.`

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean, `- 0 errors`.

```bash
git add src/store/validate.ts src/store/schema.ts src/store/migrate.ts src/engine/mental/ids.ts \
  tests/unit/validate.test.ts package.json package-lock.json
git commit -m "perf(store): hand-written progress validation instead of zod (-7 KB per page)"
```

---

### Task 2: Budget what a page loads at startup

**Files:**
- Modify: `scripts/check-bundle.mjs`

**Interfaces:**
- Produces: each page's `startup` total (the static scripts plus the lazy chunks listed in `STARTUP_LAZY`) is budgeted at 170 KB. The `on demand` extra is printed but not budgeted.

- [ ] **Step 1: Write the new check**

`scripts/check-bundle.mjs` (full replacement):

```js
// Fails when a page's startup JavaScript exceeds the budget (spec §5, quick-play spec §1).
// Run after `astro build`. Per page:
//   startup   = scripts the HTML loads + lazy chunks the page imports as soon as it starts
//               (STARTUP_LAZY), with everything they import statically. Budgeted.
//   on demand = every other lazily imported chunk (loaded on a tap). Reported, not budgeted.
// Lesson, formula, about and 404 pages ship no JS files at all.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 170);
const NO_JS_PAGES = [
  /^skills\/[^/]+\/index\.html$/,
  /^formulas\/index\.html$/,
  /^about\/index\.html$/,
  /^404\.html$/,
];
/** Lazy chunks (by file-name prefix) a page loads at startup, e.g. Quick Play's feed on ?go=1. */
const STARTUP_LAZY = { 'play/index.html': ['PlayFeed.'] };

const STATIC_IMPORT = /(?:from|import)\s*"\.\/([^"]+\.js)"/g;
const DYNAMIC_IMPORT = /import\(\s*"\.\/([^"]+\.js)"\s*\)/g;

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '_astro' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

/** Static import closure of `entries`, plus every dynamic import target found along the way. */
function closure(entries) {
  const files = new Set();
  const dynamic = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (files.has(file)) continue;
    files.add(file);
    const code = readFileSync(join(DIST, '_astro', file), 'utf8');
    for (const m of code.matchAll(STATIC_IMPORT)) queue.push(m[1]);
    for (const m of code.matchAll(DYNAMIC_IMPORT)) dynamic.add(m[1]);
  }
  return { files, dynamic };
}

/** Everything reachable, following dynamic imports too. */
function everything(entries) {
  const files = new Set();
  let frontier = [...entries];
  while (frontier.length > 0) {
    const { files: f, dynamic } = closure(frontier);
    f.forEach((x) => files.add(x));
    frontier = [...dynamic].filter((d) => !files.has(d));
  }
  return files;
}

const kb = (files) =>
  [...files].reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, '_astro', f))).length, 0) / 1024;

const failures = [];
for (const file of htmlFiles(DIST).sort()) {
  const page = relative(DIST, file);
  const html = readFileSync(file, 'utf8');
  const entries = [
    ...html.matchAll(/(?:src|component-url|renderer-url)="[^"]*?\/_astro\/([^"]+\.js)"/g),
  ].map((m) => m[1]);
  const base = closure(entries);
  const prefixes = STARTUP_LAZY[page] ?? [];
  const lazyAtStart = [...base.dynamic].filter((f) => prefixes.some((p) => f.startsWith(p)));
  const startup = closure([...entries, ...lazyAtStart]).files;
  const all = everything(entries);
  const startupKb = kb(startup);
  const extraKb = kb(all) - startupKb;
  console.log(
    `${page.padEnd(32)} ${startupKb.toFixed(1).padStart(6)} KB gz startup` +
      (extraKb > 0.05 ? `  (+${extraKb.toFixed(1)} KB on demand)` : ''),
  );
  if (startupKb > BUDGET_KB) failures.push(`${page}: ${startupKb.toFixed(1)} KB > ${BUDGET_KB} KB`);
  if (NO_JS_PAGES.some((re) => re.test(page)) && all.size > 0)
    failures.push(`${page}: should ship no JS files`);
}

if (failures.length > 0) {
  console.error(`\nBundle budget exceeded:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nAll pages within ${BUDGET_KB} KB at startup.`);
```

- [ ] **Step 2: Prove it counts the feed, then that it can fail**

Run: `BASE_PATH=/free-sat-math npm run build && npm run check:bundle`
Expected:
- `play/index.html` shows a startup total ~84 KB larger than before (the PlayFeed chunk and its imports, now ~164 KB);
- pages with lazy sheets show a `(+… KB on demand)` note;
- it ends with `All pages within 170 KB at startup.`

Run: `BUNDLE_BUDGET_KB=150 npm run check:bundle; echo "exit $?"`
Expected: `exit 1`, listing `play/index.html`, `practice/index.html` and `problem/index.html`.

- [ ] **Step 3: Commit**

Run: `npm run lint`
Expected: clean.

```bash
git add scripts/check-bundle.mjs
git commit -m "build: budget the lazy chunks a page loads at startup"
```

---

### Task 3: Mental Math engine and the first three drills

**Files:**
- Create:
  - `src/engine/mental/types.ts`, `src/engine/mental/expr.ts`, `src/engine/mental/build.ts`, `src/engine/mental/registry.ts`;
  - `src/engine/mental/drills/arithmetic.ts`, `src/engine/mental/drills/fdp.ts`, `src/engine/mental/drills/percent.ts`.
- Test:
  - `tests/unit/mental-expr.test.ts`, `tests/unit/mental-check.test.ts`, `tests/unit/mental-drills.test.ts`, `tests/unit/mental-golden.test.ts`;
  - `tests/soak/mental.test.ts`, `tests/golden/mental/*.json`.
- Modify: `package.json` (`golden:update` also rewrites the mental golden files)

**Interfaces:**
- Produces:
  - `Drill`, `MentalProblem`, `MentalAnswer`, `MINUS`, `signed`, `paren`, `numberBody`, `choiceBody`, `choicesOk`, `numberOk` (types.ts);
  - `evalExpr`, `sup`, `pow` (expr.ts);
  - `buildMental`, `generateMental`, `mentalFromId`, `checkMental` (build.ts);
  - `DRILLS`, `getDrill` (registry.ts).
- Problem ids look like `m:<drill>@<version>:<tier>:<seed>`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/mental-expr.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evalExpr, sup } from '../../src/engine/mental/expr';
import { r } from '../../src/engine/rational';

describe('evalExpr', () => {
  it.each([
    ['47 + 38', r(85)],
    ['7 − 3 × (−2)', r(13)],
    ['(12 − 5) × (−3)', r(-21)],
    ['144 ÷ 12', r(12)],
    ['2⁵ · 2³', r(256)],
    ['(2³)²', r(64)],
    ['4⁻¹', r(1, 4)],
    ['(1/2)⁻²', r(4)],
    ['52² − 48²', r(400)],
    ['7⁰', r(1)],
  ])('%s', (text, value) => {
    expect(evalExpr(text).eq(value)).toBe(true);
  });
  it('throws on text it cannot read', () => {
    expect(() => evalExpr('2 +')).toThrow();
    expect(() => evalExpr('x²')).toThrow();
  });
});

describe('sup', () => {
  it('writes integer exponents as superscripts', () => {
    expect(sup(10)).toBe('¹⁰');
    expect(sup(-2)).toBe('⁻²');
  });
});
```

`tests/unit/mental-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildMental, checkMental, mentalFromId } from '../../src/engine/mental/build';
import { getDrill } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';

const typed = (value: string, extra: Partial<Extract<MentalProblem['answer'], { kind: 'number' }>> = {}): MentalProblem => ({
  id: 'm:test@1:1:1',
  drill: 'mm.fdp',
  tier: 1,
  prompt: 'test',
  answer: { kind: 'number', value, ...extra },
});

describe('checkMental', () => {
  it('accepts any exact form of the value', () => {
    expect(checkMental(typed('3/4'), '0.75')).toEqual({ status: 'checked', correct: true });
    expect(checkMental(typed('3/4'), '6/8')).toEqual({ status: 'checked', correct: true });
    expect(checkMental(typed('-13'), '−13')).toEqual({ status: 'checked', correct: true });
    expect(checkMental(typed('3/4'), '.7')).toEqual({ status: 'checked', correct: false });
  });
  it('asks for the requested form instead of marking it wrong', () => {
    expect(checkMental(typed('3/4', { form: 'decimal' }), '3/4').status).toBe('invalid');
    expect(checkMental(typed('5/4', { form: 'fraction' }), '1.25').status).toBe('invalid');
    expect(checkMental(typed('5/4', { form: 'fraction' }), '10/8')).toEqual({ status: 'checked', correct: true });
  });
  it('rejects things that are not numbers', () => {
    expect(checkMental(typed('3'), '')).toMatchObject({ status: 'invalid' });
    expect(checkMental(typed('3'), '1/0')).toMatchObject({ status: 'invalid' });
    expect(checkMental(typed('3'), '--3')).toMatchObject({ status: 'invalid' });
  });
});

describe('mentalFromId', () => {
  it('rebuilds a problem from its id', () => {
    const p = buildMental(getDrill('mm.percent')!, 2, 99);
    expect(mentalFromId(p.id)).toEqual(p);
    expect(mentalFromId('m:nope@1:1:1')).toBeNull();
  });
});
```

`tests/unit/mental-drills.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildMental } from '../../src/engine/mental/build';
import { TIERS } from '../../src/engine/mental/ids';
import { DRILLS, getDrill } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';
import { Rational } from '../../src/engine/rational';

function tampered(p: MentalProblem): MentalProblem {
  if (p.answer.kind === 'choice') {
    return { ...p, answer: { ...p.answer, index: ((p.answer.index + 1) % 4) as 0 | 1 | 2 | 3 } };
  }
  return { ...p, answer: { ...p.answer, value: Rational.parse(p.answer.value).add(Rational.of(1)).toString() } };
}

describe.each(DRILLS.map((d) => [d.id, d] as const))('%s', (_id, drill) => {
  it.each(TIERS)('tier %s: verify() accepts 300 seeds and rejects a tampered answer', (tier) => {
    for (let seed = 1; seed <= 300; seed++) {
      const p = buildMental(drill, tier, seed);
      expect(drill.verify(p), p.id).toBe(true);
      expect(drill.verify(tampered(p)), `${p.id} tampered`).toBe(false);
    }
  });
});

const prompts = (id: string, tier: 1 | 2 | 3, n = 60) =>
  Array.from({ length: n }, (_, i) => buildMental(getDrill(id)!, tier, i + 1).prompt);

describe('drill content', () => {
  it('arithmetic moves from + − × to ÷ to order of operations with negatives', () => {
    expect(prompts('mm.arithmetic', 1).every((t) => /^\d+ [+−×] \d+$/.test(t))).toBe(true);
    expect(prompts('mm.arithmetic', 2).some((t) => t.includes('÷'))).toBe(true);
    expect(prompts('mm.arithmetic', 3).every((t) => t.includes('−'))).toBe(true);
  });
  it('fractions, decimals and percents ask for repeating decimals as a choice', () => {
    const t2 = Array.from({ length: 60 }, (_, i) => buildMental(getDrill('mm.fdp')!, 2, i + 1));
    expect(t2.some((p) => p.answer.kind === 'choice' && p.answer.choices.some((c) => c.endsWith('…')))).toBe(true);
    expect(prompts('mm.fdp', 3).some((t) => /% as a fraction$/.test(t))).toBe(true);
  });
  it('percents cover "of", "what percent" and increases and decreases', () => {
    expect(prompts('mm.percent', 1).every((t) => /^\d+% of \d+$/.test(t))).toBe(true);
    expect(prompts('mm.percent', 2).some((t) => t.includes('what percent'))).toBe(true);
    expect(prompts('mm.percent', 3).some((t) => t.includes('then decreased'))).toBe(true);
  });
});
```

`tests/unit/mental-golden.test.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMental } from '../../src/engine/mental/build';
import { TIERS } from '../../src/engine/mental/ids';
import { DRILLS } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';

const DIR = join(process.cwd(), 'tests', 'golden', 'mental');
const UPDATE = process.env['UPDATE_GOLDEN'] === '1';

interface GoldenFile {
  drill: string;
  version: number;
  problems: Record<string, MentalProblem>;
}

describe.each(DRILLS.map((d) => [d.id, d] as const))('golden %s', (_id, drill) => {
  it('matches its golden file', () => {
    const problems: Record<string, MentalProblem> = {};
    for (const tier of TIERS) for (let seed = 1; seed <= 5; seed++) problems[`${tier}:${seed}`] = buildMental(drill, tier, seed);
    const current: GoldenFile = JSON.parse(JSON.stringify({ drill: drill.id, version: drill.version, problems }));
    const file = join(DIR, `${drill.id}.json`);
    if (UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    if (!existsSync(file)) throw new Error(`No golden file for ${drill.id}. Run: npm run golden:update`);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
    if (saved.version !== drill.version) {
      throw new Error(`${drill.id} is version ${drill.version} but its golden file is ${saved.version}. Run: npm run golden:update`);
    }
    expect(current).toEqual(saved);
  });
});
```

`tests/soak/mental.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildMental } from '../../src/engine/mental/build';
import { TIERS } from '../../src/engine/mental/ids';
import { DRILLS } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';
import { Rational } from '../../src/engine/rational';

const SEEDS = Number(process.env['SOAK_SEEDS'] ?? 5000);

function issues(p: MentalProblem): string[] {
  const out: string[] = [];
  if (p.prompt.trim() === '' || /NaN|undefined|Infinity/.test(p.prompt)) out.push(`bad prompt "${p.prompt}"`);
  if (p.answer.kind === 'number') {
    const typed = p.answer.form === 'decimal' ? String(Rational.parse(p.answer.value).toNumber()) : p.answer.value;
    if (typed.length > 8) out.push(`answer too long to type: ${typed}`);
  } else if (new Set(p.answer.choices).size !== 4) {
    out.push(`duplicate choices ${p.answer.choices.join(' | ')}`);
  }
  return out;
}

describe.each(DRILLS.map((d) => [d.id, d] as const))('%s', (_id, drill) => {
  it.each(TIERS)(`tier %s passes on seeds 1-${SEEDS}`, (tier) => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS && failures.length < 5; seed++) {
      let p: MentalProblem;
      try {
        p = buildMental(drill, tier, seed);
      } catch (err) {
        failures.push(`seed ${seed}: generate threw ${(err as Error).message}`);
        continue;
      }
      if (!drill.verify(p)) failures.push(`seed ${seed}: verify() failed for "${p.prompt}"`);
      const found = issues(p);
      if (found.length > 0) failures.push(`seed ${seed}: ${found.join(' | ')}`);
    }
    expect(failures).toEqual([]);
  });
});
```

In `package.json`, change `golden:update` to:

```json
"golden:update": "UPDATE_GOLDEN=1 vitest run --project unit tests/unit/golden.test.ts tests/unit/mental-golden.test.ts",
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/mental-expr.test.ts tests/unit/mental-check.test.ts tests/unit/mental-drills.test.ts`
Expected: FAIL. It can't resolve `src/engine/mental/expr`, `build` and `registry`.

- [ ] **Step 3: Implement**

`src/engine/mental/types.ts`:

```ts
import { Rational } from '../rational';
import type { Rng } from '../rng';
import type { DrillId, Tier } from './ids';

/**
 * A typed answer is an exact value. `form` limits how it may be written (a wrong form gets a
 * hint, not a wrong mark); `suffix` is shown after the pad, e.g. "%".
 */
export type MentalAnswer =
  | { kind: 'number'; value: string; form?: 'decimal' | 'fraction'; suffix?: '%' }
  | { kind: 'choice'; choices: [string, string, string, string]; index: 0 | 1 | 2 | 3 };

export interface MentalBody {
  /** Plain text: Unicode superscripts, √ and the − sign. No LaTeX. */
  prompt: string;
  answer: MentalAnswer;
}

export interface MentalProblem extends MentalBody {
  id: string;
  drill: DrillId;
  tier: Tier;
}

export interface Drill {
  id: DrillId;
  /** Bump whenever the output for any seed changes. */
  version: number;
  name: string;
  blurb: string;
  generate(rng: Rng, tier: Tier): MentalBody;
  /** Independent check: re-derives the answer from the prompt text, never from generate(). */
  verify(problem: MentalProblem): boolean;
}

/** The minus sign used in prompts (U+2212), so it never reads as a hyphen. */
export const MINUS = '−';
export const signed = (n: number): string => (n < 0 ? `${MINUS}${-n}` : String(n));
/** A factor in a product: negatives in parentheses, e.g. "(−3)". */
export const paren = (n: number): string => (n < 0 ? `(${MINUS}${-n})` : String(n));

export function numberBody(
  prompt: string,
  value: Rational,
  extra: { form?: 'decimal' | 'fraction'; suffix?: '%' } = {},
): MentalBody {
  return { prompt, answer: { kind: 'number', value: value.toString(), ...extra } };
}

export function choiceBody(
  prompt: string,
  correct: string,
  distractors: readonly [string, string, string],
  rng: Rng,
): MentalBody {
  const choices = rng.shuffle([correct, ...distractors]) as [string, string, string, string];
  return { prompt, answer: { kind: 'choice', choices, index: choices.indexOf(correct) as 0 | 1 | 2 | 3 } };
}

/** verify() helper: four distinct choices with `correct` at the recorded index. */
export function choicesOk(p: MentalProblem, correct: string): boolean {
  return (
    p.answer.kind === 'choice' &&
    new Set(p.answer.choices).size === 4 &&
    p.answer.choices[p.answer.index] === correct
  );
}

/** verify() helper: a typed answer equal to `value`, written in `form`, with `suffix`. */
export function numberOk(
  p: MentalProblem,
  value: Rational,
  form?: 'decimal' | 'fraction',
  suffix?: '%',
): boolean {
  return (
    p.answer.kind === 'number' &&
    Rational.parse(p.answer.value).eq(value) &&
    p.answer.form === form &&
    p.answer.suffix === suffix
  );
}
```

`src/engine/mental/expr.ts`:

```ts
/** A tiny evaluator for mental-math prompts, used only by verify() (shares nothing with generators). */
import { Rational } from '../rational';

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};
const FROM_SUPERSCRIPT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SUPERSCRIPT).map(([k, v]) => [v, k]),
);

/** An integer exponent as superscript characters: sup(-2) → "⁻²". */
export function sup(n: number): string {
  return [...String(n)].map((c) => SUPERSCRIPT[c] as string).join('');
}

/** base^e for an integer e (negative e gives the reciprocal). */
export function pow(base: Rational, e: number): Rational {
  let out = Rational.of(1);
  for (let i = 0; i < Math.abs(e); i++) out = out.mul(base);
  return e < 0 ? Rational.of(1).div(out) : out;
}

/** Numbers, + − × ÷ · /, parentheses, unary minus and superscript integer exponents. */
export function evalExpr(text: string): Rational {
  const s = text.replace(/−/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  let i = 0;
  const fail = (): never => {
    throw new SyntaxError(`Cannot evaluate "${text}" at ${i}`);
  };
  const atom = (): Rational => {
    if (s[i] === '(') {
      i++;
      const v = expr();
      if (s[i] !== ')') fail();
      i++;
      return v;
    }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (m === null) return fail();
    i += m[0].length;
    return Rational.parse(m[0]);
  };
  const power = (): Rational => {
    const base = atom();
    let digits = '';
    while (i < s.length && FROM_SUPERSCRIPT[s[i] as string] !== undefined) {
      digits += FROM_SUPERSCRIPT[s[i] as string];
      i++;
    }
    return digits === '' ? base : pow(base, Number(digits));
  };
  const unary = (): Rational => {
    if (s[i] === '-') {
      i++;
      return unary().neg();
    }
    return power();
  };
  const term = (): Rational => {
    let v = unary();
    while (s[i] === '*' || s[i] === '/') {
      const op = s[i++];
      const t = unary();
      v = op === '*' ? v.mul(t) : v.div(t);
    }
    return v;
  };
  const expr = (): Rational => {
    let v = term();
    while (s[i] === '+' || s[i] === '-') {
      const op = s[i++];
      const t = term();
      v = op === '+' ? v.add(t) : v.sub(t);
    }
    return v;
  };
  const v = expr();
  if (i !== s.length) fail();
  return v;
}
```

(The `SUPERSCRIPT` table may be split across lines by Prettier; keep it as a literal.)

`src/engine/mental/drills/arithmetic.ts`:

```ts
import { r } from '../../rational';
import { evalExpr } from '../expr';
import { MINUS, numberBody, numberOk, paren, type Drill } from '../types';

export const arithmetic: Drill = {
  id: 'mm.arithmetic',
  version: 1,
  name: 'Speed arithmetic',
  blurb: 'Add, subtract, multiply and divide in your head.',
  generate(rng, tier) {
    if (tier === 1) {
      const op = rng.pick(['+', MINUS, '×'] as const);
      if (op === '×') {
        const a = rng.int(2, 9);
        const b = rng.int(11, 99);
        return numberBody(`${a} × ${b}`, r(a * b));
      }
      let a = rng.int(10, 99);
      let b = rng.int(10, 99);
      if (op === MINUS && b > a) [a, b] = [b, a];
      return numberBody(`${a} ${op} ${b}`, r(op === '+' ? a + b : a - b));
    }
    if (tier === 2) {
      if (rng.chance(0.5)) {
        const a = rng.int(12, 99);
        const b = rng.int(3, 9);
        return numberBody(`${a} × ${b}`, r(a * b));
      }
      const b = rng.int(3, 12);
      const q = rng.int(4, 25);
      return numberBody(`${b * q} ÷ ${b}`, r(q));
    }
    const a = rng.int(2, 20);
    const b = rng.int(2, 9);
    const c = rng.pick([-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]);
    const form = rng.int(0, 2);
    if (form === 0) return numberBody(`${a} ${MINUS} ${b} × ${paren(c)}`, r(a - b * c));
    if (form === 1) return numberBody(`(${a} ${MINUS} ${b}) × ${paren(c)}`, r((a - b) * c));
    return numberBody(`${paren(-Math.abs(c))} × ${b} + ${a}`, r(-Math.abs(c) * b + a));
  },
  verify(p) {
    return numberOk(p, evalExpr(p.prompt));
  },
};
```

(Every tier-3 prompt contains −: forms 0 and 1 write `a − b`, and form 2 always uses a negative factor.)

`src/engine/mental/drills/fdp.ts`:

```ts
import { r, Rational } from '../../rational';
import { choiceBody, choicesOk, numberBody, numberOk, type Drill } from '../types';

/** n/d by long division, truncated to `places` decimals: (2, 3, 4) → "0.6666". */
function truncated(n: number, d: number, places: number): string {
  let rem = n % d;
  let out = `${Math.floor(n / d)}.`;
  for (let k = 0; k < places; k++) {
    rem *= 10;
    out += String(Math.floor(rem / d));
    rem %= d;
  }
  return out;
}

const REPEATING = [
  [1, 3], [2, 3], [1, 6], [5, 6], [1, 9], [2, 9], [4, 9], [5, 9], [7, 9], [8, 9],
] as const;

export const fdp: Drill = {
  id: 'mm.fdp',
  version: 1,
  name: 'Fractions, decimals, percents',
  blurb: 'Switch between 3/8, 0.375 and 37.5% without a calculator.',
  generate(rng, tier) {
    if (tier === 1) {
      const d = rng.pick([2, 4, 5, 10]);
      const n = rng.int(1, d - 1);
      return rng.chance(0.5)
        ? numberBody(`${n}/${d} as a decimal`, r(n, d), { form: 'decimal' })
        : numberBody(`${n}/${d} as a percent`, r(n * 100, d), { suffix: '%' });
    }
    if (tier === 2) {
      const kind = rng.int(0, 2);
      const n = rng.pick([1, 3, 5, 7]);
      if (kind === 0) {
        return rng.chance(0.5)
          ? numberBody(`${n}/8 as a decimal`, r(n, 8), { form: 'decimal' })
          : numberBody(`${n}/8 as a percent`, r(n * 100, 8), { suffix: '%' });
      }
      if (kind === 1) return numberBody(`${n / 8} as a fraction`, r(n, 8), { form: 'fraction' });
      const [a, b] = rng.pick(REPEATING);
      const correct = `${truncated(a, b, 4)}…`;
      const reciprocal = String(Number((b / a).toFixed(4)));
      return choiceBody(`${a}/${b} as a decimal`, correct, [truncated(a, b, 1), truncated(a, b, 2), reciprocal], rng);
    }
    const kind = rng.int(0, 2);
    if (kind === 0) {
      const p = rng.pick([110, 120, 125, 150, 175, 225, 250, 350]);
      return numberBody(`${p}% as a fraction`, r(p, 100), { form: 'fraction' });
    }
    if (kind === 1) {
      const n = rng.pick([1, 3, 5, 7]);
      return numberBody(`${n}/8 as a percent`, r(n * 100, 8), { suffix: '%' });
    }
    const k = rng.int(1, 999);
    return numberBody(`${k / 1000} as a percent`, r(k, 10), { suffix: '%' });
  },
  verify(p) {
    let m = /^(\d+)\/(\d+) as a decimal$/.exec(p.prompt);
    if (m) {
      const n = Number(m[1]);
      const d = Number(m[2]);
      if (p.answer.kind === 'choice') {
        // Repeating: computed by float flooring here, by long division in generate().
        return choicesOk(p, `${(Math.floor((n / d) * 1e4) / 1e4).toFixed(4)}…`);
      }
      return numberOk(p, r(n, d), 'decimal');
    }
    m = /^(\d+)\/(\d+) as a percent$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]) * 100, Number(m[2])), undefined, '%');
    m = /^(\d+)% as a fraction$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]), 100), 'fraction');
    m = /^(\d*\.\d+) as a fraction$/.exec(p.prompt);
    if (m) return numberOk(p, Rational.parse(m[1] as string), 'fraction');
    m = /^(\d*\.\d+) as a percent$/.exec(p.prompt);
    if (m) return numberOk(p, Rational.parse(m[1] as string).mul(r(100)), undefined, '%');
    return false;
  },
};
```

`src/engine/mental/drills/percent.ts`:

```ts
import { r } from '../../rational';
import { numberBody, numberOk, type Drill } from '../types';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export const percent: Drill = {
  id: 'mm.percent',
  version: 1,
  name: 'Percents',
  blurb: 'Percent of a number, what percent, and increases and decreases.',
  generate(rng, tier) {
    if (tier === 1) {
      const p = rng.pick([10, 20, 25, 50]);
      const result = rng.int(2, 40);
      return numberBody(`${p}% of ${(result * 100) / p}`, r(result));
    }
    if (tier === 2) {
      if (rng.chance(0.5)) {
        const p = rng.pick([5, 15, 30, 35, 40, 60, 75]);
        const unit = 100 / gcd(p, 100);
        const n = unit * rng.int(1, Math.max(1, Math.floor(400 / unit)));
        return numberBody(`${p}% of ${n}`, r((p * n) / 100));
      }
      const b = 20 * rng.int(1, 10);
      const pct = rng.pick([5, 10, 20, 25, 40, 50, 60, 75, 80]);
      return numberBody(`${(b * pct) / 100} is what percent of ${b}?`, r(pct), { suffix: '%' });
    }
    if (rng.chance(0.6)) {
      const base = 20 * rng.int(1, 20);
      const pct = rng.pick([10, 15, 20, 25, 30, 40, 50]);
      const up = rng.chance(0.5);
      return numberBody(
        `${base} ${up ? 'increased' : 'decreased'} by ${pct}%`,
        r(base * (100 + (up ? pct : -pct)), 100),
      );
    }
    const base = rng.pick([100, 200]);
    const p1 = rng.pick([10, 20, 50]);
    const p2 = rng.pick([10, 20, 50]);
    return numberBody(
      `${base} increased by ${p1}%, then decreased by ${p2}%`,
      r(base * (100 + p1) * (100 - p2), 10000),
    );
  },
  verify(p) {
    let m = /^(\d+)% of (\d+)$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]) * Number(m[2]), 100));
    m = /^(\d+) is what percent of (\d+)\?$/.exec(p.prompt);
    if (m) return numberOk(p, r(Number(m[1]) * 100, Number(m[2])), undefined, '%');
    m = /^(\d+) increased by (\d+)%, then decreased by (\d+)%$/.exec(p.prompt);
    if (m) {
      const v = r(Number(m[1])).mul(r(100 + Number(m[2]), 100)).mul(r(100 - Number(m[3]), 100));
      return numberOk(p, v);
    }
    m = /^(\d+) (increased|decreased) by (\d+)%$/.exec(p.prompt);
    if (m) {
      const sign = m[2] === 'increased' ? 1 : -1;
      return numberOk(p, r(Number(m[1])).mul(r(100 + sign * Number(m[3]), 100)));
    }
    return false;
  },
};
```

`src/engine/mental/registry.ts`:

```ts
import { arithmetic } from './drills/arithmetic';
import { fdp } from './drills/fdp';
import { percent } from './drills/percent';
import type { Drill } from './types';

/** Every Mental Math drill (spec §4.1). Add new drills here. */
export const DRILLS: readonly Drill[] = [arithmetic, fdp, percent];

export const getDrill = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
```

`src/engine/mental/build.ts`:

```ts
import type { Grade } from '../answer';
import { Rational } from '../rational';
import { MAX_SEED, createRng, type Rng } from '../rng';
import type { Tier } from './ids';
import { getDrill } from './registry';
import type { Drill, MentalProblem } from './types';

export function buildMental(drill: Drill, tier: Tier, seed: number): MentalProblem {
  const body = drill.generate(createRng(seed), tier);
  return { ...body, id: `m:${drill.id}@${drill.version}:${tier}:${seed}`, drill: drill.id, tier };
}

/** A fresh problem that passed verify(), or null after 10 failed seeds. */
export function generateMental(drill: Drill, tier: Tier, rng: Rng): MentalProblem | null {
  for (let i = 0; i < 10; i++) {
    const seed = rng.int(0, MAX_SEED);
    try {
      const p = buildMental(drill, tier, seed);
      if (drill.verify(p)) return p;
    } catch {
      // try another seed
    }
  }
  return null;
}

const ID = /^m:([a-z.]+)@(\d+):([123]):(\d+)$/;

/** Rebuilds a problem from its id (current drill version, same seed). */
export function mentalFromId(id: string): MentalProblem | null {
  const m = ID.exec(id);
  if (m === null) return null;
  const drill = getDrill(m[1] as string);
  return drill === undefined ? null : buildMental(drill, Number(m[3]) as Tier, Number(m[4]));
}

const NUMBER_SHAPE = /^-?(?:\d+\/\d+|\d+(?:\.\d*)?|\.\d+)$/;
const NOT_A_NUMBER = 'Enter a number, like 12, 3.5 or 7/2';

/** Grades a typed answer: any exact form is right unless the problem asks for a form. */
export function checkMental(p: MentalProblem, input: string): Grade {
  if (p.answer.kind !== 'number') throw new Error('checkMental is for typed answers');
  const t = input.trim().replace(/−/g, '-');
  if (!NUMBER_SHAPE.test(t)) return { status: 'invalid', reason: NOT_A_NUMBER };
  if (p.answer.form === 'decimal' && t.includes('/'))
    return { status: 'invalid', reason: 'Give a decimal, like 0.75' };
  if (p.answer.form === 'fraction' && !t.includes('/'))
    return { status: 'invalid', reason: 'Give a fraction, like 3/4' };
  let v: Rational;
  try {
    v = Rational.parse(t);
  } catch {
    return { status: 'invalid', reason: NOT_A_NUMBER };
  }
  return { status: 'checked', correct: v.eq(Rational.parse(p.answer.value)) };
}
```

Then generate the golden files:

```bash
npm run golden:update
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all unit tests, including the 3 golden tests for the new drills).

Run: `npm run test:soak`
Expected: PASS, 15 SAT soak tests plus 9 mental soak tests (3 drills × 3 tiers).

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/engine/mental tests/unit/mental-*.test.ts tests/soak/mental.test.ts tests/golden/mental package.json
git commit -m "feat(mental): drill engine with arithmetic, fraction/decimal/percent and percent drills"
```

---

### Task 4: Squares, exponents and shortcuts drills

**Files:**
- Create: `src/engine/mental/drills/squares.ts`, `src/engine/mental/drills/exponents.ts`, `src/engine/mental/drills/shortcuts.ts`
- Modify: `src/engine/mental/registry.ts`, `tests/unit/mental-drills.test.ts`, `tests/golden/mental/*.json`

**Interfaces:**
- Consumes: Task 3's `types.ts`, `expr.ts` and `registry.ts`.
- Produces: `DRILLS` holds all six drills, in spec order.

- [ ] **Step 1: Write the failing test**

Append to the `drill content` block in `tests/unit/mental-drills.test.ts`:

```ts
  it('lists all six drills in spec order', async () => {
    const { DRILL_IDS } = await import('../../src/engine/mental/ids');
    expect(DRILLS.map((d) => d.id)).toEqual([...DRILL_IDS]);
  });
  it('squares and roots end with simplifying radicals as a choice', () => {
    expect(prompts('mm.squares', 1).every((t) => /^(\d+²|√\d+)$/.test(t))).toBe(true);
    expect(prompts('mm.squares', 3).every((t) => /^Simplify √\d+$/.test(t))).toBe(true);
  });
  it('exponents reach zero and negative powers', () => {
    expect(prompts('mm.exponents', 3).some((t) => t.includes('⁻'))).toBe(true);
    expect(prompts('mm.exponents', 3).some((t) => t.endsWith('⁰'))).toBe(true);
  });
  it('shortcuts cover slope, factoring and estimation', () => {
    expect(prompts('mm.shortcuts', 1).every((t) => t.startsWith('Slope through'))).toBe(true);
    expect(prompts('mm.shortcuts', 2).every((t) => t.startsWith('Factor x²'))).toBe(true);
    expect(prompts('mm.shortcuts', 3).some((t) => t.startsWith('Which is closest'))).toBe(true);
    expect(prompts('mm.shortcuts', 3).some((t) => t.includes('² −'))).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/mental-drills.test.ts`
Expected: FAIL. `getDrill('mm.squares')` is undefined, and the drill list has only 3 entries.

- [ ] **Step 3: Implement**

`src/engine/mental/drills/squares.ts`:

```ts
import { r } from '../../rational';
import { evalExpr } from '../expr';
import { choiceBody, choicesOk, numberBody, numberOk, type Drill } from '../types';

export const squares: Drill = {
  id: 'mm.squares',
  version: 1,
  name: 'Squares and roots',
  blurb: 'Perfect squares, cubes and simplifying square roots.',
  generate(rng, tier) {
    if (tier === 1) {
      const n = rng.int(2, 15);
      return rng.chance(0.5) ? numberBody(`${n}²`, r(n * n)) : numberBody(`√${n * n}`, r(n));
    }
    if (tier === 2) {
      if (rng.chance(0.6)) {
        const n = rng.int(16, 25);
        return numberBody(`${n}²`, r(n * n));
      }
      const n = rng.int(2, 5);
      return numberBody(`${n}³`, r(n * n * n));
    }
    const a = rng.int(2, 6);
    const b = rng.pick([2, 3, 5, 6, 7]);
    const swapped = a === b ? `${a + 3}√${b}` : `${b}√${a}`;
    return choiceBody(`Simplify √${a * a * b}`, `${a}√${b}`, [`${a + 1}√${b}`, `${a * a}√${b}`, swapped], rng);
  },
  verify(p) {
    let m = /^√(\d+)$/.exec(p.prompt);
    if (m) {
      const n = Number(m[1]);
      const root = Math.round(Math.sqrt(n));
      return root * root === n && numberOk(p, r(root));
    }
    m = /^Simplify √(\d+)$/.exec(p.prompt);
    if (m) {
      const n = Number(m[1]);
      let k = Math.floor(Math.sqrt(n));
      while (n % (k * k) !== 0) k--;
      return k > 1 && choicesOk(p, `${k}√${n / (k * k)}`);
    }
    return numberOk(p, evalExpr(p.prompt));
  },
};
```

`src/engine/mental/drills/exponents.ts`:

```ts
import { r } from '../../rational';
import { evalExpr, sup } from '../expr';
import { numberBody, numberOk, type Drill } from '../types';

export const exponents: Drill = {
  id: 'mm.exponents',
  version: 1,
  name: 'Exponents',
  blurb: 'Powers, exponent rules, and zero and negative exponents.',
  generate(rng, tier) {
    if (tier === 1) {
      const [b, max] = rng.pick([[2, 10], [3, 6], [5, 4], [10, 5]] as const);
      const e = rng.int(2, max);
      return numberBody(`${b}${sup(e)}`, r(b ** e));
    }
    if (tier === 2) {
      const b = rng.pick([2, 3]);
      const cap = b === 2 ? 10 : 6;
      const form = rng.int(0, 2);
      if (form === 0) {
        const m = rng.int(1, cap - 1);
        const n = rng.int(1, cap - m);
        return numberBody(`${b}${sup(m)} · ${b}${sup(n)}`, r(b ** (m + n)));
      }
      if (form === 1) {
        const n = rng.int(1, cap - 1);
        const m = n + rng.int(1, cap);
        return numberBody(`${b}${sup(m)} ÷ ${b}${sup(n)}`, r(b ** (m - n)));
      }
      const m = rng.int(1, b === 2 ? 5 : 3);
      const n = rng.int(2, Math.floor(cap / m));
      return numberBody(`(${b}${sup(m)})${sup(n)}`, r(b ** (m * n)));
    }
    const form = rng.int(0, 2);
    if (form === 0) return numberBody(`${rng.int(2, 12)}${sup(0)}`, r(1));
    const n = rng.int(1, 2);
    if (form === 1) {
      const b = rng.pick([2, 3, 4, 5, 10]);
      return numberBody(`${b}${sup(-n)}`, r(1, b ** n));
    }
    const b = rng.pick([2, 3, 4, 5]);
    return numberBody(`(1/${b})${sup(-n)}`, r(b ** n));
  },
  verify(p) {
    return numberOk(p, evalExpr(p.prompt));
  },
};
```

`src/engine/mental/drills/shortcuts.ts`:

```ts
import { r } from '../../rational';
import { evalExpr } from '../expr';
import { MINUS, choiceBody, choicesOk, numberBody, numberOk, signed, type Drill } from '../types';

const NONZERO = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** "+ 3" or "− 3". */
const term = (n: number) => (n < 0 ? `${MINUS} ${-n}` : `+ ${n}`);
/** "(x + a)(x − b)" with the two factors in numeric order. */
const factors = (a: number, b: number) => {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return `(x ${term(lo)})(x ${term(hi)})`;
};
const xTerm = (b: number) => (b === 1 ? '+ x' : b === -1 ? `${MINUS} x` : `${term(b)}x`);
const num = (s: string) => Number(s.replace(MINUS, '-'));

export const shortcuts: Drill = {
  id: 'mm.shortcuts',
  version: 1,
  name: 'SAT shortcuts',
  blurb: 'Slope, quick factoring, estimating and the difference of squares.',
  generate(rng, tier) {
    if (tier === 1) {
      const den = rng.pick([1, 1, 2]);
      const top = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]);
      const x1 = rng.int(-5, 5);
      const y1 = rng.int(-5, 5);
      const dx = den * rng.pick([1, 2, -1]);
      const x2 = x1 + dx;
      const y2 = y1 + (top * dx) / den;
      return numberBody(
        `Slope through (${signed(x1)}, ${signed(y1)}) and (${signed(x2)}, ${signed(y2)})`,
        r(top, den),
      );
    }
    if (tier === 2) {
      const p = rng.pick(NONZERO);
      let q = rng.pick(NONZERO);
      while (q === p || q === -p) q = rng.pick(NONZERO);
      return choiceBody(
        `Factor x² ${xTerm(p + q)} ${term(p * q)}`,
        factors(p, q),
        [factors(-p, -q), factors(p, -q), factors(-p, q)],
        rng,
      );
    }
    if (rng.chance(0.5)) {
      const a = rng.int(30, 99);
      const d = rng.int(1, 9);
      return numberBody(`${a + d}² ${MINUS} ${a - d}²`, r(4 * a * d));
    }
    const x = rng.int(11, 99);
    const y = rng.int(11, 99);
    const near = Math.max(100, Math.round((x * y) / 100) * 100);
    const below = near > 300 ? near - 300 : near + 900;
    return choiceBody(
      `Which is closest to ${x} × ${y}?`,
      String(near),
      [String(near + 300), String(near + 600), String(below)],
      rng,
    );
  },
  verify(p) {
    let m = /^Slope through \((−?\d+), (−?\d+)\) and \((−?\d+), (−?\d+)\)$/.exec(p.prompt);
    if (m) {
      const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map((s) => num(s as string));
      return x2 !== x1 && numberOk(p, r((y2 as number) - (y1 as number), (x2 as number) - (x1 as number)));
    }
    m = /^Factor x² ([+−]) (\d*)x ([+−]) (\d+)$/.exec(p.prompt);
    if (m && p.answer.kind === 'choice') {
      const b = (m[1] === '+' ? 1 : -1) * (m[2] === '' ? 1 : Number(m[2]));
      const c = (m[3] === '+' ? 1 : -1) * Number(m[4]);
      const expands = (choice: string) => {
        const f = /^\(x ([+−]) (\d+)\)\(x ([+−]) (\d+)\)$/.exec(choice);
        if (f === null) return false;
        const a1 = (f[1] === '+' ? 1 : -1) * Number(f[2]);
        const a2 = (f[3] === '+' ? 1 : -1) * Number(f[4]);
        return a1 + a2 === b && a1 * a2 === c;
      };
      const right = p.answer.choices.filter(expands);
      return right.length === 1 && choicesOk(p, right[0] as string);
    }
    m = /^Which is closest to (\d+) × (\d+)\?$/.exec(p.prompt);
    if (m && p.answer.kind === 'choice') {
      const product = Number(m[1]) * Number(m[2]);
      const gaps = p.answer.choices.map((c) => Math.abs(Number(c) - product));
      const best = Math.min(...gaps);
      return gaps.filter((g) => g === best).length === 1 && choicesOk(p, p.answer.choices[gaps.indexOf(best)] as string);
    }
    return numberOk(p, evalExpr(p.prompt));
  },
};
```

In `src/engine/mental/registry.ts`, import the three drills and set:

```ts
export const DRILLS: readonly Drill[] = [arithmetic, fdp, percent, squares, exponents, shortcuts];
```

Then: `npm run golden:update`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run test:soak`
Expected: PASS, 15 SAT soak tests plus 18 mental soak tests.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/engine/mental tests/unit/mental-drills.test.ts tests/golden/mental
git commit -m "feat(mental): squares, exponents and SAT shortcuts drills"
```

---

### Task 5: The on-screen number pad

**Files:**
- Create: `src/components/NumPad.tsx`, `tests/unit/numpad.test.tsx`
- Modify: `src/components/play/SatCard.tsx` (typed answers use the pad), `src/styles/play.css`, `tests/unit/sat-card.test.tsx`, `tests/e2e/play.spec.ts`

**Interfaces:**
- Produces: `padInput(current, key, maxLength): string`, and `NumPad` with the props `{ id, label, value, onChange, onSubmit, submitLabel?, suffix?, maxLength?, active?, locked? }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/numpad.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import NumPad, { padInput } from '../../src/components/NumPad';

describe('padInput', () => {
  it('builds numbers, fractions and negatives one key at a time', () => {
    const type = (keys: string[], max = 8) => keys.reduce((v, k) => padInput(v, k, max), '');
    expect(type(['7', '/', '2'])).toBe('7/2');
    expect(type(['3', '.', '5', '.'])).toBe('3.5');
    expect(type(['/'])).toBe('');
    expect(type(['4', '.', '/'])).toBe('4.');
    expect(type(['5', '−'])).toBe('-5');
    expect(type(['5', '−', '−'])).toBe('5');
    expect(type(['1', '2', '⌫'])).toBe('1');
    expect(type(['1', '2', '3', '4'], 3)).toBe('123');
  });
});

function Harness({ onSubmit = () => {}, active = true }: { onSubmit?: () => void; active?: boolean }) {
  const [v, setV] = useState('');
  return <NumPad id="pad" label="Your answer" value={v} onChange={setV} onSubmit={onSubmit} active={active} />;
}

describe('NumPad', () => {
  it('types with taps and submits with ✓', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    for (const k of ['1', '2', '/', '5']) await userEvent.click(screen.getByRole('button', { name: k }));
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('12/5');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('accepts the physical keyboard while active', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    for (const key of ['-', '4', '.', '5', 'Backspace', '2']) fireEvent.keyDown(window, { key });
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('−4.2');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('an inactive pad ignores the keyboard', () => {
    render(<Harness active={false} />);
    fireEvent.keyDown(window, { key: '7' });
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('');
  });
});
```

Append to `tests/unit/sat-card.test.tsx` (a typed question answered on the pad; this is the path whose Check button once did nothing):

```tsx
const spr: Problem = {
  ...mcq,
  id: 'g:test@1:easy:spr:1',
  format: 'spr',
  choices: undefined,
  answer: { kind: 'values', values: ['12'] },
};
delete (spr as Partial<Problem>).choices;

it('answers a typed question with the number pad', async () => {
  const onAnswer = vi.fn();
  render(<SatCard problem={spr} desmosKey={null} result={undefined} reduced onAnswer={onAnswer} />);
  await userEvent.click(screen.getByRole('button', { name: '1' }));
  await userEvent.click(screen.getByRole('button', { name: '2' }));
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true, response: '12' }));
});
```

(Put the `it` inside the existing `describe('SatCard')`. If `exactOptionalPropertyTypes` rejects `choices: undefined`, build `spr` without the key: `const { choices: _c, ...rest } = mcq;` then spread `rest`.)

In `tests/e2e/play.spec.ts`, change the typed-answer branch of `answerCurrent` to type on the pad with the keyboard:

```ts
  } else {
    const right = answerValue(problem)!;
    await page.keyboard.type(correct ? right : right === '1' ? '2' : '1');
    await current(page).getByRole('button', { name: 'Check' }).click();
  }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/numpad.test.tsx`
Expected: FAIL. It can't resolve `../../src/components/NumPad`.

- [ ] **Step 3: Implement**

`src/components/NumPad.tsx`:

```tsx
import { useEffect } from 'react';

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '.', '/', '⌫'] as const;
const KEYBOARD: Readonly<Record<string, string>> = { '-': '−', Backspace: '⌫', '.': '.', '/': '/' };

/** Applies one pad key. Keeps one "." or one "/", a leading minus only, and the length cap. */
export function padInput(current: string, key: string, maxLength: number): string {
  if (key === '⌫') return current.slice(0, -1);
  if (key === '−') return current.startsWith('-') ? current.slice(1) : `-${current}`;
  const body = current.replace('-', '');
  if (key === '.' && (body.includes('.') || body.includes('/'))) return current;
  if (key === '/' && (body === '' || body.includes('/') || body.includes('.') || body.endsWith('.')))
    return current;
  if (!/^[0-9./]$/.test(key)) return current;
  return current.length >= maxLength ? current : current + key;
}

interface Props {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  submitLabel?: string;
  /** Shown after the value, e.g. "%". */
  suffix?: string;
  maxLength?: number;
  /** Only the pad on screen listens to the keyboard (feed cards are pre-rendered). */
  active?: boolean;
  locked?: boolean;
}

/** Big on-screen keys, so the phone keyboard never covers the question (spec §4.3). */
export default function NumPad({
  id,
  label,
  value,
  onChange,
  onSubmit,
  submitLabel = 'Check',
  suffix = '',
  maxLength = 8,
  active = true,
  locked = false,
}: Props) {
  useEffect(() => {
    if (!active || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
        return;
      }
      const key = /^[0-9]$/.test(e.key) ? e.key : KEYBOARD[e.key];
      if (key === undefined) return;
      e.preventDefault();
      onChange(padInput(value, key, maxLength));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, locked, value, onChange, onSubmit, maxLength]);

  return (
    <div className="numpad">
      <output id={id} className="numpad-display" aria-label={label} aria-live="polite">
        {value.replace('-', '−')}
        {value !== '' && suffix}
      </output>
      <div className="numpad-keys" role="group" aria-label="Number pad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="numpad-key"
            disabled={locked}
            aria-label={k === '⌫' ? 'Delete' : k === '−' ? 'Minus' : k}
            onClick={() => onChange(padInput(value, k, maxLength))}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          className="numpad-key numpad-submit"
          disabled={locked || value === ''}
          onClick={onSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
```

The number key buttons use `aria-label={k}`, so `getByRole('button', { name: '1' })` and `{ name: '/' }` find them in the unit test.

In `src/components/play/SatCard.tsx`, replace the typed-answer block, from `<div className="play-typed">` through its closing `</div>`, with:

```tsx
        <NumPad
          id={`answer-${problem.id}`}
          label="Your answer"
          value={typed}
          onChange={(v) => setTyped(sanitizeSprTyping(v))}
          onSubmit={() => {
            if (problem.answer.kind === 'choice' || typed.trim() === '') return;
            const g = checkSpr(problem.answer, typed);
            if (g.status === 'invalid') setInvalid(g.reason);
            else submit(g.correct, typed.trim());
          }}
          maxLength={6}
          active={active && result === undefined}
          locked={result !== undefined}
        />
```

Update the imports: `import { checkSpr, sanitizeSprTyping } from '../../engine/answer';` and `import NumPad from '../NumPad';`, and remove `import AnswerInput from '../AnswerInput';`.

Append to `src/styles/play.css`:

```css
.numpad {
  display: grid;
  gap: 0.6rem;
  max-width: 22rem;
}
.numpad-display {
  min-height: 3.25rem;
  padding: 0.6rem 0.9rem;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
}
.numpad-keys {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}
.numpad-key {
  min-height: 3.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 1.35rem;
  cursor: pointer;
}
.numpad-submit {
  grid-column: span 2;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
}
.numpad-key:disabled {
  opacity: 0.45;
  cursor: default;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including the 4 `numpad.test.tsx` tests and the new SatCard pad test.

Run: `npm run test:e2e`
Expected: PASS, 68 tests. The typed SAT questions in `play.spec.ts` now go through the pad.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/components/NumPad.tsx src/components/play/SatCard.tsx src/styles/play.css \
  tests/unit/numpad.test.tsx tests/unit/sat-card.test.tsx tests/e2e/play.spec.ts
git commit -m "feat(play): on-screen number pad for typed answers"
```

---

### Task 6: The Mental Math Gym

**Files:**
- Create: `src/engine/mental/sprint.ts`, `src/store/mental.ts`, `src/components/gym/GymApp.tsx`, `src/styles/gym.css`, `src/pages/train/index.astro`
- Modify: `src/engine/game.ts` (Gym points), `src/layouts/BaseLayout.astro` (Train link), `src/styles/play.css` (drill styles shared with Lightning)
- Test: `tests/unit/sprint.test.ts`, `tests/unit/mental-store.test.ts`, `tests/e2e/train.spec.ts`

**Interfaces:**
- Consumes: `DRILLS`, `generateMental`, `checkMental` (Tasks 3–4), `NumPad` (Task 5), and `addAnswerDay` / `currentStreak` (`game.ts`).
- Produces:
  - `GYM_POINTS_PER_CORRECT = 2`;
  - `SPRINT_MS = 60_000`, `startSprint`, `recordSprintAnswer`, `sprintSummary`;
  - `applyGymSession(progress, { drill, summary, now })`;
  - the island `GymApp` with `client:only="react"`. Its prompt element carries `data-mental-id`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/sprint.test.ts`:

```ts
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
    for (const [ok, ms] of [[true, 1000], [false, 9000], [true, 3000], [true, 2000]] as const) s = recordSprintAnswer(s, ok, ms);
    expect(sprintSummary(s)).toEqual({ correct: 3, attempted: 4, medianMs: 2000, endTier: 3 });
    expect(sprintSummary(startSprint('mm.percent', 1)).medianMs).toBe(0);
  });
});
```

`tests/unit/mental-store.test.ts`:

```ts
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
```

`tests/e2e/train.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { mentalFromId } from '../../src/engine/mental/build';

async function answerRight(page: Page, nowCorrect: number) {
  const prompt = page.locator('[data-mental-id]');
  await expect(prompt).toBeVisible();
  const p = mentalFromId((await prompt.getAttribute('data-mental-id'))!)!;
  if (p.answer.kind === 'choice') {
    await page.getByRole('button', { name: p.answer.choices[p.answer.index] as string, exact: true }).click();
  } else {
    const value = p.answer.value;
    const text = p.answer.form === 'decimal' ? String(Number(value.split('/')[0]) / Number(value.split('/')[1] ?? 1)) : value;
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.gym-bar').getByText(`${nowCorrect} correct`, { exact: true })).toBeVisible();
}

test('the sprint ends after 60 seconds and keeps the personal best', async ({ page }) => {
  await page.clock.install();
  await page.goto('/train/');
  await page.getByRole('button', { name: /Speed arithmetic/ }).click();
  for (let i = 1; i <= 3; i++) await answerRight(page, i);
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('heading', { name: '3 correct' })).toBeVisible();
  await expect(page.getByText('New personal best!')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fsm.progress.v1')!));
  expect(saved.mental.best['mm.arithmetic']).toBe(3);
  expect(saved.game.points).toBe(6);

  await page.getByRole('button', { name: 'Go again' }).click();
  await answerRight(page, 1);
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('heading', { name: '1 correct' })).toBeVisible();
  await expect(page.getByText('Personal best: 3')).toBeVisible();
});

test('the Gym fits a 360px screen and is in the main menu', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Train' }).click();
  await expect(page.getByRole('heading', { name: 'Mental Math Gym', level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/sprint.test.ts tests/unit/mental-store.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Implement**

Append to `src/engine/game.ts`:

```ts
/** Gym sprints: points per correct answer, no combo (spec §3.3). */
export const GYM_POINTS_PER_CORRECT = 2;
```

`src/engine/mental/sprint.ts`:

```ts
/** The Gym's 60-second sprint: pure state, tier adaptation and the summary (spec §2.2, §4.4). */
import type { DrillId, Tier } from './ids';

export const SPRINT_MS = 60_000;
export const UP_AFTER = 3;
export const DOWN_AFTER = 2;

export interface SprintState {
  drill: DrillId;
  tier: Tier;
  /** Positive: right in a row. Negative: wrong in a row. */
  run: number;
  answers: { correct: boolean; ms: number }[];
}

export function startSprint(drill: DrillId, tier: Tier): SprintState {
  return { drill, tier, run: 0, answers: [] };
}

export function recordSprintAnswer(s: SprintState, correct: boolean, ms: number): SprintState {
  const answers = [...s.answers, { correct, ms }];
  if (correct) {
    const run = s.run > 0 ? s.run + 1 : 1;
    if (run >= UP_AFTER) return { ...s, answers, run: 0, tier: Math.min(3, s.tier + 1) as Tier };
    return { ...s, answers, run };
  }
  const run = s.run < 0 ? s.run - 1 : -1;
  if (-run >= DOWN_AFTER) return { ...s, answers, run: 0, tier: Math.max(1, s.tier - 1) as Tier };
  return { ...s, answers, run };
}

export interface SprintSummary {
  correct: number;
  attempted: number;
  /** Median time of correct answers, 0 when none. */
  medianMs: number;
  endTier: Tier;
}

export function sprintSummary(s: SprintState): SprintSummary {
  const times = s.answers.filter((a) => a.correct).map((a) => a.ms).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianMs =
    times.length === 0 ? 0 : times.length % 2 === 1 ? (times[mid] as number) : Math.round(((times[mid - 1] as number) + (times[mid] as number)) / 2);
  return {
    correct: s.answers.filter((a) => a.correct).length,
    attempted: s.answers.length,
    medianMs,
    endTier: s.tier,
  };
}
```

`src/store/mental.ts`:

```ts
/** Records a finished Gym sprint (spec §2.2, §3.3, §3.4). */
import { GYM_POINTS_PER_CORRECT, addAnswerDay, currentStreak } from '../engine/game';
import type { DrillId } from '../engine/mental/ids';
import type { SprintSummary } from '../engine/mental/sprint';
import type { Progress } from './schema';

export const MAX_SESSIONS = 200;

export function applyGymSession(
  progress: Progress,
  s: { drill: DrillId; summary: SprintSummary; now: Date },
): Progress {
  const { correct, attempted, medianMs, endTier } = s.summary;
  let answerDays = progress.game.answerDays;
  for (let i = 0; i < attempted; i++) answerDays = addAnswerDay(answerDays, s.now);
  const sessions = [
    ...progress.mental.sessions,
    { drill: s.drill, at: s.now.toISOString(), correct, attempted, medianMs },
  ].slice(-MAX_SESSIONS);
  return {
    ...progress,
    mental: {
      tier: { ...progress.mental.tier, [s.drill]: endTier },
      best: { ...progress.mental.best, [s.drill]: Math.max(progress.mental.best[s.drill] ?? 0, correct) },
      sessions,
    },
    game: {
      ...progress.game,
      points: progress.game.points + GYM_POINTS_PER_CORRECT * correct,
      answerDays,
      bestStreak: Math.max(progress.game.bestStreak, currentStreak(answerDays, s.now)),
    },
  };
}
```

`src/components/gym/GymApp.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkMental, generateMental } from '../../engine/mental/build';
import type { DrillId } from '../../engine/mental/ids';
import { DRILLS, getDrill } from '../../engine/mental/registry';
import {
  SPRINT_MS,
  recordSprintAnswer,
  sprintSummary,
  startSprint,
  type SprintState,
  type SprintSummary,
} from '../../engine/mental/sprint';
import type { MentalProblem } from '../../engine/mental/types';
import { createRng, randomSeed } from '../../engine/rng';
import { applyGymSession } from '../../store/mental';
import { getProgressStore, useProgress } from '../../store/progress-store';
import NumPad from '../NumPad';
import StorageBanner from '../StorageBanner';

type View =
  | { kind: 'pick' }
  | { kind: 'sprint'; drill: DrillId; run: number }
  | { kind: 'done'; drill: DrillId; summary: SprintSummary; previousBest: number };

/** Median seconds per correct answer over the last 20 sessions, as a small line chart. */
function Trend({ drill }: { drill: DrillId }) {
  const { progress } = useProgress();
  const points = progress.mental.sessions.filter((s) => s.drill === drill && s.medianMs > 0).slice(-20);
  if (points.length < 2) return <p className="hint">Do a few sprints to see your speed trend.</p>;
  const secs = points.map((s) => s.medianMs / 1000);
  const max = Math.max(...secs);
  const min = Math.min(...secs);
  const span = max - min || 1;
  const path = secs
    .map((v, i) => `${(i / (secs.length - 1)) * 280 + 10},${70 - ((v - min) / span) * 60}`)
    .join(' ');
  return (
    <figure className="gym-trend">
      <svg viewBox="0 0 300 80" role="img" aria-label={`Seconds per correct answer, last ${secs.length} sprints: from ${secs[0]?.toFixed(1)} to ${secs.at(-1)?.toFixed(1)}`}>
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <figcaption className="hint">
        Seconds per correct answer, last {secs.length} sprints (lower is faster)
      </figcaption>
    </figure>
  );
}

function Sprint({ drill, onDone }: { drill: DrillId; onDone(s: SprintSummary): void }) {
  const store = getProgressStore();
  const rng = useMemo(() => createRng(randomSeed()), []);
  const startTier = store.getSnapshot().progress.mental.tier[drill] ?? 1;
  const state = useRef<SprintState>(startSprint(drill, startTier));
  const endsAt = useRef(Date.now() + SPRINT_MS);
  const shownAt = useRef(performance.now());
  const finished = useRef(false);
  const [problem, setProblem] = useState<MentalProblem | null>(() => generateMental(getDrill(drill)!, startTier, rng));
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState('');
  const [flash, setFlash] = useState<'' | '✓' | '✗'>('');
  const [left, setLeft] = useState(SPRINT_MS);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone(sprintSummary(state.current));
  }, [onDone]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const ms = endsAt.current - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) finish();
    }, 200);
    return () => window.clearInterval(id);
  }, [finish]);

  const answer = (correct: boolean) => {
    if (finished.current || Date.now() >= endsAt.current) return finish();
    state.current = recordSprintAnswer(state.current, correct, Math.round(performance.now() - shownAt.current));
    setFlash(correct ? '✓' : '✗');
    setTyped('');
    setHint('');
    setProblem(generateMental(getDrill(drill)!, state.current.tier, rng));
    shownAt.current = performance.now();
  };

  if (problem === null) return <p className="notice">We couldn't create a question just now.</p>;
  const right = state.current.answers.filter((a) => a.correct).length;
  return (
    <div className="gym-sprint">
      <div className="gym-bar">
        <span className="gym-clock">{Math.ceil(left / 1000)}s</span>
        <span>{right} correct</span>
        <span role="status" aria-live="polite" className={`gym-flash ${flash === '✓' ? 'is-right' : flash === '✗' ? 'is-wrong' : ''}`}>
          {flash}
        </span>
      </div>
      <p className="gym-prompt" data-mental-id={problem.id}>
        {problem.prompt}
      </p>
      {problem.answer.kind === 'choice' ? (
        <div className="play-choices" role="group" aria-label="Answer choices">
          {problem.answer.choices.map((c, i) => (
            <button key={c} type="button" className="play-choice" onClick={() => answer(problem.answer.kind === 'choice' && i === problem.answer.index)}>
              {c}
            </button>
          ))}
        </div>
      ) : (
        <>
          <NumPad
            id="gym-answer"
            label="Your answer"
            value={typed}
            onChange={setTyped}
            onSubmit={() => {
              if (typed === '') return;
              const g = checkMental(problem, typed);
              if (g.status === 'invalid') setHint(g.reason);
              else answer(g.correct);
            }}
            submitLabel="Enter"
            suffix={problem.answer.suffix ?? ''}
          />
          {hint !== '' && <p className="feedback-invalid">{hint}</p>}
        </>
      )}
    </div>
  );
}

/** The Mental Math Gym: pick a drill, sprint for 60 seconds, see your best (spec §2.2). */
export default function GymApp() {
  const snapshot = useProgress();
  const [view, setView] = useState<View>({ kind: 'pick' });
  const { mental } = snapshot.progress;

  if (view.kind === 'sprint') {
    return (
      <Sprint
        key={view.run}
        drill={view.drill}
        onDone={(summary) => {
          const previousBest = getProgressStore().getSnapshot().progress.mental.best[view.drill] ?? 0;
          getProgressStore().update((p) => applyGymSession(p, { drill: view.drill, summary, now: new Date() }));
          setView({ kind: 'done', drill: view.drill, summary, previousBest });
        }}
      />
    );
  }
  if (view.kind === 'done') {
    const { summary, previousBest } = view;
    const accuracy = summary.attempted === 0 ? 0 : Math.round((100 * summary.correct) / summary.attempted);
    return (
      <div className="gym-done">
        <StorageBanner snapshot={snapshot} />
        <h2>{summary.correct} correct</h2>
        <p>
          {summary.attempted} answered · {accuracy}% accurate
        </p>
        <p className="gym-best">
          {summary.correct > previousBest ? 'New personal best!' : `Personal best: ${previousBest}`}
        </p>
        <Trend drill={view.drill} />
        <div className="button-row">
          <button type="button" className="button primary" onClick={() => setView({ kind: 'sprint', drill: view.drill, run: Date.now() })}>
            Go again
          </button>
          <button type="button" className="button" onClick={() => setView({ kind: 'pick' })}>
            Pick a drill
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="gym-pick">
      <StorageBanner snapshot={snapshot} />
      <p className="lead">Pick a drill. You get 60 seconds: answer as many as you can.</p>
      <div className="gym-grid">
        {DRILLS.map((d) => (
          <button key={d.id} type="button" className="gym-drill" onClick={() => setView({ kind: 'sprint', drill: d.id, run: Date.now() })}>
            <strong>{d.name}</strong>
            <span>{d.blurb}</span>
            <span className="hint">
              Best {mental.best[d.id] ?? 0} · Level {mental.tier[d.id] ?? 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

`src/styles/gym.css`:

```css
.gym-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
  gap: 0.75rem;
}
.gym-drill {
  display: grid;
  gap: 0.35rem;
  min-height: 7rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.gym-drill strong {
  font-size: 1.1rem;
}
.gym-sprint,
.gym-done {
  display: grid;
  gap: 1rem;
  max-width: 28rem;
}
.gym-best {
  font-weight: 700;
}
.gym-trend svg {
  width: 100%;
  max-width: 300px;
  height: auto;
  color: var(--accent);
}
```

Append to `src/styles/play.css` (shared with Task 7's Lightning cards, so they live in the Quick Play stylesheet that `/train/` also loads):

```css
.gym-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-weight: 700;
}
.gym-clock {
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
}
.gym-flash.is-right {
  color: var(--good);
}
.gym-flash.is-wrong {
  color: var(--bad);
}
.gym-prompt {
  font-size: 2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
```

`src/pages/train/index.astro`:

```astro
---
import GymApp from '../../components/gym/GymApp';
import BaseLayout from '../../layouts/BaseLayout.astro';
import '../../styles/play.css';
import '../../styles/gym.css';
---

<BaseLayout
  title="Mental Math Gym"
  description="60-second mental math sprints: arithmetic, percents, fractions, exponents, roots and SAT shortcuts."
>
  <h1>Mental Math Gym</h1>
  <GymApp client:only="react" />
  <noscript>
    <p class="notice">The Gym needs JavaScript turned on.</p>
  </noscript>
</BaseLayout>
```

In `src/layouts/BaseLayout.astro`, add `['/train/', 'Train'],` to the `nav` list after `['/review/', 'Review'],`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including `sprint.test.ts` (3) and `mental-store.test.ts` (2).

Run: `npm run test:e2e`
Expected: PASS, 72 tests (68 + 2 × 2).

Run: `BASE_PATH=/free-sat-math npm run build && npm run check:bundle`
Expected: `train/index.html` startup well under 170 KB (no KaTeX, about 85–95 KB), and `All pages within 170 KB at startup.`

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/engine/game.ts src/engine/mental/sprint.ts src/store/mental.ts src/components/gym \
  src/styles/gym.css src/styles/play.css src/pages/train src/layouts/BaseLayout.astro \
  tests/unit/sprint.test.ts tests/unit/mental-store.test.ts tests/e2e/train.spec.ts
git commit -m "feat(gym): Mental Math Gym with 60-second sprints"
```

---

### Task 7: ⚡ Lightning rounds in Quick Play

**Files:**
- Create: `src/components/play/LightningCard.tsx`
- Modify: `src/engine/game.ts`, `src/engine/feed.ts`, `src/store/play.ts`, `src/components/play/PlayFeed.tsx`, `src/env.d.ts`, `playwright.config.ts`, `src/styles/play.css`
- Test: `tests/unit/game.test.ts`, `tests/unit/feed.test.ts`, `tests/unit/play-store.test.ts`, `tests/e2e/play.spec.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:
  - `LIGHTNING_POINTS = 5`, `LIGHTNING_PERFECT_BONUS = 25`, `LIGHTNING_PERFECT_COMBO = 2`, `LIGHTNING_SECONDS = 10`;
  - `scoreLightningAnswer(combo, correct)`, `lightningSeconds(settings)`;
  - the `Card` kind `'lightning'` and `newFeedState(tipIndex, lightningFirst?)`;
  - `applyLightningAnswer(progress, { answered, points, combo, now })` and `addBonusPoints(progress, points)`;
  - the test hook `?lightning=first`, honored only when `PUBLIC_TEST_HOOKS=1` at build time.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/game.test.ts` (and add `lightningSeconds, scoreLightningAnswer, LIGHTNING_POINTS` to its import):

```ts
describe('Lightning', () => {
  it('scores 5 per right answer times the combo multiplier', () => {
    expect(scoreLightningAnswer(0, true)).toEqual({ combo: 1, points: LIGHTNING_POINTS, multiplier: 1 });
    expect(scoreLightningAnswer(5, true)).toEqual({ combo: 6, points: 15, multiplier: 3 });
    expect(scoreLightningAnswer(4, false)).toEqual({ combo: 0, points: 0, multiplier: 1 });
  });
  it('Lightning time follows extended time and untimed', () => {
    expect(lightningSeconds({ timeMultiplier: 1, untimed: false })).toBe(10);
    expect(lightningSeconds({ timeMultiplier: 1.5, untimed: false })).toBe(15);
    expect(lightningSeconds({ timeMultiplier: 2, untimed: false })).toBe(20);
    expect(lightningSeconds({ timeMultiplier: 2, untimed: true })).toBeNull();
  });
});
```

In `tests/unit/feed.test.ts`, replace the tip test (cards now include Lightning rounds, so positions are counted in questions) and add Lightning tests:

```ts
  it('inserts a tip after every TIP_EVERY questions, rotating through the list', () => {
    const cards = run(7, 90);
    const tips = cards.flatMap((c, i) => (c?.kind === 'tip' ? [i] : []));
    const questionsBefore = (i: number) => cards.slice(0, i).filter((c) => c?.kind === 'sat').length;
    expect(tips.length).toBeGreaterThanOrEqual(2);
    expect(questionsBefore(tips[0] as number)).toBe(TIP_EVERY);
    expect(cards[tips[0] as number]).toMatchObject({ text: TIPS[0] });
    expect(cards[tips[1] as number]).toMatchObject({ text: TIPS[1] });
  });
  it('inserts a Lightning round of 3 verified mental-math questions every 8 to 12 questions', async () => {
    const { getDrill } = await import('../../src/engine/mental/registry');
    const cards = run(5, 120);
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
    const r = nextCard(emptyProgress(), newFeedState(0, true), createRng(3));
    expect(r.card?.kind).toBe('lightning');
  });
```

Add a new block at the end of the file (its own `describe`, so it shares no mocks with `when nothing can be generated`):

```ts
describe('Lightning fallback', () => {
  it('skips a Lightning round it can’t build', async () => {
    vi.resetModules();
    vi.doMock('../../src/engine/mental/build', async (orig) => ({
      ...(await orig<typeof import('../../src/engine/mental/build')>()),
      generateMental: () => null,
    }));
    const feed = await import('../../src/engine/feed');
    const r = feed.nextCard(emptyProgress(), feed.newFeedState(0, true), createRng(1));
    expect(r.card?.kind).toBe('sat');
    vi.doUnmock('../../src/engine/mental/build');
  });
});
```

Append to `tests/unit/play-store.test.ts` (import `applyLightningAnswer, addBonusPoints`):

```ts
describe('Lightning answers', () => {
  it('count toward points, best combo and today, but timeouts are not answers', () => {
    let p = applyLightningAnswer(emptyProgress(), { answered: true, points: 10, combo: 4, now: base.now });
    p = applyLightningAnswer(p, { answered: false, points: 0, combo: 0, now: base.now });
    p = addBonusPoints(p, 25);
    expect(p.game.points).toBe(35);
    expect(p.game.bestCombo).toBe(4);
    expect(p.game.answerDays).toEqual({ '2026-10-01': 1 });
    expect(p.attempts).toEqual([]);
  });
});
```

Append to `tests/e2e/play.spec.ts`:

```ts
import { mentalFromId } from '../../src/engine/mental/build';

test('a perfect Lightning round earns the bonus', async ({ page }) => {
  await page.goto('/play/?go=1&lightning=first');
  const card = current(page);
  await expect(card.getByText('⚡ Lightning')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const prompt = card.locator('[data-mental-id]');
    await expect(prompt).toHaveAttribute('data-mental-id', /^m:/);
    const p = mentalFromId((await prompt.getAttribute('data-mental-id'))!)!;
    if (p.answer.kind === 'choice') {
      await card.getByRole('button', { name: p.answer.choices[p.answer.index] as string, exact: true }).click();
    } else {
      const [n, d] = p.answer.value.split('/');
      await page.keyboard.type(p.answer.form === 'decimal' ? String(Number(n) / Number(d ?? 1)) : p.answer.value);
      await page.keyboard.press('Enter');
    }
    if (i < 2) await expect(card.getByText(`${i + 1} of 3 done`)).toBeVisible();
  }
  await expect(card.getByText('Perfect! +25 bonus')).toBeVisible();
});

test('an unanswered Lightning question times out', async ({ page }) => {
  await page.clock.install();
  await page.goto('/play/?go=1&lightning=first');
  await expect(current(page).getByText('⚡ Lightning')).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(current(page).getByText("Time's up")).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/game.test.ts tests/unit/feed.test.ts tests/unit/play-store.test.ts`
Expected: FAIL. `scoreLightningAnswer`, the `lightning` card and `applyLightningAnswer` are missing.

- [ ] **Step 3: Implement**

Append to `src/engine/game.ts`:

```ts
export const LIGHTNING_POINTS = 5;
export const LIGHTNING_PERFECT_BONUS = 25;
/** A perfect Lightning round adds this much extra to the combo (spec §3.2). */
export const LIGHTNING_PERFECT_COMBO = 2;
export const LIGHTNING_SECONDS = 10;

/** One Lightning answer: 5 base points times the combo multiplier (spec §3.1). */
export function scoreLightningAnswer(
  combo: number,
  correct: boolean,
): { combo: number; points: number; multiplier: number } {
  if (!correct) return { combo: 0, points: 0, multiplier: 1 };
  const next = combo + 1;
  const multiplier = comboMultiplier(next);
  return { combo: next, points: LIGHTNING_POINTS * multiplier, multiplier };
}

/** Seconds per Lightning question, or null for no clock (spec §4.4). */
export function lightningSeconds(settings: { timeMultiplier: 1 | 1.5 | 2; untimed: boolean }): number | null {
  return settings.untimed ? null : LIGHTNING_SECONDS * settings.timeMultiplier;
}
```

In `src/engine/feed.ts`:

- Imports: `import { generateMental } from './mental/build';`, `import { DRILLS } from './mental/registry';`, `import type { MentalProblem } from './mental/types';`.
- Extend `Card`:

```ts
  | { kind: 'lightning'; key: string; questions: [MentalProblem, MentalProblem, MentalProblem] };
```

- Add the constants `LIGHTNING_GAP_MIN = 8` and `LIGHTNING_GAP_MAX = 12`.
- `FeedState` gains `untilLightning: number | null;` (null means "draw a gap on the next question").
- `newFeedState` becomes:

```ts
export function newFeedState(tipIndex: number, lightningFirst = false): FeedState {
  return {
    sinceTip: 0,
    recentFormats: [],
    issued: [],
    tipIndex,
    cardCount: 0,
    untilLightning: lightningFirst ? 0 : null,
  };
}
```

- Add the builder:

```ts
function lightningRound(progress: Progress, rng: Rng): [MentalProblem, MentalProblem, MentalProblem] | null {
  const drill = rng.pick(DRILLS);
  const tier = progress.mental.tier[drill.id] ?? 1;
  const qs = [0, 1, 2].map(() => generateMental(drill, tier, rng));
  return qs.every((q) => q !== null) ? (qs as [MentalProblem, MentalProblem, MentalProblem]) : null;
}
```

- In `nextCard`, after the tip branch and before the SAT branch:

```ts
  const until = state.untilLightning ?? rng.int(LIGHTNING_GAP_MIN, LIGHTNING_GAP_MAX);
  if (until <= 0) {
    const gap = rng.int(LIGHTNING_GAP_MIN, LIGHTNING_GAP_MAX);
    const questions = lightningRound(progress, rng);
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
```

  For this to work, `state` must be reassignable: rename the parameter to `input` and start the function with `let state = input;`. In the SAT branch's returned state, also decrement: `untilLightning: (state.untilLightning ?? 0) - 1`.

In `src/store/play.ts`, add:

```ts
/** A Lightning answer: points and combo; only answered questions count toward the day (spec §3.4). */
export function applyLightningAnswer(
  progress: Progress,
  a: { answered: boolean; points: number; combo: number; now: Date },
): Progress {
  const answerDays = a.answered ? addAnswerDay(progress.game.answerDays, a.now) : progress.game.answerDays;
  return {
    ...progress,
    game: {
      ...progress.game,
      points: progress.game.points + a.points,
      bestCombo: Math.max(progress.game.bestCombo, a.combo),
      answerDays,
      bestStreak: Math.max(progress.game.bestStreak, currentStreak(answerDays, a.now)),
    },
  };
}

export function addBonusPoints(progress: Progress, points: number): Progress {
  return { ...progress, game: { ...progress.game, points: progress.game.points + points } };
}
```

`src/components/play/LightningCard.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { LIGHTNING_PERFECT_BONUS } from '../../engine/game';
import { checkMental } from '../../engine/mental/build';
import type { MentalProblem } from '../../engine/mental/types';
import NumPad from '../NumPad';

export interface LightningResult {
  done: boolean;
  right: number;
}

interface Props {
  questions: readonly [MentalProblem, MentalProblem, MentalProblem];
  /** Seconds per question, or null for no clock. */
  seconds: number | null;
  active: boolean;
  result: LightningResult | undefined;
  /** Returns the points awarded, for the feedback line. */
  onAnswer(r: { correct: boolean; answered: boolean }): number;
  /** Called once, after the third question, with how many were right. */
  onDone(right: number): void;
}

/** ⚡ 3 mental-math questions against the clock (spec §2.1). */
export default function LightningCard({ questions, seconds, active, result, onAnswer, onDone }: Props) {
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [typed, setTyped] = useState('');
  const [line, setLine] = useState('');
  const [left, setLeft] = useState(seconds === null ? null : seconds * 1000);
  const locked = useRef(false);
  const done = result?.done === true || i >= 3;
  const q = questions[Math.min(i, 2)];

  const advance = (correct: boolean, answered: boolean) => {
    if (locked.current || done) return;
    locked.current = true;
    const points = onAnswer({ correct, answered });
    const nextRight = right + (correct ? 1 : 0);
    setRight(nextRight);
    setLine(
      !answered ? "Time's up" : correct ? `✓ +${points}` : `✗ ${q.answer.kind === 'number' ? q.answer.value : q.answer.choices[q.answer.index]}`,
    );
    window.setTimeout(() => {
      setTyped('');
      setI((n) => n + 1);
      setLeft(seconds === null ? null : seconds * 1000);
      locked.current = false;
      if (i === 2) onDone(nextRight);
    }, 700);
  };

  // One clock per question, only while this card is on screen.
  useEffect(() => {
    if (seconds === null || !active || done) return;
    const deadline = Date.now() + seconds * 1000;
    const id = window.setInterval(() => {
      const ms = deadline - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) {
        window.clearInterval(id);
        advance(false, false);
      }
    }, 100);
    return () => window.clearInterval(id);
    // advance reads current state through closures that change with i; re-arm per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, active, seconds, done]);

  if (done) {
    const total = result?.right ?? right;
    return (
      <div className="play-card play-lightning">
        <h2 tabIndex={-1}>⚡ Lightning</h2>
        <p className="play-lightning-score">
          {total === 3 ? `Perfect! +${LIGHTNING_PERFECT_BONUS} bonus` : `${total} of 3 right`}
        </p>
      </div>
    );
  }
  return (
    <div className="play-card play-lightning">
      <h2 tabIndex={-1}>⚡ Lightning</h2>
      <div className="gym-bar">
        <span>{i} of 3 done</span>
        {left !== null && <span className="gym-clock">{Math.ceil(left / 1000)}s</span>}
        <span role="status" aria-live="polite">
          {line}
        </span>
      </div>
      <p className="gym-prompt" data-mental-id={q.id}>
        {q.prompt}
      </p>
      {q.answer.kind === 'choice' ? (
        <div className="play-choices" role="group" aria-label="Answer choices">
          {q.answer.choices.map((c, k) => (
            <button key={c} type="button" className="play-choice" onClick={() => advance(q.answer.kind === 'choice' && k === q.answer.index, true)}>
              {c}
            </button>
          ))}
        </div>
      ) : (
        <NumPad
          id={`lightning-${q.id}`}
          label="Your answer"
          value={typed}
          onChange={setTyped}
          onSubmit={() => {
            if (typed === '') return;
            const g = checkMental(q, typed);
            if (g.status === 'invalid') setLine(g.reason);
            else advance(g.correct, true);
          }}
          submitLabel="Enter"
          suffix={q.answer.suffix ?? ''}
          active={active}
        />
      )}
    </div>
  );
}
```

The progress line reads "`{i} of 3 done`" and updates when `i` advances, 700 ms after each answer. The e2e test waits for it after the first two answers, then for the summary after the third.

In `src/components/play/PlayFeed.tsx`:

1. Imports. Change the game and store imports and add the card:

```ts
import {
  LIGHTNING_PERFECT_BONUS,
  LIGHTNING_PERFECT_COMBO,
  comboMultiplier,
  levelInfo,
  lightningSeconds,
  scoreLightningAnswer,
  scoreSatAnswer,
} from '../../engine/game';
import { addBonusPoints, applyLightningAnswer, applyPlayAnswer } from '../../store/play';
import LightningCard, { type LightningResult } from './LightningCard';
```

2. Below `RENDER_WINDOW`, add the test hook and widen `Entry`:

```ts
/** `?lightning=first` starts with a Lightning round. Only in builds made with PUBLIC_TEST_HOOKS=1. */
const lightningFirst = () =>
  import.meta.env.PUBLIC_TEST_HOOKS === '1' &&
  new URLSearchParams(window.location.search).get('lightning') === 'first';

type Entry = { key: string; card: Card | null; result?: CardResult; lightning?: LightningResult };
```

(Replace the existing `type Entry` line.)

3. In `extend`, replace the `let state = …` line with:

```ts
      let state =
        feedState.current ??
        newFeedState(store.getSnapshot().progress.game.tipIndex, lightningFirst());
```

4. After `onAnswer`, add:

```ts
  const onLightningAnswer = (r: { correct: boolean; answered: boolean }): number => {
    const scored = scoreLightningAnswer(comboRef.current, r.correct);
    comboRef.current = scored.combo;
    setCombo(scored.combo);
    const store = getProgressStore();
    const before = levelInfo(store.getSnapshot().progress.game.points).level;
    store.update((p) =>
      applyLightningAnswer(p, {
        answered: r.answered,
        points: scored.points,
        combo: scored.combo,
        now: new Date(),
      }),
    );
    const { settings, game } = store.getSnapshot().progress;
    answerFeedback(r.correct, settings);
    if (levelInfo(game.points).level > before) levelUpFeedback(settings);
    return scored.points;
  };

  const onLightningDone = (index: number, right: number) => {
    if (right === 3) {
      comboRef.current += LIGHTNING_PERFECT_COMBO;
      setCombo(comboRef.current);
      getProgressStore().update((p) => addBonusPoints(p, LIGHTNING_PERFECT_BONUS));
    }
    entriesRef.current = entriesRef.current.map((e, i) =>
      i === index ? { ...e, lightning: { done: true, right } } : e,
    );
    setEntries(entriesRef.current);
  };
```

5. In the slot renderer, add a branch between the tip branch and `SatCard`:

```tsx
            ) : e.card.kind === 'lightning' ? (
              <LightningCard
                questions={e.card.questions}
                seconds={lightningSeconds(snapshot.progress.settings)}
                active={i === current}
                result={e.lightning}
                onAnswer={onLightningAnswer}
                onDone={(right) => onLightningDone(i, right)}
              />
```

6. Change the `SatCard` `onAnswer` guard, which already reads `e.card?.kind === 'sat'`, so nothing else changes there.

In `src/env.d.ts`, add `readonly PUBLIC_TEST_HOOKS?: string;` to `ImportMetaEnv` (so `import.meta.env.PUBLIC_TEST_HOOKS` type-checks with dot access).

In `playwright.config.ts`, change the web-server command to:

```ts
    command: `PUBLIC_TEST_HOOKS=1 npx astro build && npx astro preview --port ${PORT} --ignore-lock`,
```

Append to `src/styles/play.css`:

```css
.play-lightning h2 {
  font-size: 1.4rem;
}
.play-lightning-score {
  font-size: 1.5rem;
  font-weight: 700;
}
```

`LightningCard` reuses `.gym-bar`, `.gym-clock` and `.gym-prompt`, which Task 6 put in `play.css`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run test:e2e`
Expected: PASS, 76 tests (72 + 2 × 2).

Run: `BASE_PATH=/free-sat-math npm run build && npm run check:bundle`
Expected: `play/index.html` startup ≤ 170 KB, ending `All pages within 170 KB at startup.` (`check:bundle` runs on the normal build, which has no test hooks.)

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: clean.

```bash
git add src/engine/game.ts src/engine/feed.ts src/store/play.ts src/components/play src/env.d.ts \
  playwright.config.ts src/styles tests/unit/game.test.ts tests/unit/feed.test.ts \
  tests/unit/play-store.test.ts tests/e2e/play.spec.ts
git commit -m "feat(play): ⚡ Lightning mental-math rounds in the Quick Play feed"
```

---

### Task 8: Links and the full run

**Files:**
- Modify: `src/components/play/PlayApp.tsx` (Gym link on the start screen), `src/pages/index.astro`

- [ ] **Step 1: Add the entry points**

In `PlayApp`'s start screen, after the ▶ Play button:

```tsx
      <a className="button" href={url('/train/')}>
        Mental Math Gym
      </a>
```

Import `url` from `../../lib/paths`.

In `src/pages/index.astro`, add to the `button-row`:

```astro
    <a class="button" href={url('/train/')}>Mental Math Gym</a>
```

- [ ] **Step 2: Run everything the way CI does**

Run: `npm run verify`
Expected:
- Prettier is clean;
- all unit tests pass;
- 33 soak tests pass (15 SAT + 18 mental);
- `astro check` reports 0 errors;
- `All pages within 170 KB at startup.`;
- `All site links start with /free-sat-math/`;
- 76 browser tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/play/PlayApp.tsx src/pages/index.astro
git commit -m "feat(site): links to the Mental Math Gym"
```

Hand-off: report the branch state. Pushing to `main` deploys, and that needs the owner's go-ahead.
