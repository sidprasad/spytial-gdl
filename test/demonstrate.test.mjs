// The demonstration mode (demonstrate.js) — the state machine only.
//
// `createDemonstration` is deliberately DOM-free so the flow can be driven in
// plain Node: begin, arrange, explain, accept. The chrome that renders it is
// tested by eye; what matters here is that the mode means what it says —
// nothing is watched outside it, the baseline is the moment you entered, and an
// offer computed from one arrangement cannot outlive that arrangement.

import { parseGraph } from '../src/parse.js';
import { relationalize } from '../src/relationalize.js';
import { createDemonstration, relatedNodes, IDLE, DEMONSTRATING, OFFERING } from '../src/demonstrate.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}

// Same stand-in observe.test.mjs uses: the two drag events spytial-core
// dispatches, plus movable positions.
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
  drag(id, x, y) {
    const node = this.positions.find((n) => n.id === id);
    const previous = { x: node.x, y: node.y };
    this.emit('node-drag-start', { id, position: previous });
    node.x = x; node.y = y;
    this.emit('node-drag-end', { id, previous, current: { x, y } });
  }
  /** How many listeners are attached — i.e. is anything watching at all? */
  get watchers() {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }
}

const dataFor = (src) => {
  const { atoms, relations } = relationalize(parseGraph(src));
  return { atoms, relations };
};

// Two spouse pairs, the second drawn crooked. Levelling it is the demonstration
// throughout: it generalizes to `@align(selector=spouse, direction=horizontal)`.
const SPOUSES = dataFor(`
c -> e : spouse
e -> c : spouse
h -> i : spouse
i -> h : spouse
`);
const crooked = () => new FakeGraph([
  { id: 'c', x: 100, y: 100 }, { id: 'e', x: 300, y: 100 },
  { id: 'h', x: 100, y: 300 }, { id: 'i', x: 300, y: 420 },
]);

// ── outside the mode, nothing is watched ────────────────────────────────────
//
// This is the whole point of a mode. A drag you did not frame as a
// demonstration is just a drag — reading it as evidence is the guess this
// replaces, so the honest implementation is not to be listening at all.

{
  const el = crooked();
  const demo = createDemonstration(el);

  check('the mode starts idle', demo.state === IDLE);
  check('and nothing is listening to the diagram', el.watchers === 0, `${el.watchers} listeners`);

  el.drag('i', 300, 300);
  check('a drag outside the mode marks nothing', demo.status().marked === 0);
  check('and explaining outside the mode does nothing',
    demo.explain(SPOUSES).proposals.length === 0);

  demo.begin();
  check('entering the mode starts watching', el.watchers > 0, `${el.watchers} listeners`);
  check('and the state is demonstrating', demo.state === DEMONSTRATING);
  check('the drag from before the mode is not evidence', demo.status().marked === 0);

  demo.detach();
  check('detaching stops watching', el.watchers === 0, `${el.watchers} listeners`);
}

{
  // The baseline is declared, not inferred from first touch. Entering the mode
  // after a node has already been moved must measure against the arrangement as
  // it stands *now* — not as it stood before that earlier, unrelated drag.
  const el = crooked();
  const demo = createDemonstration(el);
  el.drag('i', 300, 300);            // levels the pair — but outside the mode
  demo.begin();
  demo.explain(SPOUSES);

  check('an arrangement made before the mode is not a demonstration',
    demo.state === DEMONSTRATING && demo.status().proposals.length === 0,
    `${demo.state}: ${demo.status().proposals.map((p) => p.line).join(', ')}`);
  check('and it says why', /Drag the nodes/.test(demo.status().note), demo.status().note);
}

// ── the flow ────────────────────────────────────────────────────────────────

{
  const el = crooked();
  const seen = [];
  const demo = createDemonstration(el, { onChange: (s) => seen.push(s.state) });

  demo.begin();
  el.drag('i', 300, 300);
  el.drag('h', 100, 300);

  const arranging = demo.status();
  check('drags inside the mode are counted', arranging.marked === 2, `${arranging.marked} moved`);
  check('and explaining is offered once something has moved', arranging.canExplain === true);

  const offered = demo.explain(SPOUSES);
  check('explaining moves to offering', demo.state === OFFERING, demo.state);
  check('and it names the relation',
    offered.proposals.some((p) => p.line === '@align(selector=spouse, direction=horizontal)'),
    offered.proposals.map((p) => p.line).join(' | '));

  check('every transition was announced',
    seen.includes(DEMONSTRATING) && seen.includes(OFFERING), seen.join(','));
}

{
  // Nothing to explain is not a dead end — it is an invitation to show more, so
  // the mode stays open and says so.
  const el = crooked();
  const demo = createDemonstration(el);
  demo.begin();
  el.drag('i', 305, 425);            // moved, but nothing qualitative changed
  const s = demo.explain(SPOUSES);
  check('an unexplainable arrangement leaves you arranging', demo.state === DEMONSTRATING, demo.state);
  check('with a note rather than an empty list', /generalizes/.test(s.note), s.note);
  check('and the demonstration is still there', s.marked === 1, `${s.marked} moved`);
}

// ── an offer cannot outlive the arrangement it came from ────────────────────

