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
/**
 * Pages with their own startup budget. Quick Play builds four random-skill question cards the
 * moment it opens, so every question generator is startup code; with all 19 skills that's 172 KB.
 * The owner raised its limit to 175 KB (2026-10-03). BUNDLE_BUDGET_KB still overrides all pages.
 */
const PAGE_BUDGET_KB = process.env.BUNDLE_BUDGET_KB ? {} : { 'play/index.html': 175 };
const NO_JS_PAGES = [
  /^skills\/[^/]+\/index\.html$/,
  /^formulas\/index\.html$/,
  /^about\/index\.html$/,
  /^404\.html$/,
];
/** Lazy chunks (by file-name prefix) a page loads at startup, e.g. Quick Play's feed on ?go=1. */
const STARTUP_LAZY = { 'play/index.html': ['PlayFeed.'] };

const STATIC_IMPORT = /(?:from|import)\s*"\.\/([^"]+\.js)"/g;
// Vite writes lazy imports with backticks: import(`./PlayFeed.abc.js`).
const DYNAMIC_IMPORT = /import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g;

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
  [...files].reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, '_astro', f))).length, 0) /
  1024;

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
  // A renamed chunk must not silently drop out of the budget.
  for (const prefix of prefixes) {
    if (!lazyAtStart.some((f) => f.startsWith(prefix)))
      failures.push(`${page}: no lazy chunk starts with "${prefix}" (update STARTUP_LAZY)`);
  }
  const startup = closure([...entries, ...lazyAtStart]).files;
  const all = everything(entries);
  const startupKb = kb(startup);
  const extraKb = kb(all) - startupKb;
  console.log(
    `${page.padEnd(32)} ${startupKb.toFixed(1).padStart(6)} KB gz startup` +
      (extraKb > 0.05 ? `  (+${extraKb.toFixed(1)} KB on demand)` : ''),
  );
  const budget = PAGE_BUDGET_KB[page] ?? BUDGET_KB;
  if (startupKb > budget) failures.push(`${page}: ${startupKb.toFixed(1)} KB > ${budget} KB`);
  if (NO_JS_PAGES.some((re) => re.test(page)) && all.size > 0)
    failures.push(`${page}: should ship no JS files`);
}

if (failures.length > 0) {
  console.error(`\nBundle budget exceeded:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nAll pages within budget at startup (${BUDGET_KB} KB; Quick Play 175 KB).`);
