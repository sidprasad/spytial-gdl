import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { compileSpytialGdl } from '../src/index.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../assets/landing.js', import.meta.url), 'utf8');
const source = html.match(/id="expression-graph"[^>]*>([\s\S]*?)<\/div>/)[1];
const link = { dataset: { playgroundSource: 'expression-graph' }, href: './playground/' };
const document = {
  querySelectorAll: (selector) => selector === '[data-playground-source]' ? [link] : [],
  getElementById: (id) => id === 'expression-graph' ? { textContent: source } : null,
};
runInNewContext(script, {
  document, TextEncoder,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
});
assert.ok(link.href.startsWith('./playground/#g='));
const payload = JSON.parse(Buffer.from(link.href.split('#g=')[1], 'base64').toString('utf8'));
assert.equal(payload.m, source.trim(), 'Edit link must preserve the graph, including Unicode labels');
const compiled = compileSpytialGdl(payload.m);
assert.equal(compiled.ok, true);
assert.deepEqual(compiled.annotationErrors, []);
assert.deepEqual(compiled.parseErrors, []);
assert.ok(html.indexOf('src="./assets/landing.js"') < html.indexOf('src="./src/auto.js"'),
  'Capture the graph source before the renderer replaces it');

// The copyable minimal embed must also be valid, independent of hero styling.
const embed = html.match(/id="html-example">([\s\S]*?)<\/code>/)[1];
const embedSource = embed.match(/&lt;div[^\n]*\n([\s\S]*?)&lt;\/div&gt;/)[1];
const minimal = compileSpytialGdl(embedSource);
assert.equal(minimal.ok, true);
assert.deepEqual(minimal.annotationErrors, []);
assert.deepEqual(minimal.parseErrors, []);
console.log('Landing page edit link round-trips, and both example sources compile.');
