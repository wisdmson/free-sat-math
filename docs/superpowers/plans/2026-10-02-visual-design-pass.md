# Visual Design Pass First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Apply the approved Free SAT Math visual system to the shared shell, home page, Quick Play start screen, and Mental Math Gym picker while preserving behavior and the existing route structure.

**Architecture:** Tune the existing native CSS token layer rather than adding a component library or new runtime dependency. Add small semantic classes to the Astro shell and home markup, then style the existing React entry surfaces through src/styles/play.css; React behavior and persisted data remain unchanged.

**Tech Stack:** Astro 7, React 19 islands, TypeScript, native CSS, Playwright, Vitest.

**Spec:** docs/superpowers/specs/2026-10-02-visual-design-pass.md

## Global Constraints

- Preserve existing route URLs, content voice, legal text, form names, and storage behavior.
- Keep keyboard navigation, focus visibility, reduced motion, dark mode, safe-area padding, and 360px layouts working.
- Keep every page's startup JavaScript at or below 170 KB gzipped.
- Keep every internal link through url() from src/lib/paths.ts.
- Use no new UI, font, icon, or runtime dependency.
- All visible copy remains original and appropriate for a high-school SAT learner.
- Commit only when the owner asks; do not push, merge, or deploy.

## Review Focus

1. **Narrow shell wrapping:** At 360px, the brand, navigation, theme control, and main content must remain usable without horizontal overflow. Test in tests/e2e/site.spec.ts and existing narrow suites.
2. **Theme contrast:** The tuned light and dark tokens must keep primary buttons, links, focus rings, and answer-state colors readable. Test both theme attributes in the browser.
3. **Home action hierarchy:** The primary practice action and the two secondary modes must remain discoverable by accessible name and link to the same URLs. Test the home landmark and links.
4. **Play/Gym state preservation:** Styling changes must not alter the Play start screen's existing streak, level, sound control, or Gym drill selection behavior. Reuse existing Play and Train e2e coverage.
5. **Motion preferences:** Any new transition or animation must disappear under prefers-reduced-motion: reduce. Test computed animation/transition state for the new shell and action surfaces.

### Task 1: Semantic shell and home layout

**Files:**
- Modify: src/layouts/BaseLayout.astro
- Modify: src/pages/index.astro
- Test: tests/e2e/site.spec.ts

**Interfaces:**
- Produces semantic classes .site-brand, .site-nav, .home-hero, .home-copy, .home-actions, .home-aside, .home-section, and .home-availability for the shared and home styles.
- Preserves all current nav hrefs, aria-current behavior, theme toggle label, skip link, and home action URLs.

- [ ] **Step 1: Write the failing browser assertions**

Add a test named home has a clear start action and the visual layout landmarks to tests/e2e/site.spec.ts. Visit /, assert .home-hero, .home-actions, and .home-availability are visible, assert the primary link named Start practicing remains visible, and assert the home page has no horizontal overflow at 360px. Assert the nav still exposes Skills, Train, and Settings.

- [ ] **Step 2: Run the test to verify it fails**

Run: npx playwright test tests/e2e/site.spec.ts --grep home has a clear start action

Expected: FAIL because the new semantic layout classes do not exist yet.

- [ ] **Step 3: Add semantic markup**

In BaseLayout.astro, add the semantic classes without changing the visible nav labels or links. In index.astro, wrap the existing lead, target selector, action links, explanation, and availability copy in the home landmarks. Keep TargetScoreSelect, url() calls, and all visible copy intact.

- [ ] **Step 4: Run the focused browser test**

Run: npx playwright test tests/e2e/site.spec.ts --grep home has a clear start action

Expected: The semantic assertions and 360px overflow check pass.

### Task 2: Shared visual tokens and shell styling

**Files:**
- Modify: src/styles/global.css
- Test: tests/e2e/site.spec.ts

**Interfaces:**
- Produces tuned CSS custom properties for the warm paper light theme and intentional deep blue-black dark theme, plus shared typography, buttons, surfaces, focus, shell, and responsive rules.
- Keeps existing class names usable by all learning pages and existing state colors available to Play, Gym, and practice components.

