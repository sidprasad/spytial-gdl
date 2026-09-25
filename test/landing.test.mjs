import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const landing = read('index.html');
const docs = read('docs/index.html');
const playground = read('playground/index.html');
const docsNav = JSON.parse(read('docs/nav.json'));

assert.match(landing, /<h1 id="page-title">Graph diagrams with layout requirements\.<\/h1>/);
assert.match(landing, /Spytial GDL is a lightweight, web-native graph description language/);
assert.ok(landing.indexOf('Spytial GDL is a lightweight') < landing.indexOf('<section class="argument"'));
assert.ok(landing.indexOf('<section class="argument"') < landing.indexOf('<section class="model"'));
assert.ok(!landing.includes('board-graph'), 'The landing page should lead with the project, not the old board demo');

for (const [page, examples, embed, docsLink] of [
  [landing, './playground/', './docs/#/embedding', './docs/'],
  [docs, '../playground/', '#/embedding', '#/introduction'],
  [playground, '../playground/', '../docs/#/embedding', '../docs/'],
]) {
  const mainNav = page.match(/<nav class="[^"]*" aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(mainNav, 'Main navigation exists');
  assert.deepEqual([...mainNav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]), ['Examples', 'Embed', 'Docs']);
  for (const href of [examples, embed, docsLink]) {
    assert.ok(mainNav.includes(`href="${href}"`), `Main navigation includes ${href}`);
  }
}

const syntax = docsNav.find((entry) => entry.section === 'Syntax reference');
assert.deepEqual(syntax.pages.map((page) => page.slug), ['notation', 'annotations']);
for (const slug of ['introduction', 'embedding', 'notation', 'annotations']) {
  assert.ok(docsNav.flatMap((entry) => entry.pages || [entry]).some((page) => page.slug === slug));
  assert.ok(existsSync(new URL(`../docs/pages/${slug}.md`, import.meta.url)));
}
assert.match(read('docs/pages/embedding.md'), /## Quick start[\s\S]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/spytial-gdl\/src\/auto\.js"/);
assert.match(playground, /<select id="example-select"[\s\S]*<option value="pipeline">/);
assert.ok(existsSync(new URL('../SKILL.md', import.meta.url)));
console.log('Landing copy, primary navigation, embedding route, and playground examples are present.');
