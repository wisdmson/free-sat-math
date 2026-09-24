# Free SAT Math — Design Spec

- **Date:** 2026-09-24
- **Status:** Approved 2026-09-24; revised the same day after the Phase 1 build-out (see "Revision notes" at the end)
- **Working name:** Free SAT Math (defined once in `src/site.config.ts`; renaming is a one-line change)

---

## 1. Purpose

A free, public SAT Math practice website. It gives students the kind of experience paid prep sites sell (skill-organized practice at three difficulty levels, clear worked solutions, bookmarks and missed-problem review, Desmos help, and full-length adaptive practice tests with a score estimate and study recommendations) at no cost, with no sign-up.

### Background

The owner asked for a free alternative to a paid SAT Math prep site. A feature-level review of that site found: SAT Math only; a free set of problems organized by topic and difficulty with bookmarks, a missed-problems list and progress counters; and a paid tier with video lessons, a larger problem bank with written solutions, and adaptive practice tests with a score and recommended problems.

This project reproduces those **capabilities**, not that site. See §3.

### Success criteria

1. A first-time visitor can be working a problem within 2 clicks of the home page, with no account.
2. All 19 official SAT Math skills can be practiced at easy, medium and hard.
3. No known wrong answers:
   - every generator passes its soak tests;
   - every hand-written problem passes `verify-bank`;
   - every conceptual problem is human-reviewed before it is published.
4. There are 4 fixed practice tests plus unlimited fresh tests. All of them are timed and adaptive, and they report an estimated score range and recommend what to practice next.
5. Lighthouse mobile scores of at least 90 for Performance and Accessibility on the home, skill and practice pages.
6. It works in current Chrome (including ChromeOS), Safari (including iOS), Firefox and Edge, at viewport widths of 360px and up.
7. Hosting costs $0.

### Non-goals (v1)

- Accounts or cross-device sync. Export and import cover device moves.
- Video lessons.
- Reading & Writing. That is a separate follow-on project.
- Leaderboards, social features, teacher dashboards, an AI tutor chat, native apps and PDF export.
- Analytics or tracking of any kind.

---

## 2. Users

High-school students preparing for the digital SAT, at any score level. Many use school Chromebooks or phones. Some have testing accommodations (extended time).

---

## 3. Originality, legal, and privacy rules

These rules are binding on all content and code in the repo.

1. **Original content only.** Every problem, solution, lesson, guide and explanation is written from scratch. Nothing is copied or paraphrased from any prep company, from College Board or Khan Academy materials, or from prep books.
   - We **may** use the public SAT skill taxonomy, the public test format (module counts, timing, answer-entry rules), and standard math facts and formulas.
2. **No imitation of branding or UI.** No other product's logos, names, color schemes, layouts or assets. The resources page links out to official materials and does not reproduce them.
3. **Trademark disclaimer.** The footer on every page reads: *"SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this site."*
4. **Desmos.** The embedded calculator is used only under the Desmos API terms with a production key (see §11). Without a key, the site links to desmos.com.
5. **Privacy.**
   - No cookies, no analytics and no third-party trackers.
   - All progress stays in the student's browser.
   - Fonts (including KaTeX fonts) are self-hosted.
   - The only third-party request is the Desmos script, and only when a production key is configured.
   - The host (GitHub Pages) keeps its own standard server logs.
   - The About page states all of this.
6. **Licenses.** Code is MIT. Original content (problems, lessons, guides) is CC BY 4.0, so teachers can reuse it. The owner may change this before launch.

---

## 4. Site map

| Route | Rendering | Purpose |
|---|---|---|
| `/` | static | Intro, "Start practicing" button, and target-score picker, which sets the suggested starting difficulty (§9.1) |
| `/skills/` | static shell + island | 4 domains → 19 skills, each with the student's accuracy and number attempted |
| `/skills/<skillId>/` | static lesson + island | Written lesson (§8.4) and practice launcher (difficulty picker; endless mode where a generator exists) |
| `/practice/?skill=<skillId\|mix>&level=<easy\|medium\|hard\|auto>` | client | Practice session |
| `/problem/?id=<ProblemId>` | client | A single problem by ID (shareable, used by review) |
| `/review/` | client | Missed problems, bookmarks, accuracy by skill, "Smart mix" launcher |
| `/tests/` | static shell + island | Tests 1–4, "Generate a fresh test", past attempts |
| `/tests/take/?test=<1\|2\|3\|4\|fresh>` | client | Test runner |
| `/tests/results/?attempt=<attemptId>` | client | Score report |
| `/desmos/` | static + live examples | Original Desmos techniques guide |
| `/formulas/` | static | Formula sheet (also available as a drawer in the problem view and test runner) |
| `/resources/` | static | Links to Bluebook, the College Board SAT Suite Question Bank and Khan Academy |
| `/settings/` | client | Target score, timing preferences (1×, 1.5×, 2×, untimed), export/import, reset |
| `/about/` | static | What the site is, the privacy statement, licenses and the disclaimer |

