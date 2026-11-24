import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as core from 'spytial-core';
import { parseGraph } from '../src/parse.js';
import { extractAnnotations } from '../src/annotations.js';
import { compileSpytialGdl, renderSpytialGdlEditable } from '../src/index.js';
import { tokenize, tokenizeLine, toHtml } from '../src/highlight.js';
import { renderSpytialGdls } from '../src/markdown.js';
import { appendSourceRules } from '../src/source-edits.js';

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

const authored = [
  '',
  '%% Keep this heading  ',
  'Z[Isolated];',
  '  A[Alpha]:::Term -->|next| B  %% belongs to this edge',
  'B  ->  Z : prev',
  'class B, Z focus',
  '',
  '%%@orientation(selector=prev, directions=[right])',
  annotation,
  '%% Leave this footer alone',
  '',
].join('\n');

const dom = new JSDOM('<pre class="spytial-gdl-editable"></pre>', { runScripts: 'outside-only' });
const { window } = dom;
const { document, customElements, Element, HTMLElement, Event, KeyboardEvent } = window;
const globals = { window, document, customElements, Element, spytialcore: core };
const previous = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
Object.assign(globalThis, globals);
window.spytialcore = core;
let renderGate;
class EditableGraph extends HTMLElement {
  async setViewOptions() {}
  setDataInstance(instance) { this.instance = instance; }
  getDataInstance() { return this.instance; }
  async setCnDSpec() { await renderGate; }
}
customElements.define('structured-input-graph', EditableGraph);
customElements.define('webcola-cnd-graph', class extends HTMLElement {});

try {
  const sourceBlock = document.querySelector('pre');
  sourceBlock.textContent = authored;
  const [{ host, handle }] = await renderSpytialGdls(document, { injectEngine: false });
  const textarea = document.querySelector('textarea');
  const graph = host.querySelector('structured-input-graph');
  const update = [...document.querySelectorAll('button')].find(el => el.textContent === 'Update diagram');
  const disclosure = document.querySelector('.spytial-gdl-source-toggle');
  const type = value => {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
  };
  const waitForUpdate = async () => {
    for (let i = 0; update.disabled && i < 10; i++) await Promise.resolve();
    assert.equal(update.disabled, false);
  };
  assert.equal(textarea.value, authored, 'mounting the editor preserves the authored text');
  assert.equal(handle.getSource(), authored);

  const uncommented = authored.replace('%%@orientation(selector=prev', '@orientation(selector=prev');
  type(uncommented);
  textarea.focus();
  textarea.setSelectionRange(18, 24);
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, cancelable: true }));
  await waitForUpdate();
  assert.equal(textarea.value, uncommented, 'keyboard Apply leaves comments, spacing and line order intact');
  assert.deepEqual([textarea.selectionStart, textarea.selectionEnd], [18, 24]);
  disclosure.click();
  disclosure.click();
  assert.equal(textarea.value, uncommented, 'reopening uses the latest applied source');

  let finishRender;
  renderGate = new Promise(resolve => { finishRender = resolve; });
  update.click();
  const newer = uncommented + '%% Continued typing during render\n';
  type(newer);
  finishRender();
  renderGate = undefined;
  await waitForUpdate();
  assert.equal(textarea.value, newer, 'typing during Apply remains in the editor');
  graph.instance.addAtom({ id: 'Discarded', type: '', label: 'Discarded' });
  await Promise.resolve();
  assert.equal(textarea.value, newer, 'visual graph changes leave an unapplied draft intact');
  update.click();
  await waitForUpdate();
  assert.equal(textarea.value, newer, 'button Apply also preserves the exact draft');

  graph.instance.addAtom({ id: 'C', type: '', label: 'C' });
  await Promise.resolve();
  const withNode = newer.replace('class B, Z focus\n', 'class B, Z focus\nC\n');
  assert.equal(textarea.value, withNode, 'a visual addition changes just one source line');
  graph.instance.removeAtom('B');
  await Promise.resolve();
  const afterDelete = withNode
    .replace('A[Alpha]:::Term -->|next| B  ', '')
    .replace('B  ->  Z : prev\n', '')
    .replace('class B, Z focus\nC\n', 'class Z focus\nC\nA[Alpha]:::Term\n');
  assert.equal(textarea.value, afterDelete, 'deleting an atom preserves its inline comment and surviving endpoint');
  const parsedEdit = compileSpytialGdl(afterDelete).parsed;
  assert.deepEqual([...parsedEdit.nodes.keys()], ['Z', 'C', 'A']);
  assert.equal(parsedEdit.nodes.get('A').type, 'Term');

  graph.setDataInstance(new core.JSONDataInstance({ atoms: [], relations: [] }));
  graph.dispatchEvent(new Event('all-items-cleared'));
  await Promise.resolve();
  assert.match(textarea.value, /^\n%% Keep this heading  \n  %% belongs to this edge\n/);
  assert.ok(textarea.value.includes(annotation));

  const crlf = authored.replaceAll('\n', '\r\n');
  const direct = await renderSpytialGdlEditable(graph, crlf);
  assert.equal(direct.getSource(), crlf, 'the editable API retains CRLF line endings');
  const tuple = direct.getValue().relations.find(relation => relation.id === 'lbl_next').tuples[0];
  graph.instance.removeRelationTuple('lbl_next', tuple);
  graph.instance.addRelationTuple('following', tuple);
  const renamed = crlf.replace('-->|next|', '-->|following|');
  assert.equal(direct.getSource(), renamed, 'renaming a visual edge keeps it in place with its comment');
  assert.equal(direct.getSource(), renamed, 'reading the edited source again is stable');

  const trailing = 'A\r\n\r\n  ';
  assert.equal(appendSourceRules(trailing, ['@hide(selector=A)']), trailing + '\r\n@hide(selector=A)');
  console.log('Editable source survives Apply, asynchronous typing, visual edits, and rule appends.');
} finally {
  Object.assign(globalThis, previous);
  window.close();
}