- [ ] **Step 1: Add theme and shell checks to the browser test**

Extend the focused site test to read the computed theme or body styles in the default theme, click the theme toggle, and assert the theme attribute changes while .button.primary remains visible and readable. Use the existing theme persistence test for reload behavior.

- [ ] **Step 2: Run the focused test to verify the new style contract is not yet present**

Run: npx playwright test tests/e2e/site.spec.ts --grep home has a clear start action

Expected: The structural test passes from Task 1, while the new visual assertion fails until the tokens and shell styles are added.

- [ ] **Step 3: Implement the visual token layer**

Update global.css with the approved warm paper, ink navy, signal accent, tuned dark values, display/type hierarchy, 4px spacing rhythm, quiet borders, compact and feature radii, button states, shell spacing, and responsive rules. Keep focus rings at high contrast and preserve reduced-motion handling. Style the new home landmarks with a clear action hierarchy and a restrained responsive two-column layout that collapses at narrow widths.

- [ ] **Step 4: Run focused site and existing narrow checks**

Run: npx playwright test tests/e2e/site.spec.ts tests/e2e/skills.spec.ts --project=narrow

Expected: All selected tests pass with no horizontal overflow.

### Task 3: Quick Play start and Gym picker direction

**Files:**
- Modify: src/styles/play.css
- Modify: src/styles/gym.css
- Test: tests/e2e/play.spec.ts
- Test: tests/e2e/train.spec.ts

**Interfaces:**
- Produces styling for existing .play-start, .play-streak, .play-level-card, .play-start-button, .gym-pick, .gym-grid, and .gym-drill elements.
- Does not change PlayApp, GymApp, scoring, timers, drill generation, or progress writes.

- [ ] **Step 1: Add visual landmark assertions**

Extend the existing Play and Train browser tests to assert the start/status group and Gym drill grid are visible at 360px, and that the first drill remains keyboard focusable. Keep all current behavior assertions unchanged.

- [ ] **Step 2: Run the focused Play and Train tests**

Run: npx playwright test tests/e2e/play.spec.ts tests/e2e/train.spec.ts --project=narrow

Expected: Existing behavior passes; any new landmark assertion fails only if the selector or styling contract is absent.

- [ ] **Step 3: Style the mode entry surfaces**

In play.css, give the Quick Play start screen a stronger status stack, feature surface, primary action, sound row, and supporting note. In gym.css, give the picker a training header rhythm, responsive six-drill grid, clear drill title/description/stat hierarchy, hover/focus states, and dark-theme values through the shared tokens. Use transitions only where they communicate hover or focus and disable them under reduced motion.

- [ ] **Step 4: Run the focused Play and Train tests**

Run: npx playwright test tests/e2e/play.spec.ts tests/e2e/train.spec.ts --project=narrow

Expected: All selected tests pass, including Quick Play and Gym overflow checks.

### Task 4: Full verification and visual handoff

**Files:**
- Modify: WORKLOG.md

- [ ] **Step 1: Run formatting, unit, soak, build, bundle, and link checks**

Run: npm run lint && npm test -- --maxWorkers=2 && npm run test:soak && BASE_PATH=/free-sat-math npm run build && npm run check:bundle && BASE_PATH=/free-sat-math npm run check:links

Expected: All commands pass and every page stays within the 170 KB startup budget.

- [ ] **Step 2: Run the full browser suite outside the sandbox if needed**

Run: npm run test:e2e

Expected: 86 browser tests pass. If Chromium startup is blocked by the sandbox, rerun with the approved outside-sandbox command.

- [ ] **Step 3: Record the result**

Add the changed files, exact checks, open visual questions, and any screenshots or narrow-layout findings to the top of WORKLOG.md.

- [ ] **Step 4: Review the final diff**

Run: git diff --check && git status --short

Expected: Only the intended visual files, test updates, worklog, and plan/spec artifacts are present; no generated test output or build artifacts are staged.