Every page has a light and dark theme. The theme follows the system setting and can be overridden with a toggle.

---

## 5. Tech stack

| Concern | Choice |
|---|---|
| Framework | Astro (static output) + TypeScript (strict) |
| Interactive islands | React (practice player, test runner, review, settings) |
| Math rendering | KaTeX, with MathML output enabled for screen readers |
| Figures | SVG generated from typed `Figure` specs (§7.4) |
| Content | Astro content collections (Markdown + Zod-validated frontmatter) |
| Validation | Zod (content schemas, saved data, imported files) |
| Unit and property tests | Vitest |
| End-to-end tests | Playwright |
| Lint and format | ESLint + Prettier, plus `astro check` for types |
| Package manager | npm, Node ≥ 22 |
| CI/CD | GitHub Actions: lint → unit → soak → verify-bank → build (type-check included) → bundle budget → base-path link check → e2e → deploy |
| Hosting | GitHub Pages (Astro `base` set to the repo path; a custom domain is optional) |

**Performance budget:** no page ships more than 170 KB of gzipped JS in total, KaTeX included. React (about 67 KB) and KaTeX (about 70 KB) are a fixed floor of about 137 KB; the Phase 1 practice page measured 166 KB. The lesson, Desmos guide, formulas, resources and about pages ship no JS files (only a small inline theme script); their math is rendered to HTML at build time. `scripts/check-bundle.mjs` enforces this in CI.

---

## 6. Project structure

```
sat-math/
  src/
    site.config.ts          site name, base URL, Desmos key lookup
    engine/                 pure TypeScript; no DOM, no UI imports
      skills.ts             the 19-skill taxonomy (§7.1)
      rng.ts                seeded PRNG (sfc32); integer-only, identical in every browser
      rational.ts           exact rational arithmetic (safe-integer checked)
      surd.ts               exact values of the form (a/b)·√n and (a/b)·π (added in Phase 2, where first used)
      format.ts             math formatting: no "1x", no "+ -3", fractions and signs placed correctly
      answer.ts             answer checking, including the SAT typed-answer rules (§7.3)
      problem.ts            Problem, Answer, ProblemType types, and ProblemId parse/format (Figure added in Phase 3)
      build.ts              buildProblem(type, difficulty, format, seed) and generateVerified()
      registry.ts           all ProblemTypes, looked up by id; problemFromId(); availableSkills()
      generators/
        algebra/*.ts        one file per problem type (§8.1)
        advanced/*.ts
        psda/*.ts
        geometry/*.ts
        shared/             scenario pool, distractor helpers, choice ordering
      bank.ts               loads published hand-written problems
      practice.ts           problem selection: staircase, smart mix, bank/generator alternation (§9)
      tests.ts              blueprint, test assembly, module-2 routing (§10)
      scoring.ts            Rasch MAP estimate → 200–800 score range (§10.5)
    content/
      problems/<skillId>/<slug>.md    hand-written problems (§8.3)
      lessons/<skillId>.mdx           one lesson per skill (§8.4)
      tests/test-<n>.json             frozen fixed tests (§10.4)
      guide/desmos.mdx
    components/             ProblemView, AnswerInput, ChoiceList, Solution, FigureSvg, DesmosPanel,
                            FormulaDrawer, PracticeSession, TestRunner, Timer, Navigator, ResultsReport
    store/
      progress.ts           versioned localStorage wrapper and pure updates (§11.1)
      progress-store.ts     one shared store per page for all islands (useSyncExternalStore), cross-tab sync
      schema.ts             schemas (zod/mini, for bundle size) and migrations
    lib/                    browser/UI helpers: paths (base URL), theme, math-html (KaTeX), labels
    pages/                  routes in §4
  scripts/
    verify-bank.ts          validates hand-written problems (§8.3)
    freeze-test.ts          builds and freezes a fixed test (§10.4)
    check-bundle.mjs        per-page JS budget (§5)
    check-links.mjs         every built link carries the base path
  tests/
    unit/                   engine unit tests
    soak/                   generator soak tests (§8.2)
    golden/                 golden outputs per problem type (§8.2)
    e2e/                    Playwright specs
  docs/superpowers/specs/   this document
```

**Boundary rule:** `src/engine/` never imports from `components/`, `store/`, `lib/` or `pages/`. Everything in `engine/` can be tested in Node without a browser.

---

## 7. Data model

### 7.1 Skill taxonomy

These are the public SAT Math domains and skills. IDs are stable.

