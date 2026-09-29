// Seeded property tests for Mermaid input. The seed and generated source are
// included on failure so a counterexample can be reproduced without a network
// dependency or a changing random test run.
import assert from 'node:assert/strict';
import { parseGraph } from '../src/parse.js';
import { compileSpytialGdl, renderSpytialGdl, renderSpytialGdlEditable } from '../src/index.js';

const SEED = 0x6d65726d;
let state = SEED;
function next() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}
const pick = (xs) => xs[next() % xs.length];
const id = () => `n${next() % 100000}`;
const check = (source, property, condition) => {
  assert.ok(condition, `${property}; seed=${SEED}; source=${JSON.stringify(source)}`);
};

for (let i = 0; i < 150; i++) {
  const a = id();
  let b = id();
  if (a === b) b += 'x';
  const label = `rel${next() % 1000}`;
  const space = pick(['', ' ', '  ']);
  const source = `flowchart LR\n${a}${space}-->|${label}|${space}${b}`;
  const parsed = parseGraph(source);
  check(source, 'pipe labels preserve graph identity and relation name',
    parsed.nodes.size === 2 && parsed.edges.length === 1 &&
    parsed.edges[0].source === a && parsed.edges[0].target === b &&
    parsed.edges[0].label === label &&
    parsed.errors.length === 1 && parsed.errors[0].severity === 'warning');
}

for (let i = 0; i < 100; i++) {
  const a = id();
  let b = id();
  if (a === b) b += 'x';
  const header = `${pick(['graph', 'flowchart'])} ${pick(['TD', 'TB', 'BT', 'LR', 'RL'])}`;
  const source = `${header}\n${a} --> ${b}`;
  const parsed = parseGraph(source);
  const compiled = compileSpytialGdl(source);
  check(source, 'flowchart headers warn while plain arrows remain edges',
    compiled.ok && parsed.edges.length === 1 &&
    parsed.edges[0].source === a && parsed.edges[0].target === b &&
    parsed.errors.length === 1 && parsed.errors[0].severity === 'warning');
}

for (let i = 0; i < 150; i++) {
  const a = id();
  let b = id();
  if (a === b) b += 'x';
  const arrow = pick(['-.->', '==>', '---']);
  const source = `${a} ${arrow} ${b}`;
  const parsed = parseGraph(source);
  check(source, 'lossy link syntax retains endpoints and reports one warning',
    parsed.nodes.size === 2 && parsed.edges.length === 1 &&
    parsed.edges[0].source === a && parsed.edges[0].target === b &&
    parsed.edges[0].kind === arrow && parsed.errors.length === 1 &&
    parsed.errors[0].severity === 'warning' && parsed.errors[0].line === 1);
}

for (let i = 0; i < 150; i++) {
  const a = id();
  let b = id();
  if (a === b) b += 'x';
  const label = `Text ${next() % 1000}`;
  const wrap = pick([(x) => `(${x})`, (x) => `((${x}))`, (x) => `{${x}}`, (x) => `[[${x}]]`]);
  const source = `${a}${wrap(label)} --> ${b}`;
  const parsed = parseGraph(source);
  check(source, 'unsupported shape retains its label and reports the loss',
    parsed.nodes.get(a)?.label === label && parsed.edges.length === 1 &&
    parsed.errors.length === 1 && parsed.errors[0].severity === 'warning' &&
    /shape/.test(parsed.errors[0].message));
}

for (let i = 0; i < 100; i++) {
  const a = id();
  let b = id();
  if (a === b) b += 'x';
  const statement = pick([
    `style ${a} fill:#fff`, 'linkStyle 0 stroke:#f00',
    `click ${a} "https://example.org"`, 'direction TB',
    'accTitle: Example', 'accDescr: Example',
  ]);
  const source = `flowchart LR\n${statement}\n${a} --> ${b}`;
  const parsed = parseGraph(source);
  check(source, 'ignored statement warns without adding a phantom node',
    parsed.nodes.size === 2 && parsed.nodes.has(a) && parsed.nodes.has(b) &&
    parsed.edges.length === 1 && parsed.errors.length === 2 &&
    parsed.errors.every((e) => e.severity === 'warning'));
}

for (let i = 0; i < 100; i++) {
  const a = id();
  let b = id();
  if (a === b) b += 'x';
  const cls = `class${next() % 1000}`;
  const source = `classDef ${cls} fill:#fff\nclass ${a},${b} ${cls}\n${a} --> ${b}`;
  const parsed = parseGraph(source);
  check(source, 'class definitions warn while class membership survives',
    parsed.nodes.size === 2 && parsed.classesPerNode.get(a)?.has(cls) &&
    parsed.classesPerNode.get(b)?.has(cls) && parsed.edges.length === 1 &&
    parsed.errors.length === 1 && parsed.errors[0].severity === 'warning' &&
    /classDef/.test(parsed.errors[0].message));
}

