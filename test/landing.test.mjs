import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as core from 'spytial-core';
import { compileSpytialGdl, solveSpytialGdl } from '../src/index.js';
import { legacyTarget } from '../docs/pages/javascripts/legacy-routes.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const landing = read('index.html');
const playground = read('playground/index.html');
const docsConfig = read('mkdocs.yml');

assert.match(landing, /<h1 id="page-title">Graph diagrams with layout requirements\.<\/h1>/);
assert.match(landing, /<p class="lede">Have you ever described a Mermaid or DOT graph/);
assert.ok(!landing.includes('board-graph'), 'The landing page should lead with the project, not the old board demo');

for (const [page, examples, embed, docsLink] of [
  [landing, './playground/', './docs/#/embedding', './docs/'],
  [playground, '../playground/', '../docs/#/embedding', '../docs/'],
]) {
  const mainNav = page.match(/<nav class="[^"]*" aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(mainNav, 'Main navigation exists');
  assert.deepEqual([...mainNav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]), ['Examples', 'Embed', 'Docs']);
  for (const href of [examples, embed, docsLink]) {
    assert.ok(mainNav.includes(`href="${href}"`), `Main navigation includes ${href}`);
  }
}

for (const slug of ['embedding', 'notation', 'requirements']) {
  assert.ok(docsConfig.includes(`${slug}.md`));
  assert.ok(existsSync(new URL(`../docs/pages/${slug}.md`, import.meta.url)));
  for (const base of ['https://example.com/docs/', 'https://example.com/spytial-gdl/docs/']) {
    assert.equal(legacyTarget(`#/${slug}`, base), `${base}${slug}/`);
    assert.equal(legacyTarget(`#/${slug}/style-blocks`, base), `${base}${slug}/#style-blocks`);
  }
}
assert.equal(legacyTarget('#orientation', 'https://example.com/docs/'), null);
assert.equal(legacyTarget('#/unknown', 'https://example.com/docs/'), null);
assert.equal(legacyTarget('#//example.net', 'https://example.com/docs/'), null);

const reference = read('docs/pages/requirements.md');
const referenceExamples = [...reference.matchAll(/```spytial-gdl(?:-editable)?\n([\s\S]*?)```/g)];
assert.ok(referenceExamples.length >= 6, 'Every layout rule has a live example');
for (const [, source] of referenceExamples) {
  const compiled = compileSpytialGdl(source);
  assert.equal(compiled.ok, true, source);
  const solved = solveSpytialGdl(core, compiled);
  assert.equal(solved.error, null, source);
  assert.deepEqual(solved.diagnostics, [], source);
  assert.ok(solved.layout);
}
assert.match(read('docs/pages/embedding.md'), /## Quick start[\s\S]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/spytial-gdl\/src\/auto\.js"/);
const exampleMenu = playground.match(/<select id="example-select"[\s\S]*?<\/select>/)?.[0];
assert.ok(exampleMenu, 'The playground has an example menu');
assert.deepEqual([...exampleMenu.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]),
  ['', 'tree', 'cycle', 'compiler', 'counterfactual']);
assert.match(exampleMenu, /<option value="tree" selected>Binary tree<\/option>/);
const examples = Object.fromEntries([...playground.matchAll(/\n\s+(tree|cycle|compiler|counterfactual): `([\s\S]*?)`,/g)]
  .map(([, name, source]) => [name, source]));
assert.deepEqual(Object.keys(examples), ['tree', 'cycle', 'compiler', 'counterfactual']);
for (const [name, source] of Object.entries(examples)) {
  const compiled = compileSpytialGdl(source);
  assert.equal(compiled.ok, true, name);
  assert.deepEqual(compiled.parseErrors, [], name);
  assert.deepEqual(compiled.annotationErrors, [], name);
  const solved = solveSpytialGdl(core, compiled);
  if (name === 'counterfactual') {
    assert.ok(solved.error?.errorMessages, 'The counterfactual example reports a constraint clash');
    assert.equal(compiled.parsed.nodes.size, 7);
    assert.equal(compiled.parsed.edges.length, 7);
    const conflict = solved.layout.conflictingConstraints;
    assert.equal(conflict.length, 3, 'Only the three cycle edges belong to the conflict');
    assert.deepEqual(new Set(conflict.flatMap((c) => [c.top.id, c.bottom.id])),
      new Set(['A', 'B', 'D']), 'Four nodes remain outside the conflict');
    assert.equal(solved.layout.nodes.length, 7, 'The counterfactual retains the whole graph');
    assert.equal(solved.layout.constraints.length, 6, 'The original tree constraints remain feasible');
    const repaired = solveSpytialGdl(core, compileSpytialGdl(source.replace(/^D -> A\n/m, '')));
    assert.equal(repaired.error, null, 'Removing the extra edge resolves the conflict');
  } else {
    assert.equal(solved.error, null, `${name} layout requirements are satisfiable`);
  }
  assert.deepEqual(solved.diagnostics, [], name);
  assert.ok(solved.layout, name);
  if (name === 'cycle') {
    assert.equal(compiled.parsed.nodes.size, 5);
    assert.equal(compiled.parsed.edges.length, 5);
  }
}
assert.doesNotMatch(playground, /id="value-btn"|id="view-hint"/);
assert.match(playground, /#error-messages #error-message-modal\s*\{[^}]*background: var\(--canvas\)/);
assert.ok(existsSync(new URL('../SKILL.md', import.meta.url)));
console.log('Landing copy, primary navigation, embedding route, and playground examples are present.');
