# Free SAT Math Phase 1 (Foundation and Systems of Equations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the first working version of Free SAT Math: a static site where a student can practice "Systems of two linear equations" at three difficulty levels with auto-adjusting difficulty, see worked solutions, review missed and bookmarked problems, and move their progress between devices, all without an account.

**Architecture:** An Astro 7 static site. Pure TypeScript in `src/engine/` generates and grades problems (seeded, exact arithmetic, independently verified). React islands handle the interactive pages and share one progress store that lives in `localStorage`. Lessons are MDX rendered at build time, with worked examples produced by the same generators.

**Tech Stack:** Astro 7.3, React 19.3, TypeScript 6.0 (strict), KaTeX 0.18, Zod 4 (`zod/mini`), Vitest 5 + Testing Library + jsdom 30, Playwright 1.63, ESLint 10 + typescript-eslint 8.70, Prettier 3.9, GitHub Actions and GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-24-free-sat-math-design.md` (Phase 1 is §14, item 1). Read it before starting; this plan argues from it.

**How this plan was checked:** every file below was written and run in a scratch project first. That project passed `npm run verify` from end to end: lint and format, 179 unit tests, the 5,000-seed generator soak, the type check, the build, the bundle budget, the base-path link check, and 48 Playwright runs (24 tests at two widths). If a step's result differs from its "Expected" line, stop and investigate. Don't edit the test to match.

## Global Constraints

- **Node:** 22.12 or newer locally; CI uses Node 24.
- **Dependencies:** the exact versions in Task 1's `package.json`. Keep TypeScript on 6.0.x, because typescript-eslint 8.70 and `@astrojs/check` do not support TypeScript 7.
- **Original content only:** every problem, solution, lesson, guide and explanation is written from scratch. Nothing is copied or paraphrased from any prep company, from College Board or Khan Academy materials, or from prep books (spec §3.1).
- **Footer disclaimer, verbatim:** `SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this site.`
- **Privacy:**
  - no cookies, analytics or third-party trackers;
  - progress lives only in the browser;
  - KaTeX fonts are bundled from npm, not loaded from a CDN;
  - the Desmos script loads only when a key is configured and the student opens the calculator.
- **Storage keys:** `fsm.progress.v1`, `fsm.backup.<ISO timestamp>`, `fsm.theme`. Every storage access is wrapped in try/catch.
- **Engine boundary:** `src/engine/` never imports from `src/components/`, `src/store/`, `src/lib/` or `src/pages/`.
- **Generators:**
  - use exact math (`Rational`) and build answer-first;
  - typed (`spr`) answers are always rational;
  - bump a type's `version` whenever its output changes for any seed, then run `npm run golden:update`.
- **Typed-answer rules** (spec §7.3):
  - 5 characters for positive answers, 6 for negative ones;
  - fractions and decimals are both accepted;
  - non-terminating decimals must fill the whole space (truncated or rounded).
- **Accessibility:**
  - WCAG 2.1 AA targets and tap targets of at least 44px;
  - no sideways page scrolling at 360px wide;
  - KaTeX renders with MathML output.
- **Performance:** every page ships at most 170 KB of gzipped JS. The lesson, formula, about and 404 pages ship no JS files.
- **Links:** every internal URL goes through `url()` from `src/lib/paths.ts`, because GitHub Pages serves the site under `/<repo>/`.
- **Site name:** lives only in `src/site.config.ts`.

## Changes from the spec

The spec's "Revision notes" section records these; they came out of building this plan.
- The JS budget is 170 KB, not 150 KB.
- The theme is stored in `fsm.theme`, not inside `settings`.
- `surd.ts` and `Figure` wait for Phases 2 and 3.
- `build.ts` is split out of `registry.ts`.
- A base-path link check runs in CI.

## Review Focus

The five situations most likely to hurt a real student that the spec implies but does not spell out, each pinned by a test in the task that owns the code:

1. **Unreadable saved progress** (old format, hand-edited, corrupted). The data is backed up to `fsm.backup.*`, the student starts fresh, and they see a notice. *Task 19:* `review.spec.ts` "unreadable saved progress is backed up and the student is told".
2. **Two tabs open at once.** The second tab picks up the first tab's changes instead of overwriting them. *Task 19:* `review.spec.ts` "a second open tab picks up changes without a reload".
3. **Served under `/<repo>/` on GitHub Pages.** No built page links to a path that skips the base. *Task 21:* `scripts/check-links.mjs`, run in CI with `BASE_PATH` set.
4. **Keyboard-only students.** Arrow keys pick an answer and Enter checks it. *Task 18:* `practice.spec.ts` "a problem can be answered with the keyboard alone".
5. **Desmos blocked or slow** (for example, a school filter). The "Open Desmos" fallback appears within 8 seconds, and a later attempt can retry. *Task 15:* `desmos-panel.test.tsx` "loadDesmos gives up after the timeout and can be retried".

---

### Task 1: Project scaffold and tooling

Sets up the Astro project, TypeScript, tests, linting and formatting, plus the two small helpers everything else uses: the base-path-aware `url()` and the site config.

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `tests/setup.ts`
- Create: `src/env.d.ts`, `src/site.config.ts`, `src/lib/paths.ts`, `src/pages/index.astro` (temporary)
- Test: `tests/unit/paths.test.ts`, `tests/unit/site-config.test.ts`

**Interfaces:**
- Produces:
  - `url(path: string): string` in `src/lib/paths.ts`: prefixes `import.meta.env.BASE_URL`.
  - `SITE: { name; description; disclaimer }`, `DESMOS_DEMO_KEY: string` and `desmosApiKey(): string | null` in `src/site.config.ts`. `desmosApiKey()` is for build time only; pass its result to islands as a prop.
  - npm scripts: `test` (unit), `test:soak`, `test:e2e`, `golden:update`, `check:bundle`, `check:links`, `lint`, `format`, `build`, `verify`. Some point at files later tasks create.

- [ ] **Step 1: Create `package.json` and install**

`package.json`:

```json
{
  "name": "free-sat-math",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview --ignore-lock",
    "test": "vitest run --project unit",
    "test:soak": "vitest run --project soak",
    "test:e2e": "playwright test",
    "golden:update": "UPDATE_GOLDEN=1 vitest run --project unit tests/unit/golden.test.ts",
    "check:bundle": "node scripts/check-bundle.mjs",
    "check:links": "node scripts/check-links.mjs",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "verify": "npm run lint && npm test && npm run test:soak && BASE_PATH=/free-sat-math npm run build && npm run check:bundle && BASE_PATH=/free-sat-math npm run check:links && npm run test:e2e"
  },
  "dependencies": {
    "@astrojs/mdx": "8.0.2",
    "@astrojs/react": "7.0.0",
    "astro": "7.3.5",
    "katex": "0.18.9",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@astrojs/check": "0.9.10",
    "@playwright/test": "1.63.0",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/katex": "0.16.8",
    "@types/node": "24.13.6",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "eslint": "10.11.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "jsdom": "30.1.1",
    "prettier": "3.9.9",
    "prettier-plugin-astro": "1.0.1",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vitest": "5.0.1"
  }
}
```

Run: `npm install`
Expected: installs without errors. npm 11 may warn that the `esbuild` and `fsevents` install scripts were skipped under `allowScripts`. That's harmless: the build and tests work without them.

- [ ] **Step 2: Add the tool configuration**

`vitest.config.ts` defines two test projects:
- `unit`: jsdom, fast, run by `npm test`.
- `soak`: Node, slow, run by `npm run test:soak`.

`tests/setup.ts` does two things:
- Registers Testing Library's cleanup. Without Vitest globals it is not automatic, and renders would leak between tests.
- Works around a jsdom bug: `getComputedStyle` throws on the MathML elements KaTeX emits, which breaks accessible-name queries.

`astro.config.mjs`:

```js
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

// SITE_URL and BASE_PATH are set by the deploy workflow (e.g. https://you.github.io and /sat-math).
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'always',
  integrations: [react(), mdx()],
});
```

`tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strictest",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"],
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "types": ["node"]
  }
}
```

`vitest.config.ts`:

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';
export default getViteConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'soak',
          include: ['tests/soak/**/*.test.ts'],
          environment: 'node',
          testTimeout: 600000,
        },
      },
    ],
  },
});
```

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom's getComputedStyle throws on MathML elements, which KaTeX emits for screen readers.
// Accessible-name queries call it to check visibility, so give MathML elements default styles.
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const realGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((elt: Element, pseudoElt?: string | null) =>
  realGetComputedStyle(
    elt.namespaceURI === MATHML_NS ? document.createElement('span') : elt,
    pseudoElt,
  )) as typeof window.getComputedStyle;
```

`eslint.config.js`:

```js
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig(
  { ignores: ['dist/', '.astro/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

`.prettierrc.json`:

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "plugins": ["prettier-plugin-astro"],
  "overrides": [{ "files": "*.astro", "options": { "parser": "astro" } }]
}
```

`.prettierignore`:

```text
dist/
.astro/
node_modules/
package-lock.json
playwright-report/
test-results/
tests/golden/
```

`.gitignore`:

```text
node_modules/
dist/
.astro/
playwright-report/
test-results/
.env
.DS_Store
```

- [ ] **Step 3: Write the failing tests**

`tests/unit/paths.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { url } from '../../src/lib/paths';

afterEach(() => vi.unstubAllEnvs());

describe('url', () => {
  it('leaves paths alone at the root', () => {
    vi.stubEnv('BASE_URL', '/');
    expect(url('/skills/')).toBe('/skills/');
  });
  it('prefixes the base path, with or without a trailing slash on the base', () => {
    vi.stubEnv('BASE_URL', '/sat-math/');
    expect(url('/skills/')).toBe('/sat-math/skills/');
    vi.stubEnv('BASE_URL', '/sat-math');
    expect(url('review/')).toBe('/sat-math/review/');
  });
});
```

`tests/unit/site-config.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESMOS_DEMO_KEY, SITE, desmosApiKey } from '../../src/site.config';

afterEach(() => vi.unstubAllEnvs());

describe('desmosApiKey', () => {
  it('uses DESMOS_API_KEY when set', () => {
    vi.stubEnv('DESMOS_API_KEY', 'real-key');
    expect(desmosApiKey()).toBe('real-key');
  });
  it('falls back to the demo key only in development', () => {
    vi.stubEnv('DESMOS_API_KEY', '');
    vi.stubEnv('DEV', true);
    expect(desmosApiKey()).toBe(DESMOS_DEMO_KEY);
    vi.stubEnv('DEV', false);
    expect(desmosApiKey()).toBeNull();
  });
});

describe('SITE', () => {
  it('carries the trademark disclaimer', () => {
    expect(SITE.disclaimer).toContain('not affiliated with');
  });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/paths.test.ts tests/unit/site-config.test.ts`
Expected: FAIL. The test files cannot import `src/lib/paths.ts` and `src/site.config.ts` because it does not exist yet.

- [ ] **Step 5: Implement the helpers and a temporary home page**

`src/env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly DESMOS_API_KEY?: string;
}
```

`src/site.config.ts`:

```ts
export const SITE = {
  name: 'Free SAT Math',
  description:
    'Free SAT Math practice for every skill, at three difficulty levels, with step-by-step solutions. No sign-up.',
  disclaimer:
    'SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this site.',
} as const;

/** Desmos' public demo key. Their docs allow it for development only. */
export const DESMOS_DEMO_KEY = 'dcb31709b452b1cf9dc26972add0fda6';

/**
 * The Desmos key for this build: DESMOS_API_KEY if set, the demo key in `astro dev`, otherwise null
 * (the calculator falls back to a link). Read it in .astro files and pass it to islands as a prop.
 */
export function desmosApiKey(): string | null {
  const key = import.meta.env.DESMOS_API_KEY;
  if (typeof key === 'string' && key !== '') return key;
  return import.meta.env.DEV ? DESMOS_DEMO_KEY : null;
}
```

`src/lib/paths.ts`:

```ts
/** An internal link that respects the site's base path (e.g. /sat-math on GitHub Pages). */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
```

`src/pages/index.astro`:

```astro
---
// Temporary home page. Task 17 replaces it with the real one.
import { SITE } from '../site.config';
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{SITE.name}</title>
  </head>
  <body>
    <h1>{SITE.name}</h1>
    <p>{SITE.description}</p>
    <p>{SITE.disclaimer}</p>
  </body>
</html>
```

- [ ] **Step 6: Run the tests and the build**

Run: `npx vitest run --project unit tests/unit/paths.test.ts tests/unit/site-config.test.ts`
Expected: PASS, 5 tests.

Run: `npm run build`
Expected: `astro check` reports `- 0 errors`, then Astro prints `1 page(s) built` and `Complete!`.

- [ ] **Step 7: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json vitest.config.ts eslint.config.js \
  .prettierrc.json .prettierignore .gitignore tests/setup.ts src tests/unit
git commit -m "chore: scaffold Astro project with tests, lint and formatting"
```

---

### Task 2: Seeded random numbers

Problems are rebuilt from their seed, so the random generator must produce the same numbers for a seed in every browser. It uses sfc32 seeded through splitmix32, with integer-only arithmetic.

**Files:**
- Create: `src/engine/rng.ts`
- Test: `tests/unit/rng.test.ts`

**Interfaces:**
- Produces:
  - `interface Rng { next(): number; int(min, max): number; pick<T>(items: readonly T[]): T; shuffle<T>(items: readonly T[]): T[]; chance(p: number): boolean }`
  - `createRng(seed: number): Rng`: the seed must be a uint32, otherwise it throws `RangeError`.
  - `randomSeed(): number`
  - `MAX_SEED = 0xffffffff`

- [ ] **Step 1: Write the failing test**

The pinned values for seed 1 (`[425, 790, 691, 524, 965]`) are what the implementation below produces. They guard against drift between JS engines. If they differ, the implementation differs from this one: fix the implementation, not the test.

`tests/unit/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.int(0, 1000));
    const seqB = Array.from({ length: 5 }, () => b.int(0, 1000));
    expect(seqA).toEqual(seqB);
  });

  it('is pinned to known values so cross-engine drift is caught', () => {
    const rng = createRng(1);
    expect(Array.from({ length: 5 }, () => rng.int(0, 999))).toEqual(PINNED_SEED_1);
  });

  it('gives different sequences for different seeds', () => {
    const a = Array.from(
      { length: 5 },
      (
        (g) => () =>
          g.int(0, 1e6)
      )(createRng(1)),
    );
    const b = Array.from(
      { length: 5 },
      (
        (g) => () =>
          g.int(0, 1e6)
      )(createRng(2)),
    );
    expect(a).not.toEqual(b);
  });

  it('int() stays in range and hits every value', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('next() is in [0, 1)', () => {
    const rng = createRng(9);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffle() returns a permutation and leaves the input alone', () => {
    const rng = createRng(3);
    const input = [1, 2, 3, 4, 5, 6];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('chance(0) is never true and chance(1) is always true', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('rejects seeds that are not uint32', () => {
    expect(() => createRng(-1)).toThrow(RangeError);
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => createRng(2 ** 32)).toThrow(RangeError);
  });

  it('pick() rejects an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });
});

const PINNED_SEED_1 = [425, 790, 691, 524, 965];
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/rng.test.ts`
Expected: FAIL. The test files cannot import `src/engine/rng.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/engine/rng.ts`:

```ts
/**
 * Seeded pseudo-random numbers (sfc32, seeded through splitmix32).
 * Integer-only arithmetic, so a seed produces the same sequence in every JS engine.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** A new array holding the items in random order. */
  shuffle<T>(items: readonly T[]): T[];
  /** true with probability p. */
  chance(p: number): boolean;
}

export const MAX_SEED = 0xffffffff;

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new RangeError(`seed must be an integer in [0, ${MAX_SEED}], got ${seed}`);
  }
  const init = splitmix32(seed);
  let a = init();
  let b = init();
  let c = init();
  let d = init();
  const nextU32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) nextU32();

  const next = (): number => nextU32() / 4294967296;
  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${min}, ${max}) needs integers with min <= max`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('pick() needs a non-empty array');
    return items[int(0, items.length - 1)] as T;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  const chance = (p: number): boolean => next() < p;
  return { next, int, pick, shuffle, chance };
}

/** A fresh random seed from the platform's crypto source. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/rng.test.ts`
Expected: PASS, 9 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 14 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/rng.ts tests/unit/rng.test.ts
git commit -m "feat(engine): seeded random numbers"
```

---

### Task 3: Exact fractions

All generator math is exact. `Rational` keeps a reduced numerator and a positive denominator, and throws instead of silently losing precision.

**Files:**
- Create: `src/engine/rational.ts`
- Test: `tests/unit/rational.test.ts`

**Interfaces:**
- Produces:
  - `class Rational` with `static of(num, den = 1)` and `static parse(text)`.
    - `parse` accepts `7`, `-7/2`, `0.75`, `.75`, `-.5` and `3.`, and throws `SyntaxError` otherwise.
  - Instance members:
    - arithmetic: `add`, `sub`, `mul`, `div`, `neg`, `abs`;
    - comparisons: `sign()`, `cmp()`, `eq()`;
    - checks: `isZero()`, `isInteger()`, `isTerminating()`;
    - conversions: `toNumber()`, and `toString()`, which gives `"7/2"` or `"-4"`;
    - readonly `num` and `den`.
  - `r(num, den = 1)`: shorthand for `Rational.of`.

- [ ] **Step 1: Write the failing test**

`tests/unit/rational.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Rational, r } from '../../src/engine/rational';

describe('Rational', () => {
  it('normalises sign and reduces', () => {
    expect(r(6, 8).toString()).toBe('3/4');
    expect(r(3, -6).toString()).toBe('-1/2');
    expect(r(-4, -2).toString()).toBe('2');
    expect(r(0, -5).toString()).toBe('0');
  });

  it('does arithmetic exactly', () => {
    expect(r(1, 3).add(r(1, 6)).toString()).toBe('1/2');
    expect(r(1, 3).sub(r(1, 2)).toString()).toBe('-1/6');
    expect(r(2, 3).mul(r(9, 4)).toString()).toBe('3/2');
    expect(r(2, 3).div(r(4, 9)).toString()).toBe('3/2');
    expect(r(-5, 7).neg().toString()).toBe('5/7');
    expect(r(-5, 7).abs().toString()).toBe('5/7');
  });

  it('compares', () => {
    expect(r(1, 3).cmp(r(1, 2))).toBe(-1);
    expect(r(2, 4).cmp(r(1, 2))).toBe(0);
    expect(r(2, 4).eq(r(1, 2))).toBe(true);
    expect(r(-1).sign()).toBe(-1);
  });

  it('knows which decimals terminate', () => {
    expect(r(3, 4).isTerminating()).toBe(true);
    expect(r(7, 40).isTerminating()).toBe(true);
    expect(r(2, 3).isTerminating()).toBe(false);
    expect(r(1, 7).isTerminating()).toBe(false);
  });

  it('parses integers, fractions and decimals', () => {
    expect(Rational.parse('7').toString()).toBe('7');
    expect(Rational.parse('-7/2').toString()).toBe('-7/2');
    expect(Rational.parse('6/8').toString()).toBe('3/4');
    expect(Rational.parse('0.75').toString()).toBe('3/4');
    expect(Rational.parse('.75').toString()).toBe('3/4');
    expect(Rational.parse('-.5').toString()).toBe('-1/2');
    expect(Rational.parse('3.').toString()).toBe('3');
  });

  it('rejects bad input', () => {
    for (const bad of ['', '.', '-', '1/0', 'abc', '1,000', '3 1/2', '--2', '1/-2']) {
      expect(() => Rational.parse(bad), bad).toThrow();
    }
  });

  it('refuses a zero denominator and division by zero', () => {
    expect(() => r(1, 0)).toThrow(RangeError);
    expect(() => r(1).div(r(0))).toThrow(RangeError);
  });

  it('throws instead of silently losing precision', () => {
    expect(() => r(2 ** 40).mul(r(2 ** 40))).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/rational.test.ts`
Expected: FAIL. The test files cannot import `src/engine/rational.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/engine/rational.ts`:

```ts
/** Exact fractions over safe integers. Every result is reduced, with a positive denominator. */

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

function safe(n: number, what: string): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Rational overflow in ${what}: ${n}`);
  return n;
}

const DECIMAL = /^(-?)(\d*)\.?(\d*)$/;
const FRACTION = /^(-?)(\d+)\/(\d+)$/;

export class Rational {
  readonly num: number;
  readonly den: number;

  private constructor(num: number, den: number) {
    this.num = num;
    this.den = den;
  }

  static of(num: number, den = 1): Rational {
    safe(num, 'numerator');
    safe(den, 'denominator');
    if (den === 0) throw new RangeError('Rational with zero denominator');
    if (num === 0) return new Rational(0, 1);
    const g = gcd(num, den);
    const sign = den < 0 ? -1 : 1;
    return new Rational((sign * num) / g, (sign * den) / g);
  }

  /** Parses "7", "-7", "7/2", "-7/2", "0.75", ".75", "-.5" and "3.". Throws on anything else. */
  static parse(text: string): Rational {
    const t = text.trim();
    const f = FRACTION.exec(t);
    if (f) {
      const n = Number(f[2]);
      return Rational.of(f[1] === '-' ? -n : n, Number(f[3]));
    }
    const d = DECIMAL.exec(t);
    if (d && (d[2] !== '' || d[3] !== '')) {
      const whole = d[2] === '' ? '0' : (d[2] as string);
      const frac = d[3] as string;
      const n = Number(whole + frac);
      const q = Rational.of(n, 10 ** frac.length);
      return d[1] === '-' ? q.neg() : q;
    }
    throw new SyntaxError(`Not a number: "${text}"`);
  }

  add(o: Rational): Rational {
    return Rational.of(
      safe(this.num * o.den + o.num * this.den, 'add'),
      safe(this.den * o.den, 'add'),
    );
  }
  sub(o: Rational): Rational {
    return this.add(o.neg());
  }
  mul(o: Rational): Rational {
    return Rational.of(safe(this.num * o.num, 'mul'), safe(this.den * o.den, 'mul'));
  }
  div(o: Rational): Rational {
    if (o.num === 0) throw new RangeError('Division by zero');
    return Rational.of(safe(this.num * o.den, 'div'), safe(this.den * o.num, 'div'));
  }
  neg(): Rational {
    return Rational.of(-this.num, this.den);
  }
  abs(): Rational {
    return Rational.of(Math.abs(this.num), this.den);
  }
  sign(): -1 | 0 | 1 {
    return this.num === 0 ? 0 : this.num > 0 ? 1 : -1;
  }
  cmp(o: Rational): -1 | 0 | 1 {
    return this.sub(o).sign();
  }
  eq(o: Rational): boolean {
    return this.num === o.num && this.den === o.den;
  }
  isZero(): boolean {
    return this.num === 0;
  }
  isInteger(): boolean {
    return this.den === 1;
  }
  /** true when the decimal expansion ends (the denominator has no prime factors besides 2 and 5). */
  isTerminating(): boolean {
    let d = this.den;
    while (d % 2 === 0) d /= 2;
    while (d % 5 === 0) d /= 5;
    return d === 1;
  }
  toNumber(): number {
    return this.num / this.den;
  }
  /** "7/2", "-4", "0". */
  toString(): string {
    return this.den === 1 ? String(this.num) : `${this.num}/${this.den}`;
  }
}

/** Shorthand: r(7, 2) is 7/2; r(3) is 3. */
export const r = (num: number, den = 1): Rational => Rational.of(num, den);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/rational.test.ts`
Expected: PASS, 8 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 22 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/rational.ts tests/unit/rational.test.ts
git commit -m "feat(engine): exact rational arithmetic"
```

---

### Task 4: Math text splitting and LaTeX formatting

Problem text is plain text with `$...$` inline math, `$$...$$` display math, `\$` for a literal dollar sign, and blank lines between paragraphs. `format.ts` writes clean LaTeX: never `1x`, never `+ -3`. `lintMath` catches those slips in tests.

**Files:**
- Create: `src/engine/markup.ts`, `src/engine/format.ts`
- Test: `tests/unit/markup.test.ts`, `tests/unit/format.test.ts`

**Interfaces:**
- Consumes: `Rational` and `r` (Task 3).
- Produces:
  - `markup.ts`:
    - `type Segment = { kind: 'text'; value } | { kind: 'math'; value; display }`
    - `splitMath(source): Segment[]`: throws `SyntaxError` on unclosed math.
    - `paragraphs(source): string[]`
    - `mathSegments(source): string[]`
  - `format.ts`:
    - `tex(n: Rational | number): string`: gives `4`, `-\frac{7}{2}` or `1{,}090`.
    - `commas(n): string`
    - `linear(terms: [coef, variable][], constant = 0): string`
    - `system(rows: [lhs, rhs][]): string`: an `aligned` block.
    - `signedGroup(coef, inner): string`: gives `- 2(x + 1)` or `+ (x + 1)`.
    - `lintMath(latex): string[]`

- [ ] **Step 1: Write the failing tests**

`tests/unit/markup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mathSegments, paragraphs, splitMath } from '../../src/engine/markup';

describe('splitMath', () => {
  it('splits inline and display math from text', () => {
    expect(splitMath('Solve $x + 1 = 2$ now.')).toEqual([
      { kind: 'text', value: 'Solve ' },
      { kind: 'math', value: 'x + 1 = 2', display: false },
      { kind: 'text', value: ' now.' },
    ]);
    expect(splitMath('$$y = 2x$$')).toEqual([{ kind: 'math', value: 'y = 2x', display: true }]);
  });

  it('treats \\$ as a literal dollar in text', () => {
    expect(splitMath('costs \\$12 each')).toEqual([{ kind: 'text', value: 'costs $12 each' }]);
  });

  it('keeps escaped dollars inside math', () => {
    expect(splitMath('$\\$5$')).toEqual([{ kind: 'math', value: '\\$5', display: false }]);
  });

  it('throws on unclosed math', () => {
    expect(() => splitMath('oops $x + 1')).toThrow(SyntaxError);
  });

  it('lists math segments', () => {
    expect(mathSegments('a $x$ b $$y$$')).toEqual(['x', 'y']);
  });
});

describe('paragraphs', () => {
  it('splits on blank lines and trims', () => {
    expect(paragraphs('one\n\n  two  \n\n\n')).toEqual(['one', 'two']);
  });
});
```

`tests/unit/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { commas, linear, lintMath, signedGroup, system, tex } from '../../src/engine/format';
import { r } from '../../src/engine/rational';

describe('tex', () => {
  it('formats integers, fractions and signs', () => {
    expect(tex(4)).toBe('4');
    expect(tex(-4)).toBe('-4');
    expect(tex(r(7, 2))).toBe('\\frac{7}{2}');
    expect(tex(r(-7, 2))).toBe('-\\frac{7}{2}');
  });
  it('groups thousands', () => {
    expect(tex(1090)).toBe('1{,}090');
    expect(tex(-1234567)).toBe('-1{,}234{,}567');
    expect(tex(999)).toBe('999');
    expect(commas(1090)).toBe('1,090');
  });
});

describe('linear', () => {
  it('drops zero terms and unit coefficients', () => {
    expect(
      linear([
        [1, 'x'],
        [-1, 'y'],
      ]),
    ).toBe('x - y');
    expect(
      linear(
        [
          [0, 'x'],
          [3, 'y'],
        ],
        -5,
      ),
    ).toBe('3y - 5');
    expect(linear([[-2, 'x']], 0)).toBe('-2x');
    expect(
      linear(
        [
          [2, 'x'],
          [-3, 'y'],
        ],
        4,
      ),
    ).toBe('2x - 3y + 4');
  });
  it('handles fractional coefficients and all-zero input', () => {
    expect(linear([[r(1, 2), 'x']], r(-3, 4))).toBe('\\frac{1}{2}x - \\frac{3}{4}');
    expect(linear([[0, 'x']], 0)).toBe('0');
    expect(linear([], 7)).toBe('7');
  });
});

describe('system', () => {
  it('builds an aligned block', () => {
    expect(
      system([
        ['x + y', '5'],
        ['x - y', '1'],
      ]),
    ).toBe('\\begin{aligned} x + y &= 5 \\\\ x - y &= 1 \\end{aligned}');
  });
});

describe('lintMath', () => {
  it('accepts clean output', () => {
    expect(lintMath('2x - 3y + 4 = 11')).toEqual([]);
    expect(lintMath('\\frac{1}{2}x + 10y = 1{,}090')).toEqual([]);
    expect(lintMath('11x + 21y')).toEqual([]);
  });
  it('flags bad output', () => {
    expect(lintMath('2x + -3')).toHaveLength(1);
    expect(lintMath('x - -3')).toHaveLength(1);
    expect(lintMath('1x + y')).toHaveLength(1);
    expect(lintMath('y = 0x + 2')).toHaveLength(1);
    expect(lintMath('= +4')).toHaveLength(1);
    expect(lintMath('x = NaN')).toHaveLength(1);
  });
});

