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
