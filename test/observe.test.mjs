// The observation layer (observe.js) — driven against a stand-in for the graph
// element, so the whole demonstration lifecycle is testable in plain Node.
//
// The stand-in implements exactly the surface observe.js uses: the two drag
// events spytial-core already dispatches, and `getNodePositions()`. Keeping that
// surface this small is the point — the module only ever listens.

import { parseGraph } from '../src/parse.js';
import { relationalize } from '../src/relationalize.js';
import { observeArrangement } from '../src/observe.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}

// A minimal graph element: a listener registry plus movable node positions.
// Deliberately not an EventTarget subclass — observe.js should need nothing
// beyond add/removeEventListener and a handler that reads `ev.detail`.
class FakeGraph {
  constructor(positions) {
    this.positions = positions;
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    const s = this.listeners.get(type);
    if (s) s.delete(fn);
  }
  getNodePositions() {
    return this.positions.map((n) => ({ id: n.id, x: n.x, y: n.y }));
  }
  emit(type, detail) {
    for (const fn of this.listeners.get(type) || []) fn({ detail });
  }
  // Move a node the way a user drag would: start, reposition, end.
  drag(id, x, y) {
    const node = this.positions.find((n) => n.id === id);
    const previous = { x: node.x, y: node.y };
    this.emit('node-drag-start', { id, position: previous });
    node.x = x; node.y = y;
    this.emit('node-drag-end', { id, previous, current: { x, y } });
  }
}

const dataFor = (src) => {
  const { atoms, relations } = relationalize(parseGraph(src));
  return { atoms, relations };
};

// ── lifecycle ───────────────────────────────────────────────────────────────

{
  const el = new FakeGraph([
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 200, y: 300 },
  ]);
  const obs = observeArrangement(el);

  check('nothing is marked before any interaction', obs.summary().marked === 0);
  check('there is no baseline before any interaction', obs.baseline === null);
  check('hasEvidence is false before any interaction', obs.hasEvidence === false);

  el.drag('b', 200, 100);

  // The baseline must be the arrangement as it stood *before* the drag — that is
  // the counterfactual the evidence is measured against.
  check('a drag captures a baseline', Array.isArray(obs.baseline) && obs.baseline.length === 2);
  check('the baseline holds pre-drag positions',
    obs.baseline.find((n) => n.id === 'b').y === 300, JSON.stringify(obs.baseline));
  check('the current positions are post-drag',
    obs.positions().find((n) => n.id === 'b').y === 100);
  check('dragging marks the node', obs.marks.has('b'));
  check('dragging does not mark untouched nodes', !obs.marks.has('a'));
  check('hasEvidence is true once something has been moved', obs.hasEvidence === true);

  // A second drag must not re-capture: the baseline is the pre-demonstration
  // arrangement, not the previous frame.
  el.drag('a', 100, 105);
  check('a later drag does not overwrite the baseline',
    obs.baseline.find((n) => n.id === 'b').y === 300, JSON.stringify(obs.baseline));
  check('the second node is marked too', obs.marks.has('a') && obs.summary().marked === 2);
}

{
  const el = new FakeGraph([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 100 }]);
  const obs = observeArrangement(el);
  el.drag('b', 100, 0);

  check('a drag leaves a baseline to compare against', obs.summary().hasBaseline === true);

  obs.rebase();
  check('rebase drops the baseline', obs.baseline === null);
  check('rebase keeps the marks', obs.marks.has('b'));

  // The window this opens is what `setMarkStatus` keys the Infer button on. A
  // tally without a baseline means the solver has just redrawn and the user has
  // not touched it since — so there is something to *report* but nothing to
  // infer from, and reading the fresh layout as a demonstration would suggest
  // whatever the solver happened to do.
  check('rebase leaves a tally with nothing to infer from',
    obs.summary().marked > 0 && obs.summary().hasBaseline === false);
  check('and a fresh drag restores the baseline',
    (el.drag('b', 0, 100), obs.summary().hasBaseline === true));

  obs.reset();
  check('reset drops the marks too', obs.marks.size === 0);
  check('reset drops the baseline', obs.baseline === null);

  let fired = 0;
  const obs2 = observeArrangement(el, { onChange: () => { fired++; } });
  el.drag('a', 0, 0);
  check('onChange fires on a drag', fired === 1);
  obs2.detach();
  el.drag('a', 5, 5);
  check('detach unsubscribes', fired === 1);
}

// ── end to end: demonstration → annotation ──────────────────────────────────