describe('signedGroup', () => {
  it('writes the sign and drops a unit coefficient', () => {
    expect(signedGroup(-2, 'x + 1')).toBe('- 2(x + 1)');
    expect(signedGroup(3, 'x')).toBe('+ 3(x)');
    expect(signedGroup(1, 'x + 1')).toBe('+ (x + 1)');
    expect(signedGroup(-1, 'x + 1')).toBe('- (x + 1)');
  });
  it('refuses zero', () => {
    expect(() => signedGroup(0, 'x')).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/markup.test.ts tests/unit/format.test.ts`
Expected: FAIL. The test files cannot import `src/engine/markup.ts` and `src/engine/format.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/engine/markup.ts`:

```ts
/**
 * Splits problem text into plain-text and math segments.
 * - `$...$` is inline math, `$$...$$` is display math.
 * - `\$` is a literal dollar sign in text (used for money).
 * - A blank line separates paragraphs.
 */
export type Segment =
  { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

export function splitMath(source: string): Segment[] {
  const out: Segment[] = [];
  let text = '';
  let i = 0;
  const flushText = () => {
    if (text !== '') out.push({ kind: 'text', value: text });
    text = '';
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\' && source[i + 1] === '$') {
      text += '$';
      i += 2;
      continue;
    }
    if (ch === '$') {
      const display = source[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = findClose(source, i + open, display);
      if (close === -1)
        throw new SyntaxError(`Unclosed math starting at ${i}: ${source.slice(i, i + 30)}`);
      flushText();
      out.push({ kind: 'math', value: source.slice(i + open, close), display });
      i = close + open;
      continue;
    }
    text += ch;
    i++;
  }
  flushText();
  return out;
}

function findClose(source: string, from: number, display: boolean): number {
  for (let j = from; j < source.length; j++) {
    if (source[j] === '\\') {
      j++;
      continue;
    }
    if (source[j] === '$') {
      if (!display) return j;
      if (source[j + 1] === '$') return j;
    }
  }
  return -1;
}

/** Paragraphs of a text: split on blank lines, trimmed, empties dropped. */
export function paragraphs(source: string): string[] {
  return source
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

/** Every math segment in a text (used by tests and lint). */
export function mathSegments(source: string): string[] {
  return splitMath(source).flatMap((s) => (s.kind === 'math' ? [s.value] : []));
}
```

`src/engine/format.ts`:

```ts
import { Rational, r } from './rational';

type Num = Rational | number;
const toQ = (n: Num): Rational => (typeof n === 'number' ? r(n) : n);

/** Integer digits with LaTeX thousands separators: 1090 -> "1{,}090". */
function groupDigits(n: number): string {
  const s = String(Math.abs(n));
  const grouped = s.length > 3 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, '{,}') : s;
  return n < 0 ? `-${grouped}` : grouped;
}

/** Plain-text integer with commas, for money in sentences: 1090 -> "1,090". */
export function commas(n: number): string {
  return groupDigits(n).replaceAll('{,}', ',');
}

/** LaTeX for a number: 4, -4, 1{,}090, \frac{7}{2}, -\frac{7}{2}. */
export function tex(n: Num): string {
  const q = toQ(n);
  if (q.isInteger()) return groupDigits(q.num);
  const body = `\\frac{${Math.abs(q.num)}}{${q.den}}`;
  return q.num < 0 ? `-${body}` : body;
}

/**
 * LaTeX for a sum of terms like 2x - 3y + 5.
 * Zero terms are dropped, a coefficient of 1 or -1 is written as x or -x,
 * and signs are merged so the output never contains "+ -".
 */
export function linear(terms: ReadonlyArray<readonly [Num, string]>, constant: Num = 0): string {
  const parts: Array<{ neg: boolean; body: string }> = [];
  for (const [coef, variable] of terms) {
    const q = toQ(coef);
    if (q.isZero()) continue;
    const a = q.abs();
    const body = a.eq(r(1)) ? variable : `${tex(a)}${variable}`;
    parts.push({ neg: q.sign() < 0, body });
  }
  const k = toQ(constant);
  if (!k.isZero()) parts.push({ neg: k.sign() < 0, body: tex(k.abs()) });
  if (parts.length === 0) return '0';
  return parts
    .map((p, i) => (i === 0 ? (p.neg ? `-${p.body}` : p.body) : `${p.neg ? '-' : '+'} ${p.body}`))
    .join(' ');
}

/** A system of equations as an aligned block: rows are [left side, right side]. */
export function system(rows: ReadonlyArray<readonly [string, string]>): string {
  return `\\begin{aligned} ${rows.map(([lhs, rhs]) => `${lhs} &= ${rhs}`).join(' \\\\ ')} \\end{aligned}`;
}

const LINT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\+\s*-/, 'plus followed by minus'],
  [/-\s*-/, 'double minus'],
  [/\+\s*\+/, 'double plus'],
  [/(^|[=(,]\s*)\+/, 'leading plus'],
  [/(^|[^\d.}{])1[a-z]/, 'coefficient of 1'],
  [/(^|[^\d.}{])0[a-z]/, 'coefficient of 0'],
  [/NaN|undefined|Infinity|null/, 'bad value'],
];

/** Formatting problems in one math string. An empty array means it is clean. */
export function lintMath(latex: string): string[] {
  return LINT_RULES.filter(([re]) => re.test(latex)).map(([, name]) => `${name}: ${latex}`);
}

/**
 * A coefficient times a parenthesised group, written to follow an earlier term:
 * signedGroup(-2, 'x + 1') -> "- 2(x + 1)", signedGroup(1, 'x + 1') -> "+ (x + 1)".
 */
export function signedGroup(coef: Num, inner: string): string {
  const q = toQ(coef);
  if (q.isZero()) throw new RangeError('signedGroup needs a non-zero coefficient');
  const a = q.abs();
  return `${q.sign() < 0 ? '-' : '+'} ${a.eq(r(1)) ? '' : tex(a)}(${inner})`;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/markup.test.ts tests/unit/format.test.ts`
Expected: PASS, 15 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 37 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/markup.ts src/engine/format.ts tests/unit/markup.test.ts tests/unit/format.test.ts
git commit -m "feat(engine): math text splitting and LaTeX formatting"
```

---

### Task 5: Answer checking with the SAT entry rules

This implements spec §7.3:
- Typed answers allow digits, `.`, `/` and a leading `-`, up to 5 characters (6 if negative).
- Equivalent exact forms all count, so `3/4`, `6/8`, `.75` and `0.75` are all correct for 3/4.
- A non-terminating value's decimal must fill the whole space, truncated or rounded. For 2/3 that means `.6666`, `.6667`, `0.666` or `0.667`.

**Files:**
- Create: `src/engine/answer.ts`
- Test: `tests/unit/answer.test.ts`

**Interfaces:**
- Consumes: `Rational` (Task 3).
- Produces:
  - Types:
    - `type SprAnswer = { kind: 'values'; values: string[] } | { kind: 'interval'; min; max; minInclusive; maxInclusive }`
    - `type Grade = { status: 'invalid'; reason } | { status: 'checked'; correct }`
  - Constants and input helpers:
    - `SPR_HINT`
    - `sprMaxLength(input)`
    - `sanitizeSprTyping(raw)`: used by the answer box while the student types.
  - Checking:
    - `parseSpr(input): Rational | null`
    - `acceptedDecimals(value): string[]`
    - `isEnterable(value): boolean`
    - `checkSpr(answer, input): Grade`

- [ ] **Step 1: Write the failing test**

`tests/unit/answer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  acceptedDecimals,
  checkSpr,
  isEnterable,
  parseSpr,
  sanitizeSprTyping,
  type SprAnswer,
} from '../../src/engine/answer';
import { r } from '../../src/engine/rational';

const values = (...v: string[]): SprAnswer => ({ kind: 'values', values: v });
const correct = (a: SprAnswer, input: string) => checkSpr(a, input);

describe('parseSpr', () => {
  it('accepts integers, fractions and decimals within the length cap', () => {
    expect(parseSpr('3/4')?.toString()).toBe('3/4');
    expect(parseSpr('.75')?.toString()).toBe('3/4');
    expect(parseSpr('-2/3')?.toString()).toBe('-2/3');
    expect(parseSpr('-.6667')?.toString()).toBe('-6667/10000');
    expect(parseSpr('3.')?.toString()).toBe('3');
    expect(parseSpr('-0.5')?.toString()).toBe('-1/2');
    expect(parseSpr('06/8')?.toString()).toBe('3/4');
  });
  it('rejects symbols, mixed numbers and over-long entries', () => {
    for (const bad of [
      '3 1/2',
      '$5',
      '50%',
      '1,000',
      '123456',
      '-1234567',
      '',
      '1/0',
      '--1',
      '1/-2',
    ]) {
      expect(parseSpr(bad), bad).toBeNull();
    }
  });
});

describe('sanitizeSprTyping', () => {
  it('strips disallowed characters and caps length', () => {
    expect(sanitizeSprTyping('$1,2a')).toBe('12');
    expect(sanitizeSprTyping('123456')).toBe('12345');
    expect(sanitizeSprTyping('-123456')).toBe('-12345');
    expect(sanitizeSprTyping('3-4')).toBe('34');
  });
});

describe('checkSpr exact values', () => {
  it('accepts every equivalent form of 3/4', () => {
    for (const input of ['3/4', '6/8', '.75', '0.75']) {
      expect(correct(values('3/4'), input), input).toEqual({ status: 'checked', correct: true });
    }
  });
  it('marks wrong values wrong', () => {
    expect(correct(values('3/4'), '.7')).toEqual({ status: 'checked', correct: false });
  });
  it('returns invalid with a hint for bad input', () => {
    expect(correct(values('3/4'), '3 1/2')).toMatchObject({ status: 'invalid' });
  });
  it('accepts any of several listed values', () => {
    expect(correct(values('2', '-5'), '-5')).toEqual({ status: 'checked', correct: true });
  });
});

describe('checkSpr non-terminating values', () => {
  it('accepts 2/3 only in full-length truncated or rounded form', () => {
    for (const ok of ['2/3', '4/6', '.6666', '.6667', '0.666', '0.667']) {
      expect(correct(values('2/3'), ok), ok).toEqual({ status: 'checked', correct: true });
    }
    for (const no of ['.66', '.67', '0.67', '0.6']) {
      expect(correct(values('2/3'), no), no).toEqual({ status: 'checked', correct: false });
    }
  });
  it('handles negatives', () => {
    for (const ok of ['-2/3', '-.6666', '-.6667', '-0.666', '-0.667']) {
      expect(correct(values('-2/3'), ok), ok).toEqual({ status: 'checked', correct: true });
    }
    expect(correct(values('-2/3'), '-.67')).toEqual({ status: 'checked', correct: false });
  });
});

describe('acceptedDecimals', () => {
  it('matches the worked examples', () => {
    expect(acceptedDecimals(r(2, 3)).sort()).toEqual(['.6666', '.6667', '0.666', '0.667'].sort());
    expect(acceptedDecimals(r(10, 3))).toEqual(['3.333']);
    expect(acceptedDecimals(r(1, 7)).sort()).toEqual(['.1428', '.1429', '0.142', '0.143'].sort());
    expect(acceptedDecimals(r(200, 3)).sort()).toEqual(['66.66', '66.67']);
    expect(acceptedDecimals(r(100000, 3))).toEqual([]);
  });
});

describe('checkSpr intervals', () => {
  const band: SprAnswer = {
    kind: 'interval',
    min: '2',
    max: '5/2',
    minInclusive: false,
    maxInclusive: true,
  };
  it('respects the endpoints', () => {
    expect(correct(band, '2')).toEqual({ status: 'checked', correct: false });
    expect(correct(band, '2.1')).toEqual({ status: 'checked', correct: true });
    expect(correct(band, '5/2')).toEqual({ status: 'checked', correct: true });
    expect(correct(band, '2.51')).toEqual({ status: 'checked', correct: false });
  });
});

describe('isEnterable', () => {
  it('knows what fits in the answer box', () => {
    expect(isEnterable(r(7, 2))).toBe(true);
    expect(isEnterable(r(-1234))).toBe(true);
    expect(isEnterable(r(123456))).toBe(false);
    expect(isEnterable(r(1, 32))).toBe(true);
    expect(isEnterable(r(2, 3))).toBe(true);
    expect(isEnterable(r(100000, 3))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/answer.test.ts`
Expected: FAIL. The test files cannot import `src/engine/answer.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`acceptedDecimals` uses `BigInt`, so long expansions never lose precision.

`src/engine/answer.ts`:

```ts
import { Rational } from './rational';

export type SprAnswer =
  | { kind: 'values'; values: string[] }
  | { kind: 'interval'; min: string; max: string; minInclusive: boolean; maxInclusive: boolean };

export type Grade = { status: 'invalid'; reason: string } | { status: 'checked'; correct: boolean };

export const SPR_HINT = 'Enter numbers only, e.g. 3.5 or 7/2';
const SPR_SHAPE = /^-?(?:\d+\/\d+|\d+\.?\d*|\.\d+)$/;

/** 5 characters for a positive answer, 6 when it starts with a minus sign. */
export function sprMaxLength(input: string): number {
  return input.startsWith('-') ? 6 : 5;
}

/** Cleans text as it is typed: only digits, ".", "/", a leading "-", and the length cap. */
export function sanitizeSprTyping(raw: string): string {
  const neg = raw.trimStart().startsWith('-');
  const body = raw.replace(/[^0-9./]/g, '');
  const out = (neg ? '-' : '') + body;
  return out.slice(0, sprMaxLength(out));
}

/** The exact value of a typed answer, or null when it breaks the entry rules. */
export function parseSpr(input: string): Rational | null {
  const t = input.trim();
  if (t.length === 0 || t.length > sprMaxLength(t) || !SPR_SHAPE.test(t)) return null;
  try {
    return Rational.parse(t);
  } catch {
    return null;
  }
}

/**
 * Decimal entries accepted for a non-terminating value: the value truncated or rounded
 * so that it fills the whole character limit, with or without a leading zero.
 * 2/3 -> [".6666", ".6667", "0.666", "0.667"].
 */
export function acceptedDecimals(value: Rational): string[] {
  const neg = value.sign() < 0;
  const maxLen = neg ? 6 : 5;
  const num = BigInt(Math.abs(value.num));
  const den = BigInt(value.den);
  const whole = num / den;
  const wholeForms = whole === 0n ? ['', '0'] : [whole.toString()];
  const out = new Set<string>();
  for (const w of wholeForms) {
    const digits = maxLen - (neg ? 1 : 0) - w.length - 1;
    if (digits < 1) continue;
    const scale = 10n ** BigInt(digits);
    const truncated = (num * scale) / den;
    const rounded = (num * scale * 2n + den) / (2n * den);
    for (const scaled of [truncated, rounded]) {
      const intPart = scaled / scale;
      const frac = (scaled % scale).toString().padStart(digits, '0');
      const intText = intPart === 0n ? w : intPart.toString();
      const s = `${neg ? '-' : ''}${intText}.${frac}`;
      if (s.length <= maxLen) out.add(s);
    }
  }
  return [...out];
}

/** Can a student type this value within the entry rules (as a fraction, integer or decimal)? */
export function isEnterable(value: Rational): boolean {
  const asFraction = value.toString();
  if (asFraction.length <= sprMaxLength(asFraction)) return true;
  if (value.isTerminating()) {
    const dec = value.toNumber().toString();
    const short = dec.replace(/^(-?)0\./, '$1.');
    return short.length <= sprMaxLength(short);
  }
  return acceptedDecimals(value).length > 0;
}

export function checkSpr(answer: SprAnswer, input: string): Grade {
  const value = parseSpr(input);
  if (value === null) return { status: 'invalid', reason: SPR_HINT };
  const typed = input.trim();
  if (answer.kind === 'interval') {
    const lo = Rational.parse(answer.min);
    const hi = Rational.parse(answer.max);
    const aboveLo = answer.minInclusive ? value.cmp(lo) >= 0 : value.cmp(lo) > 0;
    const belowHi = answer.maxInclusive ? value.cmp(hi) <= 0 : value.cmp(hi) < 0;
    return { status: 'checked', correct: aboveLo && belowHi };
  }
  for (const text of answer.values) {
    const accepted = Rational.parse(text);
    if (value.eq(accepted)) return { status: 'checked', correct: true };
    if (
      typed.includes('.') &&
      !accepted.isTerminating() &&
      acceptedDecimals(accepted).includes(typed)
    ) {
      return { status: 'checked', correct: true };
    }
  }
  return { status: 'checked', correct: false };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/answer.test.ts`
Expected: PASS, 12 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 49 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/answer.ts tests/unit/answer.test.ts
git commit -m "feat(engine): typed-answer checking with SAT entry rules"
```

---

### Task 6: Skill list and problem types

These are the 19 official skills (spec §7.1), the `Problem` shape shared by generated and hand-written problems, the `ProblemType` generator contract, and problem ids. Generated ids encode everything needed to rebuild the problem: `g:<typeId>@<version>:<difficulty>:<format>:<seed>`.

**Files:**
- Create: `src/engine/skills.ts`, `src/engine/problem.ts`
- Test: `tests/unit/skills.test.ts`, `tests/unit/problem.test.ts`

**Interfaces:**
- Consumes: `SprAnswer` (Task 5) and `Rng` (Task 2), both as type-only imports.
- Produces:
  - `skills.ts`:
    - types `DomainId`, `Domain`, `SkillSource`, `SkillId`, `Skill`
    - constants `DOMAINS`, `SKILL_IDS` (as const), `SKILLS`
    - functions `isSkillId(id)`, `getSkill(id)`, `skillsInDomain(domain)`, `testWeight(id)`
  - `problem.ts`:
    - types `Difficulty`, `Format` (`'mcq' | 'spr'`), `ChoiceLetter`, `Choice { text; value? }`, `McqAnswer`, `ProblemId`, `Problem`, `GeneratedBody`, `ProblemType { id; version; skill; supports; generate(rng, difficulty, format); verify(problem) }`, `GeneratedRef`, `BankRef`, `ProblemRef`
    - constants `DIFFICULTIES`, `LETTERS`
    - functions `formatProblemId(ref)`, `parseProblemId(id): ProblemRef | null`

- [ ] **Step 1: Write the failing tests**

`tests/unit/skills.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DOMAINS,
  SKILLS,
  SKILL_IDS,
  isSkillId,
  skillsInDomain,
  testWeight,
} from '../../src/engine/skills';

describe('skills', () => {
  it('has the 19 official skills, once each', () => {
    expect(SKILLS).toHaveLength(19);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(19);
    expect(SKILLS.map((s) => s.id)).toEqual([...SKILL_IDS]);
  });

  it('matches the spec split of 12 generator, 5 mixed, 2 bank', () => {
    const count = (src: string) => SKILLS.filter((s) => s.source === src).length;
    expect([count('generator'), count('mixed'), count('bank')]).toEqual([12, 5, 2]);
  });

  it('has 5 + 3 + 7 + 4 skills per domain', () => {
    expect(DOMAINS.map((d) => skillsInDomain(d.id).length)).toEqual([5, 3, 7, 4]);
  });

  it('test weights sum to 1', () => {
    const total = SKILLS.reduce((sum, s) => sum + testWeight(s.id), 0);
    expect(total).toBeCloseTo(1, 10);
    expect(testWeight('alg.systems')).toBeCloseTo(0.07, 10);
  });

  it('recognises skill ids', () => {
    expect(isSkillId('geo.circles')).toBe(true);
    expect(isSkillId('geo.squares')).toBe(false);
  });
});
```

`tests/unit/problem.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatProblemId, parseProblemId } from '../../src/engine/problem';

describe('problem ids', () => {
  it('round-trips generated ids', () => {
    const id = 'g:alg.systems.solve-system@1:hard:mcq:48213';
    const ref = parseProblemId(id);
    expect(ref).toEqual({
      kind: 'generated',
      typeId: 'alg.systems.solve-system',
      version: 1,
      difficulty: 'hard',
      format: 'mcq',
      seed: 48213,
    });
    expect(formatProblemId(ref!)).toBe(id);
  });

  it('round-trips bank ids', () => {
    expect(parseProblemId('b:psda.claims-007')).toEqual({ kind: 'bank', slug: 'psda.claims-007' });
    expect(formatProblemId({ kind: 'bank', slug: 'psda.claims-007' })).toBe('b:psda.claims-007');
  });

  it('rejects malformed ids', () => {
    for (const bad of [
      '',
      'g:alg.systems.solve-system@1:extreme:mcq:1',
      'g:alg.systems.solve-system@1:hard:essay:1',
      'g:alg.systems.solve-system:hard:mcq:1',
      'g:alg.systems.solve-system@1:hard:mcq:4294967296',
      'b:',
      'b:Has Spaces',
      'x:whatever',
    ]) {
      expect(parseProblemId(bad), bad).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/skills.test.ts tests/unit/problem.test.ts`
Expected: FAIL. The test files cannot import `src/engine/skills.ts` and `src/engine/problem.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/engine/skills.ts`:

```ts
export type DomainId = 'algebra' | 'advanced' | 'psda' | 'geometry';

export interface Domain {
  id: DomainId;
  name: string;
  /** Share of SAT Math questions from this domain. */
  share: number;
}

export const DOMAINS: readonly Domain[] = [
  { id: 'algebra', name: 'Algebra', share: 0.35 },
  { id: 'advanced', name: 'Advanced Math', share: 0.35 },
  { id: 'psda', name: 'Problem-Solving and Data Analysis', share: 0.15 },
  { id: 'geometry', name: 'Geometry and Trigonometry', share: 0.15 },
];

/** Where a skill's practice problems come from (spec §8.1). */
export type SkillSource = 'generator' | 'mixed' | 'bank';

export const SKILL_IDS = [
  'alg.linear-one-var',
  'alg.linear-functions',
  'alg.linear-two-var',
  'alg.systems',
  'alg.inequalities',
  'adv.equivalent-expressions',
  'adv.nonlinear-equations',
  'adv.nonlinear-functions',
  'psda.ratios-rates',
  'psda.percentages',
  'psda.one-var-data',
  'psda.two-var-data',
  'psda.probability',
  'psda.inference',
  'psda.claims',
  'geo.area-volume',
  'geo.lines-angles-triangles',
  'geo.right-triangles-trig',
  'geo.circles',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export interface Skill {
  id: SkillId;
  domain: DomainId;
  name: string;
  source: SkillSource;
}

export const SKILLS: readonly Skill[] = [
  {
    id: 'alg.linear-one-var',
    domain: 'algebra',
    name: 'Linear equations in one variable',
    source: 'generator',
  },
  { id: 'alg.linear-functions', domain: 'algebra', name: 'Linear functions', source: 'generator' },
  {
    id: 'alg.linear-two-var',
    domain: 'algebra',
    name: 'Linear equations in two variables',
    source: 'generator',
  },
  {
    id: 'alg.systems',
    domain: 'algebra',
    name: 'Systems of two linear equations in two variables',
    source: 'generator',
  },
  {
    id: 'alg.inequalities',
    domain: 'algebra',
    name: 'Linear inequalities in one or two variables',
    source: 'generator',
  },
  {
    id: 'adv.equivalent-expressions',
    domain: 'advanced',
    name: 'Equivalent expressions',
    source: 'generator',
  },
  {
    id: 'adv.nonlinear-equations',
    domain: 'advanced',
    name: 'Nonlinear equations in one variable and systems of equations in two variables',
    source: 'generator',
  },
  {
    id: 'adv.nonlinear-functions',
    domain: 'advanced',
    name: 'Nonlinear functions',
    source: 'mixed',
  },
  {
    id: 'psda.ratios-rates',
    domain: 'psda',
    name: 'Ratios, rates, proportional relationships, and units',
    source: 'generator',
  },
  { id: 'psda.percentages', domain: 'psda', name: 'Percentages', source: 'generator' },
  {
    id: 'psda.one-var-data',
    domain: 'psda',
    name: 'One-variable data: distributions and measures of center and spread',
    source: 'mixed',
  },
  {
    id: 'psda.two-var-data',
    domain: 'psda',
    name: 'Two-variable data: models and scatterplots',
    source: 'mixed',
  },
  {
    id: 'psda.probability',
    domain: 'psda',
    name: 'Probability and conditional probability',
    source: 'mixed',
  },
  {
    id: 'psda.inference',
    domain: 'psda',
    name: 'Inference from sample statistics and margin of error',
    source: 'bank',
  },
  {
    id: 'psda.claims',
    domain: 'psda',
    name: 'Evaluating statistical claims: observational studies and experiments',
    source: 'bank',
  },
  { id: 'geo.area-volume', domain: 'geometry', name: 'Area and volume', source: 'generator' },
  {
    id: 'geo.lines-angles-triangles',
    domain: 'geometry',
    name: 'Lines, angles, and triangles',
    source: 'mixed',
  },
  {
    id: 'geo.right-triangles-trig',
    domain: 'geometry',
    name: 'Right triangles and trigonometry',
    source: 'generator',
  },
  { id: 'geo.circles', domain: 'geometry', name: 'Circles', source: 'generator' },
];

export function isSkillId(id: string): id is SkillId {
  return (SKILL_IDS as readonly string[]).includes(id);
}

export function getSkill(id: SkillId): Skill {
  const skill = SKILLS.find((s) => s.id === id);
  if (!skill) throw new Error(`Unknown skill ${id}`);
  return skill;
}

export function skillsInDomain(domain: DomainId): Skill[] {
  return SKILLS.filter((s) => s.domain === domain);
}

/** A skill's expected share of test questions: its domain's share split evenly across the domain's skills. */
export function testWeight(id: SkillId): number {
  const skill = getSkill(id);
  const domain = DOMAINS.find((d) => d.id === skill.domain) as Domain;
  return domain.share / skillsInDomain(skill.domain).length;
}
```

`src/engine/problem.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/skills.test.ts tests/unit/problem.test.ts`
Expected: PASS, 8 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 57 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/skills.ts src/engine/problem.ts tests/unit/skills.test.ts tests/unit/problem.test.ts
git commit -m "feat(engine): skill taxonomy, problem types and ids"
```

---

### Task 7: Problem building and shared generator helpers

`build.ts` turns a type, difficulty, format and seed into a `Problem`. `generateVerified` retries until `verify()` passes (at most 20 tries) and never returns a problem that failed verification (spec §8.2). The shared helpers are:
- a 2x2 linear solver, used by `verify()` functions;
- distractors built from named mistakes;
- the choice builders.

**Files:**
- Create: `src/engine/build.ts`, `src/engine/generators/shared/numbers.ts`, `src/engine/generators/shared/linear2.ts`, `src/engine/generators/shared/choices.ts`
- Test: `tests/unit/build.test.ts`, `tests/unit/linear2.test.ts`, `tests/unit/choices.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4 and 6.
- Produces:
  - `build.ts`: `buildProblem(type, difficulty, format, seed): Problem`, `generateVerified(type, difficulty, format, rng): Problem | null`, `MAX_TRIES = 20`.
  - `numbers.ts`: `nonZeroInt(rng, lo, hi)`.
  - `linear2.ts`:
    - types `LinEq { a; b; c }` (meaning `ax + by = c`), `Solution2`, `LinEqMeta`
    - `lin(a, b, c)`, `solve2(e1, e2)`, `eqToMeta`, `eqFromMeta`, `eqTex`, `scaleEq`
  - `choices.ts`:
    - types `Candidate { value: Rational; note }`, `NiceRule`, `BuiltChoices`
    - `isNice`, `pickDistractors(answer, candidates, rule?)`, `fallbackCandidates(answer, rng)`
    - `numericChoices` (ascending order), `shuffledChoices(rng, …)`, `fixedChoices`
    - `numericAnswer(format, answer, distractors)`, `answerValue(problem): string | null`

- [ ] **Step 1: Write the failing tests**

`tests/unit/build.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProblem, generateVerified, MAX_TRIES } from '../../src/engine/build';
import type { ProblemType } from '../../src/engine/problem';
import { createRng } from '../../src/engine/rng';

afterEach(() => vi.restoreAllMocks());

const fake: ProblemType = {
  id: 'test.fake',
  version: 3,
  skill: 'alg.systems',
  supports: { easy: ['mcq', 'spr'], medium: ['spr'], hard: [] },
  generate: (rng) => ({
    stem: `n = ${rng.int(1, 1000)}`,
    answer: { kind: 'values', values: ['1'] },
    solution: ['s'],
  }),
  verify: () => true,
};

describe('buildProblem', () => {
  it('fills in id, skill, difficulty, format and source', () => {
    const p = buildProblem(fake, 'easy', 'spr', 42);
    expect(p.id).toBe('g:test.fake@3:easy:spr:42');
    expect([p.skill, p.difficulty, p.format, p.source]).toEqual([
      'alg.systems',
      'easy',
      'spr',
      'generated',
    ]);
  });
  it('is deterministic for a seed', () => {
    expect(buildProblem(fake, 'easy', 'mcq', 7)).toEqual(buildProblem(fake, 'easy', 'mcq', 7));
    expect(buildProblem(fake, 'easy', 'mcq', 7).stem).not.toBe(
      buildProblem(fake, 'easy', 'mcq', 8).stem,
    );
  });
  it('refuses difficulty and format pairs the type does not offer', () => {
    expect(() => buildProblem(fake, 'medium', 'mcq', 1)).toThrow('does not offer medium mcq');
    expect(() => buildProblem(fake, 'hard', 'spr', 1)).toThrow();
  });
});

describe('generateVerified', () => {
  it('skips seeds that fail verify()', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const flaky: ProblemType = { ...fake, verify: () => ++calls > 3 };
    expect(generateVerified(flaky, 'easy', 'mcq', createRng(1))).not.toBeNull();
    expect(calls).toBe(4);
  });
  it('gives up after MAX_TRIES failures', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      generateVerified({ ...fake, verify: () => false }, 'easy', 'mcq', createRng(1)),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(MAX_TRIES);
  });
  it('treats a throwing generator as a failed seed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing: ProblemType = {
      ...fake,
      generate: () => {
        throw new Error('boom');
      },
    };
    expect(generateVerified(throwing, 'easy', 'mcq', createRng(1))).toBeNull();
  });
});
```

`tests/unit/linear2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  eqFromMeta,
  eqTex,
  eqToMeta,
  lin,
  scaleEq,
  solve2,
} from '../../src/engine/generators/shared/linear2';
import { r } from '../../src/engine/rational';

describe('solve2', () => {
  it('solves a system with one solution', () => {
    const sol = solve2(lin(2, 3, 12), lin(1, -1, 1));
    expect(sol.kind).toBe('one');
    if (sol.kind === 'one') {
      expect(sol.x.toString()).toBe('3');
      expect(sol.y.toString()).toBe('2');
    }
  });
  it('handles fractional solutions', () => {
    const sol = solve2(lin(2, 0, 1), lin(0, 3, 1));
    expect(sol).toEqual({ kind: 'one', x: r(1, 2), y: r(1, 3) });
  });
  it('detects parallel lines', () => {
    expect(solve2(lin(1, 2, 3), lin(2, 4, 7)).kind).toBe('none');
  });
  it('detects the same line', () => {
    expect(solve2(lin(1, 2, 3), lin(-2, -4, -6)).kind).toBe('infinite');
  });
});

describe('equation helpers', () => {
  it('round-trips meta', () => {
    const e = lin(r(1, 2), -3, 4);
    expect(eqFromMeta(eqToMeta(e))).toEqual(e);
    expect(() => eqFromMeta(['1', '2'])).toThrow(TypeError);
  });
  it('formats and scales', () => {
    expect(eqTex(lin(1, -1, 5))).toBe('x - y = 5');
    expect(eqTex(scaleEq(lin(1, -1, 5), -2))).toBe('-2x + 2y = -10');
  });
});
```

`tests/unit/choices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  answerValue,
  fallbackCandidates,
  fixedChoices,
  isNice,
  numericAnswer,
  numericChoices,
  pickDistractors,
  shuffledChoices,
} from '../../src/engine/generators/shared/choices';
import type { Problem } from '../../src/engine/problem';
import { r } from '../../src/engine/rational';
import { createRng } from '../../src/engine/rng';

describe('isNice', () => {
  it('applies the default and custom rules', () => {
    expect(isNice(r(7, 2))).toBe(true);
    expect(isNice(r(1, 13))).toBe(false);
    expect(isNice(r(10000))).toBe(false);
    expect(isNice(r(7, 2), { integerOnly: true })).toBe(false);
    expect(isNice(r(0), { min: 1 })).toBe(false);
  });
});

describe('pickDistractors', () => {
  it('skips the answer, duplicates and non-nice values, in order', () => {
    const picked = pickDistractors(r(5), [
      { value: r(5), note: 'same as answer' },
      { value: r(1, 13), note: 'ugly' },
      { value: r(3), note: 'a' },
      { value: r(3), note: 'duplicate' },
      { value: r(-5), note: 'b' },
      { value: r(6), note: 'c' },
      { value: r(7), note: 'unused' },
    ]);
    expect(picked.map((c) => c.note)).toEqual(['a', 'b', 'c']);
  });
  it('throws when fewer than three survive', () => {
    expect(() => pickDistractors(r(0), [{ value: r(0), note: 'x' }])).toThrow();
  });
  it('fallback offsets vary with the seed', () => {
    const orders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        fallbackCandidates(r(10), createRng(seed))
          .slice(1, 3)
          .map((c) => c.value.toString())
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
  it('fallbacks give enough options even for 0', () => {
    expect(pickDistractors(r(0), fallbackCandidates(r(0), createRng(1)))).toHaveLength(3);
  });
});

describe('numericChoices', () => {
  it('sorts ascending and tracks the answer and notes', () => {
    const built = numericChoices(r(2), [
      { value: r(9), note: 'nine' },
      { value: r(-1), note: 'minus one' },
      { value: r(1, 2), note: 'half' },
    ]);
    expect(built.choices.map((c) => c.value)).toEqual(['-1', '1/2', '2', '9']);
    expect(built.choices[1].text).toBe('$\\frac{1}{2}$');
    expect(built.answer).toEqual({ kind: 'choice', index: 2 });
    expect(built.distractorNotes).toEqual({ A: 'minus one', B: 'half', D: 'nine' });
  });
});

describe('shuffledChoices and fixedChoices', () => {
  it('shuffles deterministically and keeps exactly one correct', () => {
    const make = () =>
      shuffledChoices(createRng(4), { text: 'right' }, [
        { text: 'w1', note: 'n1' },
        { text: 'w2', note: 'n2' },
        { text: 'w3', note: 'n3' },
      ]);
    const a = make();
    expect(a).toEqual(make());
    expect(a.choices[a.answer.index].text).toBe('right');
    expect(Object.keys(a.distractorNotes)).toHaveLength(3);
  });
  it('rejects zero or two correct choices', () => {
    const wrong = { text: 'w', note: 'n' };
    expect(() => fixedChoices([wrong, wrong, wrong, wrong])).toThrow();
    expect(() =>
      fixedChoices([{ text: 'a', note: null }, { text: 'b', note: null }, wrong, wrong]),
    ).toThrow();
  });
});

describe('numericAnswer and answerValue', () => {
  it('builds spr answers without choices', () => {
    expect(numericAnswer('spr', r(7, 2), () => [])).toEqual({
      answer: { kind: 'values', values: ['7/2'] },
    });
  });
  it('reads the correct value back from either format', () => {
    const mcq = numericAnswer('mcq', r(4), () =>
      fallbackCandidates(r(4), createRng(1)).slice(0, 3),
    );
    const problem = { ...mcq, stem: '', solution: [] } as unknown as Problem;
    expect(answerValue(problem)).toBe('4');
    const spr = { answer: { kind: 'values', values: ['7/2'] } } as unknown as Problem;
    expect(answerValue(spr)).toBe('7/2');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/build.test.ts tests/unit/linear2.test.ts tests/unit/choices.test.ts`
Expected: FAIL. The test files cannot import the new modules because it does not exist yet.

- [ ] **Step 3: Implement**

`src/engine/build.ts`:

```ts
import {
  formatProblemId,
  type Difficulty,
  type Format,
  type Problem,
  type ProblemType,
} from './problem';
import { MAX_SEED, createRng, type Rng } from './rng';

/** Deterministically builds the problem for a type, difficulty, format and seed. */
export function buildProblem(
  type: ProblemType,
  difficulty: Difficulty,
  format: Format,
  seed: number,
): Problem {
  if (!type.supports[difficulty].includes(format)) {
    throw new Error(`${type.id} does not offer ${difficulty} ${format}`);
  }
  const body = type.generate(createRng(seed), difficulty, format);
  return {
    ...body,
    id: formatProblemId({
      kind: 'generated',
      typeId: type.id,
      version: type.version,
      difficulty,
      format,
      seed,
    }),
    skill: type.skill,
    difficulty,
    format,
    source: 'generated',
  };
}

export const MAX_TRIES = 20;

/**
 * A fresh problem that passed its type's verify(). Seeds that throw or fail verification are
 * skipped (and logged). Returns null after MAX_TRIES failures.
 */
export function generateVerified(
  type: ProblemType,
  difficulty: Difficulty,
  format: Format,
  rng: Rng,
): Problem | null {
  for (let i = 0; i < MAX_TRIES; i++) {
    const seed = rng.int(0, MAX_SEED);
    try {
      const problem = buildProblem(type, difficulty, format, seed);
      if (type.verify(problem)) return problem;
      console.warn(`[generator] verify() rejected ${problem.id}`);
    } catch (err) {
      console.warn(`[generator] ${type.id} failed on seed ${seed}`, err);
    }
  }
  return null;
}
```

`src/engine/generators/shared/numbers.ts`:

```ts
import type { Rng } from '../../rng';

/** A random integer in [lo, hi] that is not 0. */
export function nonZeroInt(rng: Rng, lo: number, hi: number): number {
  const options: number[] = [];
  for (let v = lo; v <= hi; v++) if (v !== 0) options.push(v);
  return rng.pick(options);
}
```

`src/engine/generators/shared/linear2.ts`:

```ts
import { linear, tex } from '../../format';
import { Rational, r } from '../../rational';

/** The equation a·x + b·y = c. */
export interface LinEq {
  a: Rational;
  b: Rational;
  c: Rational;
}

export type Solution2 =
  { kind: 'one'; x: Rational; y: Rational } | { kind: 'none' } | { kind: 'infinite' };

type N = Rational | number;
const q = (n: N): Rational => (typeof n === 'number' ? r(n) : n);

export const lin = (a: N, b: N, c: N): LinEq => ({ a: q(a), b: q(b), c: q(c) });

/** Solves a 2x2 linear system by Cramer's rule and classifies the no-solution and same-line cases. */
export function solve2(e1: LinEq, e2: LinEq): Solution2 {
  const det = e1.a.mul(e2.b).sub(e2.a.mul(e1.b));
  if (!det.isZero()) {
    const x = e1.c.mul(e2.b).sub(e2.c.mul(e1.b)).div(det);
    const y = e1.a.mul(e2.c).sub(e2.a.mul(e1.c)).div(det);
    return { kind: 'one', x, y };
  }
  const ac = e1.a.mul(e2.c).sub(e2.a.mul(e1.c));
  const bc = e1.b.mul(e2.c).sub(e2.b.mul(e1.c));
  return ac.isZero() && bc.isZero() ? { kind: 'infinite' } : { kind: 'none' };
}

/** JSON-safe form for problem meta. */
export type LinEqMeta = [string, string, string];

export const eqToMeta = (e: LinEq): LinEqMeta => [e.a.toString(), e.b.toString(), e.c.toString()];

export function eqFromMeta(value: unknown): LinEq {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((v) => typeof v === 'string')) {
    throw new TypeError('Bad equation meta');
  }
  const [a, b, c] = value as LinEqMeta;
  return lin(Rational.parse(a), Rational.parse(b), Rational.parse(c));
}

/** LaTeX "ax + by = c". */
export const eqTex = (e: LinEq): string =>
  `${linear([
    [e.a, 'x'],
    [e.b, 'y'],
  ])} = ${tex(e.c)}`;

export const scaleEq = (e: LinEq, k: N): LinEq => lin(e.a.mul(q(k)), e.b.mul(q(k)), e.c.mul(q(k)));
```

`src/engine/generators/shared/choices.ts`:

```ts
import { tex } from '../../format';
import type {
  Choice,
  ChoiceLetter,
  Format,
  GeneratedBody,
  McqAnswer,
  Problem,
} from '../../problem';
import { LETTERS } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';

/** A wrong value and the mistake that produces it. */
export interface Candidate {
  value: Rational;
  note: string;
}

export interface NiceRule {
  /** Only whole numbers (e.g. counts of objects). */
  integerOnly?: boolean;
  /** Smallest allowed value, inclusive. */
  min?: number;
  /** Largest allowed absolute value. Default 9999. */
  maxAbs?: number;
  /** Largest allowed denominator. Default 12. */
  maxDen?: number;
}

export function isNice(v: Rational, rule: NiceRule = {}): boolean {
  if (rule.integerOnly === true && !v.isInteger()) return false;
  if (v.den > (rule.maxDen ?? 12)) return false;
  if (Math.abs(v.toNumber()) > (rule.maxAbs ?? 9999)) return false;
  if (rule.min !== undefined && v.toNumber() < rule.min) return false;
  return true;
}

/**
 * The first three candidates that differ from the answer and from each other and pass the rule.
 * List a type's named mistakes first and fallbackCandidates() last.
 * Throws when fewer than three survive; the harness then moves on to the next seed.
 */
export function pickDistractors(
  answer: Rational,
  candidates: readonly Candidate[],
  rule: NiceRule = {},
): Candidate[] {
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (out.length === 3) break;
    if (c.value.eq(answer) || out.some((o) => o.value.eq(c.value)) || !isNice(c.value, rule))
      continue;
    out.push(c);
  }
  if (out.length < 3) throw new Error('Not enough distinct distractors');
  return out;
}

/**
 * Common slips, used after a type's own named mistakes. The offsets are shuffled so the
 * correct answer is not always the middle of a run like 37, 38, 39.
 */
export function fallbackCandidates(answer: Rational, rng: Rng): Candidate[] {
  const slip = 'An arithmetic slip: redo the last computation carefully.';
  return [
    { value: answer.neg(), note: 'A sign error: the size is right but the sign is wrong.' },
    ...rng.shuffle([1, -1, 2, -2, 3, -3]).map((k) => ({ value: answer.add(r(k)), note: slip })),
    { value: answer.mul(r(2)), note: 'The value was doubled somewhere along the way.' },
  ];
}

export interface BuiltChoices {
  choices: [Choice, Choice, Choice, Choice];
  answer: McqAnswer;
  distractorNotes: Partial<Record<ChoiceLetter, string>>;
}

interface Item {
  text: string;
  value?: string;
  /** null marks the correct choice. */
  note: string | null;
}

function assemble(items: readonly Item[]): BuiltChoices {
  if (items.length !== 4) throw new Error('A multiple-choice problem needs exactly 4 choices');
  const correct = items.flatMap((it, i) => (it.note === null ? [i] : []));
  if (correct.length !== 1) throw new Error('Exactly one choice must be correct');
  const distractorNotes: Partial<Record<ChoiceLetter, string>> = {};
  items.forEach((it, i) => {
    if (it.note !== null) distractorNotes[LETTERS[i] as ChoiceLetter] = it.note;
  });
  const choices = items.map((it) =>
    it.value === undefined ? { text: it.text } : { text: it.text, value: it.value },
  ) as [Choice, Choice, Choice, Choice];
  return {
    choices,
    answer: { kind: 'choice', index: correct[0] as 0 | 1 | 2 | 3 },
    distractorNotes,
  };
}

/** Four numeric choices in ascending order. */
export function numericChoices(answer: Rational, distractors: readonly Candidate[]): BuiltChoices {
  const items = [
    { value: answer, note: null as string | null },
    ...distractors.map((d) => ({ value: d.value, note: d.note as string | null })),
  ].sort((p, q) => p.value.cmp(q.value));
  return assemble(
    items.map((c) => ({ text: `$${tex(c.value)}$`, value: c.value.toString(), note: c.note })),
  );
}

/** Four text choices in seeded random order. */
export function shuffledChoices(
  rng: Rng,
  correct: { text: string; value?: string },
  distractors: ReadonlyArray<{ text: string; value?: string; note: string }>,
): BuiltChoices {
  return assemble(rng.shuffle<Item>([{ ...correct, note: null }, ...distractors]));
}

/** Four text choices in a fixed, meaningful order. Give the correct one note: null. */
export function fixedChoices(items: readonly Item[]): BuiltChoices {
  return assemble(items);
}

/** The answer fields for a numeric answer, in either format. */
export function numericAnswer(
  format: Format,
  answer: Rational,
  distractors: () => Candidate[],
): Pick<GeneratedBody, 'choices' | 'answer' | 'distractorNotes'> {
  if (format === 'spr') return { answer: { kind: 'values', values: [answer.toString()] } };
  return numericChoices(answer, distractors());
}

/** The correct value recorded on a problem: the correct choice's value, or the first typed value. */
export function answerValue(problem: Problem): string | null {
  if (problem.answer.kind === 'choice')
    return problem.choices?.[problem.answer.index]?.value ?? null;
  if (problem.answer.kind === 'values') return problem.answer.values[0] ?? null;
  return null;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/build.test.ts tests/unit/linear2.test.ts tests/unit/choices.test.ts`
Expected: PASS, 22 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 79 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/build.ts src/engine/generators/shared \
  tests/unit/build.test.ts tests/unit/linear2.test.ts tests/unit/choices.test.ts
git commit -m "feat(engine): problem building and shared generator helpers"
```

---

### Task 8: First generator: solving a system, plus the registry and generator quality gates

This adds `alg.systems.solve-system`:
- **Easy** is substitution: one equation is already solved for y.
- **Medium** is elimination.
- **Hard** swaps coefficients, so adding or subtracting the equations gives x + y or x − y directly.

It also adds the registry and four quality gates. Every later generator gets the gates for free once it is registered:

1. **Soak test:** every variant on seeds 1 to 5,000. It checks `verify()`, the shape, KaTeX rendering and `lintMath`.
2. **Tamper test:** `verify()` must reject a wrong recorded answer.
3. **Golden files:** seeds 1 to 5 are saved. If output changes without a version bump, the test fails.
4. **Registry tests.**

**Files:**
- Create: `src/engine/generators/algebra/systems-solve.ts`, `src/engine/registry.ts`
- Create: `tests/helpers/problem-issues.ts`, `tests/soak/generators.test.ts`, `tests/unit/golden.test.ts`, `tests/unit/generators.test.ts`
- Test: `tests/unit/systems-solve.test.ts`, `tests/unit/registry.test.ts`
- Generated: `tests/golden/alg.systems.solve-system.json`, written by `npm run golden:update`

**Interfaces:**
- Consumes: Tasks 2 to 7.
- Produces:
  - `systemsSolve: ProblemType` with id `'alg.systems.solve-system'`, version 1. It supports mcq and spr at every difficulty. Its `meta` holds `{ e1, e2, ask }`.
  - `registry.ts`:
    - `PROBLEM_TYPES`, `getProblemType(id)`, `problemTypesForSkill(skill)`
    - `availableSkills()`, `isSkillAvailable(skill)`
    - `problemFromId(id): { problem; updated } | null`
    - `describeProblemId(id): { skill; difficulty } | null`
  - `problemIssues(problem): string[]` in `tests/helpers/problem-issues.ts`.

- [ ] **Step 1: Write the failing tests and the quality gates**

`tests/unit/systems-solve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { eqFromMeta, solve2 } from '../../src/engine/generators/shared/linear2';
import { systemsSolve } from '../../src/engine/generators/algebra/systems-solve';
import { Rational } from '../../src/engine/rational';

const build = (d: 'easy' | 'medium' | 'hard', f: 'mcq' | 'spr', seed: number) =>
  buildProblem(systemsSolve, d, f, seed);

describe('alg.systems.solve-system', () => {
  it('offers every difficulty in both formats', () => {
    expect(systemsSolve.supports).toEqual({
      easy: ['mcq', 'spr'],
      medium: ['mcq', 'spr'],
      hard: ['mcq', 'spr'],
    });
  });

  it('easy problems give one equation already solved for y', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(build('easy', 'mcq', seed).stem).toMatch(/^\$\$\\begin\{aligned\} y &= /);
    }
  });

  it('hard problems ask for x + y or x - y with swapped coefficients', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = build('hard', 'spr', seed);
      expect(p.stem).toMatch(/What is the value of \$x [+-] y\$\?$/);
      const [e1, e2] = [eqFromMeta(p.meta?.['e1']), eqFromMeta(p.meta?.['e2'])];
      expect(e1.a.eq(e2.b) && e1.b.eq(e2.a)).toBe(true);
    }
  });

  it('records the true solution as the answer', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = build('medium', 'spr', seed);
      const sol = solve2(eqFromMeta(p.meta?.['e1']), eqFromMeta(p.meta?.['e2']));
      expect(sol.kind).toBe('one');
      if (sol.kind === 'one') {
        const want = p.meta?.['ask'] === 'x' ? sol.x : sol.y;
        expect(Rational.parse(answerValue(p)!).eq(want)).toBe(true);
      }
    }
  });

  it('explains every wrong choice', () => {
    const p = build('easy', 'mcq', 3);
    expect(Object.keys(p.distractorNotes ?? {})).toHaveLength(3);
  });

  it('preloads both equations for Desmos', () => {
    expect(build('medium', 'mcq', 4).desmos).toHaveLength(2);
  });
});
```

`tests/unit/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PROBLEM_TYPES,
  availableSkills,
  describeProblemId,
  getProblemType,
  isSkillAvailable,
  problemFromId,
  problemTypesForSkill,
} from '../../src/engine/registry';

