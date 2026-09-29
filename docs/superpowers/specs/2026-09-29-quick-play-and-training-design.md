# Quick Play, Mental Training and the Installable App — Design

- **Status:** Draft for review, 2026-09-29
- **Builds on:** `docs/superpowers/specs/2026-09-24-free-sat-math-design.md` (the Phase 1 spec). Everything there still holds unless this document changes it.
- **Order:** these features ship **before** Phase 2 content. Every skill that Phase 2 later adds flows into Quick Play automatically.

---

## 1. Purpose

Make practice something a student reaches for in spare minutes. Opening the app should feel like opening a game: one tap, a question is on screen, and it can be closed at any moment without losing anything.

### Success criteria

- From the home-screen icon to a question on screen: **one tap** (▶ Play) and under 2 seconds on a mid-range phone.
- A student can answer, swipe, and close at any point; **every answer is saved as it happens**.
- Mental-math drills measurably get faster: the Gym shows seconds per question falling across sessions.
- Everything except Desmos works **offline** after the first visit.
- No page ships more than **170 KB of gzipped JS** (the Phase 1 budget stays).
- No existing student loses progress in the saved-progress upgrade.

### Non-goals

- Accounts, leaderboards, friends, or anything that leaves the student's device.
- Push notifications or reminders.
- A native App Store / Play Store app. The installable site can be wrapped into a store app later if wanted.
- Paid features, ads, tracking.

---

## 2. What the student sees

### 2.1 Quick Play (`/play/`)

**Start screen.** The student's 🔥 streak, level with its progress bar, and one large **▶ Play** button. The installed app opens here (`start_url`).

**Floating button.** A small round **⚡ Play** button sits in the bottom-right corner of every page except `/play/` itself. It links to `/play/?go=1`, which skips the start screen and opens straight onto a question.

**The feed.** Tapping Play shows a full-screen card. The student **swipes up** for the next card (CSS scroll-snap, one card per screen). Keyboard: ↓, `j`, or Space for next; ↑ or `k` to go back. Two small arrow buttons also move between cards, so swiping is never the only way.

- **Swiping past an unanswered card is a skip.** No penalty, no attempt recorded, combo unchanged.
- **Scrolling back** to an answered card shows it answered; it can't be answered twice.
- **✕** in the corner returns to the start screen. Closing the tab or app at any point loses nothing, because every answer was already saved.
- The feed never ends. The next 3 cards are built ahead of time, so a swipe is instant. At most 7 cards stay in the page at once.

**Card types** (§3 sets how often each appears):

