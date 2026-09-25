import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const landing = read('index.html');
const docs = read('docs/index.html');
const playground = read('playground/index.html');
const docsNav = JSON.parse(read('docs/nav.json'));

assert.match(landing, /<h1[^>]*>Graph diagrams with <span>layout requirements\.<\/span><\/h1>/);
assert.match(landing, /Spytial GDL is a lightweight, web-native graph description language/);
assert.ok(landing.indexOf('Spytial GDL is a lightweight') < landing.indexOf('<section class="argument"'));
assert.ok(landing.indexOf('<section class="argument"') < landing.indexOf('<section class="model"'));
assert.ok(!landing.includes('board-graph'), 'The landing page should lead with the project, not the old board demo');

for (const [page, embed, reference, editor] of [
  [landing, './docs/#/embedding', './docs/#/notation', './playground/'],
  [docs, '#/embedding', '#/notation', '../playground/'],
  [playground, '../docs/#/embedding', '../docs/#/notation', './'],
]) {
  const mainNav = page.match(/<nav class="[^"]*" aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(mainNav, 'Main navigation exists');
  for (const href of [embed, reference, editor]) {
    assert.ok(mainNav.includes(`href="${href}"`), `Main navigation includes ${href}`);
  }
}

for (const slug of ['notation', 'embedding']) {
  assert.ok(docsNav.some((page) => page.slug === slug));
  assert.ok(existsSync(new URL(`../docs/pages/${slug}.md`, import.meta.url)));
}
assert.match(read('docs/pages/embedding.md'), /## Quick start[\s\S]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/spytial-gdl\/src\/auto\.js"/);
assert.match(playground, /<select id="example-select"[\s\S]*<option value="pipeline">/);
assert.ok(existsSync(new URL('../SKILL.md', import.meta.url)));
console.log('Landing copy, primary navigation, embedding route, and playground examples are present.');
