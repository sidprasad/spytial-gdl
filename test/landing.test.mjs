import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as core from 'spytial-core';
import { compileSpytialGdl, solveSpytialGdl } from '../src/index.js';
import { legacyTarget } from '../docs/pages/javascripts/legacy-routes.js';
import { listExamples, loadExample } from '../playground/examples.js';
import { exampleManifest } from '../scripts/example-manifest.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const landing = read('index.html');
const playground = read('playground/index.html');
const docsConfig = read('mkdocs.yml');

for (const [page, examples, embed, docsLink] of [
  [landing, './playground/', './docs/#/embedding', './docs/'],
  [playground, '../playground/', '../docs/#/embedding', '../docs/'],
]) {
  const mainNav = page.match(/<nav class="[^"]*" aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(mainNav, 'Main navigation exists');
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
  [''], 'Example choices are filled from the discovered files');
const examples = await exampleManifest();
assert.ok(examples.length > 0, 'The playground has at least one example');
assert.deepEqual([...examples].sort(),
  readdirSync(new URL('../playground/examples/', import.meta.url))
    .filter((file) => !file.startsWith('.') && file.endsWith('.gdl'))
    .sort());
assert.deepEqual(await listExamples(async (url, options) => {
  assert.equal(url.pathname.endsWith('/playground/examples.json'), true);
  assert.equal(options.cache, 'no-cache');
  return { ok: true, json: async () => examples };
}), examples);
for (const name of examples) {
  const source = await loadExample(name, async (url, options) => {
    assert.equal(decodeURIComponent(url.pathname).endsWith(`/examples/${name}`), true);
    assert.equal(options.cache, 'no-cache', 'Reloading an example revalidates edits to its file');
    return { ok: true, text: async () => readFileSync(url, 'utf8') };
  });
  const compiled = compileSpytialGdl(source);
  assert.equal(compiled.ok, true, name);
  assert.deepEqual(compiled.parseErrors, [], name);
  assert.deepEqual(compiled.annotationErrors, [], name);
}
await assert.rejects(loadExample(examples[0], async () => ({ ok: false, status: 404 })),
  /Could not load .* example \(HTTP 404\)/, 'Failed fetches report an error instead of loading an error page');
await assert.rejects(loadExample('../unknown.gdl', async () => {
  assert.fail('Invalid example names must not issue a request');
}), /Invalid example/);
assert.doesNotMatch(playground, /id="value-btn"|id="view-hint"/);
assert.match(playground, /#error-messages #error-message-modal\s*\{[^}]*background: var\(--canvas\)/);
assert.ok(existsSync(new URL('../SKILL.md', import.meta.url)));
console.log('Primary navigation, embedding route, and playground examples are present.');