{
  // Two spouse pairs; the solver has drawn the second one crooked. Drag it level
  // and the observation path should propose aligning the relation.
  const data = dataFor(`
c -> e : spouse
e -> c : spouse
h -> i : spouse
i -> h : spouse
`);
  const el = new FakeGraph([
    { id: 'c', x: 100, y: 100 }, { id: 'e', x: 300, y: 100 },
    { id: 'h', x: 100, y: 300 }, { id: 'i', x: 300, y: 420 },
  ]);
  const obs = observeArrangement(el);

  check('proposing before any demonstration yields nothing',
    obs.propose(data).proposals.length === 0);

  el.drag('i', 300, 300);
  el.drag('h', 100, 300);

  const { proposals } = obs.propose(data);
  const align = proposals.find((p) => p.line === '@align(selector=spouse, direction=horizontal)');
  check('levelling a spouse pair proposes aligning spouse', !!align,
    `\n     ${proposals.map((p) => p.line).join('\n     ')}`);

  // The other spouse pair was already level before the user touched anything.
  // It is not evidence (the baseline subtracts it) and it is not a prediction
  // (accepting the constraint would not move it) — it is a pair the drawing
  // already honours, which is support for the reading rather than a cost.
  check('a pair the drawing already honours counts as consistent, not predicted',
    align && align.consistent === 1 && align.predicts.length === 0,
    JSON.stringify(align && { consistent: align.consistentPairs, predicts: align.predicts }));
  check('and it does not drag the score down',
    align && align.coverage === 1, String(align && align.coverage));

  const summary = obs.accept(align);
  check('accepting credits only the nodes the proposal covers',
    summary.explained === 2 && summary.marked === 2, JSON.stringify(summary));
}

{
  // An arrangement nobody touched is not evidence, even if it is full of
  // incidental alignments — the counterfactual subtracts every one of them.
  const data = dataFor(`a -> b : r\nc -> d : r`);
  const el = new FakeGraph([
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 300, y: 100 },
    { id: 'c', x: 100, y: 300 }, { id: 'd', x: 300, y: 300 },
  ]);
  const obs = observeArrangement(el);
  // A drag that puts the node back where it started: marked, but nothing changed.
  el.drag('a', 100, 100);
  const { proposals } = obs.propose(data);
  check('a drag that changes nothing proposes nothing',
    proposals.length === 0, `\n     ${proposals.map((p) => p.line).join('\n     ')}`);
}

{
  // The commonest gesture: drag ONE node to line it up with one that stays put.
  // Only the dragged node gets marked, so a strict mark-to-mark reading sees no
  // pairs at all — `propose` has to widen on its own or this does nothing.
  const data = dataFor(`alice -> acme : worksAt\nbob -> acme : worksAt`);
  const el = new FakeGraph([
    { id: 'alice', x: 100, y: 100 }, { id: 'bob', x: 300, y: 100 },
    { id: 'acme', x: 200, y: 400 },
  ]);
  const obs = observeArrangement(el);
  el.drag('acme', 200, 100);   // bring it up level with both employees

  check('only the dragged node is marked', obs.marks.size === 1 && obs.marks.has('acme'));
  const { proposals } = obs.propose(data);
  check('a single-node drag still yields a proposal',
    proposals.length > 0, `\n     ${proposals.map((p) => p.line).join('\n     ') || '(nothing)'}`);
  check('and it names the relation',
    proposals.some((p) => p.selector === 'worksAt'),
    `\n     ${proposals.map((p) => p.line).join('\n     ')}`);

  // An explicit scope is the caller's decision and must not be widened silently.
  check('an explicit scope is honoured, not overridden',
    obs.propose(data, { scope: 'both' }).proposals.length === 0);
}

// ── a marked pair is not automatically the better reading ───────────────────
//
// `propose` prefers pairs where both endpoints were dragged. That is stronger
// evidence only when the pair is one a relation connects. Drag two nodes that
// share no edge and the tight reading is a pair nothing in the source explains,
// while the pair actually demonstrated — one endpoint dragged, one left where it
// was — has been excluded. Widening only when the tight reading came back
// *empty* kept the useless one, and synthesis then manufactured an exact
// expression for it.

