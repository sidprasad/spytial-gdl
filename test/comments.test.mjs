import assert from 'node:assert/strict';
import { parseGraph } from '../src/parse.js';
import { extractAnnotations } from '../src/annotations.js';
import { compileSpytialGdl } from '../src/index.js';
import { tokenize, tokenizeLine, toHtml } from '../src/highlight.js';

const source = [
  '  %%{  ',
  'subgraph ignored',
  'Hidden -> Ghost',
  '@orientation(',
  '}%%',
  'A -> B : next',
  '%%{',
  '%%{', // Blocks do not nest.
  'another explanation',
  '}%%',
  '@orientation(selector=next, directions=[right])',
  '!!!',
].join('\n');

for (const newline of ['\n', '\r\n']) {
  const input = source.replaceAll('\n', newline);
  const compiled = compileSpytialGdl(input);
  assert.equal(compiled.ok, true);
  assert.deepEqual([...compiled.parsed.nodes.keys()], ['A', 'B']);
  assert.equal(compiled.parsed.edges[0].line, 6);
  assert.deepEqual(compiled.annotationErrors, []);
  assert.equal(compiled.annotationMeta.length, 1);
  assert.equal(compiled.annotationMeta[0].line, 11);
  assert.equal(compiled.parseErrors.length, 1);
  assert.equal(compiled.parseErrors[0].line, 12);
  assert.equal(compiled.parsed.fatal, undefined);
}

// parseGraph also supports blocks when used directly, including header guards.
const parsed = parseGraph('%%{\npie\nsubgraph hidden\n}%%\nA -> B');
assert.deepEqual(parsed.errors, []);
assert.deepEqual([...parsed.nodes.keys()], ['A', 'B']);
assert.equal(parsed.edges[0].line, 5);
assert.equal(parseGraph('%%{\nexplanation\n}%%\npie\nA -> B').fatal, true);

// Comments inside wrapped annotations cannot change the argument/paren scan.
const annotation = '@orientation(\n  selector=next,\n  %%{\n) %% “prose”\n@unknown()\n  }%%\n  directions=[right]\n)';
const extracted = extractAnnotations(`A -> B : next\n${annotation}`);
assert.deepEqual(extracted.errors, []);
assert.deepEqual(extracted.annotationLines, [annotation]);
assert.match(extracted.specYaml, /directions: \[right\]/);
assert.equal(extracted.source.split('\n').length, 9);

// Unclosed blocks hide the rest and report once at the opener, in both APIs.
const unclosed = 'A -> B\n  %%{\nGhost\n@unknown()';
for (const errors of [parseGraph(unclosed).errors, compileSpytialGdl(unclosed).annotationErrors]) {
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.match(errors[0].message, /unterminated block comment/);
}
const unfinished = compileSpytialGdl(unclosed);
assert.deepEqual([...unfinished.parsed.nodes.keys()], ['A', 'B']);
assert.deepEqual(unfinished.parseErrors, []);
const stray = compileSpytialGdl('A\n}%%\nB');
assert.equal(stray.annotationErrors.length, 1);
assert.equal(stray.annotationErrors[0].line, 2);
assert.match(stray.annotationErrors[0].message, /unexpected block comment closer/);
assert.deepEqual(stray.parseErrors, []);

// Inline percent comments/labels and Mermaid config diagnostics keep working.
const ordinary = parseGraph('A["%%{ literal }%%"] -> B %%{ ordinary line comment\nC');
assert.deepEqual(ordinary.errors, []);
assert.equal(ordinary.nodes.get('A').label, '%%{ literal }%%');
assert.ok(ordinary.nodes.has('C'));
const mermaid = compileSpytialGdl('%%{init: {theme: "dark"}}%%\nA -> B');
assert.equal(mermaid.parseErrors.length, 1);
assert.match(mermaid.parseErrors[0].message, /Mermaid .* directive is not supported/);

// Every block line is highlighted as a comment; normal highlighting resumes.
const highlighted = tokenize(source);
for (const index of [0, 1, 2, 3, 4, 6, 7, 8, 9]) {
  assert.deepEqual(highlighted[index], [{ kind: 'comment', text: source.split('\n')[index] }]);
}
assert.ok(highlighted[5].some((token) => token.kind === 'arrow'));
assert.ok(highlighted[10].some((token) => token.kind === 'annotation'));
assert.ok(tokenize(unclosed).slice(1).every((tokens) => tokens.every((token) => token.kind === 'comment')));
assert.match(toHtml('%%{\n<ignored>\n}%%\nA'), /class="tok-comment">&lt;ignored&gt;/);

// Incremental callers retain both the annotation and comment state.
let state = tokenizeLine('@orientation(');
for (const line of ['%%{', ')', '}%%']) {
  state = tokenizeLine(line, state.open, state.inBlock);
  assert.equal(state.open, 1);
  assert.ok(state.tokens.every((token) => token.kind === 'comment'));
}
state = tokenizeLine('selector=next, directions=[right])', state.open, state.inBlock);
assert.equal(state.open, 0);
assert.ok(state.tokens.some((token) => token.kind === 'selector'));

console.log('Block comments preserve graph/annotation locations, diagnostics, and highlighting.');