for (let i = 0; i < 100; i++) {
  const a = id();
  const b = id();
  const ignored = [
    `%%{init: { 'theme': '${pick(['dark', 'forest', 'default'])}' }}%%`,
    `classDef c${next() % 1000} fill:#fff`,
    `style ${a} fill:#fff`,
    `click ${a} "https://example.org"`,
  ];
  const source = `%% an ordinary comment\nflowchart TD\n${ignored.join('\n')}\n${a} --> ${b}`;
  const compiled = compileSpytialGdl(source);
  const warnedLines = compiled.parseErrors.filter((e) => e.severity === 'warning').map((e) => e.line);
  check(source, 'each ignored Mermaid line warns while ordinary comments do not',
    compiled.ok && compiled.parsed.edges.length === 1 &&
    JSON.stringify(warnedLines) === JSON.stringify([2, 3, 4, 5, 6]));
}

for (let i = 0; i < 100; i++) {
  const a = id();
  const b = id();
  const source = `flowchart LR; ${a} --> ${b}`;
  const parsed = parseGraph(source);
  check(source, 'a same-line Mermaid statement is diagnosed instead of silently dropped',
    parsed.nodes.size === 0 && parsed.edges.length === 0 &&
    parsed.errors.length === 2 && parsed.errors[0].severity === 'warning' &&
    parsed.errors[1].severity === 'warning' && parsed.errors[1].line === 1);
}

for (let i = 0; i < 100; i++) {
  const a = id();
  const b = id();
  const guard = pick(['%%@', '%% @', '  %%@', '  %% @']);
  const source = `${a} --> ${b}\n${guard}orientation(selector=_links, directions=[right])`;
  const compiled = compileSpytialGdl(source);
  check(source, 'commented annotations never compile but always warn on their line',
    compiled.ok && compiled.parsed.edges.length === 1 &&
    compiled.annotationLines.length === 0 && compiled.annotationMeta.length === 0 &&
    !compiled.rules.includes('orientation:') &&
    compiled.parseErrors.length === 1 && compiled.parseErrors[0].line === 2 &&
    compiled.parseErrors[0].severity === 'warning' &&
    /remove %%/.test(compiled.parseErrors[0].message));
}

for (const word of ['pie', 'style', 'click', 'direction', 'linkStyle']) {
  const source = `${word}[Ordinary node] --> target`;
  const parsed = parseGraph(source);
  check(source, 'a keyword with node-label syntax stays a native node',
    !parsed.fatal && parsed.nodes.get(word)?.label === 'Ordinary node' &&
    parsed.edges.length === 1 && parsed.errors.length === 0);
}
for (const word of ['pie', 'gantt', 'subgraph']) {
  const source = `${word} --> target\ntarget --> last`;
  const parsed = parseGraph(source);
  check(source, 'a keyword used as an edge source is not a Mermaid header',
    !parsed.fatal && parsed.nodes.has(word) && parsed.edges.length === 2);
}
for (const word of ['pie', 'gantt', 'sequenceDiagram']) {
  const parsed = parseGraph(word);
  check(word, 'a lone native node remains legal despite its Mermaid spelling',
    !parsed.fatal && parsed.nodes.has(word) && parsed.errors.length === 0);
}

const otherHeaders = [
  'sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'erDiagram',
  'gantt', 'pie', 'journey', 'gitGraph', 'mindmap', 'timeline',
  'quadrantChart', 'C4Context', 'sankey-beta', 'xychart-beta',
  'block-beta', 'kanban', 'architecture-beta',
];
for (const header of otherHeaders) {
  for (let i = 0; i < 8; i++) {
    const source = `%% a comment\n\n${header}\n${id()} --> ${id()}`;
    const compiled = compileSpytialGdl(source);
    check(source, 'non-flowchart Mermaid type refuses compilation and rendering',
      !compiled.ok && compiled.parsed.fatal === true &&
      compiled.parsed.nodes.size === 0 && compiled.parsed.edges.length === 0 &&
      compiled.parseErrors.length === 1 && compiled.parseErrors[0].line === 3 &&
      compiled.parseErrors[0].severity === 'error' &&
      /unsupported Mermaid diagram type/.test(compiled.reason));
  }
}

for (let i = 0; i < 100; i++) {
  const a = id();
  const b = id();
  const source = `flowchart TD\n${a} --> ${b}\nsubgraph cluster\n${id()} --> ${id()}\nend`;
  const compiled = compileSpytialGdl(source);
  check(source, 'subgraph refuses compilation without partial graph data',
    !compiled.ok && compiled.parsed.fatal === true &&
    compiled.parsed.nodes.size === 0 && compiled.parsed.edges.length === 0 &&
    compiled.parseErrors.length === 1 && compiled.parseErrors[0].line === 3 &&
    /subgraphs are not supported/.test(compiled.reason));
}

