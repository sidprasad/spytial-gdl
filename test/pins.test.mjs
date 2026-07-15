// Guard against spytial-core version drift. Run with `npm test`.
//
// The engine is loaded from CDN by hardcoded <script> tags (examples, playground)
// and by markdown.js's auto-loader — none of which `npm` can reach. So bumping
// peerDependencies silently leaves those pages on the old engine, and the repo
// ends up claiming several versions at once. That has already happened twice: the
// examples sat on 2.9.1 and markdown.js on 2.10.1 while the manifest asked for
// ^2.10.1. It used to just mean "a bit old"; since core 3 reshaped the directive
// contract, a stale pin renders a diagram *wrong*. So: one version, everywhere.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const range = pkg.peerDependencies['spytial-core'];
check('package.json declares a caret peer range on spytial-core',
  /^\^\d+\.\d+\.\d+$/.test(range || ''), JSON.stringify(range));
const expected = String(range).replace(/^\^/, '');

// Anywhere a pin can hide: sources, pages, and the docs/README prose.
const SCAN_DIRS = ['src', 'examples', 'playground', 'docs', 'test'];
const SCAN_FILES = ['README.md', 'GUIDE.md', 'index.html'];
const SCANNABLE = /\.(js|mjs|html|md)$/;
const SELF = basename(fileURLToPath(import.meta.url));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (SCANNABLE.test(entry) && entry !== SELF) out.push(p);
  }
  return out;
}

const files = [
  ...SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))),
  ...SCAN_FILES.map((f) => join(ROOT, f)),
];

// Catches both shapes of version claim: `spytial-core@3.1.0` in a CDN URL or in
// prose, and `spytial-core ≥ 3.1.0` in an error message. Both go stale alike.
const PIN = /spytial-core[@\s]*[≥>=]*\s*v?(\d+\.\d+\.\d+)/g;

const drift = [];
let found = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(PIN)) {
    found++;
    if (m[1] !== expected) {
      const line = text.slice(0, m.index).split('\n').length;
      drift.push(`${relative(ROOT, file)}:${line} says ${m[1]}, expected ${expected}`);
    }
  }
}

check(`every spytial-core version claim matches the ${expected} peer dep (${found} checked)`,
  drift.length === 0, `\n    ${drift.join('\n    ')}`);
// If the URL shape ever changes, the scan above would quietly pass on zero files.
check('the scan found pins to check', found > 0, `found=${found}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