| Domain | Skill ID | Skill |
|---|---|---|
| Algebra (~35%) | `alg.linear-one-var` | Linear equations in one variable |
| | `alg.linear-functions` | Linear functions |
| | `alg.linear-two-var` | Linear equations in two variables |
| | `alg.systems` | Systems of two linear equations in two variables |
| | `alg.inequalities` | Linear inequalities in one or two variables |
| Advanced Math (~35%) | `adv.equivalent-expressions` | Equivalent expressions |
| | `adv.nonlinear-equations` | Nonlinear equations in one variable and systems of equations in two variables |
| | `adv.nonlinear-functions` | Nonlinear functions |
| Problem-Solving & Data Analysis (~15%) | `psda.ratios-rates` | Ratios, rates, proportional relationships, and units |
| | `psda.percentages` | Percentages |
| | `psda.one-var-data` | One-variable data: distributions and measures of center and spread |
| | `psda.two-var-data` | Two-variable data: models and scatterplots |
| | `psda.probability` | Probability and conditional probability |
| | `psda.inference` | Inference from sample statistics and margin of error |
| | `psda.claims` | Evaluating statistical claims: observational studies and experiments |
| Geometry & Trigonometry (~15%) | `geo.area-volume` | Area and volume |
| | `geo.lines-angles-triangles` | Lines, angles, and triangles |
| | `geo.right-triangles-trig` | Right triangles and trigonometry |
| | `geo.circles` | Circles |

### 7.2 Problem

```ts
type Difficulty = 'easy' | 'medium' | 'hard';
type Format = 'mcq' | 'spr';              // multiple choice | student-produced (typed) response

interface Problem {
  id: ProblemId;
  skill: SkillId;
  difficulty: Difficulty;
  format: Format;
  source: 'generated' | 'bank';
  stem: string;                           // Markdown with $…$ LaTeX
  figure?: Figure;                        // §7.4
  choices?: [Choice, Choice, Choice, Choice];   // mcq only
  answer: McqAnswer | SprAnswer;
  solution: string[];                     // ordered steps, Markdown + LaTeX
  distractorNotes?: Partial<Record<'A' | 'B' | 'C' | 'D', string>>;  // "If you chose B, you probably…"
  desmos?: string[];                      // LaTeX expressions to preload in the Desmos panel
  meta?: Record<string, unknown>;         // hidden generator parameters; used only by verify()
}

interface Choice { text: string; value?: string }   // value: machine-checkable expression (bank)
type McqAnswer = { kind: 'choice'; index: 0 | 1 | 2 | 3 };
type SprAnswer =
  | { kind: 'values'; values: string[] }            // exact rationals, e.g. "7/2", "-4"
  | { kind: 'interval'; min: string; max: string; minInclusive: boolean; maxInclusive: boolean };
```

**ProblemId**
- Generated: `g:<typeId>@<version>:<difficulty>:<format>:<seed>`, for example `g:geo.circles.arc-sector@1:hard:mcq:48213`. The ID alone rebuilds the exact problem.
- Hand-written: `b:<slug>`, for example `b:psda.claims-007`.

### 7.3 Answer checking (`engine/answer.ts`)

- **Multiple choice:** correct if and only if the selected index equals `answer.index`.
- **Typed answers.** These rules are our implementation of the public SAT entry rules:
  - The input field accepts only `0–9`, `.`, `/` and a leading `-`. Its length is capped at 5 characters for positive answers and 6 for negative ones (the `-` counts).
  - Fractions `a/b` and decimals, with or without a leading zero (`.5` or `0.5`), are accepted. Mixed numbers (`3 1/2`) are rejected. In practice mode, a rejected format shows the hint "Enter numbers only, e.g. 3.5 or 7/2".
  - **Exact values** are correct if they are numerically equal to an accepted value, reduced or not. For 3/4, the entries `3/4`, `6/8`, `.75` and `0.75` are all correct.
  - **Non-terminating values**: a decimal is correct only if it is the value **truncated or rounded so it fills the full character limit**. For 2/3, the entries `.6666`, `.6667`, `0.666` and `0.667` are correct; `.66`, `.67` and `0.67` are not. For −2/3, the correct entries are `-.6666`, `-.6667`, `-0.666` and `-0.667`.
  - **Interval answers**: any entered value inside the interval is correct.

### 7.4 Figures

`Figure` is a discriminated union rendered to SVG by `FigureSvg`, with one exception: tables render as HTML `<table>`.

- **Geometry kinds:** `triangle`, `polygon`, `circle`, `parallel-lines`, `solid` (prism, cylinder, cone, sphere)
- **Graph kind:** `graph` (function curves on axes)
- **Data kinds:** `scatter` (with an optional fitted line), `dotplot`, `histogram`, `boxplot`, `bar`
- **Table kind:** `table` (two-way and function tables)

Every figure has a generated `altText`. Figures are drawn from the same parameters as the problem, and each one carries a "Figure not drawn to scale" flag where needed.

---

## 8. Content engine

### 8.1 Generators