describe('registry', () => {
  it('has unique type ids', () => {
    expect(new Set(PROBLEM_TYPES.map((t) => t.id)).size).toBe(PROBLEM_TYPES.length);
  });

  it('finds types by id and skill', () => {
    expect(getProblemType('alg.systems.solve-system')?.skill).toBe('alg.systems');
    expect(getProblemType('nope')).toBeUndefined();
    expect(problemTypesForSkill('alg.systems').length).toBeGreaterThan(0);
    expect(problemTypesForSkill('geo.circles')).toEqual([]);
  });

  it('lists alg.systems as the only available skill in Phase 1', () => {
    expect(availableSkills()).toEqual(['alg.systems']);
    expect(isSkillAvailable('alg.systems')).toBe(true);
    expect(isSkillAvailable('geo.circles')).toBe(false);
  });

  it('rebuilds problems from ids and flags old versions', () => {
    const current = problemFromId('g:alg.systems.solve-system@1:easy:spr:5');
    expect(current?.updated).toBe(false);
    const old = problemFromId('g:alg.systems.solve-system@0:easy:spr:5');
    expect(old?.updated).toBe(true);
    expect(old?.problem).toEqual(current?.problem);
  });

  it('returns null for ids it cannot rebuild', () => {
    expect(problemFromId('g:no.such.type@1:easy:spr:5')).toBeNull();
    expect(problemFromId('b:psda.claims-001')).toBeNull();
    expect(problemFromId('garbage')).toBeNull();
  });

  it('describes an id without building it', () => {
    expect(describeProblemId('g:alg.systems.solve-system@1:hard:spr:9')).toEqual({
      skill: 'alg.systems',
      difficulty: 'hard',
    });
    expect(describeProblemId('g:gone.type@1:hard:spr:9')).toBeNull();
    expect(describeProblemId('b:anything')).toBeNull();
  });
});
```

`tests/helpers/problem-issues.ts`:

```ts
import katex from 'katex';
import { isEnterable } from '../../src/engine/answer';
import { lintMath } from '../../src/engine/format';
import { splitMath } from '../../src/engine/markup';
import { LETTERS, type Problem } from '../../src/engine/problem';
import { Rational } from '../../src/engine/rational';

const renderedOk = new Set<string>();
const BAD_TEXT = /NaN|undefined|Infinity|\bnull\b|\[object/;

function textIssues(label: string, source: string): string[] {
  let segments;
  try {
    segments = splitMath(source);
  } catch (err) {
    return [`${label}: ${(err as Error).message}`];
  }
  const issues: string[] = [];
  for (const seg of segments) {
    if (seg.kind === 'text') {
      if (BAD_TEXT.test(seg.value)) issues.push(`${label}: bad text "${seg.value}"`);
      continue;
    }
    issues.push(...lintMath(seg.value).map((m) => `${label}: ${m}`));
    const key = `${seg.display ? 'D' : 'I'}${seg.value}`;
    if (renderedOk.has(key)) continue;
    try {
      katex.renderToString(seg.value, {
        throwOnError: true,
        displayMode: seg.display,
        strict: 'error',
      });
      renderedOk.add(key);
    } catch (err) {
      issues.push(`${label}: KaTeX ${(err as Error).message}`);
    }
  }
  return issues;
}

/** Everything wrong with a problem's shape and rendering. An empty array means it passes. */
export function problemIssues(p: Problem): string[] {
  const issues: string[] = [];
  if (p.stem.trim() === '') issues.push('empty stem');
  if (p.solution.length === 0) issues.push('no solution steps');
  issues.push(...textIssues('stem', p.stem));
  p.solution.forEach((step, i) => issues.push(...textIssues(`solution[${i}]`, step)));

  if (p.format === 'mcq') {
    if (p.answer.kind !== 'choice') issues.push('mcq without a choice answer');
    const choices = p.choices ?? [];
    if (choices.length !== 4) issues.push(`expected 4 choices, got ${choices.length}`);
    if (new Set(choices.map((c) => c.text)).size !== choices.length)
      issues.push('duplicate choice text');
    const values = choices.flatMap((c) => (c.value === undefined ? [] : [c.value]));
    if (new Set(values).size !== values.length) issues.push('duplicate choice values');
    choices.forEach((c, i) => issues.push(...textIssues(`choice ${LETTERS[i]}`, c.text)));
    if (p.answer.kind === 'choice') {
      const wrong = LETTERS.filter((_, i) => i !== (p.answer as { index: number }).index);
      const noted = Object.keys(p.distractorNotes ?? {}).sort();
      if (noted.join() !== [...wrong].sort().join())
        issues.push(`distractor notes for ${noted} but wrong choices are ${wrong}`);
    }
    for (const [letter, note] of Object.entries(p.distractorNotes ?? {})) {
      issues.push(...textIssues(`note ${letter}`, note));
    }
  } else {
    if (p.answer.kind === 'choice') issues.push('spr with a choice answer');
    if (p.choices !== undefined) issues.push('spr with choices');
    if (p.answer.kind === 'values') {
      if (p.answer.values.length === 0) issues.push('spr with no accepted values');
      for (const v of p.answer.values) {
        try {
          if (!isEnterable(Rational.parse(v)))
            issues.push(`answer ${v} cannot be typed within the entry rules`);
        } catch {
          issues.push(`answer ${v} is not a number`);
        }
      }
    }
  }
  return issues;
}
```

`tests/unit/generators.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { DIFFICULTIES, type Problem } from '../../src/engine/problem';
import { Rational, r } from '../../src/engine/rational';
import { PROBLEM_TYPES } from '../../src/engine/registry';

/** The same problem with a wrong answer recorded. */
function tamper(p: Problem): Problem {
  if (p.answer.kind === 'choice') {
    return { ...p, answer: { kind: 'choice', index: ((p.answer.index + 1) % 4) as 0 | 1 | 2 | 3 } };
  }
  if (p.answer.kind === 'values') {
    const wrong = Rational.parse(p.answer.values[0] as string).add(r(1));
    return { ...p, answer: { kind: 'values', values: [wrong.toString()] } };
  }
  return p;
}

describe.each(PROBLEM_TYPES.map((t) => [t.id, t] as const))('%s', (_id, type) => {
  const variants = DIFFICULTIES.flatMap((d) => type.supports[d].map((f) => [d, f] as const));
  it.each(variants)(
    'verify() accepts %s %s problems and rejects a wrong recorded answer',
    (d, f) => {
      for (let seed = 1; seed <= 20; seed++) {
        const problem = buildProblem(type, d, f, seed);
        expect(type.verify(problem), `seed ${seed}`).toBe(true);
        expect(type.verify(tamper(problem)), `tampered seed ${seed}`).toBe(false);
      }
    },
  );
});
```

`tests/soak/generators.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/engine/problem';
import { buildProblem } from '../../src/engine/build';
import { PROBLEM_TYPES } from '../../src/engine/registry';
import { problemIssues } from '../helpers/problem-issues';

const SEEDS = Number(process.env['SOAK_SEEDS'] ?? 5000);

describe.each(PROBLEM_TYPES.map((t) => [t.id, t] as const))('%s', (_id, type) => {
  const variants = DIFFICULTIES.flatMap((d) => type.supports[d].map((f) => [d, f] as const));
  it.each(variants)(`%s %s passes on seeds 1-${SEEDS}`, (difficulty, format) => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS && failures.length < 5; seed++) {
      let problem;
      try {
        problem = buildProblem(type, difficulty, format, seed);
      } catch (err) {
        failures.push(`seed ${seed}: generate threw ${(err as Error).message}`);
        continue;
      }
      if (!type.verify(problem)) failures.push(`seed ${seed}: verify() failed`);
      const issues = problemIssues(problem);
      if (issues.length > 0) failures.push(`seed ${seed}: ${issues.join(' | ')}`);
    }
    expect(failures).toEqual([]);
  });
});
```

`tests/unit/golden.test.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, type Problem } from '../../src/engine/problem';
import { buildProblem } from '../../src/engine/build';
import { PROBLEM_TYPES } from '../../src/engine/registry';

const DIR = join(process.cwd(), 'tests', 'golden');
const UPDATE = process.env['UPDATE_GOLDEN'] === '1';

interface GoldenFile {
  typeId: string;
  version: number;
  problems: Record<string, Problem>;
}

