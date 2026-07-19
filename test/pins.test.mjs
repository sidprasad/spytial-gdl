// Guard against spytial-core version drift. Run with `npm test`.
//
// The engine is loaded from CDN by hardcoded <script> tags (examples, playground)
// and by markdown.js's auto-loader — none of which `npm` can reach. So a patch
// version written into those pages can silently disagree with the manifest, and
// the repo ends up claiming several versions at once. That has already happened
// twice: the examples sat on 2.9.1 and markdown.js on 2.10.1 while the manifest
// asked for ^2.10.1.
//
// The cure is to not name a patch version at all. peerDependencies says `^3.1.0`
// — any 3.x will do — so the CDN tags float the same way: `spytial-core@3` gets
// the latest 3.x. Nothing has to be rewritten on a core release, and there is no
// triple left to go stale. Two claims still have to agree with the manifest:
//
//   * every `spytial-core@<tag>` floats — the bare major (`@3`) or a caret range
//     (`^3.1`). A patch-exact `@3.1.0` is the drift bug itself, so it fails here.
//   * every `need spytial-core ≥ X.Y.Z` message states the *floor* — the oldest
//     core we work against, which is the peer range's floor, not whatever the
//     CDN happens to serve today. That floor only moves when we actually rely on
//     something newer.

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
const floor = String(range).replace(/^\^/, '');   // 3.1.0 — the oldest core we support
const major = floor.split('.')[0];                // 3     — the line the CDN tags float on

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

// The two shapes a version claim takes. TAG is the one that ships an engine —
// `spytial-core@3` in a CDN URL or in prose. FLOOR is the one that only states a
// minimum — `spytial-core ≥ 3.1.0` in an error message. They answer different
// questions, so they're held to different rules.
const TAG = /spytial-core@(\^?[\w.\-]+)/g;
const FLOOR = /spytial-core\s*[≥>=]+\s*v?(\d+\.\d+\.\d+)/g;

// A tag floats if it's the bare major, or a caret range on that major. Anything
// naming a patch is a pin that will rot the next time core ships.
const floats = (tag) =>
  tag === major || (tag.startsWith('^') && tag.slice(1).split('.')[0] === major);

const drift = [];
let tags = 0, floors = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const at = (i) => `${relative(ROOT, file)}:${text.slice(0, i).split('\n').length}`;

  for (const m of text.matchAll(TAG)) {
    tags++;
    if (!floats(m[1])) drift.push(`${at(m.index)} pins spytial-core@${m[1]}; float it (@${major})`);
  }
  for (const m of text.matchAll(FLOOR)) {
    floors++;
    if (m[1] !== floor) drift.push(`${at(m.index)} claims a ${m[1]} floor; the peer range says ${floor}`);
  }
}

check(`every spytial-core@tag floats on ${major}.x and every floor claim says ${floor} (${tags} tags, ${floors} floors)`,
  drift.length === 0, `\n    ${drift.join('\n    ')}`);
// If the URL shape ever changes, the scan above would quietly pass on zero files.
check('the scan found both a tag and a floor claim to check', tags > 0 && floors > 0,
  `tags=${tags} floors=${floors}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