```ts
interface ProblemType {
  id: string;                  // e.g. 'geo.circles.arc-sector'
  version: number;             // must be bumped whenever output for any seed changes
  skill: SkillId;
  formats: Format[];           // formats this type supports
  difficulties: Difficulty[];
  generate(rng: Rng, difficulty: Difficulty, format: Format): Problem;
  verify(problem: Problem): boolean;   // independent check, not a re-run of generate()
}
```

**Construction rules**
1. **Answer first.** Pick a clean target answer (an integer or simple fraction), then build the problem backward from it.
2. **Difficulty rubric.**
   - *Easy:* one direct step, and the question states plainly what to find.
   - *Medium:* 2–3 steps, or a light disguise (context, a rearranged form, an expression in place of a variable).
   - *Hard:* 3 or more steps, a disguise, or an insight step (for example, finding k so a system has no solution, or solving for an expression without solving for the variable).
3. **Distractors come from real mistakes.** Each wrong choice comes from a named mistake (sign error, radius/diameter mix-up, dropped square root, percent-of vs. percent-change, etc.). Its `distractorNotes` entry names the mistake.
4. **Choice order.** Numeric choices are sorted ascending. Non-numeric choices are shuffled by the seed. All 4 choices must differ.
5. **Exact math.** Values use `Rational` and `Surd`. Floating point is allowed only inside `verify()`, with a 1e-9 tolerance. Typed-answer (`spr`) problems always have rational answers; answers involving π or radicals appear only in multiple choice.
6. **Word problems** draw on `generators/shared/scenarios.ts`, an original pool of contexts with units and plausible number ranges.

**The 40 v1 problem types** (Algebra 13, Advanced Math 11, Data Analysis 8, Geometry & Trig 8)

| Skill | Problem types |
|---|---|
| `alg.linear-one-var` | `solve` (ax+b=c through variables on both sides, distribution and fractions) · `solve-for-expression` (find 3x−2 directly) · `solution-count` (value of k for no or infinitely many solutions) |
| `alg.linear-functions` | `slope-intercept` (from two points or a table) · `interpret-context` (meaning of slope or intercept in a scenario) · `build-from-values` (f from two input/output pairs) |
| `alg.linear-two-var` | `line-equation` (through points, intercepts, parallel/perpendicular) · `context-constraint` (ax+by=c budget-style) |
| `alg.systems` | `solve-system` (substitution, elimination, or x+y via a shortcut) · `solution-count` (constant giving no or infinitely many solutions) · `word-system` (tickets, mixtures, rates) |
| `alg.inequalities` | `solve-inequality` (including which value satisfies it) · `inequality-system` (which point is a solution; max/min count in context) |
| `adv.equivalent-expressions` | `expand-simplify` · `factor` (trinomials, difference of squares) · `exponent-radical` (rational exponents) · `rational-expression` |
| `adv.nonlinear-equations` | `quadratic-solve` (factoring, formula, sum/product of roots) · `discriminant` (number of solutions; k for exactly one) · `line-parabola` (intersections) · `radical-rational` (extraneous solutions) |
| `adv.nonlinear-functions` | `vertex-form` (vertex, max/min, axis, standard → vertex) · `exponential-model` (growth/decay rate, value after t) · `transform-compose` (f(x+2), g(f(3)), notation) |
| `psda.ratios-rates` | `unit-conversion` (multi-step; squared and cubed units at hard) · `proportional-rate` (speed, density, work) |
| `psda.percentages` | `percent-basic` (percent of, percent change, original value) · `successive-change` |
| `psda.one-var-data` | `center-spread` (mean, median, range, mode from a list or frequency table; missing value given the mean) · `effect-of-change` (adding or removing a value) |
| `psda.two-var-data` | `best-fit-read` (predict from, or interpret the slope of, a fitted line on a generated scatterplot) |
| `psda.probability` | `two-way-table` (probability and conditional probability) |
| `geo.area-volume` | `area-composite` (including scale-factor effects at hard) · `solid-volume-surface` |
| `geo.lines-angles-triangles` | `parallel-transversal` (angle relationships, triangle sum, exterior angle) · `similar-triangles` |
| `geo.right-triangles-trig` | `pythagorean-special` (triples, 30-60-90, 45-45-90) · `trig-ratios` (SOH-CAH-TOA, sin x = cos(90°−x)) |
| `geo.circles` | `circle-equation` (center/radius, completing the square) · `arc-sector` (arc length, sector area, central angle, radians) |

`psda.inference` and `psda.claims` have no generators. They are hand-written only.

### 8.2 Generator verification

