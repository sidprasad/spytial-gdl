// Observation — watch a diagram being rearranged by hand, and keep the evidence.
//
// This is the only part of constraint inference that touches the browser. It
// listens to the drag events spytial-core already dispatches, remembers where
// the solver had put things before the user intervened, and hands the result to
// the pure abduce → generalize path. It changes nothing: no constraint is added
// to a solve, no node is moved, nothing is written to the spec.
//
// THE BASELINE IS CAPTURED AT FIRST TOUCH. Evidence is the difference between
// the user's arrangement and the one the current annotations already produce, so
// we need the latter. The exact right moment to record it is the instant before
// the first drag begins — `node-drag-start`, the first time it fires. Earlier is
// wrong (WebCola is still settling); later is wrong (the user has already moved
// something).
//
// MARKS, AND WHY DRAGGING SETS ONE. A mark is the user saying "the way this sits
// matters" — it is addressed to the inference, never to the solver, so it has no
// layout effect and can never conflict with a constraint. It exists because the
// alternative reading of a drag ("I was making room") is just as common, and
// nothing in the geometry distinguishes them.
//
// In this version dragging a node marks it, because spytial-core exposes no node
// click event to hang a separate gesture on. That conflates "I moved this" with
// "this matters", which is precisely the conflation marks are meant to undo — so
// `unmark()` exists, the panel lists what is marked, and a real mark gesture is
// the first thing to add when the renderer can report a node click.

import { abduce } from './abduce.js';
import { generalize } from './generalize.js';
import { makeSynthesizer } from './synthesize.js';

/** Events the renderer already dispatches; we only listen. */
const DRAG_START = 'node-drag-start';
const DRAG_END = 'node-drag-end';

function readPositions(el) {
  try {
    if (el && typeof el.getNodePositions === 'function') {
      return el.getNodePositions().filter((n) => n && n.id != null);
    }
  } catch (_) { /* a renderer mid-teardown has no positions to give */ }
  return [];
}

// The live IDataInstance the editor is backed by. Synthesis evaluates candidate
// expressions against it, so it has to be the real instance rather than the
// reified {atoms, relations} snapshot — and it has to be re-read each time,
// because clearing the editor swaps in a fresh one.
function readInstance(el) {
  try {
    if (el && typeof el.getDataInstance === 'function') return el.getDataInstance();
  } catch (_) { /* same */ }
  return null;
}

