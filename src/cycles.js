// Cycle abduction — read a ring in the drawing as `@cyclic`.
//
// Everything else in this feature reads an arrangement as *pairwise* predicates:
// a is left of b, c and d share a line. `@cyclic` cannot be reached that way and
// never will be. A ring is a property of a set of nodes under a relation, and
// every pairwise reading of one is a chain — take two nodes on a circle and all
// you can say is that one is above and to the left of the other, which is just
// as true of two nodes on a diagonal. What makes it a ring lives in the *order*,
// and an order is not a pair. So this is a second abduction, run beside
// abduce.js rather than inside it, asking a different question of a different
// object: not "what became true of these two nodes" but "does this relation's
// own subgraph lie on a circle".
//
// BOTH HALVES OF THE TEST ARE LOAD-BEARING. Structure alone would call any
// 4-cycle in the data cyclic however it is drawn. Geometry alone would call any
// four nodes near a circle a ring — and four points are nearly always near
// *some* circle, so that fires constantly on layouts nobody arranged.
//
// Adapted from the cycle detection on `liangyiliang/copeanddrag`, branch
// `heuristics` (June 2025), which is where the shape of the test comes from:
// gate on the relation's own subgraph being a single ring or path, take the
// traversal order from it, then check the geometry against the centroid. Three
// things are different here. The radius test is relative to the arrangement's
// scale instead of a 100px constant, so it survives a zoom. The sweep is summed
// *signed* rather than absolute, which a zigzag can no longer pass and which
// yields the direction from its own sign instead of a separate leftmost-node
// heuristic. And the result is diffed against the baseline, because a ring the
// solver drew is not something the user demonstrated.

import { candidates, emitLine, rank } from './generalize.js';

/** Below this, "ring" is not a claim: any three points lie on a circle. */
export const MIN_CYCLE_NODES = 4;

/** How far radii may spread, as a fraction of the mean radius. */
export const RADIUS_TOLERANCE = 0.5;

/** How far the total turn may sit from a full revolution, in radians. */
export const SWEEP_TOLERANCE = 0.6;

/**
 * Least share of the turning that must go the same way. A true ring turns
 * monotonically; allowing a little backtracking tolerates a hand-placed node
 * that overshoots its neighbour without admitting a zigzag.
 */
export const MIN_MONOTONICITY = 0.9;

const TWO_PI = Math.PI * 2;

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function mean(xs) {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

// The structural half: does this selector's denotation form one ring or one
// path? Both qualify — core lays a `@cyclic` fragment out around a circle
// whether or not it closes — but nothing else does. Any node with two
// successors, two predecessors, or a second disconnected fragment means the
// relation is not a traversal, and no arrangement of it should read as a ring.
//
// Returns { order, closed } or null.
export function ringOrder(pairs) {
  const next = new Map();
  const prev = new Map();
  const nodes = new Set();
  const seen = new Set();

  for (const [a, b] of pairs || []) {
    if (a == null || b == null) return null;
    if (a === b) return null;                     // a self-loop is not a traversal
    const k = `${a} ${b}`;
    if (seen.has(k)) continue;                    // a repeated tuple is not a branch
    seen.add(k);
    if (next.has(a) || prev.has(b)) return null;  // branches: out- or in-degree > 1
    next.set(a, b);
    prev.set(b, a);
    nodes.add(a);
    nodes.add(b);
  }

  if (nodes.size < MIN_CYCLE_NODES) return null;

  // A closed ring has no node without a predecessor; an open path has exactly
  // one. More than one means several fragments.
  const starts = [...nodes].filter((n) => !prev.has(n));
  if (starts.length > 1) return null;
  const closed = starts.length === 0;
  const start = closed ? [...nodes][0] : starts[0];

  const order = [];
  const visited = new Set();
  let cur = start;
  while (cur != null && !visited.has(cur)) {
    order.push(cur);
    visited.add(cur);
    cur = next.get(cur);
  }

  // Anything the walk did not reach is a second fragment.
  return order.length === nodes.size ? { order, closed } : null;
}

// The geometric half: taken in traversal order, do these nodes go once around
// their own centroid at a roughly constant radius?
//
// DIRECTION. Screen coordinates put y downward, so `atan2(y - cy, x - cx)`
// *increases* clockwise as drawn: from (r,0) at angle 0 the next quarter turn
// reaches (0,r), which is below centre. A positive total is therefore clockwise,
// and that matches what core means by the word — it places fragment member i at
// `(R cos θ, R sin θ)` with θ increasing and reads those as screen coordinates,
// reversing the fragment for `counterclockwise`.
//
// Returns { direction, sweep, radiusSpread, monotonicity, radius } or null.
export function windingOf(order, byId, opts = {}) {
  const radiusTolerance = isFiniteNumber(opts.radiusTolerance)
    ? opts.radiusTolerance : RADIUS_TOLERANCE;
  const sweepTolerance = isFiniteNumber(opts.sweepTolerance)
    ? opts.sweepTolerance : SWEEP_TOLERANCE;
  const minMonotonicity = isFiniteNumber(opts.minMonotonicity)
    ? opts.minMonotonicity : MIN_MONOTONICITY;

  const pts = order.map((id) => byId.get(id));
  if (pts.some((p) => !p)) return null;

  const cx = mean(pts.map((p) => p.x));
  const cy = mean(pts.map((p) => p.y));

  const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const meanRadius = mean(radii);
  if (!(meanRadius > 0)) return null;             // every node at one point
  const radiusSpread = (Math.max(...radii) - Math.min(...radii)) / meanRadius;
  if (radiusSpread > radiusTolerance) return null;

  // Sum the turn from each node to the next, wrapping past the last. Wrapping
  // for an open path too is deliberate: it is what makes the expected total one
  // full revolution for a ring and a path alike.
  let signed = 0;
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const a0 = Math.atan2(p.y - cy, p.x - cx);
    const a1 = Math.atan2(q.y - cy, q.x - cx);
    const step = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    signed += step;
    total += Math.abs(step);
  }
  if (total === 0) return null;

  const monotonicity = Math.abs(signed) / total;
  if (monotonicity < minMonotonicity) return null;
  if (Math.abs(Math.abs(signed) - TWO_PI) > sweepTolerance) return null;

  return {
    direction: signed > 0 ? 'clockwise' : 'counterclockwise',
    sweep: signed,
    radiusSpread,
    monotonicity,
    radius: meanRadius,
  };
}