{
  // The playground's own example. `ship` is the only relation between Test and
  // Release; Build and Release share no edge at all.
  const data = dataFor(`Start -> Build
Build -> Test
Test -> Release : ship
Test -> Build : retry`);
  const el = new FakeGraph([
    { id: 'Start', x: 50, y: 30 }, { id: 'Build', x: 50, y: 190 },
    { id: 'Test', x: 50, y: 350 }, { id: 'Release', x: 50, y: 510 },
  ]);
  const obs = observeArrangement(el);

  // Lift Release above Test — "ship points upward" — and nudge Build on the way.
  // Both end up marked, so the tight reading is the pair (Build, Release).
  el.drag('Release', 50, 150);
  el.drag('Build', 50, 200);

  let synthesized = 0;
  const { proposals } = obs.propose(data, {
    synthesize: (pairs) => { synthesized++; return `SYNTH<${pairs.map((p) => p.join('>')).join(',')}>`; },
  });
  const lines = proposals.map((p) => p.line);

  check('the demonstration is named, not synthesized',
    lines.includes('@orientation(selector=ship, directions=[above])'), lines.join(' | '));
  check('and nothing was invented for the pair that shares no edge',
    synthesized === 0 && !lines.some((l) => /SYNTH/.test(l)),
    `${synthesized} attempts: ${lines.join(' | ')}`);

  // The tight reading is still preferred when it *is* explainable — dragging
  // both ends of a real edge must not be widened away.
  const el2 = new FakeGraph([
    { id: 'Start', x: 50, y: 30 }, { id: 'Build', x: 50, y: 190 },
    { id: 'Test', x: 50, y: 350 }, { id: 'Release', x: 50, y: 510 },
  ]);
  const obs2 = observeArrangement(el2);
  el2.drag('Test', 50, 400);
  el2.drag('Release', 50, 300);
  const tight = obs2.propose(data).proposals.map((p) => p.line);
  check('a named tight reading is kept',
    tight.includes('@orientation(selector=ship, directions=[above])'), tight.join(' | '));
}

// ── the synthesizer outlives one propose() ──────────────────────────────────
//
// Synthesis is the expensive path: a search that finds nothing has to exhaust
// the grammar, and nothing can interrupt it because it is a synchronous call
// into core. `makeSynthesizer` memoizes that — but the memo lives in the closure
// it returns, so rebuilding the synthesizer on every `propose()` throws the memo
// away with it and clicking Infer twice on one arrangement pays twice.
//
// A fake core stands in for the real synthesizer: what is under test is how
// often the search is *started*, not what it comes back with.

{
  let builds = 0, searches = 0;
  const atoms = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  // `getAtoms` is called exactly once per synthesizer, when it indexes the
  // instance — so counting it counts builds.
  const instance = { getAtoms: () => { builds++; return atoms; } };
  const prior = globalThis.spytialcore;
  globalThis.spytialcore = { synthesizeBinarySelector: () => { searches++; return null; } };

  const data = dataFor(`a -> b : r\nc -> d : r`);
  const el = new FakeGraph([
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 300, y: 100 },
    { id: 'c', x: 150, y: 400 }, { id: 'd', x: 300, y: 400 },
  ]);
  el.getDataInstance = () => instance;
  const obs = observeArrangement(el);
  el.drag('c', 100, 400);        // line c up under a — no relation says that

  obs.propose(data);
  check('a demonstration no name explains reaches the synthesizer',
    searches === 1, `searched ${searches} times`);
  check('and the synthesizer is built once', builds === 1, `built ${builds} times`);

  obs.propose(data);
  check('a second propose on the same arrangement reuses it',
    builds === 1, `built ${builds} times`);
  check('so the same search is not run again', searches === 1, `searched ${searches} times`);

  // A deeper search is a different question, not a cache miss to paper over.
  obs.propose(data, { maxDepth: 3 });
  check('a different search depth builds a new one', builds === 2, `built ${builds} times`);

  // A re-render is the one moment the data can have changed underneath, and the
  // atom index is taken once at build time.
  obs.rebase();
  obs.propose(data);
  check('and a rebase drops it', builds === 3, `built ${builds} times`);

  globalThis.spytialcore = prior;
}

// ── the ledger ──────────────────────────────────────────────────────────────

{
  const el = new FakeGraph([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 50, y: 50 }]);
  const obs = observeArrangement(el);
  el.drag('a', 0, 50);
  obs.unmark('a');
  obs.mark('a');

  const kinds = obs.ledger.map((e) => e.type);
  check('the ledger records the baseline before the drag',
    kinds.indexOf('baseline') === 0 && kinds.indexOf('drag') === 1, kinds.join(','));
  check('the ledger records mark and unmark',
    kinds.includes('unmark') && kinds.includes('mark'), kinds.join(','));
  check('the ledger is append-only — an unmark does not erase the drag',
    obs.ledger.filter((e) => e.type === 'drag').length === 1);
  check('ledger entries are sequenced',
    obs.ledger.every((e, i) => e.seq === i), JSON.stringify(obs.ledger.map((e) => e.seq)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