{
  // Each row carries a proposal computed from one arrangement. Move a node and
  // those rows describe a drawing that no longer exists — accepting one would
  // write an annotation about the diagram as it *was*, possibly the opposite of
  // what is now on screen. So a drag withdraws them and you are arranging again.
  const el = crooked();
  const demo = createDemonstration(el);
  demo.begin();
  el.drag('i', 300, 300);
  demo.explain(SPOUSES);
  check('there is an offer on the table', demo.state === OFFERING && demo.status().proposals.length > 0);

  el.drag('i', 300, 420);            // put it back — the offer is now about nothing
  check('a later drag withdraws the offer', demo.status().proposals.length === 0);
  check('and returns to arranging', demo.state === DEMONSTRATING, demo.state);
  check('but the demonstration survives — the baseline was declared, not re-taken',
    demo.status().marked === 1, `${demo.status().marked} moved`);

  // Re-explaining against the same baseline is the point of keeping it.
  el.drag('i', 300, 300);
  demo.explain(SPOUSES);
  check('so it can be explained again', demo.state === OFFERING, demo.state);
}

{
  // "None of these" is a real answer, and it must not throw the demonstration
  // away — the user may want to arrange more and ask again.
  const el = crooked();
  const demo = createDemonstration(el);
  demo.begin();
  el.drag('i', 300, 300);
  demo.explain(SPOUSES);
  const s = demo.dismiss();
  check('dismissing goes back to arranging', demo.state === DEMONSTRATING, demo.state);
  check('and keeps what was demonstrated', s.marked === 1 && s.proposals.length === 0);
}

// ── leaving ─────────────────────────────────────────────────────────────────

{
  const el = crooked();
  const demo = createDemonstration(el);
  demo.begin();
  el.drag('i', 300, 300);
  const p = demo.explain(SPOUSES).proposals.find((x) => x.kind === 'align');

  const after = demo.accept(p);
  check('accepting leaves the mode', demo.state === IDLE, demo.state);
  check('and stops watching', el.watchers === 0, `${el.watchers} listeners`);
  check('and reports what the demonstration bought',
    after.accepted && after.accepted.line === p.line && after.accepted.marked > 0,
    JSON.stringify(after.accepted));
  check('the offer is gone with it', after.proposals.length === 0);

  // Beginning again is a fresh episode, not a continuation.
  demo.begin();
  check('re-entering starts clean', demo.status().marked === 0 && demo.status().accepted === null);
}

{
  const el = crooked();
  const demo = createDemonstration(el);
  demo.begin();
  el.drag('i', 300, 300);
  const s = demo.cancel();
  check('cancelling leaves the mode', demo.state === IDLE, demo.state);
  check('and stops watching', el.watchers === 0, `${el.watchers} listeners`);
  check('and forgets the demonstration', s.marked === 0 && s.accepted === null);
}

{
  // Out-of-order calls are no-ops rather than errors: the chrome only offers the
  // buttons a state allows, but a keyboard, a script, or a stale click should
  // not be able to wedge it.
  const el = crooked();
  const demo = createDemonstration(el);
  check('accept before offering is a no-op', demo.accept({ line: 'x' }).state === IDLE);
  check('dismiss before offering is a no-op', demo.dismiss().state === IDLE);
  check('cancel while idle is a no-op', demo.cancel().state === IDLE);
  demo.begin();
  check('begin twice does not re-enter', demo.begin().state === DEMONSTRATING);
  check('and does not re-attach a second watcher', el.watchers === 2, `${el.watchers} listeners`);
  demo.detach();
}

// ── which nodes a suggestion is about ───────────────────────────────────────
//
// What the chrome hands the renderer when you hover a row. The chrome itself is
// tested by eye; this is the part that decides what gets lit, and getting it
// wrong means pointing at the wrong boxes rather than a visible break.

{
  const el = crooked();
  const demo = createDemonstration(el);
  demo.begin();
  el.drag('i', 300, 300);
  const p = demo.explain(SPOUSES).proposals.find((x) => x.line.includes('spouse'));

  const { pairs, ids } = relatedNodes(p);
  check('a suggestion knows the pairs it is about', pairs.length > 0, JSON.stringify(pairs));
  check('and both spouse pairs are in it — the one shown and the one already right',
    ['c', 'e', 'h', 'i'].every((id) => ids.includes(id)), ids.join(','));
  demo.detach();
}

{
  // `predicts` is the set with nowhere else to appear: the note says "would also
  // move 2" and this is the only thing that can say *which* 2.
  const p = {
    kind: 'orientation',
    coveredPairs: [['a', 'b']],
    consistentPairs: [['c', 'd']],
    predicts: [['e', 'f']],
  };
  const { pairs, ids } = relatedNodes(p);
  check('pairs a suggestion would move are included',
    ids.includes('e') && ids.includes('f'), ids.join(','));
  check('and every pair survives as a pair, so direction can be shown',
    pairs.length === 3 && pairs.every((pr) => pr.length === 2), JSON.stringify(pairs));
}

{
  // A ring is about its members; the pairs are just how it was measured.
  const { ids } = relatedNodes({
    kind: 'cyclic', members: ['S0', 'S1', 'S2', 'S3'],
    coveredPairs: [['S0', 'S1'], ['S1', 'S2'], ['S2', 'S3']],
  });
  check('a ring is about all of its members', ids.length === 4, ids.join(','));
}

{
  const empty = relatedNodes(null);
  check('nothing to highlight is not an error', empty.pairs.length === 0 && empty.ids.length === 0);
  const junk = relatedNodes({ coveredPairs: [['a'], null, ['b', null], ['c', 'd']] });
  check('and a malformed pair is dropped rather than half-highlighted',
    junk.pairs.length === 1 && junk.ids.join(',') === 'c,d', JSON.stringify(junk));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