/** `~R` clockwise and `R` counterclockwise are the same ring. */
function normalizeCyclic(selector, direction) {
  if (!selector.startsWith('~')) return { selector, direction };
  return {
    selector: selector.slice(1),
    direction: direction === 'clockwise' ? 'counterclockwise' : 'clockwise',
  };
}

function positionIndex(nodes) {
  const byId = new Map();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (n && n.id != null && isFiniteNumber(n.x) && isFiniteNumber(n.y)) byId.set(n.id, n);
  }
  return byId;
}

// Every selector whose denotation is drawn as a ring in this arrangement.
//
//   arrangement — [{id, x, y}]
//   data        — { atoms, relations }
//
// Products are not enumerated. A ring named by a type product would have to be
// a functional traversal of every node of one sort onto every node of another,
// which only happens when both sorts are a single node — and that is too small
// to be a ring anyway.
export function detectCycles(arrangement, data, opts = {}) {
  const byId = positionIndex(arrangement);
  if (byId.size < MIN_CYCLE_NODES) return [];

  const found = [];
  for (const cand of candidates(data, { ...opts, products: false })) {
    if (cand.kind === 'product') continue;
    const ring = ringOrder(cand.pairs);
    if (!ring) continue;
    const winding = windingOf(ring.order, byId, opts);
    if (!winding) continue;
    found.push({ selector: cand.selector, source: cand.kind, ...ring, ...winding });
  }
  return found;
}

function ringPairs(order, closed) {
  const out = [];
  for (let i = 0; i < order.length - 1; i++) out.push([order[i], order[i + 1]]);
  if (closed && order.length > 1) out.push([order[order.length - 1], order[0]]);
  return out;
}

// The rings the user demonstrated, as `@cyclic` proposals.
//
//   arrangement — positions now
//   baseline    — positions the current annotations already produce, or null
//   data        — { atoms, relations }
//   opts        — { marks?, radiusTolerance?, sweepTolerance?, minMonotonicity? }
//
// A ring already present in the baseline is dropped: the solver drew it, so it
// is evidence of nothing. This is the one thing cycle abduction takes from the
// rest of the design — and the only thing it needs, because unlike a nudge a
// ring is not ambiguous about what it means. That is why marks gate it so much
// more loosely than they gate pairs: any *one* member having been touched is
// enough, since completing a ring of four by dragging a single node into place
// leaves the other three where they were.
export function proposeCycles(arrangement, baseline, data, opts = {}) {
  if (!data) return [];
  const marks = opts.marks instanceof Set ? opts.marks : new Set(opts.marks || []);

  const before = new Set();
  for (const c of baseline ? detectCycles(baseline, data, opts) : []) {
    const n = normalizeCyclic(c.selector, c.direction);
    before.add(`${n.selector}|${n.direction}`);
  }

  const byLine = new Map();
  for (const c of detectCycles(arrangement, data, opts)) {
    const { selector, direction } = normalizeCyclic(c.selector, c.direction);
    if (before.has(`${selector}|${direction}`)) continue;
    if (marks.size > 0 && !c.order.some((id) => marks.has(id))) continue;

    const line = emitLine('cyclic', selector, direction);
    if (byLine.has(line)) continue;

    const pairs = ringPairs(c.order, c.closed);
    byLine.set(line, {
      kind: 'cyclic',
      selector,
      value: direction,
      source: c.source,
      line,
      members: c.order.slice(),
      closed: c.closed,
      // The ring passed a structural test, not a proportional one: every tuple
      // of the selector is on the circle, or `ringOrder` would have rejected it.
      coverage: 1,
      covered: pairs.length,
      coveredPairs: pairs,
      demonstrated: pairs.length,
      missed: 0,
      missedPairs: [],
      consistent: 0,
      consistentPairs: [],
      predicts: [],
      // What the geometry actually measured, for the panel to explain itself.
      geometry: {
        sweep: c.sweep,
        radiusSpread: c.radiusSpread,
        monotonicity: c.monotonicity,
      },
    });
  }

  return [...byLine.values()].sort(rank);
}