describe.each(PROBLEM_TYPES.map((t) => [t.id, t] as const))('golden %s', (_id, type) => {
  it('matches its golden file', () => {
    const problems: Record<string, Problem> = {};
    for (const d of DIFFICULTIES) {
      for (const f of type.supports[d]) {
        for (let seed = 1; seed <= 5; seed++)
          problems[`${d}:${f}:${seed}`] = buildProblem(type, d, f, seed);
      }
    }
    const current: GoldenFile = JSON.parse(
      JSON.stringify({ typeId: type.id, version: type.version, problems }),
    );
    const file = join(DIR, `${type.id}.json`);

    if (UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    if (!existsSync(file))
      throw new Error(`No golden file for ${type.id}. Run: npm run golden:update`);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
    if (saved.version !== type.version) {
      throw new Error(
        `${type.id} is version ${type.version} but its golden file is version ${saved.version}. Run: npm run golden:update`,
      );
    }
    expect(
      current.problems,
      `${type.id} output changed but its version did not. Bump the version, then run: npm run golden:update`,
    ).toEqual(saved.problems);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/systems-solve.test.ts tests/unit/registry.test.ts`
Expected: FAIL. The test files cannot import `systems-solve.ts` and `registry.ts` because it does not exist yet.

- [ ] **Step 3: Implement the generator**

All question and solution wording here is original. Keep it that way.

`src/engine/generators/algebra/systems-solve.ts`:

```ts
import { linear, signedGroup, system, tex } from '../../format';
import type { Difficulty, Format, GeneratedBody, Problem, ProblemType } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';
import {
  answerValue,
  fallbackCandidates,
  numericAnswer,
  pickDistractors,
  type Candidate,
} from '../shared/choices';
import { eqFromMeta, eqTex, eqToMeta, lin, solve2, type LinEq } from '../shared/linear2';
import { nonZeroInt } from '../shared/numbers';

type Ask = 'x' | 'y' | 'x+y' | 'x-y';
const ASK_TEX: Record<Ask, string> = { x: 'x', y: 'y', 'x+y': 'x + y', 'x-y': 'x - y' };

function question(ask: Ask): string {
  return `The solution to the given system of equations is $(x, y)$. What is the value of $${ASK_TEX[ask]}$?`;
}

function body(
  format: Format,
  stemSystem: string,
  ask: Ask,
  answer: Rational,
  e1: LinEq,
  e2: LinEq,
  solution: string[],
  distractors: () => Candidate[],
): GeneratedBody {
  return {
    stem: `$$${stemSystem}$$\n\n${question(ask)}`,
    ...numericAnswer(format, answer, distractors),
    solution,
    desmos: [eqTex(e1), eqTex(e2)],
    meta: { e1: eqToMeta(e1), e2: eqToMeta(e2), ask },
  };
}

/** Easy: one equation already solved for y, so substitution is the natural move. */
function easy(rng: Rng, format: Format): GeneratedBody {
  const x0 = nonZeroInt(rng, -8, 8);
  const y0 = rng.int(-8, 8);
  const m = nonZeroInt(rng, -4, 4);
  const b = y0 - m * x0;
  const p = rng.int(1, 5);
  let q = nonZeroInt(rng, -5, 5);
  while (p + q * m === 0) q = nonZeroInt(rng, -5, 5);
  const c = p * x0 + q * y0;
  const k = p + q * m;
  const ask: Ask = rng.pick(['x', 'y'] as const);

  const slopeForm = linear([[m, 'x']], b);
  const e1 = lin(-m, 1, b);
  const e2 = lin(p, q, c);
  const solution = [
    `Substitute $y = ${slopeForm}$ into the second equation: $${linear([[p, 'x']])} ${signedGroup(q, slopeForm)} = ${tex(c)}$.`,
    `Distribute and combine like terms: $${linear([[k, 'x']], q * b)} = ${tex(c)}$.`,
    `So $${linear([[k, 'x']])} = ${tex(c - q * b)}$, which gives $x = ${tex(x0)}$.`,
  ];
  if (ask === 'y') {
    solution.push(`Substitute $x = ${tex(x0)}$ into $y = ${slopeForm}$ to get $y = ${tex(y0)}$.`);
  }

  const xSign = r(c + q * b, k);
  const xNoDistribute = r(c - b, k);
  const distractors = (): Candidate[] =>
    ask === 'x'
      ? pickDistractors(r(x0), [
          { value: r(y0), note: 'This is the value of $y$, not $x$.' },
          { value: xSign, note: 'A sign error when moving the constant term to the other side.' },
          {
            value: xNoDistribute,
            note: 'When distributing, multiply every term inside the parentheses, including the constant.',
          },
          ...fallbackCandidates(r(x0), rng),
        ])
      : pickDistractors(r(y0), [
          { value: r(x0), note: 'This is the value of $x$, not $y$.' },
          {
            value: r(m).mul(xSign).add(r(b)),
            note: 'A sign error while solving for $x$ carried into $y$.',
          },
          {
            value: r(m).mul(xNoDistribute).add(r(b)),
            note: 'The constant was not distributed, which threw off $x$ and then $y$.',
          },
          ...fallbackCandidates(r(y0), rng),
        ]);

  const stemSystem = system([
    ['y', slopeForm],
    [
      linear([
        [p, 'x'],
        [q, 'y'],
      ]),
      tex(c),
    ],
  ]);
  return body(format, stemSystem, ask, ask === 'x' ? r(x0) : r(y0), e1, e2, solution, distractors);
}

/** Medium: both equations in standard form, solved by elimination. */
function medium(rng: Rng, format: Format): GeneratedBody {
  const x0 = rng.int(-7, 7);
  const y0 = rng.int(-7, 7);
  let a1 = 0;
  let b1 = 0;
  let a2 = 0;
  let b2 = 0;
  do {
    a1 = rng.int(1, 6);
    b1 = nonZeroInt(rng, -6, 6);
    a2 = nonZeroInt(rng, -6, 6);
    b2 = nonZeroInt(rng, -6, 6);
  } while (a1 * b2 - a2 * b1 === 0);
  const c1 = a1 * x0 + b1 * y0;
  const c2 = a2 * x0 + b2 * y0;
  const ask: Ask = rng.pick(['x', 'y'] as const);
  const e1 = lin(a1, b1, c1);
  const e2 = lin(a2, b2, c2);

  const solution: string[] = [];
  if (b1 === b2) {
    solution.push(
      `The $y$-terms already match, so subtract the second equation from the first: $${linear([[a1 - a2, 'x']])} = ${tex(c1 - c2)}$.`,
    );
  } else if (b1 === -b2) {
    solution.push(
      `The $y$-terms are opposites, so add the equations: $${linear([[a1 + a2, 'x']])} = ${tex(c1 + c2)}$.`,
    );
  } else {
    solution.push(
      `To eliminate $y$, multiply the first equation by $${tex(b2)}$ and the second equation by $${tex(b1)}$: $$${system(
        [
          [
            linear([
              [a1 * b2, 'x'],
              [b1 * b2, 'y'],
            ]),
            tex(c1 * b2),
          ],
          [
            linear([
              [a2 * b1, 'x'],
              [b1 * b2, 'y'],
            ]),
            tex(c2 * b1),
          ],
        ],
      )}$$`,
      `Subtract the second new equation from the first: $${linear([[a1 * b2 - a2 * b1, 'x']])} = ${tex(c1 * b2 - c2 * b1)}$.`,
    );
  }
  solution.push(`So $x = ${tex(x0)}$.`);
  if (ask === 'y') {
    solution.push(
      `Substitute $x = ${tex(x0)}$ into the first equation: $${linear([[b1, 'y']], a1 * x0)} = ${tex(c1)}$, so $y = ${tex(y0)}$.`,
    );
  }

  const addDen = a1 * b2 + a2 * b1;
  const distractors = (): Candidate[] =>
    ask === 'x'
      ? pickDistractors(r(x0), [
          { value: r(y0), note: 'This is the value of $y$, not $x$.' },
          ...(addDen === 0
            ? []
            : [
                {
                  value: r(c1 * b2 + c2 * b1, addDen),
                  note: 'The equations were combined with the wrong operation, so $y$ was not eliminated.',
                },
              ]),
          ...fallbackCandidates(r(x0), rng),
        ])
      : pickDistractors(r(y0), [
          { value: r(x0), note: 'This is the value of $x$, not $y$.' },
          {
            value: r(c1 + a1 * x0, b1),
            note: 'The wrong sign was used for $x$ when substituting back.',
          },
          ...fallbackCandidates(r(y0), rng),
        ]);

  const stemSystem = system([
    [
      linear([
        [a1, 'x'],
        [b1, 'y'],
      ]),
      tex(c1),
    ],
    [
      linear([
        [a2, 'x'],
        [b2, 'y'],
      ]),
      tex(c2),
    ],
  ]);
  return body(format, stemSystem, ask, ask === 'x' ? r(x0) : r(y0), e1, e2, solution, distractors);
}

/** Hard: swapped coefficients reward adding or subtracting the equations instead of solving for x and y. */
function hard(rng: Rng, format: Format): GeneratedBody {
  let a = 0;
  let b = 0;
  do {
    a = rng.int(2, 9);
    b = nonZeroInt(rng, -9, 9);
  } while ((a - b) % 2 !== 0 || Math.abs(a) === Math.abs(b));
  const ask: Ask = rng.pick(['x+y', 'x-y'] as const);
  const x0 = r(2 * rng.int(-5, 4) + 1, 2);
  const target = r(nonZeroInt(rng, -12, 12));
  const y0 = ask === 'x+y' ? target.sub(x0) : x0.sub(target);
  const c1 = r(a).mul(x0).add(r(b).mul(y0));
  const c2 = r(b).mul(x0).add(r(a).mul(y0));
  const e1 = lin(a, b, c1);
  const e2 = lin(b, a, c2);

  const plus = ask === 'x+y';
  const factor = plus ? a + b : a - b;
  const rhs = plus ? c1.add(c2) : c1.sub(c2);
  const solution = [
    plus
      ? `The coefficients of $x$ and $y$ trade places between the equations, so add the equations: $${linear(
          [
            [factor, 'x'],
            [factor, 'y'],
          ],
        )} = ${tex(rhs)}$.`
      : `The coefficients of $x$ and $y$ trade places between the equations, so subtract the second equation from the first: $${linear(
          [
            [factor, 'x'],
            [-factor, 'y'],
          ],
        )} = ${tex(rhs)}$.`,
    `Factor out $${tex(factor)}$: $${tex(factor)}(${ASK_TEX[ask]}) = ${tex(rhs)}$, so $${ASK_TEX[ask]} = ${tex(target)}$.`,
    `You never need $x$ and $y$ on their own. They are $x = ${tex(x0)}$ and $y = ${tex(y0)}$, which take longer to find.`,
  ];

  const other = plus ? x0.sub(y0) : x0.add(y0);
  const wrongFactor = plus ? a - b : a + b;
  const distractors = (): Candidate[] =>
    pickDistractors(target, [
      { value: x0, note: 'This is the value of $x$ alone.' },
      {
        value: other,
        note: plus ? 'This is $x - y$, not $x + y$.' : 'This is $x + y$, not $x - y$.',
      },
      {
        value: rhs.div(r(wrongFactor)),
        note: 'Divided by the wrong coefficient after combining the equations.',
      },
      {
        value: rhs,
        note: 'Combined the equations but forgot to divide by the common coefficient.',
      },
      ...fallbackCandidates(target, rng),
    ]);

  const stemSystem = system([
    [
      linear([
        [a, 'x'],
        [b, 'y'],
      ]),
      tex(c1),
    ],
    [
      linear([
        [b, 'x'],
        [a, 'y'],
      ]),
      tex(c2),
    ],
  ]);
  return body(format, stemSystem, ask, target, e1, e2, solution, distractors);
}

const BUILDERS: Record<Difficulty, (rng: Rng, format: Format) => GeneratedBody> = {
  easy,
  medium,
  hard,
};

export const systemsSolve: ProblemType = {
  id: 'alg.systems.solve-system',
  version: 1,
  skill: 'alg.systems',
  supports: { easy: ['mcq', 'spr'], medium: ['mcq', 'spr'], hard: ['mcq', 'spr'] },
  generate: (rng, difficulty, format) => BUILDERS[difficulty](rng, format),
  verify(problem: Problem): boolean {
    const meta = problem.meta ?? {};
    const ask = meta['ask'] as Ask;
    const sol = solve2(eqFromMeta(meta['e1']), eqFromMeta(meta['e2']));
    if (sol.kind !== 'one' || !(ask in ASK_TEX)) return false;
    const target =
      ask === 'x'
        ? sol.x
        : ask === 'y'
          ? sol.y
          : ask === 'x+y'
            ? sol.x.add(sol.y)
            : sol.x.sub(sol.y);
    const given = answerValue(problem);
    return given !== null && Rational.parse(given).eq(target);
  },
};
```

- [ ] **Step 4: Create the registry with this one generator**

Tasks 9 and 10 add the next two types to `PROBLEM_TYPES`.

`src/engine/registry.ts`:

```ts
import { buildProblem } from './build';
import { systemsSolve } from './generators/algebra/systems-solve';
import { parseProblemId, type Difficulty, type Problem, type ProblemType } from './problem';
import { SKILL_IDS, type SkillId } from './skills';

/** Every generator the site ships. Add new types here. */
export const PROBLEM_TYPES: readonly ProblemType[] = [systemsSolve];

export function getProblemType(id: string): ProblemType | undefined {
  return PROBLEM_TYPES.find((t) => t.id === id);
}

export function problemTypesForSkill(skill: SkillId): ProblemType[] {
  return PROBLEM_TYPES.filter((t) => t.skill === skill);
}

/** Skills with at least one generator. Phase 4 adds skills that have published bank problems. */
export function availableSkills(): SkillId[] {
  return SKILL_IDS.filter((s) => problemTypesForSkill(s).length > 0);
}

export function isSkillAvailable(skill: SkillId): boolean {
  return problemTypesForSkill(skill).length > 0;
}

/**
 * Rebuilds a generated problem from its id. `updated` is true when the id names an older
 * generator version: the problem is rebuilt with the current version and the same seed.
 */
export function problemFromId(id: string): { problem: Problem; updated: boolean } | null {
  const ref = parseProblemId(id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  if (!type || !type.supports[ref.difficulty].includes(ref.format)) return null;
  try {
    const problem = buildProblem(type, ref.difficulty, ref.format, ref.seed);
    if (!type.verify(problem)) return null;
    return { problem, updated: ref.version !== type.version };
  } catch {
    return null;
  }
}

/** Skill and difficulty for a problem id, without building it. null if the id is unknown. */
export function describeProblemId(id: string): { skill: SkillId; difficulty: Difficulty } | null {
  const ref = parseProblemId(id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  return type ? { skill: type.skill, difficulty: ref.difficulty } : null;
}
```

- [ ] **Step 5: Run the soak test**

Run: `npm run test:soak`
Expected: PASS, 6 tests (easy, medium and hard, each in mcq and spr), each over seeds 1 to 5,000. This takes a few seconds. For a faster loop while developing, use `SOAK_SEEDS=500 npm run test:soak`.

- [ ] **Step 6: Write the golden file, then run the unit tests**

Run: `npm run golden:update`
Expected: creates `tests/golden/alg.systems.solve-system.json`.

Run: `npx vitest run --project unit tests/unit/systems-solve.test.ts tests/unit/registry.test.ts tests/unit/generators.test.ts tests/unit/golden.test.ts`
Expected: PASS, 19 tests (6 + 6 + 6 + 1).

Then run: `npm test`
Expected: PASS, 98 tests in total.

- [ ] **Step 7: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/generators/algebra/systems-solve.ts src/engine/registry.ts \
  tests/helpers tests/soak tests/golden tests/unit/golden.test.ts tests/unit/generators.test.ts \
  tests/unit/systems-solve.test.ts tests/unit/registry.test.ts
git commit -m "feat(generators): solve-system generator with soak, tamper and golden gates"
```

---

### Task 9: Second generator: counting solutions

This adds `alg.systems.solution-count`:
- **Easy and medium** ask "how many solutions?", with the choices always in counting order: Zero, Exactly one, Exactly two, Infinitely many.
- **Hard** asks for the constant k that gives no solution or infinitely many.

**Files:**
- Create: `src/engine/generators/algebra/systems-count.ts`
- Modify: `src/engine/registry.ts` (the import and `PROBLEM_TYPES`)
- Test: `tests/unit/systems-count.test.ts`
- Generated: `tests/golden/alg.systems.solution-count.json`

**Interfaces:**
- Consumes: Tasks 2 to 8.
- Produces: `systemsCount: ProblemType` with id `'alg.systems.solution-count'`, version 1. Its supports are `{ easy: ['mcq'], medium: ['mcq'], hard: ['mcq', 'spr'] }`. Its `meta` holds `{ mode: 'count', e1, e2, outcome }` or `{ mode: 'constant', e1, e2, hidden, cond }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/systems-count.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { systemsCount } from '../../src/engine/generators/algebra/systems-count';

describe('alg.systems.solution-count', () => {
  it('offers typed answers only for the hard "find k" problems', () => {
    expect(systemsCount.supports).toEqual({ easy: ['mcq'], medium: ['mcq'], hard: ['mcq', 'spr'] });
  });

  it('lists the choices in counting order', () => {
    const p = buildProblem(systemsCount, 'medium', 'mcq', 1);
    expect(p.choices?.map((c) => c.text)).toEqual([
      'Zero',
      'Exactly one',
      'Exactly two',
      'Infinitely many',
    ]);
  });

  it('never marks "Exactly two" as correct', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const d of ['easy', 'medium'] as const) {
        const p = buildProblem(systemsCount, d, 'mcq', seed);
        expect(p.answer).not.toEqual({ kind: 'choice', index: 2 });
      }
    }
  });

  it('produces all three outcomes', () => {
    const outcomes = new Set<unknown>();
    for (let seed = 1; seed <= 30; seed++)
      outcomes.add(buildProblem(systemsCount, 'easy', 'mcq', seed).meta?.['outcome']);
    expect([...outcomes].sort()).toEqual(['infinite', 'one', 'zero']);
  });

  it('hard problems ask for a constant k', () => {
    const p = buildProblem(systemsCount, 'hard', 'spr', 2);
    expect(p.stem).toContain('$k$ is a constant');
    expect(p.stem).toMatch(/k[xy]/);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/systems-count.test.ts`
Expected: FAIL. The test files cannot import `src/engine/generators/algebra/systems-count.ts` because it does not exist yet.

- [ ] **Step 3: Implement the generator**

`src/engine/generators/algebra/systems-count.ts`:

```ts
import { linear, system, tex } from '../../format';
import type { Difficulty, Format, GeneratedBody, Problem, ProblemType } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';
import {
  answerValue,
  fallbackCandidates,
  fixedChoices,
  numericAnswer,
  pickDistractors,
  type Candidate,
} from '../shared/choices';
import { eqFromMeta, eqTex, eqToMeta, lin, scaleEq, solve2, type LinEq } from '../shared/linear2';
import { nonZeroInt } from '../shared/numbers';

type Outcome = 'zero' | 'one' | 'infinite';
type CountKey = Outcome | 'two';

/** Choices in counting order: zero < one < two < infinitely many. */
const COUNT_CHOICES: ReadonlyArray<{ key: CountKey; text: string }> = [
  { key: 'zero', text: 'Zero' },
  { key: 'one', text: 'Exactly one' },
  { key: 'two', text: 'Exactly two' },
  { key: 'infinite', text: 'Infinitely many' },
];

const WHY_WRONG: Record<Outcome, Record<CountKey, string>> = {
  zero: {
    zero: '',
    one: 'The slopes are equal, so the lines are parallel; lines with equal slopes and different intercepts never cross.',
    two: 'Two different lines cross at most once, so a linear system never has exactly two solutions.',
    infinite:
      'Equal slopes are not enough: the intercepts differ, so the lines are parallel and never meet.',
  },
  one: {
    zero: 'The slopes are different, so the lines must cross exactly once.',
    one: '',
    two: 'Two different lines cross at most once, so a linear system never has exactly two solutions.',
    infinite: 'The slopes differ, so these are two different lines that cross exactly once.',
  },
  infinite: {
    zero: 'Both equations describe the same line, so every point on that line is a solution.',
    one: 'The slopes are equal and so are the intercepts: both equations describe the same line.',
    two: 'Two different lines cross at most once, and here the lines are the same line.',
    infinite: '',
  },
};

const classify = (e1: LinEq, e2: LinEq): Outcome => {
  const kind = solve2(e1, e2).kind;
  return kind === 'one' ? 'one' : kind === 'none' ? 'zero' : 'infinite';
};

function countBody(
  stemSystem: string,
  e1: LinEq,
  e2: LinEq,
  outcome: Outcome,
  solution: string[],
): GeneratedBody {
  const built = fixedChoices(
    COUNT_CHOICES.map((c) => ({
      text: c.text,
      value: c.key,
      note: c.key === outcome ? null : WHY_WRONG[outcome][c.key],
    })),
  );
  return {
    stem: `$$${stemSystem}$$\n\nHow many solutions does the given system of equations have?`,
    ...built,
    solution,
    desmos: [eqTex(e1), eqTex(e2)],
    meta: { mode: 'count', e1: eqToMeta(e1), e2: eqToMeta(e2), outcome },
  };
}

/** Easy: both lines in slope-intercept form (the same-line case is disguised by a multiple). */
function easy(rng: Rng): GeneratedBody {
  const outcome: Outcome = rng.pick(['zero', 'one', 'infinite'] as const);
  const m1 = nonZeroInt(rng, -5, 5);
  const k1 = rng.int(-9, 9);
  const first = linear([[m1, 'x']], k1);
  const e1 = lin(-m1, 1, k1);

  if (outcome === 'infinite') {
    const n = rng.pick([2, 3, -2, -3]);
    const e2 = lin(-n * m1, n, n * k1);
    return countBody(
      system([
        ['y', first],
        [linear([[n, 'y']]), linear([[n * m1, 'x']], n * k1)],
      ]),
      e1,
      e2,
      outcome,
      [
        `Divide both sides of the second equation by $${tex(n)}$: $y = ${first}$.`,
        'That is the first equation, so both equations describe the same line. Every point on the line is a solution, so there are infinitely many solutions.',
      ],
    );
  }

  let m2 = m1;
  let k2 = k1;
  if (outcome === 'zero') {
    k2 = k1 + nonZeroInt(rng, -6, 6);
  } else {
    while (m2 === m1) m2 = nonZeroInt(rng, -5, 5);
    k2 = rng.int(-9, 9);
  }
  const second = linear([[m2, 'x']], k2);
  const e2 = lin(-m2, 1, k2);
  const solution =
    outcome === 'zero'
      ? [
          `Both equations are in slope-intercept form, and both lines have slope $${tex(m1)}$.`,
          `The $y$-intercepts are different ($${tex(k1)}$ and $${tex(k2)}$), so the lines are parallel and never meet. The system has zero solutions.`,
        ]
      : [
          `The first line has slope $${tex(m1)}$ and the second has slope $${tex(m2)}$.`,
          'Lines with different slopes cross at exactly one point, so the system has exactly one solution.',
        ];
  return countBody(
    system([
      ['y', first],
      ['y', second],
    ]),
    e1,
    e2,
    outcome,
    solution,
  );
}

/** Medium: standard form, where one equation may be a multiple of the other. */
function medium(rng: Rng): GeneratedBody {
  const outcome: Outcome = rng.pick(['zero', 'one', 'infinite'] as const);
  const p = rng.int(1, 6);
  const q = nonZeroInt(rng, -6, 6);
  const c = rng.int(-9, 9);
  const n = rng.pick([2, 3, 4, -2, -3]);
  const e1 = lin(p, q, c);
  const scaled = scaleEq(e1, n);

  let e2: LinEq;
  let solution: string[];
  if (outcome === 'zero') {
    e2 = lin(n * p, n * q, n * c + nonZeroInt(rng, -5, 5));
    solution = [
      `Multiply the first equation by $${tex(n)}$: $${eqTex(scaled)}$.`,
      `The left side now matches the second equation, but the right sides differ ($${tex(n * c)}$ and $${tex(e2.c)}$). The lines are parallel, so the system has zero solutions.`,
    ];
  } else if (outcome === 'infinite') {
    e2 = scaled;
    solution = [
      `Multiply the first equation by $${tex(n)}$: $${eqTex(scaled)}$.`,
      'That is exactly the second equation, so both equations describe the same line. The system has infinitely many solutions.',
    ];
  } else {
    e2 = lin(n * p + nonZeroInt(rng, -3, 3), n * q, rng.int(-12, 12));
    const slope1 = e1.a.neg().div(e1.b);
    const slope2 = e2.a.neg().div(e2.b);
    solution = [
      `Solve each equation for $y$. The first line has slope $${tex(slope1)}$ and the second has slope $${tex(slope2)}$.`,
      'The slopes are different, so the lines cross exactly once. The system has exactly one solution.',
    ];
  }
  return countBody(
    system([
      [
        linear([
          [e1.a, 'x'],
          [e1.b, 'y'],
        ]),
        tex(e1.c),
      ],
      [
        linear([
          [e2.a, 'x'],
          [e2.b, 'y'],
        ]),
        tex(e2.c),
      ],
    ]),
    e1,
    e2,
    outcome,
    solution,
  );
}

/** Hard: find the constant k that gives no solution or infinitely many solutions. */
function hard(rng: Rng, format: Format): GeneratedBody {
  const cond: 'none' | 'infinite' = rng.pick(['none', 'infinite'] as const);
  const hidden: 'x' | 'y' = rng.pick(['x', 'y'] as const);
  const p = rng.int(1, 6);
  const q = nonZeroInt(rng, -6, 6);
  const c = nonZeroInt(rng, -9, 9);
  const m1 = rng.int(1, 3);
  let m2 = m1;
  while (m2 === m1) m2 = rng.int(2, 5);
  const delta = cond === 'none' ? nonZeroInt(rng, -5, 5) : 0;

  const e1 = lin(m1 * p, m1 * q, m1 * c);
  const e2 = lin(m2 * p, m2 * q, m2 * c + delta);
  const k = hidden === 'x' ? e1.a : e1.b;
  const known1 = hidden === 'x' ? e1.b : e1.a;
  const known2 = hidden === 'x' ? e2.b : e2.a;
  const other2 = hidden === 'x' ? e2.a : e2.b;
  const ratio = known2.div(known1);
  const knownVar = hidden === 'x' ? 'y' : 'x';
  const reduces = !(ratio.num === known2.num && ratio.den === known1.num);

  const firstLhs =
    hidden === 'x'
      ? linear([
          [1, 'kx'],
          [e1.b, 'y'],
        ])
      : linear([
          [e1.a, 'x'],
          [1, 'ky'],
        ]);
  const stemSystem = system([
    [firstLhs, tex(e1.c)],
    [
      linear([
        [e2.a, 'x'],
        [e2.b, 'y'],
      ]),
      tex(e2.c),
    ],
  ]);
  const solution = [
    cond === 'none'
      ? 'A linear system has no solution when its lines are parallel: the $x$-coefficients and the $y$-coefficients are in the same ratio, but the constants are not.'
      : 'A linear system has infinitely many solutions when one equation is a multiple of the other: the $x$-coefficients, the $y$-coefficients, and the constants are all in the same ratio.',
    `Compare the known $${knownVar}$-coefficients: $\\frac{${tex(known2)}}{${tex(known1)}}${reduces ? ` = ${tex(ratio)}` : ''}$.`,
    `The $${hidden}$-coefficients need the same ratio: $\\frac{${tex(other2)}}{k} = ${tex(ratio)}$, so $k = ${tex(k)}$.`,
    cond === 'none'
      ? `Check the constants: $\\frac{${tex(e2.c)}}{${tex(e1.c)}} \\neq ${tex(ratio)}$, so the lines are parallel rather than the same line.`
      : `Check the constants: $\\frac{${tex(e2.c)}}{${tex(e1.c)}} = ${tex(ratio)}$ as well, so the equations describe the same line.`,
  ];

  const distractors = (): Candidate[] =>
    pickDistractors(k, [
      {
        value: other2,
        note: 'This is the matching coefficient in the other equation. The coefficients need the same ratio, not the same value.',
      },
      {
        value: other2.mul(ratio),
        note: 'The ratio is flipped: scale by the first equation over the second, not the second over the first.',
      },
      ...(e2.c.isZero()
        ? []
        : [
            {
              value: other2.mul(e1.c.div(e2.c)),
              note: 'Used the ratio of the constants instead of the ratio of the known coefficients.',
            },
          ]),
      ...fallbackCandidates(k, rng),
    ]);

  return {
    stem: `$$${stemSystem}$$\n\nIn the given system of equations, $k$ is a constant. If the system has ${cond === 'none' ? 'no solution' : 'infinitely many solutions'}, what is the value of $k$?`,
    ...numericAnswer(format, k, distractors),
    solution,
    meta: { mode: 'constant', e1: eqToMeta(e1), e2: eqToMeta(e2), hidden, cond },
  };
}

export const systemsCount: ProblemType = {
  id: 'alg.systems.solution-count',
  version: 1,
  skill: 'alg.systems',
  supports: { easy: ['mcq'], medium: ['mcq'], hard: ['mcq', 'spr'] },
  generate(rng: Rng, difficulty: Difficulty, format: Format): GeneratedBody {
    if (difficulty === 'easy') return easy(rng);
    if (difficulty === 'medium') return medium(rng);
    return hard(rng, format);
  },
  verify(problem: Problem): boolean {
    const meta = problem.meta ?? {};
    const e1 = eqFromMeta(meta['e1']);
    const e2 = eqFromMeta(meta['e2']);
    const given = answerValue(problem);
    if (given === null) return false;
    if (meta['mode'] === 'count') {
      return classify(e1, e2) === meta['outcome'] && given === meta['outcome'];
    }
    const want = meta['cond'] === 'none' ? 'zero' : 'infinite';
    const k = Rational.parse(given);
    const withK = (value: Rational): LinEq =>
      meta['hidden'] === 'x' ? lin(value, e1.b, e1.c) : lin(e1.a, value, e1.c);
    return classify(withK(k), e2) === want && classify(withK(k.add(r(1))), e2) === 'one';
  },
};
```

- [ ] **Step 4: Register it**

In `src/engine/registry.ts`, add the import above the `systems-solve` import:

```ts
import { systemsCount } from './generators/algebra/systems-count';
```

and change the list to:

```ts
export const PROBLEM_TYPES: readonly ProblemType[] = [systemsSolve, systemsCount];
```

- [ ] **Step 5: Run the soak test**

Run: `npm run test:soak`
Expected: PASS, 10 tests (the 6 from Task 8 plus 4 new ones: easy mcq, medium mcq, hard mcq and hard spr).

- [ ] **Step 6: Write the golden file, then run the unit tests**

Run: `npm run golden:update`
Expected: creates `tests/golden/alg.systems.solution-count.json` and leaves `alg.systems.solve-system.json` unchanged. Check with `git status`: the solve-system file must not be modified.

Run: `npm test`
Expected: PASS, 108 tests in total.

- [ ] **Step 7: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/generators/algebra/systems-count.ts src/engine/registry.ts \
  tests/unit/systems-count.test.ts tests/golden/alg.systems.solution-count.json
git commit -m "feat(generators): solution-count generator"
```

---

### Task 10: Third generator: word problems

This adds `alg.systems.word-system`, a sale with two items at two prices:
- **Easy:** pick the system that models the sale.
- **Medium:** find one count, given the total count and the total money.
- **Hard:** the counts are related ("d fewer than k times"), and no total count is given.

The five scenarios in `scenarios.ts` are original.

**Files:**
- Create: `src/engine/generators/shared/scenarios.ts`, `src/engine/generators/algebra/systems-word.ts`
- Modify: `src/engine/registry.ts`
- Test: `tests/unit/systems-word.test.ts`
- Generated: `tests/golden/alg.systems.word-system.json`

**Interfaces:**
- Consumes: Tasks 2 to 9.
- Produces:
  - `TwoItemScenario`, `Item` and `TWO_ITEM_SCENARIOS`, where the pricier item `a` is always priced above `b`.
  - `systemsWord: ProblemType` with id `'alg.systems.word-system'`, version 1. Its supports are `{ easy: ['mcq'], medium: ['mcq', 'spr'], hard: ['mcq', 'spr'] }`. Answers are always positive whole-number counts. Money in stems is written `\$`.

- [ ] **Step 1: Write the failing test**

`tests/unit/systems-word.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { systemsWord } from '../../src/engine/generators/algebra/systems-word';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { TWO_ITEM_SCENARIOS } from '../../src/engine/generators/shared/scenarios';
import { Rational } from '../../src/engine/rational';

describe('alg.systems.word-system', () => {
  it('offers modeling at easy and counts at medium and hard', () => {
    expect(systemsWord.supports).toEqual({
      easy: ['mcq'],
      medium: ['mcq', 'spr'],
      hard: ['mcq', 'spr'],
    });
  });

  it('easy problems ask which system models the sale', () => {
    const p = buildProblem(systemsWord, 'easy', 'mcq', 1);
    expect(p.stem).toContain('Which system of equations represents this situation?');
    const correct = p.choices?.[p.answer.kind === 'choice' ? p.answer.index : 0];
    expect(correct?.text).toContain('x + y &=');
  });

  it('answers are positive whole-number counts', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of ['medium', 'hard'] as const) {
        const v = Rational.parse(answerValue(buildProblem(systemsWord, d, 'spr', seed))!);
        expect(v.isInteger() && v.sign() > 0, `${d} seed ${seed}`).toBe(true);
      }
    }
  });

  it('writes money with an escaped dollar sign', () => {
    const p = buildProblem(systemsWord, 'medium', 'mcq', 5);
    expect(p.stem).toMatch(/\\\$\d/);
  });

  it('keeps every scenario price range above the cheaper item', () => {
    for (const s of TWO_ITEM_SCENARIOS) expect(s.a.price[0]).toBeGreaterThan(s.b.price[1]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/systems-word.test.ts`
Expected: FAIL. The test files cannot import `systems-word.ts` and `scenarios.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/engine/generators/shared/scenarios.ts`:

```ts
/** Original word-problem settings where two kinds of item are sold at two prices. */
export interface Item {
  one: string;
  many: string;
  /** Whole-dollar price range, inclusive. */
  price: readonly [number, number];
}

export interface TwoItemScenario {
  id: string;
  /** Starts a sentence, e.g. "A community theater". */
  seller: string;
  /** What both items are together, e.g. "tickets". */
  collective: string;
  /** The pricier item. Its price range sits entirely above b's. */
  a: Item;
  b: Item;
  /** Range for each item's count, inclusive. */
  count: readonly [number, number];
}

export const TWO_ITEM_SCENARIOS: readonly TwoItemScenario[] = [
  {
    id: 'theater',
    seller: 'A community theater',
    collective: 'tickets',
    a: { one: 'adult ticket', many: 'adult tickets', price: [9, 16] },
    b: { one: 'student ticket', many: 'student tickets', price: [3, 8] },
    count: [20, 90],
  },
  {
    id: 'plant-sale',
    seller: 'A school garden club',
    collective: 'plants',
    a: { one: 'tomato plant', many: 'tomato plants', price: [5, 9] },
    b: { one: 'herb pot', many: 'herb pots', price: [2, 4] },
    count: [15, 70],
  },
  {
    id: 'bookstore',
    seller: 'A used bookstore',
    collective: 'books',
    a: { one: 'hardcover book', many: 'hardcover books', price: [7, 12] },
    b: { one: 'paperback book', many: 'paperback books', price: [2, 5] },
    count: [20, 80],
  },
  {
    id: 'candles',
    seller: 'A robotics team',
    collective: 'candles',
    a: { one: 'large candle', many: 'large candles', price: [11, 18] },
    b: { one: 'small candle', many: 'small candles', price: [4, 8] },
    count: [10, 60],
  },
  {
    id: 'bakery',
    seller: 'A bakery stand',
    collective: 'items',
    a: { one: 'loaf of bread', many: 'loaves of bread', price: [5, 8] },
    b: { one: 'muffin', many: 'muffins', price: [2, 3] },
    count: [20, 75],
  },
];
```

`src/engine/generators/algebra/systems-word.ts`:

```ts
import { commas, linear, signedGroup, system, tex } from '../../format';
import type { Difficulty, Format, GeneratedBody, Problem, ProblemType } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';
import {
  answerValue,
  fallbackCandidates,
  numericAnswer,
  pickDistractors,
  shuffledChoices,
  type Candidate,
} from '../shared/choices';
import { lin, solve2, type LinEq } from '../shared/linear2';
import { TWO_ITEM_SCENARIOS, type TwoItemScenario } from '../shared/scenarios';

const COUNTS = { integerOnly: true, min: 1 } as const;

/** "x + y = T; pA x + pB y = V" as a comparable key. */
const modelKey = (rows: ReadonlyArray<readonly [number, number, number]>): string =>
  rows.map((row) => row.join(',')).join(';');

const money = (n: number): string => `\\$${commas(n)}`;

function prices(rng: Rng, s: TwoItemScenario): [number, number] {
  return [rng.int(s.a.price[0], s.a.price[1]), rng.int(s.b.price[0], s.b.price[1])];
}

function salesSentence(
  s: TwoItemScenario,
  total: number,
  pA: number,
  pB: number,
  value: number,
): string {
  return `${s.seller} sold ${total} ${s.collective} in one day: some ${s.a.many} and the rest ${s.b.many}. Each ${s.a.one} cost ${money(pA)}, and each ${s.b.one} cost ${money(pB)}. Altogether the ${s.collective} brought in ${money(value)}.`;
}

/** Easy: choose the system of equations that models the sale. */
function easy(rng: Rng): GeneratedBody {
  const s = rng.pick(TWO_ITEM_SCENARIOS);
  const [pA, pB] = prices(rng, s);
  const nA = rng.int(s.count[0], s.count[1]);
  const nB = rng.int(s.count[0], s.count[1]);
  const T = nA + nB;
  const V = pA * nA + pB * nB;

  const option = (rows: ReadonlyArray<readonly [number, number, number]>) => ({
    text: `$${system(
      rows.map(
        ([a, b, c]) =>
          [
            linear([
              [a, 'x'],
              [b, 'y'],
            ]),
            tex(c),
          ] as const,
      ),
    )}$`,
    value: modelKey(rows),
  });
  const built = shuffledChoices(
    rng,
    option([
      [1, 1, T],
      [pA, pB, V],
    ]),
    [
      {
        ...option([
          [1, 1, V],
          [pA, pB, T],
        ]),
        note: `The number of ${s.collective} and the money collected are swapped.`,
      },
      {
        ...option([
          [1, 1, T],
          [pB, pA, V],
        ]),
        note: `The prices are on the wrong variables: $x$ counts ${s.a.many}, which cost ${money(pA)} each.`,
      },
      {
        ...option([
          [1, -1, T],
          [pA, pB, V],
        ]),
        note: `The number of ${s.a.many} plus the number of ${s.b.many} is the total, so the first equation should use $x + y$, not $x - y$.`,
      },
    ],
  );
  return {
    stem: `${salesSentence(s, T, pA, pB, V)}\n\nLet $x$ be the number of ${s.a.many} sold and $y$ the number of ${s.b.many} sold. Which system of equations represents this situation?`,
    ...built,
    solution: [
      `Each item sold counts once toward the ${T} ${s.collective}, so $x + y = ${tex(T)}$.`,
      `The ${s.a.many} bring in ${money(pA)} each and the ${s.b.many} bring in ${money(pB)} each, so $${linear(
        [
          [pA, 'x'],
          [pB, 'y'],
        ],
      )} = ${tex(V)}$.`,
    ],
    meta: { mode: 'model', T, V, pA, pB },
  };
}

/** Medium: total count and total money; find one of the counts. */
function medium(rng: Rng, format: Format): GeneratedBody {
  const s = rng.pick(TWO_ITEM_SCENARIOS);
  const [pA, pB] = prices(rng, s);
  const nA = rng.int(s.count[0], s.count[1]);
  const nB = rng.int(s.count[0], s.count[1]);
  const T = nA + nB;
  const V = pA * nA + pB * nB;
  const askA = rng.chance(0.5);
  const asked = askA ? s.a : s.b;
  const answer = r(askA ? nA : nB);

  const solution = [
    `Let $x$ be the number of ${s.a.many} and $y$ the number of ${s.b.many}. Then $x + y = ${tex(T)}$ and $${linear(
      [
        [pA, 'x'],
        [pB, 'y'],
      ],
    )} = ${tex(V)}$.`,
    `From the first equation, $y = ${tex(T)} - x$. Substitute into the second: $${linear([[pA, 'x']])} ${signedGroup(pB, `${tex(T)} - x`)} = ${tex(V)}$.`,
    `Simplify: $${linear([[pA - pB, 'x']], pB * T)} = ${tex(V)}$, so $${linear([[pA - pB, 'x']])} = ${tex(V - pB * T)}$ and $x = ${tex(nA)}$.`,
  ];
  if (!askA) solution.push(`Then $y = ${tex(T)} - ${tex(nA)} = ${tex(nB)}$.`);
  solution.push(`So ${askA ? nA : nB} ${asked.many} were sold.`);

  const otherCount = askA ? nB : nA;
  const otherItem = askA ? s.b : s.a;
  const distractors = (): Candidate[] =>
    pickDistractors(
      answer,
      [
        { value: r(otherCount), note: `This is the number of ${otherItem.many}.` },
        {
          value: r((askA ? pA : pB) * (askA ? nA : nB)),
          note: `This is the money from ${asked.many}, not the number sold.`,
        },
        { value: r(T, 2), note: 'This assumes the same number of each item was sold.' },
        {
          value: r(V, pA + pB),
          note: 'This divides the total money by the price of one of each item.',
        },
        ...fallbackCandidates(answer, rng),
      ],
      COUNTS,
    );

  return {
    stem: `${salesSentence(s, T, pA, pB, V)}\n\nHow many ${asked.many} were sold?`,
    ...numericAnswer(format, answer, distractors),
    solution,
    desmos: [`x + y = ${T}`, `${pA}x + ${pB}y = ${V}`],
    meta: { mode: 'count', T, V, pA, pB, ask: askA ? 'a' : 'b' },
  };
}

/** Hard: the counts are related ("d fewer than k times"), with no total count given. */
function hard(rng: Rng, format: Format): GeneratedBody {
  const s = rng.pick(TWO_ITEM_SCENARIOS);
  const [pA, pB] = prices(rng, s);
  const nA = rng.int(8, 40);
  const k = rng.int(2, 4);
  const d = rng.int(2, 15);
  const fewer = rng.chance(0.5);
  const sign = fewer ? -1 : 1;
  const nB = k * nA + sign * d;
  const V = pA * nA + pB * nB;
  const askA = rng.chance(0.5);
  const asked = askA ? s.a : s.b;
  const answer = r(askA ? nA : nB);
  const relation = linear([[k, 'x']], sign * d);

  const solution = [
    `Let $x$ be the number of ${s.a.many} and $y$ the number of ${s.b.many}. Then $y = ${relation}$ and $${linear(
      [
        [pA, 'x'],
        [pB, 'y'],
      ],
    )} = ${tex(V)}$.`,
    `Substitute for $y$: $${linear([[pA, 'x']])} ${signedGroup(pB, relation)} = ${tex(V)}$.`,
    `Simplify: $${linear([[pA + pB * k, 'x']], sign * pB * d)} = ${tex(V)}$, so $${linear([[pA + pB * k, 'x']])} = ${tex(V - sign * pB * d)}$ and $x = ${tex(nA)}$.`,
  ];
  if (!askA)
    solution.push(`Then $y = ${tex(k)}(${tex(nA)}) ${fewer ? '-' : '+'} ${tex(d)} = ${tex(nB)}$.`);
  solution.push(`So ${askA ? nA : nB} ${asked.many} were sold.`);

  const flippedX = r(V + sign * pB * d, pA + pB * k);
  const noKX = r(V - sign * pB * d, pA + pB);
  const readBackwards = `This reads "${d} ${fewer ? 'fewer' : 'more'} than" backwards.`;
  const distractors = (): Candidate[] =>
    askA
      ? pickDistractors(
          answer,
          [
            { value: r(nB), note: `This is the number of ${s.b.many}.` },
            { value: flippedX, note: readBackwards },
            {
              value: noKX,
              note: `This leaves out the factor of ${k} in the relationship between the counts.`,
            },
            ...fallbackCandidates(answer, rng),
          ],
          COUNTS,
        )
      : pickDistractors(
          answer,
          [
            { value: r(nA), note: `This is the number of ${s.a.many}.` },
            { value: flippedX.mul(r(k)).sub(r(sign * d)), note: readBackwards },
            { value: r(k * nA), note: `This forgets to ${fewer ? 'subtract' : 'add'} ${d}.` },
            ...fallbackCandidates(answer, rng),
          ],
          COUNTS,
        );

  return {
    stem: `${s.seller} sold ${s.a.many} for ${money(pA)} each and ${s.b.many} for ${money(pB)} each, bringing in a total of ${money(V)}. The number of ${s.b.many} sold was ${d} ${fewer ? 'fewer' : 'more'} than ${k} times the number of ${s.a.many} sold.\n\nHow many ${asked.many} were sold?`,
    ...numericAnswer(format, answer, distractors),
    solution,
    desmos: [`y = ${k}x ${fewer ? '-' : '+'} ${d}`, `${pA}x + ${pB}y = ${V}`],
    meta: { mode: 'relation', V, pA, pB, k, d, sign, ask: askA ? 'a' : 'b' },
  };
}

function positiveCounts(e1: LinEq, e2: LinEq): { x: Rational; y: Rational } | null {
  const sol = solve2(e1, e2);
  if (sol.kind !== 'one') return null;
  const ok = (v: Rational) => v.isInteger() && v.sign() > 0;
  return ok(sol.x) && ok(sol.y) ? { x: sol.x, y: sol.y } : null;
}

export const systemsWord: ProblemType = {
  id: 'alg.systems.word-system',
  version: 1,
  skill: 'alg.systems',
  supports: { easy: ['mcq'], medium: ['mcq', 'spr'], hard: ['mcq', 'spr'] },
  generate(rng: Rng, difficulty: Difficulty, format: Format): GeneratedBody {
    if (difficulty === 'easy') return easy(rng);
    if (difficulty === 'medium') return medium(rng, format);
    return hard(rng, format);
  },
  verify(problem: Problem): boolean {
    const m = problem.meta ?? {};
    const num = (key: string): number => {
      const v = m[key];
      if (typeof v !== 'number' || !Number.isInteger(v))
        throw new TypeError(`meta.${key} must be an integer`);
      return v;
    };
    const given = answerValue(problem);
    if (given === null) return false;
    if (m['mode'] === 'model') {
      const counts = positiveCounts(lin(1, 1, num('T')), lin(num('pA'), num('pB'), num('V')));
      return (
        counts !== null &&
        given ===
          modelKey([
            [1, 1, num('T')],
            [num('pA'), num('pB'), num('V')],
          ])
      );
    }
    const e1 =
      m['mode'] === 'count' ? lin(1, 1, num('T')) : lin(-num('k'), 1, num('sign') * num('d'));
    const counts = positiveCounts(e1, lin(num('pA'), num('pB'), num('V')));
    if (counts === null) return false;
    return Rational.parse(given).eq(m['ask'] === 'a' ? counts.x : counts.y);
  },
};
```

- [ ] **Step 4: Register it**

In `src/engine/registry.ts`, add the import below the `systems-solve` import:

```ts
import { systemsWord } from './generators/algebra/systems-word';
```

and change the list to:

```ts
export const PROBLEM_TYPES: readonly ProblemType[] = [systemsSolve, systemsCount, systemsWord];
```

The finished file:

`src/engine/registry.ts`:

```ts
import { buildProblem } from './build';
import { systemsCount } from './generators/algebra/systems-count';
import { systemsSolve } from './generators/algebra/systems-solve';
import { systemsWord } from './generators/algebra/systems-word';
import { parseProblemId, type Difficulty, type Problem, type ProblemType } from './problem';
import { SKILL_IDS, type SkillId } from './skills';

/** Every generator the site ships. Add new types here. */
export const PROBLEM_TYPES: readonly ProblemType[] = [systemsSolve, systemsCount, systemsWord];

export function getProblemType(id: string): ProblemType | undefined {
  return PROBLEM_TYPES.find((t) => t.id === id);
}

export function problemTypesForSkill(skill: SkillId): ProblemType[] {
  return PROBLEM_TYPES.filter((t) => t.skill === skill);
}

/** Skills with at least one generator. Phase 4 adds skills that have published bank problems. */
export function availableSkills(): SkillId[] {
  return SKILL_IDS.filter((s) => problemTypesForSkill(s).length > 0);
}

export function isSkillAvailable(skill: SkillId): boolean {
  return problemTypesForSkill(skill).length > 0;
}

/**
 * Rebuilds a generated problem from its id. `updated` is true when the id names an older
 * generator version: the problem is rebuilt with the current version and the same seed.
 */
export function problemFromId(id: string): { problem: Problem; updated: boolean } | null {
  const ref = parseProblemId(id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  if (!type || !type.supports[ref.difficulty].includes(ref.format)) return null;
  try {
    const problem = buildProblem(type, ref.difficulty, ref.format, ref.seed);
    if (!type.verify(problem)) return null;
    return { problem, updated: ref.version !== type.version };
  } catch {
    return null;
  }
}

/** Skill and difficulty for a problem id, without building it. null if the id is unknown. */
export function describeProblemId(id: string): { skill: SkillId; difficulty: Difficulty } | null {
  const ref = parseProblemId(id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  return type ? { skill: type.skill, difficulty: ref.difficulty } : null;
}
```

- [ ] **Step 5: Run the soak test**

Run: `npm run test:soak`
Expected: PASS, 15 tests.

- [ ] **Step 6: Write the golden file, then run the unit tests**

Run: `npm run golden:update`
Expected: creates `tests/golden/alg.systems.word-system.json`. The other two golden files stay unchanged; check with `git status`.

Run: `npm test`
Expected: PASS, 119 tests in total.

- [ ] **Step 7: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/generators src/engine/registry.ts \
  tests/unit/systems-word.test.ts tests/golden/alg.systems.word-system.json
git commit -m "feat(generators): word-problem generator"
```

---

### Task 11: Saved progress: schema and pure updates

Progress lives in `localStorage` under `fsm.progress.v1` (spec §11.1):
- Unreadable data is copied to `fsm.backup.<ISO timestamp>` and never deleted.
- Writes that the browser refuses return `false` instead of throwing.
- Export and import use a validated JSON file.
- The schema uses `zod/mini`, which is Zod's tree-shakable build; it saves about 18 KB of JS on every page.

**Files:**
- Create: `src/store/schema.ts`, `src/store/progress.ts`
- Test: `tests/unit/progress.test.ts`

**Interfaces:**
- Consumes: `SKILL_IDS` and `SkillId` (Task 6); `Difficulty` and `ProblemId` (Task 6).
- Produces:
  - `schema.ts`:
    - `PROGRESS_SCHEMA_VERSION = 1`
    - `attemptSchema`, `skillStateSchema`, `settingsSchema`, `progressSchema`
    - types `Attempt`, `SkillState`, `Settings` (`{ targetScore; timeMultiplier; untimed }`), `Progress`
  - `progress.ts`:
    - constants and types: `PROGRESS_KEY`, `BACKUP_PREFIX`, `MAX_ATTEMPTS = 5000`, `KeyValueStore`, `LoadStatus`, `LoadResult`, `MissedItem`, `Accuracy`, `ImportResult`
    - load and save:
      - `emptyProgress()`, `browserStorage(): KeyValueStore | null`
      - `loadProgress(storage, now?)`, `saveProgress(storage, progress): boolean`
    - pure updates: `recordAttempt`, `toggleBookmark`, `setSkillState`, `updateSettings`
    - derived views:
      - `missedProblems(progress)`: newest first.
      - `skillAccuracy(progress, skill, lastN = 20)`
      - `attemptCount(progress, skill)`
    - export and import:
      - `exportFileName(now)`, `exportProgress(progress)`, `parseImport(text)`
      - `replaceProgress(storage, next, now?)`: backs up the current data first.

- [ ] **Step 1: Write the failing test**

`tests/unit/progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BACKUP_PREFIX,
  MAX_ATTEMPTS,
  PROGRESS_KEY,
  emptyProgress,
  exportFileName,
  exportProgress,
  loadProgress,
  missedProblems,
  parseImport,
  recordAttempt,
  replaceProgress,
  saveProgress,
  skillAccuracy,
  toggleBookmark,
  type KeyValueStore,
} from '../../src/store/progress';
import type { Attempt } from '../../src/store/schema';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const NOW = new Date('2026-09-24T12:00:00.000Z');
const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  problemId: 'g:alg.systems.solve-system@1:easy:mcq:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  correct: true,
  response: 'A',
  timeMs: 1000,
  at: '2026-09-24T10:00:00.000Z',
  mode: 'practice',
  ...over,
});

describe('loadProgress', () => {
  it('reports unavailable storage', () => {
    expect(loadProgress(null).status).toBe('unavailable');
  });
  it('starts fresh when nothing is saved', () => {
    const r = loadProgress(new MemoryStore());
    expect(r.status).toBe('fresh');
    expect(r.progress).toEqual(emptyProgress());
  });
  it('round-trips saved progress', () => {
    const store = new MemoryStore();
    const p = recordAttempt(emptyProgress(), attempt());
    expect(saveProgress(store, p)).toBe(true);
    expect(loadProgress(store)).toEqual({ progress: p, status: 'ok' });
  });
  it('backs up unreadable data instead of deleting it', () => {
    for (const raw of ['{not json', JSON.stringify({ schemaVersion: 99 })]) {
      const store = new MemoryStore();
      store.setItem(PROGRESS_KEY, raw);
      const r = loadProgress(store, NOW);
      expect(r.status).toBe('recovered');
      expect(r.backupKey).toBe(`${BACKUP_PREFIX}2026-09-24T12:00:00.000Z`);
      expect(store.getItem(r.backupKey!)).toBe(raw);
      expect(r.progress).toEqual(emptyProgress());
    }
  });
});

describe('saveProgress', () => {
  it('returns false instead of throwing when storage is full', () => {
    const store = new MemoryStore();
    store.failWrites = true;
    expect(saveProgress(store, emptyProgress())).toBe(false);
    expect(saveProgress(null, emptyProgress())).toBe(false);
  });
});

describe('updates', () => {
  it('keeps only the newest attempts', () => {
    let p = emptyProgress();
    p = {
      ...p,
      attempts: Array.from({ length: MAX_ATTEMPTS }, (_, i) => attempt({ problemId: `id${i}` })),
    };
    p = recordAttempt(p, attempt({ problemId: 'newest' }));
    expect(p.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(p.attempts[0]?.problemId).toBe('id1');
    expect(p.attempts.at(-1)?.problemId).toBe('newest');
  });
  it('toggles bookmarks', () => {
    const on = toggleBookmark(emptyProgress(), 'x');
    expect(on.bookmarks).toEqual(['x']);
    expect(toggleBookmark(on, 'x').bookmarks).toEqual([]);
  });
});

describe('derived views', () => {
  it('lists problems whose latest attempt was wrong, newest first', () => {
    let p = emptyProgress();
    p = recordAttempt(
      p,
      attempt({ problemId: 'a', correct: false, at: '2026-09-24T09:00:00.000Z' }),
    );
    p = recordAttempt(
      p,
      attempt({ problemId: 'b', correct: false, at: '2026-09-24T10:00:00.000Z' }),
    );
    p = recordAttempt(
      p,
      attempt({ problemId: 'a', correct: true, at: '2026-09-24T11:00:00.000Z' }),
    );
    p = recordAttempt(
      p,
      attempt({ problemId: 'c', correct: false, at: '2026-09-24T12:00:00.000Z' }),
    );
    expect(missedProblems(p).map((m) => m.problemId)).toEqual(['c', 'b']);
  });
  it('computes accuracy over the last N attempts', () => {
    let p = emptyProgress();
    for (let i = 0; i < 25; i++) p = recordAttempt(p, attempt({ correct: i >= 5 }));
    expect(skillAccuracy(p, 'alg.systems')).toEqual({ correct: 20, attempts: 20 });
    expect(skillAccuracy(p, 'geo.circles')).toEqual({ correct: 0, attempts: 0 });
  });
});

describe('export and import', () => {
  it('names the file by date', () => {
    expect(exportFileName(NOW)).toBe('free-sat-math-progress-2026-09-24.json');
  });
  it('round-trips through export and parseImport', () => {
    const p = toggleBookmark(recordAttempt(emptyProgress(), attempt()), 'x');
    const r = parseImport(exportProgress(p));
    expect(r).toEqual({ ok: true, progress: p, summary: { attempts: 1, tests: 0, bookmarks: 1 } });
  });
  it('rejects files that are not progress files, with a reason', () => {
    expect(parseImport('nope')).toEqual({ ok: false, reason: 'This file is not valid JSON.' });
    const bad = parseImport(JSON.stringify({ ...emptyProgress(), attempts: [{ problemId: 1 }] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain('attempts.0');
  });
  it('backs up current data before replacing it', () => {
    const store = new MemoryStore();
    saveProgress(store, recordAttempt(emptyProgress(), attempt()));
    const before = store.getItem(PROGRESS_KEY);
    const r = replaceProgress(store, emptyProgress(), NOW);
    expect(r.saved).toBe(true);
    expect(store.getItem(r.backupKey!)).toBe(before);
    expect(loadProgress(store).progress).toEqual(emptyProgress());
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/progress.test.ts`
Expected: FAIL. The test files cannot import `src/store/progress.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/store/schema.ts`:

```ts
// zod/mini is Zod's tree-shakable build: the same validation with a much smaller bundle.
import * as z from 'zod/mini';
import { SKILL_IDS } from '../engine/skills';

export const PROGRESS_SCHEMA_VERSION = 1;

const difficulty = z.enum(['easy', 'medium', 'hard']);
const skillId = z.enum(SKILL_IDS);
const nonEmpty = z.string().check(z.minLength(1));

export const attemptSchema = z.object({
  problemId: nonEmpty,
  skill: skillId,
  difficulty,
  correct: z.boolean(),
  /** "A"-"D" for multiple choice, the typed text for typed answers. */
  response: z.string(),
  timeMs: z.int().check(z.nonnegative()),
  /** ISO timestamp. */
  at: nonEmpty,
  mode: z.enum(['practice', 'test']),
});

export const skillStateSchema = z.object({
  level: difficulty,
  /** Positive: correct answers in a row. Negative: wrong answers in a row. */
  streak: z.int(),
});

export const settingsSchema = z.object({
  targetScore: z.nullable(z.int().check(z.minimum(200), z.maximum(800))),
  timeMultiplier: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  untimed: z.boolean(),
});

export const progressSchema = z.object({
  schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
  settings: settingsSchema,
  attempts: z.array(attemptSchema),
  bookmarks: z.array(nonEmpty),
  skillState: z.partialRecord(skillId, skillStateSchema),
  /** Practice-test results. Their shape is defined in Phase 5; always empty until then. */
  testAttempts: z.array(z.unknown()),
  completedFixedTests: z.array(z.int().check(z.minimum(1), z.maximum(4))),
});

export type Attempt = z.infer<typeof attemptSchema>;
export type SkillState = z.infer<typeof skillStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Progress = z.infer<typeof progressSchema>;
```

`src/store/progress.ts`:

```ts
import type { Difficulty, ProblemId } from '../engine/problem';
import type { SkillId } from '../engine/skills';
import {
  PROGRESS_SCHEMA_VERSION,
  progressSchema,
  type Attempt,
  type Progress,
  type Settings,
} from './schema';

export const PROGRESS_KEY = 'fsm.progress.v1';
export const BACKUP_PREFIX = 'fsm.backup.';
export const MAX_ATTEMPTS = 5000;

/** The subset of the Web Storage API we use; lets tests pass a fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function emptyProgress(): Progress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    settings: { targetScore: null, timeMultiplier: 1, untimed: false },
    attempts: [],
    bookmarks: [],
    skillState: {},
    testAttempts: [],
    completedFixedTests: [],
  };
}

/** localStorage if it works in this browser (it can throw in private modes), otherwise null. */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__fsm_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export type LoadStatus = 'ok' | 'fresh' | 'recovered' | 'unavailable';

export interface LoadResult {
  progress: Progress;
  status: LoadStatus;
  /** Where unreadable data was copied, when status is 'recovered'. */
  backupKey?: string;
}

function backup(storage: KeyValueStore, raw: string, now: Date): string | undefined {
  const key = `${BACKUP_PREFIX}${now.toISOString()}`;
  try {
    storage.setItem(key, raw);
    return key;
  } catch {
    return undefined;
  }
}

/** Reads saved progress. Unreadable data is backed up (never deleted) and replaced with a fresh start. */
export function loadProgress(storage: KeyValueStore | null, now: Date = new Date()): LoadResult {
  if (storage === null) return { progress: emptyProgress(), status: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(PROGRESS_KEY);
  } catch {
    return { progress: emptyProgress(), status: 'unavailable' };
  }
  if (raw === null) return { progress: emptyProgress(), status: 'fresh' };
  try {
    const parsed = progressSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { progress: parsed.data, status: 'ok' };
  } catch {
    // fall through to recovery
  }
  const backupKey = backup(storage, raw, now);
  return backupKey === undefined
    ? { progress: emptyProgress(), status: 'recovered' }
    : { progress: emptyProgress(), status: 'recovered', backupKey };
}

/** Writes progress. Returns false when the browser refuses (quota, private mode). */
export function saveProgress(storage: KeyValueStore | null, progress: Progress): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

// ---- pure updates -------------------------------------------------------------------------

export function recordAttempt(progress: Progress, attempt: Attempt): Progress {
  const attempts = [...progress.attempts, attempt];
  return { ...progress, attempts: attempts.slice(Math.max(0, attempts.length - MAX_ATTEMPTS)) };
}

export function toggleBookmark(progress: Progress, id: ProblemId): Progress {
  const has = progress.bookmarks.includes(id);
  return {
    ...progress,
    bookmarks: has ? progress.bookmarks.filter((b) => b !== id) : [...progress.bookmarks, id],
  };
}

export function setSkillState(
  progress: Progress,
  skill: SkillId,
  state: { level: Difficulty; streak: number },
): Progress {
  return { ...progress, skillState: { ...progress.skillState, [skill]: state } };
}

export function updateSettings(progress: Progress, patch: Partial<Settings>): Progress {
  return { ...progress, settings: { ...progress.settings, ...patch } };
}

// ---- derived views ------------------------------------------------------------------------

export interface MissedItem {
  problemId: ProblemId;
  skill: SkillId;
  difficulty: Difficulty;
  at: string;
}

/** Problems whose most recent attempt was wrong, newest first. */
export function missedProblems(progress: Progress): MissedItem[] {
  const latest = new Map<ProblemId, Attempt>();
  for (const a of progress.attempts) latest.set(a.problemId, a);
  return [...latest.values()]
    .filter((a) => !a.correct)
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
    .map(({ problemId, skill, difficulty, at }) => ({ problemId, skill, difficulty, at }));
}

export interface Accuracy {
  correct: number;
  attempts: number;
}

/** Correct / attempted over a skill's most recent `lastN` attempts (all modes). */
export function skillAccuracy(progress: Progress, skill: SkillId, lastN = 20): Accuracy {
  const recent = progress.attempts.filter((a) => a.skill === skill).slice(-lastN);
  return { correct: recent.filter((a) => a.correct).length, attempts: recent.length };
}

/** Total attempts per skill, all time (within the stored window). */
export function attemptCount(progress: Progress, skill: SkillId): number {
  return progress.attempts.filter((a) => a.skill === skill).length;
}

// ---- export / import ----------------------------------------------------------------------

export function exportFileName(now: Date): string {
  return `free-sat-math-progress-${now.toISOString().slice(0, 10)}.json`;
}

export function exportProgress(progress: Progress): string {
  return `${JSON.stringify(progress, null, 2)}\n`;
}

export type ImportResult =
  | {
      ok: true;
      progress: Progress;
      summary: { attempts: number; tests: number; bookmarks: number };
    }
  | { ok: false; reason: string };

export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'This file is not valid JSON.' };
  }
  const parsed = progressSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first && first.path.length > 0 ? ` (at ${first.path.join('.')})` : '';
    return { ok: false, reason: `This file is not a Free SAT Math progress file${where}.` };
  }
  const p = parsed.data;
  return {
    ok: true,
    progress: p,
    summary: {
      attempts: p.attempts.length,
      tests: p.testAttempts.length,
      bookmarks: p.bookmarks.length,
    },
  };
}

/** Backs up the current saved data, then replaces it. Returns the backup key if one was written. */
export function replaceProgress(
  storage: KeyValueStore | null,
  next: Progress,
  now: Date = new Date(),
): { saved: boolean; backupKey?: string } {
  if (storage === null) return { saved: false };
  let backupKey: string | undefined;
  try {
    const current = storage.getItem(PROGRESS_KEY);
    if (current !== null) backupKey = backup(storage, current, now);
  } catch {
    // nothing to back up
  }
  const saved = saveProgress(storage, next);
  return backupKey === undefined ? { saved } : { saved, backupKey };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/progress.test.ts`
Expected: PASS, 13 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 132 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/store tests/unit/progress.test.ts
git commit -m "feat(store): versioned progress storage with backups and import/export"
```

---

### Task 12: Practice engine

This covers the starting level from a target score (spec §9.1), the auto-difficulty staircase (§9.2: three right in a row moves up, two wrong in a row moves down), and problem selection. Selection mixes in about 25% typed answers and never repeats a problem from the last 10. Phase 1's "mix" picks uniformly among the available skills; Phase 4 replaces it with the smart-mix weights.

**Files:**
- Create: `src/engine/practice.ts`
- Test: `tests/unit/practice.test.ts`

**Interfaces:**
- Consumes: `generateVerified` (Task 7); the registry lookups (Task 8); `parseProblemId` (Task 6).
- Produces:
  - `startingLevel(targetScore: number | null): Difficulty`
  - `interface Stair { level; streak }`, `updateStair(state, correct): Stair`, `UP_AFTER = 3`, `DOWN_AFTER = 2`
  - `SPR_SHARE = 0.25`, `RECENT_WINDOW = 10`
  - `nextProblem(skill, difficulty, rng, recent): Problem | null`
  - `similarProblem(problem, rng): Problem | null`
  - `pickMixSkill(rng): SkillId | null`

- [ ] **Step 1: Write the failing test**

`tests/unit/practice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  nextProblem,
  pickMixSkill,
  similarProblem,
  startingLevel,
  updateStair,
  type Stair,
} from '../../src/engine/practice';
import { parseProblemId } from '../../src/engine/problem';
import { createRng } from '../../src/engine/rng';

describe('startingLevel', () => {
  it('maps target scores to levels at the spec boundaries', () => {
    expect(startingLevel(null)).toBe('medium');
    expect(startingLevel(400)).toBe('easy');
    expect(startingLevel(550)).toBe('easy');
    expect(startingLevel(560)).toBe('medium');
    expect(startingLevel(680)).toBe('medium');
    expect(startingLevel(690)).toBe('hard');
  });
});

describe('updateStair', () => {
  const run = (start: Stair, answers: boolean[]) => answers.reduce(updateStair, start);
  it('moves up after 3 correct in a row', () => {
    expect(run({ level: 'easy', streak: 0 }, [true, true])).toEqual({ level: 'easy', streak: 2 });
    expect(run({ level: 'easy', streak: 0 }, [true, true, true])).toEqual({
      level: 'medium',
      streak: 0,
    });
  });
  it('moves down after 2 wrong in a row', () => {
    expect(run({ level: 'hard', streak: 0 }, [false])).toEqual({ level: 'hard', streak: -1 });
    expect(run({ level: 'hard', streak: 0 }, [false, false])).toEqual({
      level: 'medium',
      streak: 0,
    });
  });
  it('resets the streak when the answer flips', () => {
    expect(run({ level: 'medium', streak: 0 }, [true, true, false])).toEqual({
      level: 'medium',
      streak: -1,
    });
    expect(run({ level: 'medium', streak: 0 }, [false, true])).toEqual({
      level: 'medium',
      streak: 1,
    });
  });
  it('stays within easy and hard', () => {
    expect(run({ level: 'hard', streak: 0 }, [true, true, true])).toEqual({
      level: 'hard',
      streak: 0,
    });
    expect(run({ level: 'easy', streak: 0 }, [false, false])).toEqual({ level: 'easy', streak: 0 });
  });
});

describe('nextProblem', () => {
  it('returns a problem for the requested skill and difficulty', () => {
    const p = nextProblem('alg.systems', 'hard', createRng(1), []);
    expect(p?.skill).toBe('alg.systems');
    expect(p?.difficulty).toBe('hard');
  });
  it('returns null for a skill with no generators yet', () => {
    expect(nextProblem('geo.circles', 'easy', createRng(1), [])).toBeNull();
  });
  it('never returns a recently shown problem', () => {
    const first = nextProblem('alg.systems', 'easy', createRng(5), [])!;
    const again = nextProblem('alg.systems', 'easy', createRng(5), [first.id])!;
    expect(again.id).not.toBe(first.id);
  });
  it('mixes in typed answers at roughly the target share', () => {
    const rng = createRng(11);
    let spr = 0;
    for (let i = 0; i < 400; i++)
      if (nextProblem('alg.systems', 'medium', rng, [])?.format === 'spr') spr++;
    expect(spr / 400).toBeGreaterThan(0.1);
    expect(spr / 400).toBeLessThan(0.35);
  });
});

describe('similarProblem and pickMixSkill', () => {
  it('keeps the type, difficulty and format but changes the seed', () => {
    const p = nextProblem('alg.systems', 'medium', createRng(2), [])!;
    const s = similarProblem(p, createRng(3))!;
    const [a, b] = [parseProblemId(p.id), parseProblemId(s.id)];
    expect(a?.kind === 'generated' && b?.kind === 'generated').toBe(true);
    if (a?.kind === 'generated' && b?.kind === 'generated') {
      expect([b.typeId, b.difficulty, b.format]).toEqual([a.typeId, a.difficulty, a.format]);
      expect(b.seed).not.toBe(a.seed);
    }
  });
  it('picks an available skill for mix', () => {
    expect(pickMixSkill(createRng(1))).toBe('alg.systems');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/practice.test.ts`
Expected: FAIL. The test files cannot import `src/engine/practice.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/engine/practice.ts`:

```ts
import {
  DIFFICULTIES,
  parseProblemId,
  type Difficulty,
  type Format,
  type Problem,
  type ProblemId,
} from './problem';
import { generateVerified } from './build';
import { availableSkills, getProblemType, problemTypesForSkill } from './registry';
import type { Rng } from './rng';
import type { SkillId } from './skills';

/** Starting level from a target score (spec §9.1). */
export function startingLevel(targetScore: number | null): Difficulty {
  if (targetScore === null) return 'medium';
  if (targetScore <= 550) return 'easy';
  if (targetScore <= 680) return 'medium';
  return 'hard';
}

/** Per-skill auto-difficulty state. streak > 0: correct in a row; streak < 0: wrong in a row. */
export interface Stair {
  level: Difficulty;
  streak: number;
}

export const UP_AFTER = 3;
export const DOWN_AFTER = 2;

/** The staircase (spec §9.2): 3 right in a row moves up a level, 2 wrong in a row moves down. */
export function updateStair(state: Stair, correct: boolean): Stair {
  const i = DIFFICULTIES.indexOf(state.level);
  if (correct) {
    const streak = state.streak > 0 ? state.streak + 1 : 1;
    if (streak >= UP_AFTER)
      return { level: DIFFICULTIES[Math.min(i + 1, 2)] as Difficulty, streak: 0 };
    return { level: state.level, streak };
  }
  const streak = state.streak < 0 ? state.streak - 1 : -1;
  if (-streak >= DOWN_AFTER)
    return { level: DIFFICULTIES[Math.max(i - 1, 0)] as Difficulty, streak: 0 };
  return { level: state.level, streak };
}

/** Share of typed-answer problems when a type offers both formats (matches the test's ~25%). */
export const SPR_SHARE = 0.25;
/** Never repeat a problem shown this recently. */
export const RECENT_WINDOW = 10;

function chooseFormat(formats: readonly Format[], rng: Rng): Format {
  if (formats.includes('mcq') && formats.includes('spr'))
    return rng.chance(SPR_SHARE) ? 'spr' : 'mcq';
  return formats[0] as Format;
}

/**
 * The next practice problem for a skill and difficulty, never one of the recent ids.
 * Returns null when the skill has nothing at that difficulty (or generation keeps failing).
 */
export function nextProblem(
  skill: SkillId,
  difficulty: Difficulty,
  rng: Rng,
  recent: readonly ProblemId[],
): Problem | null {
  const types = problemTypesForSkill(skill).filter((t) => t.supports[difficulty].length > 0);
  if (types.length === 0) return null;
  const recentIds = new Set(recent.slice(-RECENT_WINDOW));
  for (let tries = 0; tries < 5; tries++) {
    const type = rng.pick(types);
    const problem = generateVerified(
      type,
      difficulty,
      chooseFormat(type.supports[difficulty], rng),
      rng,
    );
    if (problem !== null && !recentIds.has(problem.id)) return problem;
  }
  return null;
}

/** Same generator type, difficulty and format as a generated problem, with a new seed. */
export function similarProblem(problem: Problem, rng: Rng): Problem | null {
  const ref = parseProblemId(problem.id);
  if (ref === null || ref.kind !== 'generated') return null;
  const type = getProblemType(ref.typeId);
  return type ? generateVerified(type, ref.difficulty, ref.format, rng) : null;
}

/** Phase 1 "mix": a random available skill. Phase 4 replaces this with smart-mix weights (spec §9.3). */
export function pickMixSkill(rng: Rng): SkillId | null {
  const skills = availableSkills();
  return skills.length === 0 ? null : rng.pick(skills);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/practice.test.ts`
Expected: PASS, 11 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 143 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/engine/practice.ts tests/unit/practice.test.ts
git commit -m "feat(engine): practice staircase and problem selection"
```

---

### Task 13: One shared progress store for every island

Astro islands on a page share ES modules, so a single module-level store keeps them in sync. A `storage` event listener picks up writes from other tabs. `useProgress()` uses `useSyncExternalStore`, whose server snapshot is an empty, fresh progress record, so server-rendered islands hydrate cleanly.

**Files:**
- Create: `src/store/progress-store.ts`
- Test: `tests/unit/progress-store.test.ts`

**Interfaces:**
- Consumes: Task 11.
- Produces:
  - `interface StoreSnapshot { progress; status; saveFailed; backupKey? }`
  - `interface ProgressStore { getSnapshot(); subscribe(listener); update(fn); replace(next); reload() }`
  - `createProgressStore(storage, now?)`
  - `getProgressStore()`: browser only.
  - `useProgress(): StoreSnapshot & { store: ProgressStore | null }`

- [ ] **Step 1: Write the failing test**

`tests/unit/progress-store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  PROGRESS_KEY,
  emptyProgress,
  toggleBookmark,
  type KeyValueStore,
} from '../../src/store/progress';
import { createProgressStore } from '../../src/store/progress-store';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe('createProgressStore', () => {
  it('saves updates and notifies subscribers', () => {
    const storage = memory();
    const store = createProgressStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update((p) => toggleBookmark(p, 'x'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
    expect(JSON.parse(storage.data.get(PROGRESS_KEY)!).bookmarks).toEqual(['x']);
  });

  it('reports a failed save without throwing', () => {
    const storage = memory();
    storage.setItem = () => {
      throw new Error('full');
    };
    const store = createProgressStore(storage);
    store.update((p) => toggleBookmark(p, 'x'));
    expect(store.getSnapshot().saveFailed).toBe(true);
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
  });

  it('works with no storage at all', () => {
    const store = createProgressStore(null);
    expect(store.getSnapshot().status).toBe('unavailable');
    store.update((p) => toggleBookmark(p, 'x'));
    expect(store.getSnapshot().progress.bookmarks).toEqual(['x']);
  });

  it('replace() backs up the old data', () => {
    const storage = memory();
    const store = createProgressStore(storage, () => new Date('2026-09-24T00:00:00.000Z'));
    store.update((p) => toggleBookmark(p, 'x'));
    const r = store.replace(emptyProgress());
    expect(r.saved).toBe(true);
    expect(storage.data.has(r.backupKey!)).toBe(true);
    expect(store.getSnapshot().progress.bookmarks).toEqual([]);
  });

  it('reload() picks up another tab’s write', () => {
    const storage = memory();
    const store = createProgressStore(storage);
    storage.setItem(
      PROGRESS_KEY,
      JSON.stringify(toggleBookmark(emptyProgress(), 'from-other-tab')),
    );
    store.reload();
    expect(store.getSnapshot().progress.bookmarks).toEqual(['from-other-tab']);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/progress-store.test.ts`
Expected: FAIL. The test files cannot import `src/store/progress-store.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/store/progress-store.ts`:

```ts
import { useSyncExternalStore } from 'react';
import {
  PROGRESS_KEY,
  browserStorage,
  emptyProgress,
  loadProgress,
  replaceProgress,
  saveProgress,
  type KeyValueStore,
  type LoadStatus,
} from './progress';
import type { Progress } from './schema';

export interface StoreSnapshot {
  progress: Progress;
  status: LoadStatus;
  /** The last write failed (storage full or blocked). */
  saveFailed: boolean;
  /** Set when unreadable data was backed up on load. */
  backupKey?: string;
}

export interface ProgressStore {
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;
  /** Applies a pure update and saves it. */
  update(fn: (p: Progress) => Progress): void;
  /** Backs up the saved data, then replaces it (import and reset). */
  replace(next: Progress): { saved: boolean; backupKey?: string };
  /** Re-reads storage (another tab wrote to it). */
  reload(): void;
}

export function createProgressStore(
  storage: KeyValueStore | null,
  now: () => Date = () => new Date(),
): ProgressStore {
  const fromLoad = (): StoreSnapshot => {
    const loaded = loadProgress(storage, now());
    const base = { progress: loaded.progress, status: loaded.status, saveFailed: false };
    return loaded.backupKey === undefined ? base : { ...base, backupKey: loaded.backupKey };
  };
  let snapshot = fromLoad();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(fn) {
      const progress = fn(snapshot.progress);
      snapshot = { ...snapshot, progress, saveFailed: !saveProgress(storage, progress) };
      emit();
    },
    replace(next) {
      const result = replaceProgress(storage, next, now());
      snapshot = { ...snapshot, progress: next, saveFailed: !result.saved };
      emit();
      return result;
    },
    reload() {
      snapshot = fromLoad();
      emit();
    },
  };
}

let shared: ProgressStore | null = null;

/** The one store for this page, shared by every island. Browser only. */
export function getProgressStore(): ProgressStore {
  if (shared === null) {
    const store = createProgressStore(browserStorage());
    window.addEventListener('storage', (e) => {
      if (e.key === PROGRESS_KEY) store.reload();
    });
    shared = store;
  }
  return shared;
}

const SERVER_SNAPSHOT: StoreSnapshot = {
  progress: emptyProgress(),
  status: 'fresh',
  saveFailed: false,
};
const noop = () => () => {};

/** Progress for React components. Server-side rendering sees an empty, fresh snapshot. */
export function useProgress(): StoreSnapshot & { store: ProgressStore | null } {
  const store = typeof window === 'undefined' ? null : getProgressStore();
  const snap = useSyncExternalStore(
    store ? store.subscribe : noop,
    store ? store.getSnapshot : () => SERVER_SNAPSHOT,
    () => SERVER_SNAPSHOT,
  );
  return { ...snap, store };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/progress-store.test.ts`
Expected: PASS, 5 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 148 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/store/progress-store.ts tests/unit/progress-store.test.ts
git commit -m "feat(store): shared progress store with cross-tab sync"
```

---

### Task 14: Math rendering and display labels

One renderer serves both the React islands and the build-time Astro components. It HTML-escapes all text, renders math with KaTeX (with MathML for screen readers) and caches the results. If KaTeX fails, it falls back to showing the raw LaTeX. It also keeps punctuation that follows math on the same line, so `$k$?` never wraps before the `?`.

**Files:**
- Create: `src/lib/math-html.ts`, `src/components/MathText.tsx`, `src/lib/labels.ts`
- Test: `tests/unit/math-html.test.ts`, `tests/unit/labels.test.ts`

**Interfaces:**
- Consumes: `splitMath` and `paragraphs` (Task 4); `tex` (Task 4); `Rational` (Task 3); `LETTERS`, `Problem` and `Difficulty` (Task 6).
- Produces:
  - `math-html.ts`: `escapeHtml(s)`, `inlineHtml(source)`, `blockHtml(source)`.
  - `<MathText text block? className? />`
  - `labels.ts`:
    - `LEVEL_NAME: Record<Difficulty, string>`
    - `answerText(problem)`: gives `"B"`, `"$\frac{7}{2}$"` or a range.
    - `shortDate(iso)`

- [ ] **Step 1: Write the failing tests**

`tests/unit/math-html.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { blockHtml, escapeHtml, inlineHtml } from '../../src/lib/math-html';

describe('math-html', () => {
  it('escapes text and renders math with MathML for screen readers', () => {
    const html = inlineHtml('If <b> then $x^2$');
    expect(html.startsWith('If &lt;b&gt; then ')).toBe(true);
    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
  });
  it('keeps punctuation after math on the same line', () => {
    const html = inlineHtml('the value of $k$?');
    expect(html.startsWith('the value of <span class="nowrap"><span class="katex">')).toBe(true);
    expect(html.endsWith('?</span>')).toBe(true);
    expect(inlineHtml('$x$, then $y$')).toMatch(/,<\/span> then /);
  });
  it('turns \\$ into a dollar sign', () => {
    expect(inlineHtml('costs \\$5')).toBe('costs $5');
  });
  it('wraps paragraphs', () => {
    expect(blockHtml('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });
  it('falls back to escaped source when KaTeX fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(inlineHtml('$\\notacommand{<}$')).toBe(
      '<code class="math-fallback">\\notacommand{&lt;}</code>',
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('falls back to plain escaped text when a $ is unclosed', () => {
    expect(inlineHtml('a $ b <c>')).toBe('a $ b &lt;c&gt;');
  });
  it('escapes all five HTML characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
```

`tests/unit/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Problem } from '../../src/engine/problem';
import { LEVEL_NAME, answerText } from '../../src/lib/labels';

const make = (answer: Problem['answer'], format: Problem['format'] = 'spr'): Problem => ({
  id: 'x',
  skill: 'alg.systems',
  difficulty: 'easy',
  format,
  source: 'generated',
  stem: '',
  solution: [],
  answer,
});

describe('answerText', () => {
  it('names the letter for multiple choice', () => {
    expect(answerText(make({ kind: 'choice', index: 2 }, 'mcq'))).toBe('C');
  });
  it('writes typed answers as math', () => {
    expect(answerText(make({ kind: 'values', values: ['7/2', '-4'] }))).toBe(
      '$\\frac{7}{2}$ or $-4$',
    );
  });
  it('describes ranges', () => {
    const range = make({
      kind: 'interval',
      min: '2',
      max: '5/2',
      minInclusive: true,
      maxInclusive: true,
    });
    expect(answerText(range)).toBe('any value from $2$ to $\\frac{5}{2}$');
  });
  it('has a name for every level', () => {
    expect(Object.values(LEVEL_NAME)).toEqual(['Easy', 'Medium', 'Hard']);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/math-html.test.ts tests/unit/labels.test.ts`
Expected: FAIL. The test files cannot import `src/lib/math-html.ts` and `src/lib/labels.ts` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/lib/math-html.ts`:

```ts
import katex from 'katex';
import { paragraphs, splitMath } from '../engine/markup';

const cache = new Map<string, string>();

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] as string);

function renderMath(latex: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${latex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: true,
      output: 'htmlAndMathml',
    });
  } catch (err) {
    console.warn('[math] KaTeX could not render', latex, err);
    html = `<code class="math-fallback">${escapeHtml(latex)}</code>`;
  }
  cache.set(key, html);
  return html;
}

const TRAILING_PUNCTUATION = /^[.,;:!?)]+/;

/**
 * HTML for one run of text with $math$ (no paragraph wrapper). Text is escaped.
 * Punctuation right after math is kept on the same line as the math.
 */
export function inlineHtml(source: string): string {
  let segments;
  try {
    segments = splitMath(source);
  } catch {
    return escapeHtml(source);
  }
  const out: string[] = [];
  let skip = 0;
  segments.forEach((seg, i) => {
    if (seg.kind === 'text') {
      out.push(escapeHtml(seg.value.slice(skip)));
      skip = 0;
      return;
    }
    const next = segments[i + 1];
    const punct =
      next?.kind === 'text' && !seg.display
        ? TRAILING_PUNCTUATION.exec(next.value)?.[0]
        : undefined;
    const math = renderMath(seg.value, seg.display);
    if (punct === undefined) {
      out.push(math);
    } else {
      out.push(`<span class="nowrap">${math}${escapeHtml(punct)}</span>`);
      skip = punct.length;
    }
  });
  return out.join('');
}

/** HTML with each paragraph (split on blank lines) wrapped in <p>. */
export function blockHtml(source: string): string {
  return paragraphs(source)
    .map((p) => `<p>${inlineHtml(p)}</p>`)
    .join('');
}
```

`src/components/MathText.tsx`:

```tsx
import { useMemo } from 'react';
import { blockHtml, inlineHtml } from '../lib/math-html';

interface Props {
  text: string;
  /** Wrap paragraphs in <p> inside a <div>. Otherwise renders a <span>. */
  block?: boolean;
  className?: string;
}

/** Text with $math$, rendered by KaTeX. All text is HTML-escaped first. */
export default function MathText({ text, block = false, className }: Props) {
  const html = useMemo(() => (block ? blockHtml(text) : inlineHtml(text)), [text, block]);
  return block ? (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
```

`src/lib/labels.ts`:

```ts
import { tex } from '../engine/format';
import { LETTERS, type Difficulty, type Problem } from '../engine/problem';
import { Rational } from '../engine/rational';

export const LEVEL_NAME: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/** The correct answer as display text with $math$: "B", "$\frac{7}{2}$", or a range. */
export function answerText(problem: Problem): string {
  const a = problem.answer;
  if (a.kind === 'choice') return LETTERS[a.index] as string;
  if (a.kind === 'values') return a.values.map((v) => `$${tex(Rational.parse(v))}$`).join(' or ');
  return `any value from $${tex(Rational.parse(a.min))}$ to $${tex(Rational.parse(a.max))}$`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/math-html.test.ts tests/unit/labels.test.ts`
Expected: PASS, 11 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 159 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/lib/math-html.ts src/lib/labels.ts src/components/MathText.tsx \
  tests/unit/math-html.test.ts tests/unit/labels.test.ts
git commit -m "feat(ui): KaTeX math rendering and display labels"
```

---

### Task 15: Formula sheet and Desmos panel

The formula sheet is our own layout of standard formulas and facts.

The Desmos panel loads the API script only when a key is configured (spec §11.2). If the script errors or takes longer than 8 seconds, the panel falls back to an "Open Desmos" link. The loader clears its cached promise after a failure, so a later attempt can retry. The loader is injectable, which keeps tests off the network.

**Files:**
- Create: `src/components/FormulaSheet.tsx`, `src/components/DesmosPanel.tsx`
- Test: `tests/unit/formula-sheet.test.tsx`, `tests/unit/desmos-panel.test.tsx`

**Interfaces:**
- Consumes: `MathText` (Task 14).
- Produces:
  - `<FormulaSheet />`
  - `<DesmosPanel apiKey expressions? loader? />`
  - `loadDesmos(key, timeoutMs = 8000): Promise<DesmosApi>`
  - type `DesmosApi`
  - `DESMOS_URL`, `DESMOS_TIMEOUT_MS`

- [ ] **Step 1: Write the failing tests**

`tests/unit/formula-sheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FormulaSheet from '../../src/components/FormulaSheet';

describe('FormulaSheet', () => {
  it('shows the four sections with rendered math', () => {
    const { container } = render(<FormulaSheet />);
    for (const title of [
      'Area and circumference',
      'Right triangles',
      'Volume',
      'Angles and arcs',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(10);
  });
});
```

`tests/unit/desmos-panel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DesmosPanel, { loadDesmos, type DesmosApi } from '../../src/components/DesmosPanel';

describe('DesmosPanel', () => {
  it('shows the fallback link when there is no key', () => {
    render(<DesmosPanel apiKey={null} expressions={['y = 2x']} />);
    expect(screen.getByRole('link', { name: 'Open Desmos' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('y = 2x')).toBeInTheDocument();
  });

  it('falls back when the script fails to load', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('blocked')));
    render(<DesmosPanel apiKey="key" loader={loader} />);
    expect(screen.getByText('Loading calculator…')).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Open Desmos' });
  });

  it('embeds the calculator and preloads expressions when the script loads', async () => {
    const setExpression = vi.fn();
    const destroy = vi.fn();
    const api: DesmosApi = { GraphingCalculator: vi.fn(() => ({ setExpression, destroy })) };
    const { unmount } = render(
      <DesmosPanel
        apiKey="key"
        expressions={['y = 2x', 'x + y = 3']}
        loader={() => Promise.resolve(api)}
      />,
    );
    await waitFor(() => expect(screen.queryByText('Loading calculator…')).not.toBeInTheDocument());
    expect(setExpression).toHaveBeenCalledWith({ id: 'e0', latex: 'y = 2x' });
    expect(setExpression).toHaveBeenCalledWith({ id: 'e1', latex: 'x + y = 3' });
    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  it('loadDesmos gives up after the timeout and can be retried', async () => {
    const first = loadDesmos('key', 20);
    await expect(first).rejects.toThrow('timed out');
    const scripts = () => document.head.querySelectorAll('script[src*="desmos.com/api"]').length;
    const before = scripts();
    await expect(loadDesmos('key', 20)).rejects.toThrow('timed out');
    expect(scripts()).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/formula-sheet.test.tsx tests/unit/desmos-panel.test.tsx`
Expected: FAIL. The test files cannot import the two components because it does not exist yet.

- [ ] **Step 3: Implement**

The Desmos API version in the script URL is `v1.10`, the version documented at desmos.com/api when this plan was written.

`src/components/FormulaSheet.tsx`:

```tsx
import MathText from './MathText';

/** Standard formulas and facts, in our own layout. */
const SECTIONS: ReadonlyArray<{ title: string; items: ReadonlyArray<readonly [string, string]> }> =
  [
    {
      title: 'Area and circumference',
      items: [
        ['Rectangle', '$A = \\ell w$'],
        ['Triangle', '$A = \\frac{1}{2}bh$'],
        ['Circle', '$A = \\pi r^2$ and $C = 2\\pi r$'],
      ],
    },
    {
      title: 'Right triangles',
      items: [
        ['Pythagorean theorem', '$a^2 + b^2 = c^2$'],
        ['45-45-90 triangle', 'sides $s$, $s$, $s\\sqrt{2}$'],
        ['30-60-90 triangle', 'sides $x$, $x\\sqrt{3}$, $2x$'],
      ],
    },
    {
      title: 'Volume',
      items: [
        ['Rectangular box', '$V = \\ell wh$'],
        ['Cylinder', '$V = \\pi r^2 h$'],
        ['Sphere', '$V = \\frac{4}{3}\\pi r^3$'],
        ['Cone', '$V = \\frac{1}{3}\\pi r^2 h$'],
        ['Rectangular pyramid', '$V = \\frac{1}{3}\\ell wh$'],
      ],
    },
    {
      title: 'Angles and arcs',
      items: [
        ['Angles of a triangle', 'add up to $180^\\circ$'],
        ['One full turn', '$360^\\circ$, which is $2\\pi$ radians'],
      ],
    },
  ];

export default function FormulaSheet() {
  return (
    <div className="formula-sheet">
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <dl>
            {section.items.map(([name, formula]) => (
              <div key={name} className="formula-row">
                <dt>{name}</dt>
                <dd>
                  <MathText text={formula} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
```

`src/components/DesmosPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

interface DesmosCalculator {
  setExpression(expr: { id: string; latex: string }): void;
  destroy(): void;
}
export interface DesmosApi {
  GraphingCalculator(el: HTMLElement, options?: Record<string, unknown>): DesmosCalculator;
}
declare global {
  interface Window {
    Desmos?: DesmosApi;
  }
}

export const DESMOS_TIMEOUT_MS = 8000;
export const DESMOS_URL = 'https://www.desmos.com/calculator';
const scriptUrl = (key: string) =>
  `https://www.desmos.com/api/v1.10/calculator.js?apiKey=${encodeURIComponent(key)}`;

let loading: Promise<DesmosApi> | null = null;

/** Loads the Desmos API script once. Rejects on error or after the timeout. */
export function loadDesmos(key: string, timeoutMs = DESMOS_TIMEOUT_MS): Promise<DesmosApi> {
  if (window.Desmos) return Promise.resolve(window.Desmos);
  if (loading) return loading;
  loading = new Promise<DesmosApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl(key);
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error('Desmos load timed out')), timeoutMs);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Desmos) resolve(window.Desmos);
      else reject(new Error('Desmos script loaded without the Desmos global'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Desmos script failed to load'));
    };
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

interface Props {
  apiKey: string | null;
  /** LaTeX expressions to preload. */
  expressions?: readonly string[];
  /** Injected in tests. */
  loader?: (key: string) => Promise<DesmosApi>;
}

export default function DesmosPanel({ apiKey, expressions = [], loader = loadDesmos }: Props) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const exprKey = expressions.join('\n');

  useEffect(() => {
    if (apiKey === null) return;
    let calc: DesmosCalculator | null = null;
    let cancelled = false;
    loader(apiKey).then(
      (api) => {
        if (cancelled || host.current === null) return;
        calc = api.GraphingCalculator(host.current, {
          expressions: true,
          keypad: true,
          settingsMenu: false,
        });
        exprKey
          .split('\n')
          .filter((latex) => latex !== '')
          .forEach((latex, i) => calc?.setExpression({ id: `e${i}`, latex }));
        setReady(true);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      calc?.destroy();
    };
  }, [apiKey, loader, exprKey]);

  if (apiKey === null || failed) {
    return (
      <div className="desmos-fallback">
        <p>
          Use the Desmos graphing calculator in a new tab.
          {expressions.length > 0 && ' Try entering:'}
        </p>
        {expressions.length > 0 && (
          <ul className="desmos-expressions">
            {expressions.map((e) => (
              <li key={e}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        )}
        <a className="button" href={DESMOS_URL} target="_blank" rel="noopener noreferrer">
          Open Desmos
        </a>
      </div>
    );
  }
  return (
    <div className="desmos-panel">
      <div ref={host} className="desmos-host" aria-label="Desmos graphing calculator" />
      {!ready && <p className="hint">Loading calculator…</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/formula-sheet.test.tsx tests/unit/desmos-panel.test.tsx`
Expected: PASS, 5 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 164 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/components/FormulaSheet.tsx src/components/DesmosPanel.tsx \
  tests/unit/formula-sheet.test.tsx tests/unit/desmos-panel.test.tsx
git commit -m "feat(ui): formula sheet and Desmos panel with fallback"
```

---

### Task 16: Problem view

This is one problem from start to finish:
1. The student answers, either by picking a choice or by typing, where `sanitizeSprTyping` strips invalid characters as they go.
2. **Check** grades the answer. Badly formed typed answers get a hint instead of a grade.
3. After grading, the student sees the solution, plus the note explaining a wrong choice they picked.

The view also has bookmarking, the formula sheet, the calculator and copy link. The choice letter is part of each radio's accessible name, so a screen reader says "B, 2", not just "2".

**Files:**
- Create: `src/components/ChoiceList.tsx`, `src/components/AnswerInput.tsx`, `src/components/Solution.tsx`, `src/components/ProblemView.tsx`
- Test: `tests/unit/problem-view.test.tsx`

**Interfaces:**
- Consumes: `checkSpr` and `sanitizeSprTyping` (Task 5); `getSkill` (Task 6); `url` (Task 1); `LEVEL_NAME` and `answerText` (Task 14); `DesmosPanel` and `FormulaSheet` (Task 15).
- Produces:
  - `<ProblemView problem desmosKey bookmarked onToggleBookmark onGraded onNext? onSimilar? />`. Render it with `key={problem.id}`.
  - `interface GradedResult { correct; response; timeMs }`. `response` is `"A"` to `"D"` or the typed text.
  - The stem container has `id="stem-<problem.id>"`. The end-to-end tests read the current problem from it.

- [ ] **Step 1: Write the failing test**

`tests/unit/problem-view.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProblemView from '../../src/components/ProblemView';
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
  solution: ['Add: $1 + 1 = 2$.'],
  distractorNotes: { A: 'Forgot to add.', C: 'Added one too many.', D: 'Doubled twice.' },
};

const spr: Problem = {
  id: 'g:test@1:easy:spr:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  format: 'spr',
  source: 'generated',
  stem: 'What is $7 \\div 2$?',
  answer: { kind: 'values', values: ['7/2'] },
  solution: ['Divide: $7 \\div 2 = \\frac{7}{2}$.'],
};

const setup = (problem: Problem) => {
  const onGraded = vi.fn();
  const onNext = vi.fn();
  render(
    <ProblemView
      problem={problem}
      desmosKey={null}
      bookmarked={false}
      onToggleBookmark={() => {}}
      onGraded={onGraded}
      onNext={onNext}
    />,
  );
  return { onGraded, onNext, user: userEvent.setup() };
};

describe('ProblemView multiple choice', () => {
  it('disables Check until a choice is picked', () => {
    setup(mcq);
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('grades a correct answer and offers the next problem', async () => {
    const { onGraded, onNext, user } = setup(mcq);
    await user.click(screen.getByRole('radio', { name: /B/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Correct!');
    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, response: 'B' }),
    );
    await user.click(screen.getByRole('button', { name: 'Next problem' }));
    expect(onNext).toHaveBeenCalled();
  });

  it('explains a wrong answer and locks the choices', async () => {
    const { onGraded, user } = setup(mcq);
    await user.click(screen.getByRole('radio', { name: /C/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByText('Added one too many.')).toBeInTheDocument();
    expect(screen.getByText(/correct answer/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /A/ })).toBeDisabled();
    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: false, response: 'C' }),
    );
  });
});

describe('ProblemView typed answer', () => {
  it('accepts an equivalent decimal', async () => {
    const { onGraded, user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '3.5');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Correct!');
    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, response: '3.5' }),
    );
  });

  it('shows a hint instead of grading a badly formed answer', async () => {
    const { onGraded, user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '3/');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Enter numbers only');
    expect(onGraded).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Your answer')).toBeEnabled();
  });

  it('strips characters the answer box does not allow', async () => {
    const { user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '$1,2x');
    expect(screen.getByLabelText('Your answer')).toHaveValue('12');
  });

  it('checks on Enter', async () => {
    const { onGraded, user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '7/2{Enter}');
    expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});

describe('ProblemView tools', () => {
  it('opens the formula sheet and the Desmos fallback', async () => {
    const { user } = setup(mcq);
    await user.click(screen.getByRole('button', { name: 'Formula sheet' }));
    expect(screen.getByText('Pythagorean theorem')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Calculator' }));
    expect(screen.getByRole('link', { name: 'Open Desmos' })).toHaveAttribute(
      'href',
      'https://www.desmos.com/calculator',
    );
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/problem-view.test.tsx`
Expected: FAIL. The test files cannot import `src/components/ProblemView.tsx` because it does not exist yet.

- [ ] **Step 3: Implement**

`src/components/ChoiceList.tsx`:

```tsx
import { LETTERS, type Choice } from '../engine/problem';
import MathText from './MathText';

interface Props {
  problemId: string;
  choices: readonly Choice[];
  selected: number | null;
  onSelect(index: number): void;
  /** After checking: the correct index, and inputs are locked. */
  revealIndex: number | null;
}

export default function ChoiceList({ problemId, choices, selected, onSelect, revealIndex }: Props) {
  const locked = revealIndex !== null;
  return (
    <fieldset className="choices" disabled={locked}>
      <legend className="visually-hidden">Answer choices</legend>
      {choices.map((choice, i) => {
        const letter = LETTERS[i] as string;
        const state = !locked
          ? selected === i
            ? 'is-selected'
            : ''
          : i === revealIndex
            ? 'is-correct'
            : selected === i
              ? 'is-wrong'
              : '';
        return (
          <label key={letter} className={`choice ${state}`}>
            <input
              type="radio"
              name={`choice-${problemId}`}
              value={letter}
              checked={selected === i}
              onChange={() => onSelect(i)}
            />
            <span className="choice-letter">{letter}</span>
            <MathText text={choice.text} className="choice-text" />
            {locked && i === revealIndex && (
              <span className="visually-hidden"> (correct answer)</span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
```

`src/components/AnswerInput.tsx`:

```tsx
import { sanitizeSprTyping } from '../engine/answer';

interface Props {
  id: string;
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  locked: boolean;
}

export default function AnswerInput({ id, value, onChange, onSubmit, locked }: Props) {
  return (
    <div className="spr">
      <label htmlFor={id}>Your answer</label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={locked}
        aria-describedby={`${id}-help`}
        onChange={(e) => onChange(sanitizeSprTyping(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
      />
      <p id={`${id}-help`} className="hint">
        Up to 5 characters (6 if negative). Fractions like 7/2 and decimals like 3.5 both work.
      </p>
    </div>
  );
}
```

`src/components/Solution.tsx`:

```tsx
import { LETTERS, type Problem } from '../engine/problem';
import { answerText } from '../lib/labels';
import MathText from './MathText';

interface Props {
  problem: Problem;
  /** The wrong choice the student picked, if any. */
  wrongIndex: number | null;
}

export default function Solution({ problem, wrongIndex }: Props) {
  const note =
    wrongIndex === null
      ? undefined
      : problem.distractorNotes?.[LETTERS[wrongIndex] as 'A' | 'B' | 'C' | 'D'];
  return (
    <section className="solution" aria-label="Solution">
      {note !== undefined && (
        <p className="distractor-note">
          <strong>About your answer: </strong>
          <MathText text={note} />
        </p>
      )}
      <p className="answer-line">
        <strong>Answer: </strong>
        <MathText text={answerText(problem)} />
      </p>
      <h3>Solution</h3>
      <ol>
        {problem.solution.map((step, i) => (
          <li key={i}>
            <MathText text={step} />
          </li>
        ))}
      </ol>
    </section>
  );
}
```

`src/components/ProblemView.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { checkSpr, type Grade } from '../engine/answer';
import { LETTERS, type Problem } from '../engine/problem';
import { getSkill } from '../engine/skills';
import { LEVEL_NAME } from '../lib/labels';
import { url } from '../lib/paths';
import AnswerInput from './AnswerInput';
import ChoiceList from './ChoiceList';
import DesmosPanel from './DesmosPanel';
import FormulaSheet from './FormulaSheet';
import MathText from './MathText';
import Solution from './Solution';

export interface GradedResult {
  correct: boolean;
  /** "A"-"D" or the typed text. */
  response: string;
  timeMs: number;
}

interface Props {
  problem: Problem;
  desmosKey: string | null;
  bookmarked: boolean;
  onToggleBookmark(): void;
  onGraded(result: GradedResult): void;
  onNext?: () => void;
  onSimilar?: () => void;
}

/** One problem: answer, check, see the solution. Give it key={problem.id} so it resets per problem. */
export default function ProblemView({
  problem,
  desmosKey,
  bookmarked,
  onToggleBookmark,
  onGraded,
  onNext,
  onSimilar,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [grade, setGrade] = useState<Grade | null>(null);
  const [tool, setTool] = useState<'none' | 'formulas' | 'desmos'>('none');
  const [copied, setCopied] = useState(false);
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  const checked = grade?.status === 'checked';
  const isMcq = problem.answer.kind === 'choice';
  const ready = isMcq ? selected !== null : typed.trim() !== '';

  const check = () => {
    if (checked || !ready) return;
    let result: Grade;
    let response: string;
    if (problem.answer.kind === 'choice') {
      result = { status: 'checked', correct: selected === problem.answer.index };
      response = LETTERS[selected as number] as string;
    } else {
      result = checkSpr(problem.answer, typed);
      response = typed.trim();
    }
    setGrade(result);
    if (result.status === 'checked') {
      onGraded({
        correct: result.correct,
        response,
        timeMs: Math.round(performance.now() - startedAt.current),
      });
    }
  };

  const copyLink = async () => {
    const link = new URL(
      url(`/problem/?id=${encodeURIComponent(problem.id)}`),
      window.location.origin,
    ).href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  const revealIndex = checked && problem.answer.kind === 'choice' ? problem.answer.index : null;
  const wrongIndex = revealIndex !== null && selected !== revealIndex ? selected : null;

  return (
    <article className="problem" aria-labelledby={`stem-${problem.id}`}>
      <header className="problem-meta">
        <span>
          {getSkill(problem.skill).name} · {LEVEL_NAME[problem.difficulty]}
        </span>
        <button
          type="button"
          className="link-button"
          aria-pressed={bookmarked}
          onClick={onToggleBookmark}
        >
          {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
        </button>
      </header>

      <div id={`stem-${problem.id}`}>
        <MathText block text={problem.stem} className="problem-stem" />
      </div>

      {problem.choices ? (
        <ChoiceList
          problemId={problem.id}
          choices={problem.choices}
          selected={selected}
          onSelect={setSelected}
          revealIndex={revealIndex}
        />
      ) : (
        <AnswerInput
          id={`answer-${problem.id}`}
          value={typed}
          onChange={setTyped}
          onSubmit={check}
          locked={checked}
        />
      )}

      <div className="problem-actions">
        {!checked ? (
          <button type="button" className="button primary" disabled={!ready} onClick={check}>
            Check
          </button>
        ) : (
          <>
            {onNext && (
              <button type="button" className="button primary" onClick={onNext}>
                Next problem
              </button>
            )}
            {onSimilar && (
              <button type="button" className="button" onClick={onSimilar}>
                Try a similar one
              </button>
            )}
          </>
        )}
      </div>

      <div role="status" aria-live="polite" className="feedback">
        {grade?.status === 'invalid' && <p className="feedback-invalid">{grade.reason}</p>}
        {grade?.status === 'checked' &&
          (grade.correct ? (
            <p className="feedback-correct">Correct!</p>
          ) : (
            <p className="feedback-wrong">Not quite. Here's how to solve it.</p>
          ))}
      </div>

      {checked && <Solution problem={problem} wrongIndex={wrongIndex} />}

      <footer className="problem-tools">
        <button
          type="button"
          className="button"
          aria-expanded={tool === 'formulas'}
          onClick={() => setTool(tool === 'formulas' ? 'none' : 'formulas')}
        >
          Formula sheet
        </button>
        <button
          type="button"
          className="button"
          aria-expanded={tool === 'desmos'}
          onClick={() => setTool(tool === 'desmos' ? 'none' : 'desmos')}
        >
          Calculator
        </button>
        <button type="button" className="button" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </footer>
      {tool === 'formulas' && <FormulaSheet />}
      {tool === 'desmos' && <DesmosPanel apiKey={desmosKey} expressions={problem.desmos ?? []} />}
    </article>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/problem-view.test.tsx`
Expected: PASS, 8 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 172 tests in total.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/components/ChoiceList.tsx src/components/AnswerInput.tsx src/components/Solution.tsx \
  src/components/ProblemView.tsx tests/unit/problem-view.test.tsx
git commit -m "feat(ui): problem view with grading, solutions and tools"
```

---

### Task 17: Site layout, styles, theme, static pages and browser tests

This adds:
- the shared layout, with a skip link, the header nav, a theme toggle that works with no framework JS, and the disclaimer footer;
- original styles with light and dark tokens;
- the real home page, the formula sheet page, about, and 404;
- Playwright.

The theme key must match between `src/lib/theme.ts` and the two inline scripts in the layout.

**Files:**
- Create: `src/lib/theme.ts`, `src/components/TargetScoreSelect.tsx`, `src/layouts/BaseLayout.astro`, `src/styles/global.css`, `public/favicon.svg`
- Create: `src/pages/formulas/index.astro`, `src/pages/about/index.astro`, `src/pages/404.astro`
- Modify: `src/pages/index.astro` (replaces the temporary page from Task 1)
- Create: `playwright.config.ts`, `tests/e2e/site.spec.ts`
- Test: `tests/unit/theme.test.ts`

**Interfaces:**
- Consumes: `startingLevel` (Task 12); `useProgress` and `getProgressStore` (Task 13); `updateSettings` (Task 11); `LEVEL_NAME` (Task 14); `FormulaSheet` (Task 15); `url` and `SITE` (Task 1).
- Produces:
  - `theme.ts`: `ThemePref`, `THEME_KEY = 'fsm.theme'`, `getThemePref()`, `setThemePref(pref)`.
  - `<TargetScoreSelect id />` and `TARGET_OPTIONS`.
  - `BaseLayout.astro` with props `{ title?; description? }`.
  - The CSS classes later tasks use: `button`, `primary`, `danger`, `link-button`, `button-row`, `field`, `hint`, `banner`, `banner-warn`, `notice`, `confirm`, `empty`, `badge`, `item-list`, `skill-list`, `stat`, `visually-hidden`, `nowrap`, `lead`, `breadcrumbs`, `worked-example`, `example-choices`, `status-line`, `inline-option`.

- [ ] **Step 1: Write the failing unit test**

`tests/unit/theme.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_KEY, getThemePref, setThemePref } from '../../src/lib/theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('theme preference', () => {
  it('defaults to system', () => {
    expect(getThemePref()).toBe('system');
  });
  it('saves and applies light or dark', () => {
    setThemePref('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(getThemePref()).toBe('dark');
  });
  it('system clears the saved choice', () => {
    setThemePref('light');
    setThemePref('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
  it('ignores junk in storage', () => {
    localStorage.setItem(THEME_KEY, 'purple');
    expect(getThemePref()).toBe('system');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/theme.test.ts`
Expected: FAIL. The test files cannot import `src/lib/theme.ts` because it does not exist yet.

- [ ] **Step 3: Implement the theme helper and the target-score picker**

`src/lib/theme.ts`:

```ts
export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'fsm.theme';

export function getThemePref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Saves the preference (if storage works) and applies it to <html data-theme>. */
export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  if (pref === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = pref;
}
```

`src/components/TargetScoreSelect.tsx`:

```tsx
import { startingLevel } from '../engine/practice';
import { LEVEL_NAME } from '../lib/labels';
import { updateSettings } from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';

export const TARGET_OPTIONS: readonly number[] = Array.from({ length: 61 }, (_, i) => 200 + i * 10);

export default function TargetScoreSelect({ id }: { id: string }) {
  const { progress } = useProgress();
  const target = progress.settings.targetScore;
  return (
    <div className="field">
      <label htmlFor={id}>Your target SAT Math score</label>
      <select
        id={id}
        value={target ?? ''}
        onChange={(e) => {
          const value = e.target.value === '' ? null : Number(e.target.value);
          getProgressStore().update((p) => updateSettings(p, { targetScore: value }));
        }}
      >
        <option value="">Not set</option>
        {TARGET_OPTIONS.map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </select>
      <p className="hint">
        Practice starts at <strong>{LEVEL_NAME[startingLevel(target)]}</strong> and adjusts as you
        go.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/theme.test.ts`
Expected: PASS, 4 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 176 tests in total.

- [ ] **Step 5: Add the layout, styles, icon and static pages**

`.wrap` must set only `padding-inline`. A `padding` shorthand there would override `main`'s top padding, because a class selector beats an element selector. On screens 640px or narrower, the nav drops to its own row. Footer links are a flex row, which keeps the separators from disappearing when Astro compresses whitespace.

`src/layouts/BaseLayout.astro`:

```astro
---
import 'katex/dist/katex.min.css';
import '../styles/global.css';
import { url } from '../lib/paths';
import { SITE } from '../site.config';

interface Props {
  title?: string;
  description?: string;
}
const { title, description = SITE.description } = Astro.props;
const fullTitle = title ? `${title} · ${SITE.name}` : SITE.name;
const nav: ReadonlyArray<readonly [string, string]> = [
  ['/skills/', 'Skills'],
  ['/review/', 'Review'],
  ['/formulas/', 'Formulas'],
  ['/settings/', 'Settings'],
];
const here = Astro.url.pathname;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{fullTitle}</title>
    <meta name="description" content={description} />
    <link rel="icon" href={url('/favicon.svg')} type="image/svg+xml" />
    <!-- Apply a saved theme before first paint. Key must match THEME_KEY in src/lib/theme.ts. -->
    <script is:inline>
      try {
        const t = localStorage.getItem('fsm.theme');
        if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
      } catch {}
    </script>
  </head>
  <body>
    <a class="skip-link" href="#main">
      Skip to content
    </a>
    <header class="site-header">
      <div class="wrap header-inner">
        <a class="brand" href={url('/')}>
          {SITE.name}
        </a>
        <nav aria-label="Main">
          <ul>
            {nav.map(([href, label]) => (
              <li>
                <a href={url(href)} aria-current={here.startsWith(url(href)) ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          class="theme-toggle"
          id="theme-toggle"
          aria-label="Switch between light and dark theme"
        >
          ◐
        </button>
      </div>
    </header>
    <main id="main" class="wrap">
      <slot />
    </main>
    <footer class="site-footer">
      <div class="wrap">
        <p>{SITE.disclaimer}</p>
        <p class="footer-links">
          <a href={url('/about/')}>About and privacy</a>
          <a href={url('/formulas/')}>Formula sheet</a>
          <a href={url('/settings/')}>Settings</a>
        </p>
      </div>
    </footer>
    <script is:inline>
      document.getElementById('theme-toggle')?.addEventListener('click', () => {
        const root = document.documentElement;
        const dark = root.dataset.theme
          ? root.dataset.theme === 'dark'
          : matchMedia('(prefers-color-scheme: dark)').matches;
        const next = dark ? 'light' : 'dark';
        root.dataset.theme = next;
        try {
          localStorage.setItem('fsm.theme', next);
        } catch {}
      });
    </script>
  </body>
</html>
```

`src/styles/global.css`:

```css
:root {
  --bg: #f7f8fa;
  --surface: #ffffff;
  --text: #1c2430;
  --muted: #5b6676;
  --border: #d8dde5;
  --accent: #1f5f8b;
  --accent-text: #ffffff;
  --accent-soft: #e5eff7;
  --good: #1e7a46;
  --good-soft: #e3f4ea;
  --bad: #b3261e;
  --bad-soft: #fbe9e7;
  --warn-soft: #fff4d6;
  --focus: #f0a500;
  --radius: 10px;
  --font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #11151b;
    --surface: #1a2029;
    --text: #e6e9ee;
    --muted: #a3adbb;
    --border: #334050;
    --accent: #7bb8e6;
    --accent-text: #0d1b26;
    --accent-soft: #1d3040;
    --good: #6fd39a;
    --good-soft: #173526;
    --bad: #ff8a80;
    --bad-soft: #3b1f1d;
    --warn-soft: #3a3016;
    color-scheme: dark;
  }
}

:root[data-theme='dark'] {
  --bg: #11151b;
  --surface: #1a2029;
  --text: #e6e9ee;
  --muted: #a3adbb;
  --border: #334050;
  --accent: #7bb8e6;
  --accent-text: #0d1b26;
  --accent-soft: #1d3040;
  --good: #6fd39a;
  --good-soft: #173526;
  --bad: #ff8a80;
  --bad-soft: #3b1f1d;
  --warn-soft: #3a3016;
  color-scheme: dark;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 1.0625rem;
  line-height: 1.6;
}

a {
  color: var(--accent);
}

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}

h1,
h2,
h3 {
  line-height: 1.25;
}

.wrap {
  max-width: 52rem;
  margin: 0 auto;
  padding-inline: 16px;
}

.nowrap {
  white-space: nowrap;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.skip-link {
  position: absolute;
  left: -999px;
}
.skip-link:focus {
  left: 16px;
  top: 8px;
  background: var(--surface);
  padding: 8px 12px;
  z-index: 10;
}

/* Header and footer */
.site-header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.header-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  min-height: 56px;
}
.brand {
  font-weight: 700;
  text-decoration: none;
  color: var(--text);
  margin-right: auto;
}
.site-header nav ul {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.site-header nav a {
  text-decoration: none;
  padding: 10px 2px;
  display: inline-block;
}
.site-header nav a[aria-current='page'] {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 6px;
}
.theme-toggle {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font-size: 1.1rem;
  cursor: pointer;
}
main {
  padding-top: 24px;
  padding-bottom: 48px;
}
.site-footer {
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.9rem;
  padding: 16px 0 32px;
}
.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

@media (max-width: 640px) {
  .site-header nav {
    order: 3;
    flex-basis: 100%;
  }
}

/* Buttons and fields */
.button,
button.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}
.button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
.button.danger {
  color: var(--bad);
  border-color: var(--bad);
}
.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.link-button {
  background: none;
  border: none;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
  min-height: 44px;
  padding: 0 4px;
}
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.field {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
.field select,
.spr input {
  font: inherit;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  max-width: 16rem;
}
.hint {
  color: var(--muted);
  font-size: 0.9rem;
  margin: 4px 0;
}
.inline-option {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 44px;
}
fieldset {
  border: none;
  margin: 0;
  padding: 0;
}

/* Notices */
.banner,
.notice,
.confirm {
  background: var(--accent-soft);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin: 0 0 16px;
}
.banner-warn {
  background: var(--warn-soft);
}
.empty {
  color: var(--muted);
}
.badge {
  font-size: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  color: var(--muted);
}

/* Problem */
.problem {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.problem-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 0.9rem;
}
.problem-stem {
  overflow-x: auto;
}
.choices {
  display: grid;
  gap: 8px;
  margin: 16px 0;
}
.choice {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  overflow-x: auto;
}
.choice input {
  width: 20px;
  height: 20px;
  flex: none;
}
.choice-letter {
  font-weight: 700;
  min-width: 1.2em;
}
.choice.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.choice.is-correct {
  border-color: var(--good);
  background: var(--good-soft);
}
.choice.is-wrong {
  border-color: var(--bad);
  background: var(--bad-soft);
}
.spr {
  margin: 16px 0;
  display: grid;
  gap: 6px;
}
.problem-actions {
  margin: 8px 0;
}
.feedback-correct {
  color: var(--good);
  font-weight: 700;
}
.feedback-wrong,
.feedback-invalid {
  color: var(--bad);
  font-weight: 700;
}
.solution {
  border-top: 1px solid var(--border);
  margin-top: 16px;
  padding-top: 8px;
}
.solution ol {
  padding-left: 1.4em;
}
.solution li {
  margin: 6px 0;
  overflow-x: auto;
}
.distractor-note {
  background: var(--bad-soft);
  border-radius: var(--radius);
  padding: 8px 12px;
}
.problem-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-top: 1px solid var(--border);
  margin-top: 16px;
  padding-top: 12px;
}
.math-fallback {
  font-family: ui-monospace, monospace;
}
.practice-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 16px;
  color: var(--muted);
  margin-bottom: 12px;
}

/* Desmos */
.desmos-host {
  height: 420px;
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.desmos-fallback {
  margin-top: 12px;
}

/* Formula sheet */
.formula-sheet {
  display: grid;
  gap: 8px 24px;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  margin-top: 12px;
}
.formula-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  padding: 6px 0;
}
.formula-row dd {
  margin: 0;
  text-align: right;
}

/* Lists, tables, skills */
.item-list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 8px;
}
.item-list li,
.skill-list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.skill-list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 8px;
}
.skill-list .is-soon {
  color: var(--muted);
}
.stat {
  color: var(--muted);
  font-size: 0.9rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  display: block;
  overflow-x: auto;
}
th,
td {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

/* Lessons */
.lead {
  font-size: 1.15rem;
  color: var(--muted);
}
.breadcrumbs {
  font-size: 0.9rem;
  color: var(--muted);
}
.worked-example {
  margin: 24px 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.worked-example figcaption {
  font-weight: 700;
}
.example-choices {
  list-style: none;
  padding: 0;
}
.lesson table {
  display: table;
}
.status-line {
  min-height: 1.6em;
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
  }
}
```

`public/favicon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1f5f8b"/><path d="M6 17h4l4 8 7-18h5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

`src/pages/index.astro`:

```astro
---
import TargetScoreSelect from '../components/TargetScoreSelect';
import BaseLayout from '../layouts/BaseLayout.astro';
import { url } from '../lib/paths';
---

<BaseLayout>
  <h1>Free SAT Math practice</h1>
  <p class="lead">
    Practice every SAT Math skill at your level, with step-by-step solutions. No sign-up, no
    paywall, and your progress stays on your device.
  </p>
  <TargetScoreSelect client:only="react" id="home-target" />
  <p>
    <a class="button primary" href={url('/practice/?skill=mix&level=auto')}>
      Start practicing
    </a>
  </p>
  <h2>How it works</h2>
  <ul>
    <li>Problems are organized by the official SAT Math skills, each at easy, medium and hard.</li>
    <li>
      Every problem has a worked solution. When you miss one, you'll see why that answer was
      tempting.
    </li>
    <li>Auto mode raises the difficulty after 3 right in a row and eases off after 2 misses.</li>
  </ul>
  <p>
    Available now: <a href={url('/skills/alg.systems/')}>systems of linear equations</a>. More
    skills are on the way. See the <a href={url('/skills/')}>full skills list</a>.
  </p>
</BaseLayout>
```

`src/pages/formulas/index.astro`:

```astro
---
import FormulaSheet from '../../components/FormulaSheet';
import BaseLayout from '../../layouts/BaseLayout.astro';
---

<BaseLayout title="Formula sheet" description="Common SAT Math formulas and facts.">
  <h1>Formula sheet</h1>
  <p class="lead">Standard formulas and facts that come up on SAT Math.</p>
  <FormulaSheet />
</BaseLayout>
```

`src/pages/about/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { SITE } from '../../site.config';
---

<BaseLayout title="About and privacy">
  <h1>About {SITE.name}</h1>
  <p>
    {SITE.name} is a free SAT Math practice site. Every problem, solution and lesson here is written
    for this site. There are no ads, no accounts and no paid tier.
  </p>
  <h2>Privacy</h2>
  <ul>
    <li>No cookies, no analytics and no trackers.</li>
    <li>
      Your progress is saved only in this browser. Use Settings to download it or move it to another
      device.
    </li>
    <li>
      This site is hosted on GitHub Pages, which keeps standard server logs. If you open the
      embedded calculator, your browser loads it from desmos.com.
    </li>
  </ul>
  <h2>Licenses</h2>
  <p>
    The code is MIT-licensed. The problems, solutions and lessons are licensed CC BY 4.0, so
    teachers can reuse them.
  </p>
  <p>{SITE.disclaimer}</p>
</BaseLayout>
```

`src/pages/404.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { url } from '../lib/paths';
---

<BaseLayout title="Page not found">
  <h1>Page not found</h1>
  <p>
    That page doesn't exist. Try the <a href={url('/skills/')}>skills list</a> or the{' '}
    <a href={url('/')}>home page</a>.
  </p>
</BaseLayout>
```

- [ ] **Step 6: Set up Playwright and write the site tests**

Run: `npx playwright install chromium`
Expected: downloads Chromium Headless Shell, about 95 MB, once per machine.

Notes on the config:
- `--ignore-lock` keeps `astro preview` in the foreground. Astro 7 detects AI agents and moves the preview to the background, then exits, which Playwright reports as "Process from config.webServer exited early".
- Port 4322 with `reuseExistingServer: false` stops a leftover preview of a different build from being tested by mistake.

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

// A dedicated port, and never reuse a running server: a leftover preview of a different build
// (for example one built with BASE_PATH) would make every test fail in confusing ways.
const PORT = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    // --ignore-lock keeps `astro preview` in the foreground. Astro 7 backgrounds it (and exits)
    // when it detects an AI agent, which makes Playwright report "exited early".
    command: `npx astro build && npx astro preview --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } },
    },
  ],
});
```

`tests/e2e/site.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('the theme choice sticks across page loads', async ({ page }) => {
  await page.goto('/formulas/');
  const before = await page.evaluate(() => document.documentElement.dataset['theme'] ?? 'system');
  await page.getByRole('button', { name: 'Switch between light and dark theme' }).click();
  await page.reload();
  const after = await page.evaluate(() => document.documentElement.dataset['theme']);
  expect(after).toBeDefined();
  expect(after).not.toBe(before);
});

test('the formula sheet and footer disclaimer render', async ({ page }) => {
  await page.goto('/formulas/');
  await expect(page.getByRole('heading', { name: 'Formula sheet', level: 1 })).toBeVisible();
  await expect(page.getByText('Pythagorean theorem')).toBeVisible();
  await expect(
    page.getByText(/not affiliated with, and does not endorse, this site/),
  ).toBeVisible();
});

test('unknown pages show the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('static pages fit a 360px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/', '/formulas/', '/about/']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
```

Run: `npm run test:e2e`
Expected: PASS, 8 tests (4 tests in the `desktop` and `narrow` projects each).

- [ ] **Step 7: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/lib/theme.ts src/components/TargetScoreSelect.tsx src/layouts src/styles public src/pages \
  playwright.config.ts tests/e2e/site.spec.ts tests/unit/theme.test.ts
git commit -m "feat(site): layout, styles, theme toggle, static pages and Playwright"
```

---

### Task 18: Practice session and problem pages

`/practice/?skill=<id|mix>&level=<easy|medium|hard|auto>` runs a session:
- It records each attempt.
- On auto, it moves the staircase.
- It keeps a tally for the session.
- It shows a banner when storage is blocked or data was recovered.

`/problem/?id=…` shows one problem by id, for shared links and review retries.

The browser tests build the same problems in Node with the site's own engine, so they know the right answers.

**Files:**
- Create: `src/components/StorageBanner.tsx`, `src/components/PracticeSession.tsx`, `src/components/ProblemPage.tsx`
- Create: `src/pages/practice/index.astro`, `src/pages/problem/index.astro`
- Create: `tests/e2e/helpers.ts`, `tests/e2e/practice.spec.ts`
- Test: `tests/unit/practice-params.test.ts`

**Interfaces:**
- Consumes: Tasks 7, 8, 11 to 16.
- Produces:
  - `readPracticeParams(search): { skill: SkillId | 'mix'; level: Difficulty | 'auto' } | null`
  - `<StorageBanner snapshot />`
  - the islands `PracticeSession` and `ProblemPage`, which take `{ desmosKey }` and must use `client:only="react"`
  - e2e helpers: `fixedProblem(typeId, difficulty, format, seed)`, `problemUrl(id)`, `currentProblem(page)`, `answer(page, problem, correct)`

- [ ] **Step 1: Write the failing unit test**

`tests/unit/practice-params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readPracticeParams } from '../../src/components/PracticeSession';

describe('readPracticeParams', () => {
  it('defaults to mixed practice at auto level', () => {
    expect(readPracticeParams('')).toEqual({ skill: 'mix', level: 'auto' });
  });
  it('reads a skill and a level', () => {
    expect(readPracticeParams('?skill=alg.systems&level=hard')).toEqual({
      skill: 'alg.systems',
      level: 'hard',
    });
  });
  it('rejects unknown skills and levels', () => {
    expect(readPracticeParams('?skill=alg.nope')).toBeNull();
    expect(readPracticeParams('?skill=alg.systems&level=extreme')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run --project unit tests/unit/practice-params.test.ts`
Expected: FAIL. The test files cannot import `src/components/PracticeSession.tsx` because it does not exist yet.

- [ ] **Step 3: Implement the islands and pages**

`src/components/StorageBanner.tsx`:

```tsx
import type { StoreSnapshot } from '../store/progress-store';

export default function StorageBanner({ snapshot }: { snapshot: StoreSnapshot }) {
  if (snapshot.status === 'unavailable' || snapshot.saveFailed) {
    return (
      <p className="banner banner-warn" role="status">
        Progress won't be saved in this browser because storage is blocked or full. Everything else
        still works.
      </p>
    );
  }
  if (snapshot.status === 'recovered') {
    return (
      <p className="banner" role="status">
        We couldn't read your saved progress, so you're starting fresh. A backup copy was kept in
        this browser.
      </p>
    );
  }
  return null;
}
```

`src/components/PracticeSession.tsx`:

```tsx
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
```

`src/components/ProblemPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { similarProblem } from '../engine/practice';
import { problemFromId } from '../engine/registry';
import { createRng, randomSeed } from '../engine/rng';
import { url } from '../lib/paths';
import { recordAttempt, toggleBookmark } from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';
import ProblemView from './ProblemView';
import StorageBanner from './StorageBanner';

const idFromLocation = () => new URLSearchParams(window.location.search).get('id') ?? '';

/** /problem/?id=... : one problem by id (shared links and review retries). */
export default function ProblemPage({ desmosKey }: { desmosKey: string | null }) {
  const snapshot = useProgress();
  const rng = useMemo(() => createRng(randomSeed()), []);
  const [id, setId] = useState(idFromLocation);
  const found = useMemo(() => problemFromId(id), [id]);

  useEffect(() => {
    const onPop = () => setId(idFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (found === null) {
    return (
      <div className="notice">
        <h1>Problem not found</h1>
        <p>This link doesn't match a problem on this site. It may be mistyped or out of date.</p>
        <p>
          <a href={url('/skills/')}>Browse skills</a> ·{' '}
          <a href={url('/review/')}>Your review list</a>
        </p>
      </div>
    );
  }

  const { problem, updated } = found;
  return (
    <div>
      <StorageBanner snapshot={snapshot} />
      {updated && <p className="banner">This problem was updated since you last saw it.</p>}
      <ProblemView
        key={problem.id}
        problem={problem}
        desmosKey={desmosKey}
        bookmarked={snapshot.progress.bookmarks.includes(problem.id)}
        onToggleBookmark={() => getProgressStore().update((p) => toggleBookmark(p, problem.id))}
        onGraded={(result) =>
          getProgressStore().update((p) =>
            recordAttempt(p, {
              problemId: problem.id,
              skill: problem.skill,
              difficulty: problem.difficulty,
              correct: result.correct,
              response: result.response,
              timeMs: result.timeMs,
              at: new Date().toISOString(),
              mode: 'practice',
            }),
          )
        }
        onSimilar={() => {
          const similar = similarProblem(problem, rng);
          if (similar === null) return;
          window.history.pushState(null, '', url(`/problem/?id=${encodeURIComponent(similar.id)}`));
          setId(similar.id);
        }}
      />
    </div>
  );
}
```

`src/pages/practice/index.astro`:

```astro
---
import PracticeSession from '../../components/PracticeSession';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { desmosApiKey } from '../../site.config';
---

<BaseLayout title="Practice">
  <h1 class="visually-hidden">Practice</h1>
  <PracticeSession client:only="react" desmosKey={desmosApiKey()} />
  <noscript>
    <p class="notice">Practice needs JavaScript turned on.</p>
  </noscript>
</BaseLayout>
```

`src/pages/problem/index.astro`:

```astro
---
import ProblemPage from '../../components/ProblemPage';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { desmosApiKey } from '../../site.config';
---

<BaseLayout title="Problem">
  <h1 class="visually-hidden">Problem</h1>
  <ProblemPage client:only="react" desmosKey={desmosApiKey()} />
  <noscript>
    <p class="notice">Problems need JavaScript turned on.</p>
  </noscript>
</BaseLayout>
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run --project unit tests/unit/practice-params.test.ts`
Expected: PASS, 3 tests.

Then run the whole unit suite: `npm test`
Expected: PASS, 179 tests in total.

- [ ] **Step 5: Write and run the browser tests**

`tests/e2e/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { LETTERS, type Problem } from '../../src/engine/problem';
import { buildProblem } from '../../src/engine/build';
import { getProblemType, problemFromId } from '../../src/engine/registry';

/** A fixed generated problem, built in Node with the same engine the site uses. */
export function fixedProblem(
  typeId: string,
  difficulty: 'easy' | 'medium' | 'hard',
  format: 'mcq' | 'spr',
  seed: number,
): Problem {
  const type = getProblemType(typeId);
  if (!type) throw new Error(`unknown type ${typeId}`);
  return buildProblem(type, difficulty, format, seed);
}

export const problemUrl = (id: string) => `/problem/?id=${encodeURIComponent(id)}`;

/** The problem currently on screen, read from the stem element's id. */
export async function currentProblem(page: Page): Promise<Problem> {
  const stem = page.locator('[id^="stem-g:"]');
  await expect(stem).toBeVisible();
  const id = (await stem.getAttribute('id'))!.slice('stem-'.length);
  const found = problemFromId(id);
  if (!found) throw new Error(`could not rebuild ${id}`);
  return found.problem;
}

/** Answers the problem on screen, correctly or not, and presses Check. */
export async function answer(page: Page, problem: Problem, correct: boolean): Promise<void> {
  if (problem.answer.kind === 'choice') {
    const index = correct ? problem.answer.index : (problem.answer.index + 1) % 4;
    await page.locator(`input[type=radio][value="${LETTERS[index]}"]`).check();
  } else {
    const right = answerValue(problem)!;
    await page.getByLabel('Your answer').fill(correct ? right : right === '1' ? '2' : '1');
  }
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: correct ? 'Correct!' : 'Not quite' }),
  ).toBeVisible();
}
```

`tests/e2e/practice.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { answer, currentProblem, fixedProblem, problemUrl } from './helpers';

test('home page reaches a problem in one click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start practicing' }).click();
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
});

test('auto practice moves up a level after 3 correct answers', async ({ page }) => {
  await page.goto('/practice/?skill=alg.systems&level=auto');
  await expect(page.getByText('Level: Medium (adjusts to you)')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await answer(page, await currentProblem(page), true);
    await page.getByRole('button', { name: 'Next problem' }).click();
  }
  await expect(page.getByText('Level: Hard (adjusts to you)')).toBeVisible();
  await expect(page.getByText('3 of 3 correct')).toBeVisible();
});

test('a problem link shows the solution after a wrong answer', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'easy', 'spr', 7);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, false);
  await expect(page.getByRole('heading', { name: 'Solution' })).toBeVisible();
});

test('try a similar one keeps the type and difficulty', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solution-count', 'hard', 'mcq', 5);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, true);
  await page.getByRole('button', { name: 'Try a similar one' }).click();
  const similar = await currentProblem(page);
  expect(similar.id).not.toBe(problem.id);
  expect(similar.id.startsWith('g:alg.systems.solution-count@1:hard:mcq:')).toBe(true);
});

test('a problem can be answered with the keyboard alone', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'medium', 'mcq', 21);
  await page.goto(problemUrl(problem.id));
  await page.locator('input[type=radio]').first().focus();
  const correct = problem.answer.kind === 'choice' ? problem.answer.index : 0;
  for (let i = 0; i < correct; i++) await page.keyboard.press('ArrowDown');
  if (correct === 0) await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Check' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
});

test('an unknown problem link shows a helpful message', async ({ page }) => {
  await page.goto(problemUrl('g:not.a.type@1:easy:mcq:1'));
  await expect(page.getByRole('heading', { name: 'Problem not found' })).toBeVisible();
});

test('a bad practice link offers the skills list', async ({ page }) => {
  await page.goto('/practice/?skill=not-a-skill');
  await expect(page.getByRole('link', { name: 'Choose a skill' })).toBeVisible();
});

test('when storage is blocked, a banner explains and practice still works', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await page.goto('/practice/?skill=alg.systems&level=easy');
  await expect(page.getByText("Progress won't be saved in this browser")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
});

test('the problem page fits a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(problemUrl(fixedProblem('alg.systems.word-system', 'easy', 'mcq', 2).id));
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
```

Run: `npm run test:e2e`
Expected: PASS, 26 tests (13 tests in each of the two projects).

- [ ] **Step 6: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/components/StorageBanner.tsx src/components/PracticeSession.tsx src/components/ProblemPage.tsx \
  src/pages/practice src/pages/problem tests/e2e tests/unit/practice-params.test.ts
git commit -m "feat(site): practice session and problem pages"
```

---

### Task 19: Review and settings pages

`/review/` shows three things:
- missed problems, meaning the latest attempt was wrong, each with **Retry**;
- bookmarks;
- accuracy by skill.

`/settings/` covers:
- the target score;
- practice-test timing (stored now, used in Phase 5);
- the theme;
- download, import and reset. Import and reset both back up the current data first.

**Files:**
- Create: `src/components/ReviewPage.tsx`, `src/components/SettingsPage.tsx`
- Create: `src/pages/review/index.astro`, `src/pages/settings/index.astro`
- Create: `tests/e2e/review.spec.ts`

**Interfaces:**
- Consumes:
  - `describeProblemId` (Task 8)
  - `SKILLS` and `getSkill` (Task 6)
  - `missedProblems`, `skillAccuracy`, `attemptCount`, `toggleBookmark`, `emptyProgress`, `exportFileName`, `exportProgress`, `parseImport` and `updateSettings` (Task 11)
  - `useProgress` and `getProgressStore` (Task 13)
  - `LEVEL_NAME` and `shortDate` (Task 14)
  - theme (Task 17)
  - `TargetScoreSelect` (Task 17)
  - `StorageBanner` (Task 18)
- Produces: the islands `ReviewPage` and `SettingsPage`, which must use `client:only="react"`.

- [ ] **Step 1: Write the failing browser tests**

These include Review Focus items 1 (unreadable saved progress) and 2 (two tabs).

`tests/e2e/review.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { answer, fixedProblem, problemUrl } from './helpers';

test('a wrong answer lands in review, and a right retry clears it', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'easy', 'spr', 7);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, false);

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (1)' })).toBeVisible();
  await page.getByRole('link', { name: 'Retry' }).click();
  await answer(page, problem, true);

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (0)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '50% of last 2' })).toBeVisible();
});

test('bookmarks show up in review and can be removed', async ({ page }) => {
  const problem = fixedProblem('alg.systems.word-system', 'medium', 'mcq', 3);
  await page.goto(problemUrl(problem.id));
  await page.getByRole('button', { name: '☆ Bookmark' }).click();
  await expect(page.getByRole('button', { name: '★ Bookmarked' })).toBeVisible();

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Bookmarks (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('heading', { name: 'Bookmarks (0)' })).toBeVisible();
});

test('progress survives download, reset and import', async ({ page }) => {
  const problem = fixedProblem('alg.systems.solve-system', 'medium', 'mcq', 11);
  await page.goto(problemUrl(problem.id));
  await answer(page, problem, false);

  await page.goto('/settings/');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download progress' }).click();
  const file = await (await downloading).path();
  expect(JSON.parse(readFileSync(file, 'utf8')).attempts).toHaveLength(1);

  await page.getByRole('button', { name: 'Reset progress…' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Progress reset.')).toBeVisible();

  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText(/It has 1 answered problems/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace my progress' }).click();
  await expect(page.getByText('Progress imported.')).toBeVisible();

  await page.goto('/review/');
  await expect(page.getByRole('heading', { name: 'Missed problems (1)' })).toBeVisible();
});

test('a file that is not a progress file is rejected with a reason', async ({ page }) => {
  await page.goto('/settings/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByText(/not a Free SAT Math progress file/)).toBeVisible();
});

test('unreadable saved progress is backed up and the student is told', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('fsm.progress.v1', '{"schemaVersion": 99, "garbage": true}');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/review/');
  await expect(page.getByText("We couldn't read your saved progress")).toBeVisible();
  const backups = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('fsm.backup.')),
  );
  expect(backups).toHaveLength(1);
});

test('a second open tab picks up changes without a reload', async ({ context }) => {
  const problem = fixedProblem('alg.systems.word-system', 'hard', 'spr', 4);
  const review = await context.newPage();
  await review.goto('/review/');
  await expect(review.getByRole('heading', { name: 'Bookmarks (0)' })).toBeVisible();

  const practice = await context.newPage();
  await practice.goto(problemUrl(problem.id));
  await practice.getByRole('button', { name: '☆ Bookmark' }).click();

  await expect(review.getByRole('heading', { name: 'Bookmarks (1)' })).toBeVisible();
});

test('review and settings fit a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/review/', '/settings/']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
```

Run: `npm run test:e2e`
Expected: FAIL. The new `review.spec.ts` tests can't find the Review and Settings headings, because `/review/` and `/settings/` return the 404 page. The 26 tests from Tasks 17 and 18 still pass.

- [ ] **Step 2: Implement**

`src/components/ReviewPage.tsx`:

```tsx
import { describeProblemId } from '../engine/registry';
import { SKILLS, getSkill } from '../engine/skills';
import { LEVEL_NAME, shortDate } from '../lib/labels';
import { url } from '../lib/paths';
import { attemptCount, missedProblems, skillAccuracy, toggleBookmark } from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';
import StorageBanner from './StorageBanner';

const problemLink = (id: string) => url(`/problem/?id=${encodeURIComponent(id)}`);

export default function ReviewPage() {
  const snapshot = useProgress();
  const { progress } = snapshot;
  const missed = missedProblems(progress);
  const bookmarks = [...progress.bookmarks].reverse();
  const practiced = SKILLS.filter((s) => attemptCount(progress, s.id) > 0);

  return (
    <div className="review">
      <StorageBanner snapshot={snapshot} />

      <section aria-labelledby="missed-heading">
        <h2 id="missed-heading">Missed problems ({missed.length})</h2>
        {missed.length === 0 ? (
          <p className="empty">
            Nothing here yet. Problems you get wrong show up here so you can retry them.
          </p>
        ) : (
          <ul className="item-list">
            {missed.map((m) => (
              <li key={m.problemId}>
                <span>
                  {getSkill(m.skill).name} · {LEVEL_NAME[m.difficulty]} · {shortDate(m.at)}
                </span>
                <a className="button" href={problemLink(m.problemId)}>
                  Retry
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="bookmarks-heading">
        <h2 id="bookmarks-heading">Bookmarks ({bookmarks.length})</h2>
        {bookmarks.length === 0 ? (
          <p className="empty">Bookmark a problem to keep it here.</p>
        ) : (
          <ul className="item-list">
            {bookmarks.map((id) => {
              const info = describeProblemId(id);
              return (
                <li key={id}>
                  <span>
                    {info === null
                      ? 'This problem is no longer available'
                      : `${getSkill(info.skill).name} · ${LEVEL_NAME[info.difficulty]}`}
                  </span>
                  <span className="button-row">
                    {info !== null && (
                      <a className="button" href={problemLink(id)}>
                        Open
                      </a>
                    )}
                    <button
                      type="button"
                      className="button"
                      onClick={() => getProgressStore().update((p) => toggleBookmark(p, id))}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="accuracy-heading">
        <h2 id="accuracy-heading">Accuracy by skill</h2>
        {practiced.length === 0 ? (
          <p className="empty">Answer a few problems to see how you're doing in each skill.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Problems tried</th>
                <th scope="col">Recent accuracy</th>
              </tr>
            </thead>
            <tbody>
              {practiced.map((s) => {
                const acc = skillAccuracy(progress, s.id);
                return (
                  <tr key={s.id}>
                    <th scope="row">{s.name}</th>
                    <td>{attemptCount(progress, s.id)}</td>
                    <td>
                      {Math.round((100 * acc.correct) / acc.attempts)}% of last {acc.attempts}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

`src/components/SettingsPage.tsx`:

```tsx
import { useState } from 'react';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';
import {
  emptyProgress,
  exportFileName,
  exportProgress,
  parseImport,
  updateSettings,
} from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';
import type { Progress } from '../store/schema';
import StorageBanner from './StorageBanner';
import TargetScoreSelect from './TargetScoreSelect';

type Pending = {
  progress: Progress;
  summary: { attempts: number; tests: number; bookmarks: number };
};

export default function SettingsPage() {
  const snapshot = useProgress();
  const { settings } = snapshot.progress;
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('');
  const store = getProgressStore();

  const download = () => {
    const blob = new Blob([exportProgress(snapshot.progress)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = exportFileName(new Date());
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage('Progress file downloaded.');
  };

  const chooseFile = async (file: File | undefined) => {
    if (file === undefined) return;
    const result = parseImport(await file.text());
    if (result.ok) {
      setPending({ progress: result.progress, summary: result.summary });
      setMessage('');
    } else {
      setPending(null);
      setMessage(result.reason);
    }
  };

  return (
    <div className="settings">
      <StorageBanner snapshot={snapshot} />

      <section aria-labelledby="goal-heading">
        <h2 id="goal-heading">Goal</h2>
        <TargetScoreSelect id="settings-target" />
      </section>

      <section aria-labelledby="timing-heading">
        <h2 id="timing-heading">Practice test timing</h2>
        <fieldset>
          <legend>Time per module</legend>
          {([1, 1.5, 2] as const).map((m) => (
            <label key={m} className="inline-option">
              <input
                type="radio"
                name="time-multiplier"
                checked={settings.timeMultiplier === m}
                onChange={() => store.update((p) => updateSettings(p, { timeMultiplier: m }))}
              />
              {m === 1 ? 'Standard' : `${m}× (extended time)`}
            </label>
          ))}
        </fieldset>
        <label className="inline-option">
          <input
            type="checkbox"
            checked={settings.untimed}
            onChange={(e) => store.update((p) => updateSettings(p, { untimed: e.target.checked }))}
          />
          Untimed practice tests
        </label>
      </section>

      <section aria-labelledby="theme-heading">
        <h2 id="theme-heading">Theme</h2>
        <div className="field">
          <label htmlFor="theme">Color theme</label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => {
              const pref = e.target.value as ThemePref;
              setThemePref(pref);
              setTheme(pref);
            }}
          >
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <section aria-labelledby="data-heading">
        <h2 id="data-heading">Your data</h2>
        <p>
          Your progress is stored only in this browser. To move it to another device, download it
          here and import it there.
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={download}>
            Download progress
          </button>
          <label className="button">
            Import progress file
            <input
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(e) => {
                void chooseFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="button danger" onClick={() => setConfirmReset(true)}>
            Reset progress…
          </button>
        </div>

        {pending !== null && (
          <div className="confirm" role="group" aria-label="Confirm import">
            <p>
              Replace your current progress with this file? It has {pending.summary.attempts}{' '}
              answered problems, {pending.summary.bookmarks} bookmarks and {pending.summary.tests}{' '}
              practice tests. Your current progress is backed up in this browser first.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  store.replace(pending.progress);
                  setPending(null);
                  setMessage('Progress imported.');
                }}
              >
                Replace my progress
              </button>
              <button type="button" className="button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {confirmReset && (
          <div className="confirm" role="group" aria-label="Confirm reset">
            <p>
              This clears your answers, bookmarks and settings. A backup is kept in this browser.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  store.replace(emptyProgress());
                  setConfirmReset(false);
                  setMessage('Progress reset.');
                }}
              >
                Reset
              </button>
              <button type="button" className="button" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <p role="status" aria-live="polite" className="status-line">
          {message}
        </p>
      </section>
    </div>
  );
}
```

`src/pages/review/index.astro`:

```astro
---
import ReviewPage from '../../components/ReviewPage';
import BaseLayout from '../../layouts/BaseLayout.astro';
---

<BaseLayout
  title="Review"
  description="Retry missed problems, revisit bookmarks, and see your accuracy by skill."
>
  <h1>Review</h1>
  <ReviewPage client:only="react" />
  <noscript>
    <p class="notice">Review needs JavaScript turned on.</p>
  </noscript>
</BaseLayout>
```

`src/pages/settings/index.astro`:

```astro
---
import SettingsPage from '../../components/SettingsPage';
import BaseLayout from '../../layouts/BaseLayout.astro';
---

<BaseLayout title="Settings">
  <h1>Settings</h1>
  <SettingsPage client:only="react" />
  <noscript>
    <p class="notice">Settings need JavaScript turned on.</p>
  </noscript>
</BaseLayout>
```

- [ ] **Step 3: Run the browser tests**

Run: `npm run test:e2e`
Expected: PASS, 40 tests.

- [ ] **Step 4: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/components/ReviewPage.tsx src/components/SettingsPage.tsx \
  src/pages/review src/pages/settings tests/e2e/review.spec.ts
git commit -m "feat(site): review and settings pages with import/export"
```

---

### Task 20: Skills map, lesson and worked examples

This adds:
- `/skills/`: all 19 skills by domain. It is rendered on the server, then fills in the student's stats. Unavailable skills say "Coming soon".
- `/skills/<skillId>/`: one page per lesson in the content collection, with practice buttons.
- The first lesson, which is original writing.
  - Inline math in lessons uses `<M t="..." />`, because MDX does not render `$...$`.
  - Worked examples are built at build time from the generators, with fixed seeds. A build fails if an example stops passing `verify()`.

**Files:**
- Create: `src/components/SkillsList.tsx`, `src/components/M.astro`, `src/components/WorkedExample.astro`, `src/content.config.ts`, `src/content/lessons/alg.systems.mdx`
- Create: `src/pages/skills/index.astro`, `src/pages/skills/[skillId].astro`
- Create: `tests/e2e/skills.spec.ts`

**Interfaces:**
- Consumes: `buildProblem` (Task 7); `getProblemType` and `isSkillAvailable` (Task 8); `DOMAINS`, `skillsInDomain`, `getSkill` and `SKILL_IDS` (Task 6); `LETTERS` (Task 6); `answerText` (Task 14); `inlineHtml` and `blockHtml` (Task 14); `useProgress` (Task 13); `attemptCount` and `skillAccuracy` (Task 11).
- Produces:
  - the `lessons` content collection, with frontmatter `{ title; skill: SkillId; summary }`
  - `<M t />`
  - `<WorkedExample typeId difficulty format seed title? />`

- [ ] **Step 1: Write the failing browser tests**

`tests/e2e/skills.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('the skills list links available skills and marks the rest', async ({ page }) => {
  await page.goto('/skills/');
  await expect(page.getByRole('heading', { name: 'Algebra' })).toBeVisible();
  await expect(page.getByText('Coming soon')).toHaveCount(18);
  await page
    .getByRole('link', { name: 'Systems of two linear equations in two variables' })
    .click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Systems of two linear equations in two variables',
    }),
  ).toBeVisible();
});

test('a lesson shows worked examples with a hidden solution', async ({ page }) => {
  await page.goto('/skills/alg.systems/');
  const example = page.locator('figure.worked-example').first();
  await expect(example.getByText('Example: elimination')).toBeVisible();
  await expect(example.getByRole('heading', { name: 'Solution' })).toHaveCount(0);
  await example.getByText('Show the answer and solution').click();
  await expect(example.getByText(/Answer:/)).toBeVisible();
});

test('lesson practice buttons open a practice session at that level', async ({ page }) => {
  await page.goto('/skills/alg.systems/');
  await page.getByRole('link', { name: 'Hard' }).click();
  await expect(page.getByText('Level: Hard')).toBeVisible();
});

test('skills pages fit a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/skills/', '/skills/alg.systems/']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
```

Run: `npm run test:e2e`
Expected: FAIL. The `skills.spec.ts` tests find no "Algebra" heading, because `/skills/` doesn't exist yet. The other 40 tests pass.

- [ ] **Step 2: Implement**

`src/components/SkillsList.tsx`:

```tsx
import { isSkillAvailable } from '../engine/registry';
import { DOMAINS, skillsInDomain } from '../engine/skills';
import { url } from '../lib/paths';
import { attemptCount, skillAccuracy } from '../store/progress';
import { useProgress } from '../store/progress-store';

/** All 19 skills by domain. Rendered on the server, then filled in with the student's stats. */
export default function SkillsList() {
  const { progress } = useProgress();
  return (
    <div className="skills">
      {DOMAINS.map((domain) => (
        <section key={domain.id} className="domain" aria-labelledby={`domain-${domain.id}`}>
          <h2 id={`domain-${domain.id}`}>{domain.name}</h2>
          <p className="hint">About {Math.round(domain.share * 100)}% of the math questions</p>
          <ul className="skill-list">
            {skillsInDomain(domain.id).map((skill) => {
              const available = isSkillAvailable(skill.id);
              const tried = attemptCount(progress, skill.id);
              const acc = skillAccuracy(progress, skill.id);
              return (
                <li key={skill.id} className={available ? '' : 'is-soon'}>
                  {available ? (
                    <a href={url(`/skills/${skill.id}/`)}>{skill.name}</a>
                  ) : (
                    <span>{skill.name}</span>
                  )}
                  {!available && <span className="badge">Coming soon</span>}
                  {available && tried > 0 && (
                    <span className="stat">
                      {tried} tried · {Math.round((100 * acc.correct) / acc.attempts)}% of last{' '}
                      {acc.attempts}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

`src/components/M.astro`:

```astro
---
/** Inline math for lessons: <M t="x + y = 5" />. */
import { inlineHtml } from '../lib/math-html';
interface Props {
  t: string;
}
const { t } = Astro.props;
---

<Fragment set:html={inlineHtml(`$${t}$`)} />
```

`src/components/WorkedExample.astro`:

```astro
---
/** A generated problem rendered at build time, with its solution behind a <details> toggle. */
import { LETTERS, type Difficulty, type Format } from '../engine/problem';
import { buildProblem } from '../engine/build';
import { getProblemType } from '../engine/registry';
import { answerText } from '../lib/labels';
import { blockHtml, inlineHtml } from '../lib/math-html';

interface Props {
  typeId: string;
  difficulty: Difficulty;
  format: Format;
  seed: number;
  title?: string;
}
const { typeId, difficulty, format, seed, title = 'Worked example' } = Astro.props;
const type = getProblemType(typeId);
if (!type) throw new Error(`WorkedExample: unknown problem type ${typeId}`);
const problem = buildProblem(type, difficulty, format, seed);
if (!type.verify(problem)) throw new Error(`WorkedExample: ${problem.id} failed verification`);
---

<figure class="worked-example">
  <figcaption>{title}</figcaption>
  <div class="problem-stem" set:html={blockHtml(problem.stem)} />
  {problem.choices && (
    <ul class="example-choices">
      {problem.choices.map((c, i) => (
        <li>
          <span class="choice-letter">{LETTERS[i]}</span> <Fragment set:html={inlineHtml(c.text)} />
        </li>
      ))}
    </ul>
  )}
  <details>
    <summary>Show the answer and solution</summary>
    <p>
      <strong>Answer:</strong> <Fragment set:html={inlineHtml(answerText(problem))} />
    </p>
    <ol>
      {problem.solution.map((step) => (
        <li set:html={inlineHtml(step)} />
      ))}
    </ol>
  </details>
</figure>
```

`src/content.config.ts`:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { SKILL_IDS } from './engine/skills';

const lessons = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    skill: z.enum(SKILL_IDS),
    summary: z.string(),
  }),
});

export const collections = { lessons };
```

`src/content/lessons/alg.systems.mdx`:

```mdx
---
title: Systems of two linear equations
skill: alg.systems
summary: Find where two lines meet, count a system's solutions, and turn two-quantity word problems into systems.
---

import M from '../../components/M.astro';
import WorkedExample from '../../components/WorkedExample.astro';

## What these questions ask

A system is two equations that must both be true at once. On the test you'll be asked to:

- find <M t="x" />, <M t="y" />, or a combination such as <M t="x + y" />;
- decide how many solutions a system has, or find the constant that gives it none or infinitely many;
- write or solve a system for a situation with two unknown amounts, such as two ticket prices.

## Two ways to solve

**Substitution.** If one equation already says <M t="y = \dots" /> (or <M t="x = \dots" />), put that expression into the other equation. You're left with one variable to solve for.

**Elimination.** Multiply one or both equations so a variable has matching (or opposite) coefficients, then subtract (or add) the equations to cancel that variable.

**Look for a shortcut.** When the question asks for something like <M t="x + y" />, check whether adding or subtracting the equations gives it directly. If the coefficients trade places, as in <M t="3x + 5y" /> and <M t="5x + 3y" />, adding gives <M t="8x + 8y" />, which is <M t="8(x + y)" />.

<WorkedExample
  typeId="alg.systems.solve-system"
  difficulty="medium"
  format="mcq"
  seed={12}
  title="Example: elimination"
/>

## How many solutions?

Each equation is a line, and the solutions are the points the lines share.

| The lines…                               | Solutions       |
| ---------------------------------------- | --------------- |
| have different slopes                    | exactly one     |
| have the same slope, different intercept | zero (parallel) |
| are the same line                        | infinitely many |

For equations in the form <M t="ax + by = c" />, compare ratios. If <M t="\frac{a_1}{a_2} = \frac{b_1}{b_2}" />, the slopes match. Then the constants decide: the same ratio means the same line, and a different ratio means parallel lines.

<WorkedExample
  typeId="alg.systems.solution-count"
  difficulty="hard"
  format="mcq"
  seed={16}
  title="Example: finding the constant"
/>

## Word problems

Name the two unknowns first ("let <M t="x" /> be the number of adult tickets"). Then write one equation for each fact: usually a total count and a total amount of money.

## Common traps

- Answering with <M t="y" /> when the question asks for <M t="x" />.
- Distributing a negative and dropping a sign.
- Forgetting to multiply the constant when distributing, for example writing <M t="3(x + 2)" /> as <M t="3x + 2" />.
- Assuming "same slope" means "same line." Check the intercepts, too.

## Desmos shortcut

Type both equations into Desmos. Click the point where the lines cross to read off <M t="(x, y)" />. If the lines never meet, there's no solution. If you only see one line, both equations describe the same line.
```

`src/pages/skills/index.astro`:

```astro
---
import SkillsList from '../../components/SkillsList';
import BaseLayout from '../../layouts/BaseLayout.astro';
---

<BaseLayout
  title="Skills"
  description="Every SAT Math skill, grouped the way the test groups them."
>
  <h1>Skills</h1>
  <p class="lead">The SAT Math section tests 19 skills in 4 areas.</p>
  <SkillsList client:load />
</BaseLayout>
```

`src/pages/skills/[skillId].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import { isSkillAvailable } from '../../engine/registry';
import { getSkill } from '../../engine/skills';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/paths';

export async function getStaticPaths() {
  const lessons = await getCollection('lessons');
  return lessons.map((lesson) => ({ params: { skillId: lesson.data.skill }, props: { lesson } }));
}

const { lesson } = Astro.props;
const skill = getSkill(lesson.data.skill);
const { Content } = await render(lesson);
const practice = (level: string) => url(`/practice/?skill=${skill.id}&level=${level}`);
---

<BaseLayout title={skill.name} description={lesson.data.summary}>
  <p class="breadcrumbs">
    <a href={url('/skills/')}>Skills</a> / {skill.name}
  </p>
  <h1>{skill.name}</h1>
  <p class="lead">{lesson.data.summary}</p>
  {isSkillAvailable(skill.id) && (
    <section aria-labelledby="practice-heading">
      <h2 id="practice-heading">Practice</h2>
      <div class="button-row">
        <a class="button primary" href={practice('auto')}>
          Start (adjusts to you)
        </a>
        <a class="button" href={practice('easy')}>
          Easy
        </a>
        <a class="button" href={practice('medium')}>
          Medium
        </a>
        <a class="button" href={practice('hard')}>
          Hard
        </a>
      </div>
    </section>
  )}
  <article class="lesson">
    <Content />
  </article>
</BaseLayout>
```

- [ ] **Step 3: Run the browser tests**

Run: `npm run test:e2e`
Expected: PASS, 48 tests.

- [ ] **Step 4: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add src/components/SkillsList.tsx src/components/M.astro src/components/WorkedExample.astro \
  src/content.config.ts src/content src/pages/skills tests/e2e/skills.spec.ts
git commit -m "feat(site): skills map, systems lesson and worked examples"
```

---

### Task 21: Bundle budget, base-path link check, CI and deploy, docs

This adds:
- two build checks, each proven to fail on a planted problem before it is trusted;
- a GitHub Actions workflow that runs everything and deploys `main` to GitHub Pages;
- the README and license files.

**Files:**
- Create: `scripts/check-bundle.mjs`, `scripts/check-links.mjs`, `.github/workflows/ci.yml`, `README.md`, `LICENSE`, `CONTENT-LICENSE.md`

**Interfaces:**
- Consumes: the built `dist/` directory.
- Produces:
  - `npm run check:bundle` fails when a page ships more than 170 KB of gzipped JS, or when a lesson, formula, about or 404 page ships any JS files.
  - `npm run check:links` fails when a built link or script path skips `BASE_PATH`.
  - The CI workflow has three jobs: `test`, then `build-site` and `deploy`, which run only on pushes to `main`.

- [ ] **Step 1: Write both checks**

`scripts/check-bundle.mjs`:

```js
// Fails when a built page ships more JavaScript than the budget (spec §5).
// Run after `astro build`. Budget: every page <= 170 KB of gzipped JS; lesson, formula,
// about and 404 pages ship no JS files at all.
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

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '_astro' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

function jsFor(html) {
  const seen = new Set();
  const queue = [
    ...html.matchAll(/(?:src|component-url|renderer-url)="[^"]*?\/_astro\/([^"]+\.js)"/g),
  ].map((m) => m[1]);
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(join(DIST, '_astro', file), 'utf8');
    for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) queue.push(m[1]);
  }
  return [...seen];
}

const failures = [];
for (const file of htmlFiles(DIST).sort()) {
  const page = relative(DIST, file);
  const js = jsFor(readFileSync(file, 'utf8'));
  const kb =
    js.reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, '_astro', f))).length, 0) / 1024;
  console.log(`${page.padEnd(36)} ${kb.toFixed(1).padStart(6)} KB gz  (${js.length} files)`);
  if (kb > BUDGET_KB) failures.push(`${page}: ${kb.toFixed(1)} KB > ${BUDGET_KB} KB`);
  if (NO_JS_PAGES.some((re) => re.test(page)) && js.length > 0)
    failures.push(`${page}: should ship no JS files`);
}

if (failures.length > 0) {
  console.error(`\nBundle budget exceeded:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nAll pages within ${BUDGET_KB} KB.`);
```

`scripts/check-links.mjs`:

```js
// Fails when a built page links to a site path without the base path, which would 404 on
// GitHub Pages (served from /<repo>/). Run after building with BASE_PATH set, e.g.
//   BASE_PATH=/free-sat-math npm run build && BASE_PATH=/free-sat-math npm run check:links
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '_astro' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const bad = [];
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/\b(?:href|src|component-url|renderer-url)="(\/[^"]*)"/g)) {
    const target = m[1];
    if (!target.startsWith('//') && !target.startsWith(base))
      bad.push(`${relative(DIST, file)}: ${target}`);
  }
}

if (bad.length > 0) {
  console.error(`Links missing the base path ${base}:\n  ${[...new Set(bad)].join('\n  ')}`);
  process.exit(1);
}
console.log(`All site links start with ${base}`);
```

- [ ] **Step 2: Confirm both checks pass on the real build and fail when they should**

Run: `BASE_PATH=/free-sat-math npm run build && npm run check:bundle`
Expected: a per-page table (the practice and problem pages at about 166 KB), then `All pages within 170 KB.`

Run: `BUNDLE_BUDGET_KB=100 npm run check:bundle`
Expected: exit code 1, listing `practice/index.html` and `problem/index.html` as over 100 KB.

Run: `BASE_PATH=/free-sat-math npm run check:links`
Expected: `All site links start with /free-sat-math/`

Then plant a bad link to prove the link check can fail:
1. In `src/layouts/BaseLayout.astro`, temporarily change `<a href={url('/about/')}>About and privacy</a>` to `<a href="/about/">About and privacy</a>`.
2. Run: `BASE_PATH=/free-sat-math npm run build && BASE_PATH=/free-sat-math npm run check:links`
   Expected: exit code 1, listing `/about/` under several pages.
3. Revert the change, rebuild, and confirm the check passes again.

- [ ] **Step 3: Add the workflow, README and licenses**

The deploy job needs, from the repository owner:
- **Settings → Pages → Source:** set to "GitHub Actions".
- **Optionally,** a `DESMOS_API_KEY` repository secret. Without it, the calculator falls back to a link.

`SITE_URL` and `BASE_PATH` come from the repository's owner and name, so a fork deploys correctly without edits.

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run test:soak
      - run: npm run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}
      - run: npm run check:bundle
      - run: npm run check:links
        env:
          BASE_PATH: /${{ github.event.repository.name }}
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-results
          path: test-results/
          retention-days: 7

  build-site:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: withastro/action@v6
        with:
          node-version: 24
        env:
          SITE_URL: https://${{ github.repository_owner }}.github.io
          BASE_PATH: /${{ github.event.repository.name }}
          DESMOS_API_KEY: ${{ secrets.DESMOS_API_KEY }}

  deploy:
    needs: build-site
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

`README.md`:

````markdown
# Free SAT Math

A free SAT Math practice site: every official skill at three difficulty levels, step-by-step
solutions, and (later) adaptive practice tests. No accounts, no ads, no tracking. Progress is
saved in the student's own browser.

Design spec: `docs/superpowers/specs/2026-09-24-free-sat-math-design.md`

## Develop

Requires Node 22.12 or newer (CI uses Node 24).

```bash
npm install
npx playwright install chromium   # once, for end-to-end tests
npm run dev                       # http://localhost:4321
```

| Command                 | What it does                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `npm test`              | Unit and component tests (Vitest)                                                         |
| `npm run test:soak`     | Every generator × difficulty × format on 5,000 seeds (`SOAK_SEEDS=500` for a quick run)   |
| `npm run golden:update` | Rewrites `tests/golden/` after an intentional generator change (bump its `version` first) |
| `npm run build`         | Type-checks, then builds the static site into `dist/`                                     |
| `npm run check:bundle`  | Fails if any page ships more than 170 KB of gzipped JS                                    |
| `npm run test:e2e`      | Builds, serves and runs the Playwright tests                                              |
| `npm run verify`        | Everything above, in the order CI runs it                                                 |

## Adding a problem generator

1. Create `src/engine/generators/<domain>/<name>.ts` exporting a `ProblemType` (see `src/engine/problem.ts`).
2. Add it to `PROBLEM_TYPES` in `src/engine/registry.ts`.
3. Run `npm run test:soak` until it passes, then `npm run golden:update`.
4. If you later change what a generator outputs for any seed, bump its `version` and run `npm run golden:update`.

## Deploy (GitHub Pages)

1. Push this repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Optional: add a repository secret `DESMOS_API_KEY` (from partnerships@desmos.com) to embed the
   calculator. Without it, the calculator button opens desmos.com in a new tab.

Every push to `main` runs CI and, if it passes, deploys to `https://<owner>.github.io/<repo>/`.

## Licenses

Code: MIT (`LICENSE`). Problems, solutions and lessons: CC BY 4.0 (`CONTENT-LICENSE.md`).

SAT® is a trademark registered by the College Board, which is not affiliated with, and does not
endorse, this site.
````

`LICENSE`:

```text
MIT License

Copyright (c) 2026 Free SAT Math contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`CONTENT-LICENSE.md`:

```markdown
# Content license

The problems, solutions, lessons and guides on this site (everything under `src/content/`, and the
text that the problem generators in `src/engine/generators/` produce) are licensed under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You may share and adapt them for any purpose, including in your own classes, as long as you give
credit to Free SAT Math and link to the license.

The code is licensed separately under the MIT License (see `LICENSE`).

SAT® is a trademark registered by the College Board, which is not affiliated with, and does not
endorse, this site.
```

- [ ] **Step 4: Run everything the way CI does**

Run: `npm run verify`
Expected, in order:
- Prettier reports `All matched files use Prettier code style!`;
- the unit tests pass (179);
- the soak test passes (15);
- `astro check` reports 0 errors;
- the build completes;
- the bundle check prints `All pages within 170 KB.`;
- the link check prints `All site links start with /free-sat-math/`;
- the browser tests pass (48).

The whole run takes about a minute.

- [ ] **Step 5: Lint, type-check and commit**

Run: `npm run lint && npx astro check`
Expected: ESLint prints nothing, Prettier prints `All matched files use Prettier code style!`, and `astro check` ends with `- 0 errors`.

```bash
git add scripts .github README.md LICENSE CONTENT-LICENSE.md
git commit -m "ci: bundle budget, base-path link check, CI and Pages deploy"
```

- [ ] **Step 6: Hand off**

Phase 1 is done when:
- `npm run verify` passes on `main`;
- the first push to a GitHub repository with Pages set to "GitHub Actions" deploys the site.

Report the live URL, and list anything that differed from this plan.
