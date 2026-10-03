# Free SAT Math visual design pass

**Status:** Approved direction, awaiting written-spec review, 2026-10-02

## Design read

Free SAT Math is a trust-first learning product for high-school students. It should feel like a focused study tool with a light game layer: calm enough for learning, energetic enough to make a five-minute session inviting. The design language is an editorial study room with a training scoreboard, built with native CSS and the existing Astro and React structure.

The visual dials are **variance 6**, **motion 4**, and **density 4**. The site needs more personality and hierarchy than the current utility styling, while staying readable, fast, and comfortable at 360px.

## Audit

The current implementation has a sound foundation: stable routes, local progress, keyboard support, large touch targets, reduced-motion handling, dark mode, and a small CSS-only visual system. The main visual debt is shared across the site:

- The home page reads as a plain document, so the first action does not have enough emphasis.
- Most surfaces use the same border, radius, and spacing treatment, which flattens the hierarchy.
- Quick Play and the Gym work well as interactions but do not yet feel like distinct modes.
- Typography is readable but has little display hierarchy for page titles, scores, timers, or prompts.
- The light and dark themes are functional inversions rather than deliberately balanced palettes.

The redesign keeps the current information architecture, copy voice, routes, form names, and legal text.

## Visual system

### Color

Use a warm paper background and ink navy text as the primary light theme. Use one vivid signal accent for primary actions, progress, and active navigation. Reserve green and red for correct and incorrect answer states. Warning yellow remains a separate state color.

The dark theme gets its own tuned values rather than a mechanical inversion: deep blue-black background, warm light text, a slightly brighter signal accent, and answer-state colors with equivalent contrast. Every foreground and action color must pass the existing accessibility checks.

### Typography

Use a display face from the platform's serif or rounded system fallbacks for page titles and major result numbers. Use the existing system sans stack for navigation, controls, explanations, and question text. Timers, scores, and progress values use tabular numerals.

The hierarchy should be visible without relying on color: page title, lead explanation, section title, prompt, supporting hint, and state feedback each have a distinct size or weight.

### Shape and spacing

Use one compact corner-radius family and one larger feature radius for primary mode surfaces. Keep borders quiet and use surface contrast, spacing, and a restrained shadow to establish hierarchy. Avoid turning every item into a card.

Use a spacing rhythm based on 4px increments, with larger jumps between page sections. Preserve minimum 44px controls and the existing 56px mental-math keys.

## Surface direction

### Shared shell

The header becomes a compact brand lockup with a clear current-page marker and a quieter theme control. Desktop navigation stays on one line. On narrow screens the navigation wraps cleanly without making the brand or theme control compete with it. The footer uses the same spacing and type hierarchy as the main content.

The Quick Play floating action keeps its existing purpose and URL, but gets stronger contrast, a more deliberate shadow, and spacing that respects safe areas.

### Home

The home page becomes the clearest starting point: a short display headline, one primary practice action, a secondary Quick Play action, and a compact progress or target-score area. The existing explanation and availability copy remain, but are organized beneath the starting action so the page answers “what do I do first?” immediately.

### Quick Play

The start screen gets a stronger status hierarchy for streak, level, and points. The Play action is the visual anchor. The feed HUD gets clearer separation between exit, progress, and combo. SAT cards, tips, and Lightning cards keep their existing behavior but gain distinct type scale and state treatment.

Answer feedback must remain understandable through text, icon, and color. Motion is limited to answer feedback and mode transitions, and all of it stays disabled under `prefers-reduced-motion`.

### Mental Math Gym

The drill picker becomes a training menu with a readable six-item grid. Each drill tile emphasizes the drill name, a short description, the personal best, and current tier. The sprint view prioritizes the clock, prompt, and answer area in that order. Results give the new best state a clear visual moment while keeping the repeat and pick actions obvious.

### Existing learning surfaces

Practice, problem, review, skills, formulas, settings, and lessons receive the same tokens, typography, spacing, buttons, notices, and surface hierarchy. Their information architecture and content remain stable.

## Motion and accessibility

Motion is functional: it confirms answer state, makes a mode transition legible, or draws attention to a newly achieved best. No animation is required to understand a result. Reduced-motion users receive the same information through color, icon, text, and layout. Focus rings remain high-contrast and visible.

The visual pass must preserve keyboard navigation, screen-reader labels, 360px layouts, dark mode, safe-area padding, and the current bundle limits. No external font, icon, or visual dependency is required.

## Implementation sequence

1. Tune shared tokens, type hierarchy, buttons, surfaces, shell, and responsive rhythm in `src/styles/global.css` and `BaseLayout.astro`.
2. Recompose the home page using existing components and links.
3. Refine Quick Play and Gym styles while keeping their React behavior unchanged.
4. Apply the shared system to the existing learning pages and inspect narrow layouts.
5. Run lint, unit, soak, build, bundle, link, and browser checks.

The first implementation slice is limited to shared tokens, the shell, home, Quick Play start screen, and Gym picker. Later slices can address the feed, sprint results, and remaining content pages without changing the design direction.

## Acceptance criteria

- The first action on home is visually obvious within one viewport.
- Quick Play and Gym are recognizable as separate modes while sharing the same system.
- Desktop navigation stays on one line and narrow pages remain usable at 360px.
- Light and dark themes have intentional contrast and readable controls.
- Answer state remains clear without motion or color alone.
- Existing route URLs, content behavior, storage, keyboard behavior, and bundle limits continue to pass all checks.
