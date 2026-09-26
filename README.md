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
