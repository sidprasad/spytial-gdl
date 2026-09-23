import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { runCases } from 'spytial-core/conformance';
import { compileSpytialGdl } from '../src/index.js';

const page = new URL('../gallery/index.html', import.meta.url);
const html = readFileSync(page, 'utf8');
const script = readFileSync(new URL('../assets/landing.js', import.meta.url), 'utf8');
const graphs = new Map([...html.matchAll(/class="spytial-gdl" id="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)]
  .map(([, id, source]) => [id, source.trim()]));
assert.equal(graphs.size, 4, 'Every case has a live graph');
assert.equal([...html.matchAll(/class="source-link"/g)].length, graphs.size, 'Every case credits its source');
assert.ok(!html.includes('—'), 'Keep the gallery copy free of em dashes');
assert.ok(html.indexOf('../assets/landing.js') < html.indexOf('../src/auto.js'));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, 'Page IDs are unique');
for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (/^https?:/.test(href)) continue;
  if (href.startsWith('#')) {
    assert.ok(ids.includes(href.slice(1)), `Anchor exists: ${href}`);
  } else {
    assert.ok(existsSync(new URL(href, page)), `Local target exists: ${href}`);
  }
}

// Gallery links must resolve from a subdirectory and from a GitHub Pages prefix.
for (const prefix of ['', '/spytial-gdl']) {
  const links = [...html.matchAll(/href="([^"]+)" data-playground-source="([^"]+)"/g)]
    .map(([, href, id]) => ({ href: new URL(href, `https://example.com${prefix}/gallery/`).href,
      dataset: { playgroundSource: id } }));
  assert.equal(links.length, graphs.size);
  runInNewContext(script, {
    TextEncoder,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    document: {
      querySelectorAll: () => links,
      getElementById: (id) => graphs.has(id) ? { textContent: graphs.get(id) } : null,
    },
  });
  for (const link of links) {
    const url = new URL(link.href);
    assert.equal(url.pathname, `${prefix}/playground/`);
    const payload = JSON.parse(Buffer.from(url.hash.slice(3), 'base64').toString('utf8'));
    assert.equal(payload.m, graphs.get(link.dataset.playgroundSource));
  }
}

const assertions = {
  'words-graph': [
    { query: 'nodes()', count: 7 },
    { query: 'must.rightOf(determiner)', contains: ['noun', 'verb', 'object'] },
    { query: 'must.rightOf(noun)', contains: ['verb', 'object'] },
    { query: 'must.rightOf(verb)', contains: ['object'] },
    { query: 'must.aligned.y(determiner)', contains: ['noun', 'verb', 'object'] },
    { query: 'must.below(sentence)', contains: ['subject', 'predicate', 'determiner', 'noun', 'verb', 'object'] },
  ],
  'family-graph': [
    { query: 'nodes()', count: 6 },
    { query: 'must.below(henry)', contains: ['mary', 'john', 'jane'] },
    { query: 'must.below(abigail)', contains: ['mary', 'john', 'jane'] },
    { query: 'must.below(adam)', contains: ['john', 'jane'] },
    { query: 'must.aligned.y(henry)', contains: ['abigail'] },
    { query: 'must.aligned.y(adam)', contains: ['mary'] },
    { query: 'must.aligned.y(john)', contains: ['jane'] },
    { query: 'grouped(henry, abigail)', nonEmpty: true },
    { query: 'grouped(adam, mary)', nonEmpty: true },
    { query: 'grouped(henry, mary)', empty: true },
  ],
  'subsystem-graph': [
    { query: 'nodes()', count: 5 },
    { query: 'must.rightOf(parse)', contains: ['check', 'generate'] },
    { query: 'must.rightOf(check)', contains: ['generate'] },
    { query: 'must.aligned.y(parse)', contains: ['check', 'generate'] },
    { query: 'must.below(source)', contains: ['parse'] },
    { query: 'must.below(generate)', contains: ['program'] },
    { query: 'grouped(parse, generate)', nonEmpty: true },
    { query: 'grouped(source, parse)', empty: true },
  ],
  'peers-graph': [
    { query: 'nodes()', count: 5 },
    { query: 'must.aligned.y(east)', contains: ['west'] },
    { query: 'must.below(router)', contains: ['east', 'west', 'eastStore', 'westStore'] },
    { query: 'must.below(east)', contains: ['eastStore'] },
    { query: 'must.below(west)', contains: ['westStore'] },
    { query: 'must.aligned.x(east)', contains: ['eastStore'] },
    { query: 'must.aligned.x(west)', contains: ['westStore'] },
  ],
};

const cases = [...graphs].map(([name, source]) => {
  const compiled = compileSpytialGdl(source);
  assert.equal(compiled.ok, true, name);
  assert.deepEqual(compiled.parseErrors, [], name);
  assert.deepEqual(compiled.annotationErrors, [], name);
  return { name, datum: compiled.datum, spec: compiled.rules, assertions: assertions[name] };
});
const result = runCases(cases);
assert.equal(result.formatVersion, 1);
assert.equal(result.cases.length, graphs.size);
for (const c of result.cases) {
  assert.deepEqual(c.errors, [], `${c.name}: valid datum and spec`);
  assert.deepEqual(c.warnings, [], `${c.name}: all selectors match`);
  for (const a of c.assertions) assert.ok(a.ok, `${c.name}: ${a.query}: ${a.message}`);
}
console.log('Gallery: four sourced graphs compile, spatial requirements hold, and playground links preserve source.');