| Card | Contents |
|---|---|
| **SAT question** | A generated problem from any available skill. Multiple choice as 4 large buttons, or a typed answer with the number pad (§4.3). Calculator button (Desmos). |
| **Pace check** | An SAT question card with a ring counting toward 95 s (the real test's average: 22 questions in 35 min). |
| **⚡ Lightning round** | 3 mental-math questions, 10 s each, one after another inside one card. |
| **Reset offer** | Appears once per session after 3 wrong in a row: "Take 20 seconds?" Swipe past to ignore. |
| **Tip** | A one-sentence test-day tip (§5.4). |

**After an answer:**

- **Right:** the card flashes green, a short burst animation plays, and the combo meter ticks up. Android phones vibrate for 20 ms (`navigator.vibrate`; iPhones don't support it and nothing happens).
- **Wrong:** the card shakes once and turns red, the right answer is highlighted, and the combo resets.
- **Why?** opens a bottom sheet with the step-by-step solution, the same rendering as the problem page.
- A small **Guessed?** chip lets the student mark the answer as a guess (§5.3). Not tapping it means "sure".
- On a pace check, the time is shown against 95 s: "48 s · on pace ✅" or "2:10 · over pace ⚠️ — on test day, flag it, guess, and move on."

**Sound** is off by default; a toggle on the start screen turns on short Web Audio tones (right, wrong, level-up). No audio files.

**Reduced motion** (`prefers-reduced-motion`): no bursts, shakes or animated rings. Color, icons and text carry the same information.

### 2.2 Mental Math Gym (`/train/`)

A grid of the 6 drills (§4). Tapping one starts a **60-second sprint**: answer as many as possible.

- The results show correct, attempted, accuracy, and the drill's **personal best**, with a celebration when it's beaten.
- A small line chart shows the median seconds per correct answer over the last 20 sessions of that drill.
- A second mode, **Test Pace**, is also here (§5.1).

### 2.3 You (`/you/`)

All the student's stats on one screen:
- streak and best streak, and a 7-day row of done/not-done days;
- level, points, and the bar to the next level;
- personal bests for each drill;
- average time per question for each SAT skill, against 95 s;
- how accurate their answers are when they're sure versus when they guessed;
- the count of "sure but wrong" answers, with a link to Review.

It also holds the **Install app** button or the iPhone instructions (§6.3), and the sound and vibration toggles.

### 2.4 Review page change

On `/review/`, missed problems are sorted with **"sure but wrong"** first. Those are the gaps a student doesn't know they have. Each gets a small "You were sure" label.

---

## 3. Game rules

All numbers here are constants in `src/engine/game.ts`, so they can be tuned without touching the UI.

### 3.1 Points

| Event | Base points |
|---|---|
| Correct SAT answer, easy / medium / hard | 10 / 20 / 30 |
| Correct Lightning answer | 5 |
| All 3 Lightning answers correct | +25 bonus |
| Pace check answered correctly within 95 s | +10 bonus |
| Wrong answer or skip | 0 (points are never taken away) |

### 3.2 Combo

- The combo counts correct answers in a row; Lightning answers count too.
- Multiplier: **×1** below 3, **×2** for 3–5, **×3** for 6–9, **×5** from 10.
- The multiplier applies to base points, not to bonuses.
- A wrong answer resets the combo to 0; a skip leaves it unchanged. A perfect Lightning round adds 2 extra to the combo.
- The combo lives only for the session and resets when the student leaves `/play/`. The best combo ever is saved.

### 3.3 Levels

- Level *n* → *n*+1 needs a running total of 100·*n*·(*n*+1)/2 points: 100 to reach level 2, 300 for level 3, 600 for level 4, and so on.
- Levels never go down.
- Gym sprints earn points too: 2 per correct answer, with no combo.

### 3.4 Daily streak

- A day counts when the student makes **5 answers** in it. Answers from Quick Play, the Gym and Test Pace all count; skips don't.
- Days are the student's **local calendar date** (`YYYY-MM-DD` from the device's time zone).
- **Current streak:** the run of consecutive counted days ending today, or ending yesterday if today isn't counted yet. That way the streak doesn't show 0 in the morning before the student has played.
- **Best streak** is kept forever. Missing a day resets the current streak only.
- If the device clock jumps backward, days are never double-counted; only distinct dates count.

### 3.5 Feed composition (`src/engine/feed.ts`)

A seeded composer builds cards in order:

- **Lightning:** after every 8–12 SAT cards (the gap is random within that range).
- **Pace check:** each SAT card becomes one with probability 1/6.
- **Tip:** at most one per 25 cards.
- **Reset offer:** inserted next, once per session, after 3 wrong in a row.
- **Everything else:** plain SAT questions.

Choosing each SAT question:

- **Skill:** reuse Phase 1's smart mix (`pickMixSkill`). Skills are weighted toward lower recent accuracy, from those available (`isSkillAvailable`).
- **Difficulty:** reuse the per-skill staircase (`skillState`, `updateStair`). Quick Play answers move it exactly like practice answers do.
- **Format:** at most 1 in 5 SAT cards is a typed answer (MCQ-first for phones).
- **No repeats:** skip any problem whose id appears in the last 200 attempts.

---

## 4. Mental Math

### 4.1 Drills (`src/engine/mental/`)

Each drill is a generator like the SAT ones:
- seeded RNG and exact `Rational` arithmetic;
- built answer-first, with an independent `verify()`;
- soak-tested on 5,000 seeds, with golden files and a tamper test.

Each has 3 tiers.

| Drill id | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| `mm.arithmetic` | 2-digit ± 2-digit; 1-digit × 2-digit | 2-digit × 1-digit, exact ÷ | order of operations with negatives |
| `mm.fdp` (fractions/decimals/percents) | halves, quarters, fifths, tenths | eighths, thirds (repeating shown as fraction choice) | percents over 100 and mixed conversions |
| `mm.percent` | 10/25/50% of a number | any whole % of a number; "x is what % of y" | % increase/decrease; successive changes |
| `mm.squares` | squares to 15², roots of perfect squares | squares to 25², cubes to 5³ | simplify √n (e.g. √50 = 5√2) as a choice question |
| `mm.exponents` | 2ⁿ, 3ⁿ, 10ⁿ values | product/quotient/power rules | negative and zero exponents, fractional results |
| `mm.shortcuts` | slope from two points | factor x² + bx + c (choice) | "which choice is closest?" estimation; difference of squares |

### 4.2 Answer types

- **Numeric:** typed on the number pad. It's checked by exact value, so any equivalent fraction or decimal is accepted when the value is exact (0.75 = 3/4). A repeating value is asked as a choice question, never typed.
- **Choice:** 4 options, used for forms that are hard to type (√ expressions, factored forms).

### 4.3 Number pad (`src/components/NumPad.tsx`)

- **Keys:** 0–9, `.`, `−`, `/`, ⌫, and ✓, each at least 56 × 56 px. Physical keyboard input works too.
- **No system keyboard:** it uses `inputmode="none"` plus a read-only display, so the phone keyboard never covers the question.
- **Shared:** SAT typed answers in Quick Play use it too.
- **Garbage input** gets the same hint behavior as Phase 1's answer checker.

### 4.4 Gym sprint rules

- The sprint starts at the drill's saved tier, defaulting to 1.
- Within a sprint: **3 correct in a row → tier up** (max 3); **2 wrong in a row → tier down** (min 1). The tier at the end is saved.
- Lightning cards in Quick Play use the student's saved tier, drawn from a random drill.
- Timing:
  - **Extended time** (Phase 1 setting: 1.5× or 2×) scales the Lightning clock to 15 or 20 seconds.
  - **Untimed** turns Lightning's clock off entirely.
  - The Gym sprint is always 60 s: it's a speed drill, and the student chose it.

---

## 5. Mindset & pacing

### 5.1 Test Pace (Gym mode)

- **Setup:** 5 SAT questions with one shared clock of 5 × 95 s = 7:55, scaled by the extended-time setting.
- **During:** a **Flag & skip** button moves on and remembers the question. Flagged questions come back after question 5.
- **Time's up:** unanswered questions count as unanswered, never as wrong.
- **Results:** time on each question against 95 s, plus the one-line lesson: flagging hard questions saves time for easy ones.

### 5.2 Reset routine

**Where it opens:**
- a **Reset** button on every pace-check card;
- the Reset offer card;
- the You screen.

**What it shows:**
- 20 seconds of guided breathing (in 4 s, out 6 s, twice), shown as a growing and shrinking circle. With reduced motion, it's a text countdown instead.
- Then the unstuck checklist:
  1. Reread exactly what the question asks for.
  2. Try the answer choices, or plug in easy numbers.
  3. Graph it in Desmos.
  4. Still stuck: guess, flag, move on. **Wrong answers don't lose points on the SAT**, so never leave one blank.

The wording is framed as test strategy, not as health advice.

### 5.3 Sure or guess

- An attempt gets `guessed: true` when the chip is tapped. The chip stays tappable until the student moves two cards on.
- The You screen shows accuracy separately for sure and guessed answers, over the last 200 attempts, once there are at least 10 of each.
- A "sure but wrong" answer is one whose latest attempt was wrong and not guessed. These rank first on Review (§2.4).

### 5.4 Tips

A fixed list of 20 short, original tips lives in `src/content/tips.ts`. They are shown in order and don't repeat until all 20 have been seen; the position is stored in progress. Examples:
- "Answer every question. A blank scores the same as a wrong answer."
- "Desmos can check your algebra: graph both sides and look for where they meet."

---

## 6. Installable app & offline

### 6.1 Manifest

- **Names:** name "Free SAT Math", short name "SAT Math".
- **Start and scope:** `start_url` is `${BASE}play/` and `scope` is `${BASE}`. Both come from `BASE_PATH`, so forks deploy correctly.
- **Display:** `display: standalone`, with theme and background colors from the site tokens.
- **Icons:** 192 and 512 px, plus a maskable 512 and a 180 px apple-touch-icon. They're generated from one SVG at build time, so no binaries are committed by hand.

### 6.2 Service worker

- **Tool:** `@vite-pwa/astro` (1.2.x at spec time; pinned in the plan), `generateSW` strategy.
- **Precached:** every built page, script, style, font and icon, so every page works offline after the first visit. The whole site is small.
- **Desmos:** never cached. Offline, the calculator button shows the existing "Open Desmos" fallback with an "offline" note.
- **Updates:** `registerType: 'prompt'`. A new version shows a small **"Update ready — tap to refresh"** toast. It never reloads the page by itself and never interrupts a card.
- **Budget:** the registration script counts toward each page's 170 KB budget. The worker file itself isn't page JS, so it's excluded.

### 6.3 Install prompts

- **Android and desktop Chrome:** capture `beforeinstallprompt` and show an **Install app** button on the You screen and the Play start screen.
- **iPhone Safari:** there's no install API. The Play start screen shows a one-time tip: "Tap Share, then Add to Home Screen." It's dismissed forever with ✕, and it's hidden when already running installed (`display-mode: standalone`).

---

## 7. 3D home hero (ThreeUI)

- **Library:** ThreeUI Community (`@designcodeio/threeui`, MIT), on the home page only.
- **Candidates:** the ones that are raw WebGL and don't bundle three.js, such as LiquidForm, Condensation and RibbonField. The plan builds a comparison preview; **the owner picks one**.
- **Loading:** by dynamic import after the `load` event (and `requestIdleCallback` where available), so the hero never delays the page's content.
- **Fallbacks:**
  - Mounted only when WebGL works. Otherwise the still poster (a CSS gradient in the site's colors) stays.
  - With reduced motion, the component is shown still (e.g. `speed={0}`) or not mounted at all, whichever the chosen component supports.
- **Budget:** the home page must stay ≤170 KB gzipped *including* the hero chunk. React is already on the page, so the chunk is only the component (~10 KB); three.js must never be pulled in. `check:bundle` enforces this.
- **Credit:** the MIT notice goes in `THIRD_PARTY_NOTICES.md` and the About page.

---

## 8. Desmos

- **Setup:** already wired in Phase 1 through the `DESMOS_API_KEY` repository secret. **Owner action:** request the key, and ask Desmos to allow the `wisdmson.github.io` domain.
- **New:** a calculator button on SAT and pace-check cards in Quick Play opens the existing Desmos panel as a bottom sheet.
- **Test Pace** questions get the calculator button too, since the real test has Desmos.
- **Lightning cards and Gym sprints never get it.** They train mental math.

---

## 9. Data model

### 9.1 Schema v2 (`src/store/schema.ts`)

`PROGRESS_SCHEMA_VERSION` becomes **2**. Changes from v1:

- `attempts[].mode` gains `'play'`.
- `attempts[].guessed?: boolean` is new and optional.
- `settings` gains `sound: boolean` (default false) and `haptics: boolean` (default true).
- New `game` section:
  - `points: int`;
  - `bestCombo: int`;
  - `answerDays`: `Record<'YYYY-MM-DD', int>` holding answers per day, pruned to the last 400 days;
  - `bestStreak: int`;
  - `tipIndex: int`.
- New `mental` section:
  - `tier: Partial<Record<DrillId, 1|2|3>>`;
  - `best: Partial<Record<DrillId, int>>`;
  - `sessions`: `{ drill, at, correct, attempted, medianMs }[]`, capped at the newest 200.

Mental-math answers are **not** stored as `attempts`. Attempts stay SAT-only, so Review and accuracy by skill keep meaning SAT skills.

### 9.2 Upgrade from v1 (`src/store/migrate.ts`)

On load:

1. **Parse** the raw JSON.
2. **Version 2** is validated as today.
3. **Version 1** that validates against the v1 schema (kept as `progressSchemaV1`) is upgraded:
   - first a backup copy is written, `fsm.backup.pre-v2`, only if that key doesn't exist yet;
   - then defaults fill the new fields and it's saved as v2.
   - If the backup can't be written, the loader behaves like Phase 1's `locked` status: it doesn't overwrite, and it tells the student.
4. **A version newer than this code knows** gets the new status **`newer`**. This happens when an old tab is open after an update.
   - The data is **not** backed up and **not** overwritten.
   - The page works read-only, with a banner: "This site was updated in another tab. Refresh to keep saving."
   - This guard ships in the **first** release of this work, before anything writes v2.
5. **Anything else** takes the Phase 1 recovery path: back up once, start fresh.

Known gap: a tab still running the currently deployed v1 code (no `newer` guard) that reloads storage after a v2 write will treat v2 as unreadable. It backs the data up once and starts fresh. The backup means nothing is lost, and the v2 build offers the restore:
- **When:** on load, the saved record has no attempts and no points, and a `fsm.backup.*` key written in the last 24 hours holds valid v2 data.
- **What:** a one-time banner offers **"Restore your progress"**. Tapping it replaces the empty record with the backup, backing up the empty one first like any other replace.

### 9.3 Size

Worst case: 5,000 attempts at about 220 bytes each, plus 400 day entries and 200 sessions, comes to about 1.2 MB. That's under the ~5 MB localStorage limit, with the backup rules from Phase 1's fixes still bounding the copies.

---

## 10. Visual design pass (first build step)

Before any new screen is built:

- **Mobbin** (signed in via `/mcp`): collect reference screens from well-designed apps. The list: full-screen question feeds, streak and level displays, combo and reward feedback, numeric keypads, stats pages. The findings go into `docs/superpowers/design/quick-play-references.md` as short notes, never copied assets.
- **TypeUI** (signed in via `/mcp`): produce a small design system for the game surfaces, as tokens added to `src/styles/`:
  - colors for right, wrong and combo levels;
  - the type scale for full-screen cards;
  - spacing and radius;
  - motion durations.
- The owner reviews 3–4 static mockups (Play start, a question card, a Lightning card, the You screen) before the UI tasks start.

---

## 11. Accessibility

- **Swiping always has an alternative:** arrow buttons, the keyboard (↑/↓, `j`/`k`, Space), and normal scrolling with screen readers.
- **Focus:** each card is a region with a heading. Focus moves to the new card's heading on navigation. Feedback is announced through a polite live region.
- **Right and wrong** always show an icon and text, not color alone. Contrast meets WCAG AA in both themes.
- **Timers:** pace-check clocks never submit on their own. Lightning's 10 s clock respects extended time, and **untimed** turns it off.
- **Motion:** vibration and sound are both optional, and everything respects `prefers-reduced-motion`.
- **Tap targets:** at least 48 px; answer buttons and number-pad keys at least 56 px.

---

## 12. Testing

**Unit:**
- points, combo multipliers and levels (`game.ts`);
- streak math with an injected clock, covering midnight, time-zone changes, a clock moved backward, and a gap day;
- feed composer determinism and card frequencies over 10,000 cards with a fixed seed;
- migration: a v1 fixture upgraded to v2 is lossless; the `newer` guard doesn't write; a failed backup ends `locked`;
- the number-pad parser;
- tip rotation.

**Soak / golden / tamper:** each of the 6 drills × 3 tiers on 5,000 seeds, the same machinery as the SAT generators.

**Component:** the feed card states (unanswered, right, wrong, skipped), the number pad, and the Guessed chip.

**Browser (Playwright):**
- ▶ Play → answer → swipe → the attempt is saved;
- a skip keeps the combo;
- a Lightning card appears on a forced seed (a `?seed=` query honored only in test builds);
- the streak counts after 5 answers;
- reload mid-feed loses nothing;
- after one online visit, `context.setOffline(true)` still loads `/play/` and serves a question;
- the manifest is valid and its `start_url` includes the base path;
- 360 px fit for `/play/`, `/train/` and `/you/`;
- reduced motion;
- keyboard-only play.

**Budget and links:** `check:bundle` covers `/play/`, `/train/`, `/you/` and the home page with the hero chunk; `check:links` covers the manifest and the service-worker URLs.

---

## 13. Build order

Each step ends with the full suite green and a deployable site.

0. **Visual design pass** (§10), and the `newer`-version guard shipped on its own (§9.2 step 4).
1. **Schema v2 + upgrade**, `game.ts`, `feed.ts`, the **Quick Play** page (start screen, feed, SAT and tip cards, feedback, combo, points, levels, streak), the floating ⚡ button, and the Review sort.
2. **Mental Math:** the 6 drills with tests, the number pad, the Gym page, and Lightning cards in the feed.
3. **Mindset & pacing:** pace checks, Test Pace, Reset routine and offer card, the Guessed chip, and the You page.
4. **Installable app:** manifest, icons, service worker, update toast, install prompts.
5. **3D home hero:** comparison preview, owner's pick, integration within budget.

Then Phase 2 (the remaining Algebra and Advanced Math generators) resumes; its skills join Quick Play automatically.

---

## 14. Owner actions

- Request the Desmos API key and approval for `wisdmson.github.io`, then add the `DESMOS_API_KEY` secret.
- Sign in to Mobbin and TypeUI with `/mcp` before step 0.
- Review the mockups (step 0) and pick the hero component (step 5).
