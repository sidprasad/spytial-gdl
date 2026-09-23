import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { compileSpytialGdl } from '../src/index.js';
import { parseGraph } from '../src/parse.js';
import { mermaidSource, setupComparison } from '../assets/landing-comparison.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../assets/landing.js', import.meta.url), 'utf8');
const source = html.match(/id="board-graph"[^>]*>([\s\S]*?)<\/div>/)[1];
const link = { dataset: { playgroundSource: 'board-graph' }, href: './playground/' };
const document = {
  querySelectorAll: (selector) => selector === '[data-playground-source]' ? [link] : [],
  getElementById: (id) => id === 'board-graph' ? { textContent: source } : null,
};
runInNewContext(script, {
  document, TextEncoder,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
});
assert.ok(link.href.startsWith('./playground/#g='));
const payload = JSON.parse(Buffer.from(link.href.split('#g=')[1], 'base64').toString('utf8'));
assert.equal(payload.m, source.trim(), 'Playground link must preserve the full graph, including Unicode labels');
const compiled = compileSpytialGdl(payload.m);
assert.equal(compiled.ok, true);
assert.deepEqual(compiled.annotationErrors, []);
assert.deepEqual(compiled.parseErrors, []);
const graph = parseGraph(payload.m);
assert.equal(graph.nodes.size, 9);
assert.ok([...graph.nodes.values()].every(node => node.type === 'Cell'));
assert.deepEqual(graph.edges.map(({ source, target, label }) => `${source}:${label}:${target}`).sort(), [
  'a:right:b', 'b:right:c', 'd:right:e', 'e:right:f', 'g:right:h', 'h:right:i',
  'a:below:d', 'd:below:g', 'b:below:e', 'e:below:h', 'c:below:f', 'f:below:i',
].sort());
assert.ok(source.includes('@orientation(selector=right, directions=[directlyRight])'));
assert.ok(source.includes('@orientation(selector=below, directions=[directlyBelow])'));
assert.ok(!/@(?:atomStyle|edgeStyle|size)\(/.test(source), 'Use default graph appearance');
const comparison = mermaidSource(source);
const comparedGraph = parseGraph(comparison.replace(/^flowchart TB\n/, ''));
const relations = g => g.edges.map(({ source, target, label }) => ({ source, target, label }));
assert.deepEqual(relations(comparedGraph), relations(graph), 'The comparison preserves every labeled edge');
assert.deepEqual([...comparedGraph.nodes].map(([id, n]) => [id, n.label]),
  [...graph.nodes].map(([id, n]) => [id, n.label]), 'The comparison preserves every cell and mark');

// Lazy rendering, caching, and failure recovery without loading a CDN in tests.
let toggle;
const elements = Object.fromEntries(['mermaid-source', 'mermaid-preview', 'mermaid-status'].map(id => [id, {}]));
elements['board-graph'] = { textContent: source };
elements['mermaid-comparison'] = { open: false, addEventListener: (event, handler) => { assert.equal(event, 'toggle'); toggle = handler; } };
let loads = 0;
setupComparison({ getElementById: id => elements[id] }, async () => {
  loads++;
  if (loads === 1) throw new Error('offline');
  return { default: {
    initialize: options => assert.equal(options.securityLevel, 'strict'),
    render: async (id, code) => { assert.equal(code, comparison); return { svg: '<svg></svg>' }; },
  } };
});
assert.equal(loads, 0);
assert.equal(elements['mermaid-source'].textContent, comparison);
await toggle();
assert.equal(loads, 0);
elements['mermaid-comparison'].open = true;
await toggle();
assert.match(elements['mermaid-status'].textContent, /could not load/);
await toggle();
assert.equal(elements['mermaid-preview'].innerHTML, '<svg></svg>');
assert.equal(elements['mermaid-status'].textContent, '');
await toggle();
assert.equal(loads, 2, 'Successful comparison is rendered only once');
assert.ok(html.indexOf('src="./assets/landing.js"') < html.indexOf('src="./src/auto.js"'),
  'Capture the graph source before the renderer replaces it');

const actions = html.match(/<nav class="actions"[\s\S]*?<\/nav>/)[0];
assert.equal([...actions.matchAll(/<a\s/g)].length, 3);
assert.ok(actions.includes('href="./docs/#/introduction"'));
assert.ok(actions.includes('href="./AGENTS.md"'));
assert.ok(!html.includes('<figcaption'));
assert.ok(!html.includes('data-copy-target'));
assert.ok(html.indexOf('Traditional graph description languages') < html.indexOf('id="board-graph"'));
assert.ok(html.indexOf('Describe the graph, then state relationships') < html.indexOf('id="board-graph"'));
assert.equal(html.match(/Traditional graph description languages/g).length, 1);
for (const path of ['index.html', 'docs/index.html', 'playground/index.html', 'gallery/index.html',
  'examples/index.html', 'examples/two-way-editing.html', 'examples/binary-tree.html',
  'examples/conflict.html', 'examples/drop-in.html', 'examples/editable.html',
  'examples/guide.html', 'examples/md-viewer.html']) {
  const page = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const header = page.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  assert.ok(header, `${path} has a site header`);
  assert.match(header, />Playground<\/a>/, `${path} links to the playground in its header`);
  assert.match(header, />Documentation<\/a>/, `${path} links to documentation in its header`);
  assert.ok(!header.includes('Gallery'), `${path} does not promote the gallery`);
}
const docsNav = JSON.parse(readFileSync(new URL('../docs/nav.json', import.meta.url), 'utf8'));
assert.equal(docsNav.find(page => page.slug === 'annotations').title, 'Requirements');
assert.match(readFileSync(new URL('../docs/pages/annotations.md', import.meta.url), 'utf8'), /^# Requirements\n/);
console.log('Landing graph compiles, playground link round-trips, and the three entry points are present.');