// Watch a graph element and accumulate demonstration evidence.
//
//   graphEl — a <webcola-cnd-graph> or <structured-input-graph>
//   opts    — { onChange?: (session) => void }
//
// Returns a handle; call `detach()` to unsubscribe.
export function observeArrangement(graphEl, opts = {}) {
  const marks = new Set();
  const explained = new Set();
  const ledger = [];
  let baseline = null;
  let seq = 0;

  const record = (type, detail) => {
    ledger.push({ seq: seq++, type, ...detail });
  };

  const notify = () => {
    if (typeof opts.onChange === 'function') {
      try { opts.onChange(handle); } catch (_) { /* a listener must not break observation */ }
    }
  };

  // The solver's own arrangement, frozen the moment before the user's first
  // drag. Without it every incidental alignment in the layout would read as
  // something the user asserted.
  const captureBaseline = (force) => {
    if (baseline && !force) return baseline;
    const positions = readPositions(graphEl);
    if (positions.length === 0) return baseline;
    baseline = positions;
    record('baseline', { count: positions.length });
    return baseline;
  };

  const onDragStart = () => { captureBaseline(); };

  const onDragEnd = (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.id == null) return;
    captureBaseline();
    marks.add(d.id);
    explained.delete(d.id);   // moving it again reopens the question
    record('drag', { id: d.id, previous: d.previous, current: d.current });
    notify();
  };

  if (graphEl && typeof graphEl.addEventListener === 'function') {
    graphEl.addEventListener(DRAG_START, onDragStart);
    graphEl.addEventListener(DRAG_END, onDragEnd);
  }

  const handle = {
    element: graphEl,
    ledger,

    get marks() { return new Set(marks); },
    get explained() { return new Set(explained); },
    get baseline() { return baseline ? baseline.slice() : null; },

    /** Positions as they stand right now. */
    positions: () => readPositions(graphEl),

    captureBaseline,

    mark(id) { marks.add(id); record('mark', { id }); notify(); },
    unmark(id) { marks.delete(id); explained.delete(id); record('unmark', { id }); notify(); },
    toggleMark(id) { marks.has(id) ? handle.unmark(id) : handle.mark(id); },

    /** Forget everything, including what the user has demonstrated. */
    reset() {
      marks.clear();
      explained.clear();
      baseline = null;
      record('reset', {});
      notify();
    },

    // Drop the baseline but keep the session. Used after a re-render: the solver
    // has produced a new arrangement, so the old counterfactual is meaningless,
    // but the record of what the user moved and what has been explained is still
    // theirs. Ids that no longer exist simply stop matching any node, so a
    // structural edit needs no special handling.
    rebase() {
      baseline = null;
      record('rebase', {});
      notify();
    },

    /** Has the user actually demonstrated anything yet? */
    get hasEvidence() { return marks.size > 0 && !!baseline; },

    // What was demonstrated, and what would explain it.
    //
    //   data — { atoms, relations } for the graph as it currently stands
    //
    // Returns { evidence, proposals } — or empty ones when the user has not
    // rearranged anything, which is the honest answer rather than a guess.
    propose(data, options = {}) {
      const positions = readPositions(graphEl);
      if (positions.length === 0) return { evidence: null, proposals: [] };

      const read = (scope) => abduce(positions, {
        baseline: baseline || undefined,
        marks,
        ...options,
        scope,
      });

      // Prefer the tight reading — pairs where the user moved *both* endpoints,
      // which is the strongest evidence and keeps the candidate set small. But
      // the commonest gesture of all is dragging one node to line it up with one
      // that stays put, and that marks only the node that moved. So when the
      // tight reading finds nothing, widen to pairs with one marked endpoint
      // rather than concluding the user demonstrated nothing.
      let evidence = read(options.scope || 'both');
      if (evidence.groups.length === 0 && !options.scope) evidence = read('any');
      // `satisfied` lets generalization distinguish a pair the constraint would
      // move from one the drawing already honours — see scoreAgainst.
      //
      // `synthesize` is the fallback for demonstrations no name in the source
      // explains — siblings, ancestors, anything derived. Built from the live
      // instance, and null when spytial-core's synthesis API is not on the page,
      // in which case generalization simply proposes nothing for those groups.
      const synthesize =
        options.synthesize !== undefined
          ? options.synthesize
          : makeSynthesizer(readInstance(graphEl), options);

      const proposals = data
        ? generalize(evidence.groups, data, {
            ...options,
            satisfied: evidence.satisfied,
            synthesize,
          })
        : [];
      record('propose', { groups: evidence.groups.length, proposals: proposals.length });
      return { evidence, proposals };
    },

    // Accept a proposal: the marks it accounts for are explained, and stop
    // counting against the user. The proposal's own text is the caller's to
    // apply — this module never writes to the source.
    accept(proposal) {
      for (const [a, b] of (proposal && proposal.coveredPairs) || []) {
        explained.add(a); explained.add(b);
      }
      // `covered` is a count, not a list; when the caller has not supplied the
      // pairs, fall back to marking everything the proposal's selector touched.
      if (!proposal || !proposal.coveredPairs) {
        for (const id of marks) explained.add(id);
      }
      record('accept', { line: proposal && proposal.line });
      notify();
      return handle.summary();
    },

    /** `n marked · m explained` — the progress the panel shows. */
    summary() {
      return {
        marked: marks.size,
        explained: [...explained].filter((id) => marks.has(id)).length,
        hasBaseline: !!baseline,
      };
    },

    detach() {
      if (graphEl && typeof graphEl.removeEventListener === 'function') {
        graphEl.removeEventListener(DRAG_START, onDragStart);
        graphEl.removeEventListener(DRAG_END, onDragEnd);
      }
    },
  };

  return handle;
}