// The public render entry points must clear an older graph and return before
// invoking the solver when a pasted diagram is refused.
const previousCore = globalThis.spytialcore;
globalThis.spytialcore = {
  JSONDataInstance: class {}, SGraphQueryEvaluator: class {},
  parseLayoutSpec() { throw new Error('solver should not be called'); },
  LayoutInstance: class {},
};
try {
  for (let i = 0; i < 30; i++) {
    const source = pick([
      `gantt\n${id()} --> ${id()}`,
      `pie\n${id()} --> ${id()}`,
      `flowchart TD\nsubgraph cluster\n${id()} --> ${id()}\nend`,
    ]);
    let readCleared = 0;
    let readWarningsCleared = 0;
    const readGraph = {
      async setViewOptions() {},
      clear() { readCleared++; },
      renderLayoutWarnings(warnings) { if (warnings.length === 0) readWarningsCleared++; },
      renderLayout() { throw new Error('renderLayout should not be called'); },
    };
    const readResult = await renderSpytialGdl(readGraph, source);
    check(source, 'read-only renderer refuses and clears a rejected diagram',
      !readResult.applied && readCleared === 1 && readWarningsCleared === 1 &&
      readResult.diagnostics.length === 1 && readResult.diagnostics[0].severity === 'error');

    let editableCleared = 0;
    let editableWarningsCleared = 0;
    const editor = {
      tagName: 'STRUCTURED-INPUT-GRAPH',
      async setViewOptions() {},
      clear() { editableCleared++; },
      renderLayoutWarnings(warnings) { if (warnings.length === 0) editableWarningsCleared++; },
      setDataInstance() { throw new Error('setDataInstance should not be called'); },
      setCnDSpec() { throw new Error('setCnDSpec should not be called'); },
    };
    const editableResult = await renderSpytialGdlEditable(editor, source);
    check(source, 'editable renderer refuses and clears a rejected diagram',
      !editableResult.applied && editableCleared === 1 && editableWarningsCleared === 1 &&
      editableResult.diagnostics.length === 1 && editableResult.diagnostics[0].severity === 'error');
  }
} finally {
  if (previousCore === undefined) delete globalThis.spytialcore;
  else globalThis.spytialcore = previousCore;
}

// Accepted Mermaid syntax is handed to core's built-in warning panel through
// layout.warnings, alongside any warnings produced by the engine itself.
globalThis.spytialcore = await import('spytial-core');
try {
  for (let i = 0; i < 20; i++) {
    const a = id();
    const b = id();
    const source = `${a} ${pick(['-.->', '==>', '---'])} ${b}`;
    let shownLayout;
    const graph = {
      async setViewOptions() {},
      clear() {},
      removeAttribute() {},
      async renderLayout(layout) { shownLayout = layout; },
    };
    const result = await renderSpytialGdl(graph, source);
    check(source, 'rendered Mermaid warning reaches WebCola layout warning panel',
      result.applied && shownLayout === result.layout &&
      shownLayout.warnings.some((w) => w.code === 'gdl-parse' &&
        w.label === 'spytial-gdl · line 1' && w.message === result.parseErrors[0].message));
  }

  const commentedSource = 'A --> B\n%%@orientation(selector=_links, directions=[right])';
  let commentedLayout;
  const commentedGraph = {
    async setViewOptions() {}, clear() {}, removeAttribute() {},
    async renderLayout(layout) { commentedLayout = layout; },
  };
  const commentedResult = await renderSpytialGdl(commentedGraph, commentedSource);
  check(commentedSource, 'commented annotation warning reaches the renderer warning panel',
    commentedResult.applied && commentedResult.diagnostics.length === 1 &&
    commentedLayout.warnings.some((w) => w.code === 'gdl-parse' &&
      w.label === 'spytial-gdl · line 2' && /remove %%/.test(w.message)));

  const mixedSource = `A -.-> B\n@orientation(selector=missing, directions=[right])`;
  let mixedLayout;
  const mixedGraph = {
    async setViewOptions() {},
    clear() {},
    removeAttribute() {},
    async renderLayout(layout) { mixedLayout = layout; },
  };
  const mixedResult = await renderSpytialGdl(mixedGraph, mixedSource);
  check(mixedSource, 'Mermaid warning and engine warning share the layout panel without changing raw engine warnings',
    mixedResult.applied && mixedResult.warnings.length > 0 &&
    mixedResult.warnings.every((w) => mixedLayout.warnings.includes(w)) &&
    mixedLayout.warnings.some((w) => w.code === 'gdl-parse') &&
    mixedResult.warnings.every((w) => w.code !== 'gdl-parse'));

  const source = `flowchart LR\n${id()} -.-> ${id()}`;
  let shownWarnings;
  const editor = {
    tagName: 'STRUCTURED-INPUT-GRAPH',
    sourceLayout: { warnings: [{ code: 'engine-warning', message: 'engine', context: 'spec' }] },
    async setViewOptions() {},
    setDataInstance() {},
    async setCnDSpec() {},
    renderLayoutWarnings(warnings) { shownWarnings = warnings; },
  };
  const handle = await renderSpytialGdlEditable(editor, source);
  check(source, 'editable warning panel preserves engine warnings and adds Mermaid warnings',
    handle.applied && shownWarnings.length === 3 &&
    shownWarnings[0].code === 'engine-warning' &&
    shownWarnings.slice(1).every((w) => w.code === 'gdl-parse'));
} finally {
  if (previousCore === undefined) delete globalThis.spytialcore;
  else globalThis.spytialcore = previousCore;
}

console.log('Mermaid compatibility properties passed');
