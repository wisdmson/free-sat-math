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