- **Soak tests** (`tests/soak/`): every type × difficulty × format runs on seeds 1–5000. Each generated problem must satisfy all of the following:
  - `verify()` passes;
  - the 4 choices are distinct and exactly one of them is correct;
  - typed answers fit the length rules;
  - every stem, choice and solution string renders in KaTeX with `throwOnError: true`;
  - there are no degenerate values (division by zero, a coefficient of 0 or 1 printed as a coefficient, answers outside the type's declared range);
  - `format.ts` lint passes (no `+ -`, no `1x`, no `--`).
- **Golden files** (`tests/golden/<typeId>.json`) hold the output for seeds 1–5 in each difficulty and format. If output changes while `version` has not been bumped, the test fails with the message "bump version".
- **Runtime self-check:** the practice engine calls `verify()` on every generated problem. If it fails, the engine discards the problem and tries the next seed, up to 20 times. If all 20 fail, it shows "Couldn't create this problem type. Try another." and logs the failure to the console. A problem that fails verification is never shown.

### 8.3 Hand-written bank

One Markdown file per problem at `src/content/problems/<skillId>/<slug>.md`. Here is an original example:

```md
---
id: psda.ratios-rates-012
skill: psda.ratios-rates
difficulty: medium
format: spr
answer: { kind: values, values: ["45"] }
check: "3 / 4 * 60"
reviewed: false
---
A community garden's drip line delivers 3 liters of water every 4 minutes.
At this rate, how many liters does it deliver in 1 hour?

## Solution
1. The rate is $\frac{3}{4}$ liter per minute.
2. One hour is 60 minutes, so the drip line delivers $\frac{3}{4} \times 60 = 45$ liters.
```

- **Multiple-choice files** also list `choices` (each with `text` and an optional `value`) and include a `## Why not the others` section with one bullet per wrong choice.
- **`check`** is an arithmetic expression (numbers, `+ - * / ^`, parentheses, `sqrt()`, `pi`). It is evaluated by a small safe parser, never `eval`.
  - For typed answers, it must equal the answer.
  - For multiple choice, it must equal the correct choice's `value`, and every choice `value` must be distinct.
- **Publish rule.** A problem appears on the site only if:
  - it is `reviewed: true`, or
  - it has a passing `check` and a skill other than `psda.inference` or `psda.claims`.

  A conceptual problem (no `check`) is never published until a person has reviewed it.
- **`scripts/verify-bank.ts`** runs in CI and fails the build if any of these fail:
  - the frontmatter schema;
  - uniqueness of `id` (matching the filename);
  - that a multiple-choice answer index is in range;
  - every `check`;
  - KaTeX rendering;
  - the required sections;
  - per-skill minimums of **published** problems (§8.5).

  It also prints the **review queue**: every problem where `reviewed: false`.

### 8.4 Lessons, Desmos guide and formula sheet

- **Lessons.** One original MDX lesson per skill. Each covers:
  - what the skill looks like on the test;
  - the core method or methods;
  - key formulas;
  - common traps (linked to the distractor mistakes in §8.1);
  - a Desmos shortcut, where one exists;
  - 2 worked examples. These are rendered **at build time from generators with fixed seeds**, so the examples always match the practice problems. The two hand-written-only skills (`psda.inference`, `psda.claims`) have no generator, so their examples are written directly in the lesson and are not bank problems.
- **Desmos guide.** Original techniques: solving by graphing both sides, finding intersections, regression from a table, sliders for unknown constants, checking whether two expressions are equivalent, and reading off a vertex or zeros. Includes live examples when a Desmos key is configured and screenshots otherwise.
- **Formula sheet.** Our own layout of standard formulas and facts: area and circumference, volumes, special right triangles, angle sums, 360° = 2π radians.

### 8.5 v1 content targets

| Content | Target |
|---|---|
| Generator problem types | 40 (§8.1) |
| Hand-written: `psda.inference`, `psda.claims` | 15 each, at least 5 per difficulty, all reviewed |
| Hand-written: the 5 mixed skills (`adv.nonlinear-functions`, `psda.one-var-data`, `psda.two-var-data`, `psda.probability`, `geo.lines-angles-triangles`) | 10 each, at least 3 per difficulty |
| Hand-written word problems spread across generator skills | 40 |
| **Hand-written total** | **120** |
| Lessons | 19 |

---

## 9. Practice mode (`engine/practice.ts`)

### 9.1 Starting difficulty

The student sets a target score on the home page or in settings. It maps to a starting level: **550 or below → easy; 560–680 → medium; 690 or above → hard**. With no target set, practice starts at medium.

### 9.2 Auto difficulty (staircase)

Each skill keeps its own `{ level, streak }`. After **3 correct in a row**, the level moves up one step. After **2 wrong in a row**, it moves down one step. The level stays within easy–hard. Choosing a fixed level turns the staircase off for that session.

### 9.3 Smart mix

Choose a skill `s` with probability proportional to:

```
w_s = testWeight_s × (0.5 + need_s)
testWeight_s = domainShare(domain_s) / skillsInDomain(domain_s)      // 0.35/5, 0.35/3, 0.15/7, 0.15/4
need_s = 0.7 × (1 − acc_s) + 0.3 × staleness_s
acc_s = (correct + 1) / (attempts + 2)       over that skill's last 20 attempts
staleness_s = min(1, daysSinceLastAttempt / 7)   (1 if never attempted)
```

### 9.4 Choosing the source

- **Generator-only skills:** always generated, with a random seed.
- **Hand-written-only skills:** the bank, in this order: unseen → previously missed (least recent first) → previously correct (least recent first). There is no endless mode. Once every problem has been attempted, the skill page shows a banner, "You've done all N. Review your missed ones." Practice keeps going in the same order.
- **Mixed skills:** alternate between bank turns and generator turns. A bank turn takes the next unseen bank problem, or failing that the least recently missed one. If there is neither, the turn goes to the generator.
- **Test answers** count toward accuracy (the review page, smart mix and "Practice next") but do not move the staircase.
- **Everywhere:** never repeat a problem shown in the last 10. Never show a problem **reserved** by an uncompleted fixed test (§10.4).

### 9.5 Problem view behavior

- Answer → **Check** shows correct or incorrect, the step-by-step solution, and the distractor note for the chosen wrong choice.
- **Bookmark** toggle, **formula drawer**, **Desmos panel** (preloaded with `desmos` expressions if present), **"Try a similar one"** for generated problems (same type, same difficulty, new seed), and a **copy-link** button.
- Time on each problem is recorded, but no timer is shown in practice mode.

---

## 10. Practice tests

### 10.1 Blueprint

Each module has 22 questions. The digital SAT gives 35 minutes per module; ours is multiplied by the student's setting (1×, 1.5× or 2×) or untimed.

| | Algebra | Advanced | PSDA | Geometry & Trig | MCQ / typed | Easy / Medium / Hard |
|---|---|---|---|---|---|---|
| Module 1 | 8 | 7 | 4 | 3 | 17 / 5 | 7 / 8 / 7 |
| Module 2, harder | 7 | 8 | 3 | 4 | 16 / 6 | 3 / 8 / 11 |
| Module 2, easier | 7 | 8 | 3 | 4 | 16 / 6 | 10 / 9 / 3 |

Totals across both modules: Algebra 15, Advanced 15, PSDA 7, Geometry 7 (34% / 34% / 16% / 16%); 33 multiple choice and 11 typed (75% / 25%). All 44 questions are scored; there are no unscored pretest questions. Within a module, questions are ordered easy → hard, with ties broken by the seed.

### 10.2 Routing

**Module 1 correct ≥ 13 of 22 → harder module 2; otherwise → easier module 2.** The threshold is the constant `ROUTE_THRESHOLD` in `tests.ts`, and the results page explains it.

### 10.3 Test runner

- **Timer:** visible and hideable. A 5-minute warning and a 1-minute warning are announced through `aria-live="polite"`. The module auto-submits at 0:00.
- **Navigation:** a question grid showing answered, unanswered and marked questions; mark for review; cross-out for answer choices; the Desmos panel and formula drawer.
- A confirm screen appears before submitting a module. No going back to module 1 after moving on.
- **Persistence:** the test state, including remaining time, is saved after every answer and every 5 seconds. Reopening the page offers **Resume**. Time does not run while the page is closed.
- Untimed mode hides the timer and records elapsed time only.

### 10.4 Fixed and fresh tests

- **Fixed tests 1–4** are built once by `scripts/freeze-test.ts --n <n> --seed <seed>` and committed as `src/content/tests/test-<n>.json`. Each file is a **full problem snapshot** (module 1, harder module 2 and easier module 2, 66 problems in total), so later generator changes can never alter them.
  - Each fixed test includes at least 1 `psda.inference` and at least 1 `psda.claims` problem from the bank.
  - Bank problems used by fixed tests are **reserved**. The practice engine computes the reserved set from the test files at build time. A reserved problem unlocks for practice once the student completes that test.
- **Fresh tests** are assembled at runtime from a random seed, using generators plus unreserved bank problems, with unseen problems preferred. The full problem snapshot is saved with the attempt.
- **Slot filling** (used by both the freeze script and fresh tests). Each blueprint slot names a domain, difficulty and format. For each slot:
  1. Pick a skill in that domain, weighted by `testWeight` (§9.3), from the skills that can supply that difficulty and format.
  2. Pick the source. Hand-written-only skills use the bank. Mixed skills use the bank with probability 0.5 if an eligible bank problem exists, and the generator otherwise. Generator-only skills use the generator.
  3. No problem, and no generator type + seed pair, appears twice within a test.
- **Reserve cap.** Each fixed test contains 1–2 problems from `psda.inference` and 1–2 from `psda.claims`. With 4 fixed tests, that reserves at most 8 of each skill's 15, so at least 7 per skill stay available for practice.

### 10.5 Scoring (`engine/scoring.ts`)

- **Model:** Rasch (1-parameter logistic), `P(correct) = 1 / (1 + e^−(θ − b))`, with `b` = −1.2 (easy), 0 (medium) and +1.2 (hard). These constants are uncalibrated and tunable.
- **Estimate:** the MAP value of θ under a Normal(0, 1) prior, found by grid search over θ ∈ [−4, 4] in steps of 0.01. The posterior standard deviation (SD) is computed on the same grid. Unanswered questions count as wrong.
- **Scale:** `θ_hi` = MAP for all correct on the harder route; `θ_lo` = MAP for all wrong on the easier route. Then `score(θ) = 200 + 600 × (θ − θ_lo) / (θ_hi − θ_lo)`, clamped to [200, 800] and rounded to the nearest 10.
- **Reported range:** `[score(θ − SD), score(θ + SD)]`, labeled *"Estimated score. For an official-style score, take a Bluebook practice test."*
- **Guaranteed properties** (unit-tested):
  - all correct on the harder route gives 800; all wrong on the easier route gives 200;
  - changing any wrong answer to correct never lowers the estimate;
  - for equal total correct, the harder route scores at least as high as the easier route. This holds because the harder route's sorted `b` values are, element by element, at least the easier route's.
- **Checked numerically on 2026-09-24:**
  - `θ_hi` ≈ 3.12 and `θ_lo` ≈ −3.09, both inside the grid, and all three properties hold.
  - The reported range is about 60–80 points wide.
  - Known calibration issue: a perfect easier-route test scores **770**, which is probably too generous. Revisit the `b` constants in Phase 5.

### 10.6 Results page

- The score range and the route taken.
- Correct / total by domain and by skill.
- A review of every question: the student's answer, the correct answer, the solution, the time spent, and whether it was marked.
- **"Practice next":** the 3 weakest skills from this test (lowest accuracy, with ties broken by test weight), each linking to `/practice/` at the level the staircase suggests.
- Attempts older than the newest 10 keep only their summary (score range, route, domain and skill accuracy), so their results page has no per-question review (§11.1).

---

## 11. Storage, Desmos, and error handling

### 11.1 Saved progress (`store/progress.ts`)

Keys:
- `fsm.progress.v1`: the main progress record (shape below)
- `fsm.test-in-progress`: the test currently being taken
- `fsm.backup.<ISO timestamp>`: backups of unreadable or replaced data
- `fsm.theme`: `light` or `dark` (absent means follow the system). Kept apart from the progress record so a tiny inline script can apply it before the page paints.

```ts
interface ProgressV1 {
  schemaVersion: 1;
  settings: { targetScore: number | null; timeMultiplier: 1 | 1.5 | 2; untimed: boolean };
  attempts: Attempt[];                   // newest 5,000 kept
  bookmarks: ProblemId[];
  skillState: Record<SkillId, { level: Difficulty; streak: number }>;
  testAttempts: TestAttempt[];           // full snapshots kept for the newest 10; older ones keep the summary only
  completedFixedTests: number[];
}
interface Attempt { problemId: ProblemId; skill: SkillId; difficulty: Difficulty; correct: boolean;
                    response: string; timeMs: number; at: string; mode: 'practice' | 'test' }
```

- **Missed** means a problem whose most recent attempt was wrong. It is computed, not stored.
- **Stale generated IDs.** If an ID's version is older than the current generator version, the problem is rebuilt with the current version and the same seed, and a note says "This problem was updated since you last saw it."
- Every read and write is wrapped in try/catch. If storage is unavailable or full, a banner says "Progress won't be saved in this browser", and everything else still works for the session.
- **Unreadable or invalid data** fails Zod validation or migration. It is copied to a `fsm.backup.*` key, the student starts fresh, and a notice explains what happened. Nothing is deleted silently.
- **Export** downloads `free-sat-math-progress-YYYY-MM-DD.json`. **Import** validates the file, shows a summary (attempts, tests, bookmarks), asks for confirmation, backs up the current data, then replaces it.

### 11.2 Desmos

- `DESMOS_API_KEY` is read at build time. If it is set, `DesmosPanel` loads the Desmos API script and embeds the calculator, preloading any expressions the problem provides.
- The public demo key is used **only** in `npm run dev`.
- With no key, or if the script fails to load within 8 seconds, the panel shows an **"Open Desmos"** button that opens `https://www.desmos.com/calculator` in a new window.
- A draft key-request email is in Appendix A.

### 11.3 Error handling summary

| Failure | Behavior |
|---|---|
| A generated problem fails `verify()` | Next seed, up to 20 tries; after that a friendly message and the type is skipped; console log |
| KaTeX render error at runtime | Show the raw text for that expression; console log |
| Storage unavailable or full | Banner; the session keeps working; export still works |
| Saved data corrupt or invalid | Backup key, fresh start, notice |
| Invalid import file | Rejected with the validation reason; current data untouched |
| Desmos script fails or no key | "Open Desmos" fallback |
| Unknown or unparseable `?id=` | "Problem not found", with links to skills and review |
| Tab closed mid-test | Resume offered, with time remaining as last saved |

---

## 12. Accessibility

- WCAG 2.1 AA targets: keyboard-operable everywhere, visible focus, contrast of at least 4.5:1, and labeled controls.
- KaTeX MathML output for screen readers. Every figure has generated `altText`.
- Answer choices are a radio group with arrow-key navigation. Cross-out is keyboard-accessible.
- Timer warnings go through `aria-live`. `prefers-reduced-motion` is respected.
- The layout works from 360px wide up, and every tap target is at least 44px.

---

## 13. Testing strategy

| Layer | What | Tool |
|---|---|---|
| Unit | `rational`, `surd`, `format`, `answer` (every rule and example in §7.3), `rng` determinism, `practice` (staircase, smart-mix weights, source order, reserved exclusion), `tests` (blueprint counts, routing, ordering), `scoring` (the §10.5 properties), `store` (migrations, corrupt-data backup, import validation) | Vitest |
| Soak | Every generator × difficulty × format, seeds 1–5000 (§8.2) | Vitest |
| Golden | Output snapshots and version-bump enforcement | Vitest |
| Content | `verify-bank` (§8.3) | Node script in CI |
| E2E | Solve a problem (right and wrong); bookmark it and see it in review; complete both modules of a test with an auto-answering script and reach results; resume a test after reload; export then import progress | Playwright |
| Audits | Lighthouse (performance and accessibility) and axe on key pages | CI |

---

## 14. Delivery phases

Each phase gets its own implementation plan and ends in a working, deployed site.

1. **Foundation + vertical slice.**
   - Scaffold, CI and GitHub Pages deploy.
   - Engine core: skills, rng, rational, format, answer, problem, build, registry. (`surd` moves to Phase 2 and `Figure` to Phase 3, where they are first used.)
   - One complete skill (`alg.systems`: 3 generator types with soak and golden tests, plus its lesson).
   - Problem view, practice session (staircase), progress storage, review page, formula drawer, Desmos panel with fallback, settings (export/import), home, skills map and about pages.
2. **Algebra + Advanced Math generators.** The remaining 21 types in those domains, plus the remaining 7 lessons for those domains.
3. **Data Analysis + Geometry & Trig generators.** 16 types, the SVG figure renderer, and their 11 lessons.
4. **Hand-written bank.** 120 problems, `verify-bank`, the review-queue workflow, and smart mix.
5. **Practice tests.** Blueprint, assembler, runner, scoring, results, and the 4 frozen tests.
6. **Launch polish.** Desmos guide, resources page, accessibility and Lighthouse pass, content review sign-off, and launch.

**Owner actions** (outside the code):
- Create a GitHub repo and enable Pages.
- Email Desmos for a production key (Appendix A).
- Line up a math-confident reviewer for the review queue.
- Confirm the final name and the licenses (§3.6).

---

## Appendix A — Desmos API key request (draft)

> **To:** partnerships@desmos.com
> **Subject:** API key request: free, non-commercial SAT Math practice site
>
> Hi Desmos team,
>
> I'm building a free SAT Math practice website for high-school students. It has no ads, no accounts and no paid tier. Students work through practice problems and timed practice tests, and I'd like to embed the Desmos graphing calculator next to each problem, as it is on the real digital SAT.
>
> Planned usage: the standard graphing calculator embed, sometimes preloaded with a problem's equations. The site is static and hosted on GitHub Pages at [URL]. Expected traffic: [estimate].
>
> Could you share a production API key and any terms I should follow? Happy to provide more detail.
>
> Thanks,
> [Name]

---

## Revision notes (2026-09-24, after building Phase 1 in a scratch project)

- **JS budget 150 → 170 KB.** Measured: React ≈ 67 KB + KaTeX ≈ 70 KB + app ≈ 29 KB = 166 KB on the practice page, after switching the store schema to `zod/mini` (which saved 18 KB). Meeting 150 KB would mean replacing React with Preact or KaTeX with a MathML-only renderer; neither is worth it for 16 KB. The budget is enforced in CI.
- **Theme** moved out of `settings` into its own key, `fsm.theme` (§11.1), so it applies before first paint without loading the app.
- **`surd.ts` → Phase 2 and `Figure` → Phase 3**: no Phase 1 code uses them.
- **`build.ts`** split out of `registry.ts` so generators can be built and tested before they are registered.
- **Base-path link check** added to CI: GitHub Pages serves the site under `/<repo>/`, and end-to-end tests run at `/`, so a link that skips the base path would otherwise only break in production.

