// Abduction — read a hand-made arrangement as qualitative spatial predicates.
//
// This is the first half of constraint inference: the user drags nodes into the
// shape they wanted, and we ask *what became true*, not *what did they mean*.
// Intent is recovered later (generalize.js); here we only observe.
//
// The observation vocabulary is deliberately the same as the constraint
// language's, so a reading is directly expressible as an annotation:
//
//   orientation:  b is left / right / above / below a   (ordered pair)
//   align:        a and b share a horizontal / vertical line   (unordered pair)
//
// Two design points carry most of the weight.
//
// TOLERANCE LIVES HERE, AND ONLY HERE. Nobody drags to the pixel, so `abduce`
// quantizes geometry through an epsilon: within it, two nodes are *aligned*;
// beyond it, one is above/below (or left/right of) the other. Downstream
// matching is then exact set arithmetic over discrete predicates, so no other
// module needs a notion of "close enough". Epsilon is scale-relative — a
// fraction of the median nearest-neighbour distance — because a pixel count
// would mean different things at different zooms and graph sizes.
//
// EVIDENCE IS A DIFF, NOT A READING. An n-node arrangement satisfies O(n²)
// pairwise predicates and nearly all of them are accidental. What the user
// actually asserted is the difference between their arrangement and the one the
// current annotations already produce — so `abduce` takes a baseline and
// subtracts it. A predicate the solver was going to give you anyway is not
// evidence of anything.
//
// Marks narrow it further: by default only pairs whose *both* endpoints were
// marked are considered, which is what keeps the candidate set O(k²) in the
// number of marks rather than O(n²) in the size of the graph.

// Screen coordinates: x grows right, y grows *down*. So a positive dy means the
// second node sits below the first, which is why `below` and `above` read the
// way they do in `orientationFor`.

/** Fraction of the spatial scale within which two coordinates count as equal. */
export const EPSILON_RATIO = 0.2;

/** The four relative directions `@orientation(directions=[...])` accepts. */
export const DIRECTIONS = ['left', 'right', 'above', 'below'];

/** The two axes `@align(direction=...)` accepts. */
export const ALIGNMENTS = ['horizontal', 'vertical'];

/** `left` ⇄ `right`, `above` ⇄ `below` — used to normalize a transposed selector. */
export const OPPOSITE = {
  left: 'right', right: 'left', above: 'below', below: 'above',
};

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// Keep only nodes we can actually place. A node the renderer hasn't positioned
// yet carries undefined/NaN coordinates, and letting one through would make
// every pair involving it read as "aligned" (NaN comparisons are all false, so
// it would fall through to the else branch).
function usableNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).filter(
    (n) => n && n.id != null && isFiniteNumber(n.x) && isFiniteNumber(n.y)
  );
}

function median(xs) {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// A length scale for the arrangement: the median distance from a node to its
// nearest neighbour. This tracks how tightly the graph is packed at whatever
// zoom it happens to be drawn, which a pixel constant cannot. Falls back to the
// bounding box's diagonal over √n when every node sits on top of every other
// (median 0), and to 0 for a graph too small to have a scale at all.
export function spatialScale(nodes) {
  const ns = usableNodes(nodes);
  if (ns.length < 2) return 0;

  const nearest = [];
  for (let i = 0; i < ns.length; i++) {
    let best = Infinity;
    for (let j = 0; j < ns.length; j++) {
      if (i === j) continue;
      const dx = ns[i].x - ns[j].x;
      const dy = ns[i].y - ns[j].y;
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }

  const m = median(nearest);
  if (m > 0) return m;

  const xs = ns.map((n) => n.x);
  const ys = ns.map((n) => n.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return diag > 0 ? diag / Math.sqrt(ns.length) : 0;
}

/** The tolerance to use for an arrangement, honouring an explicit override. */
export function epsilonFor(nodes, opts = {}) {
  if (isFiniteNumber(opts.epsilon)) return Math.max(0, opts.epsilon);
  const ratio = isFiniteNumber(opts.epsilonRatio) ? opts.epsilonRatio : EPSILON_RATIO;
  return spatialScale(nodes) * ratio;
}

// A predicate's identity. Orientation is ordered (`below` of (a,b) is a
// different claim from `below` of (b,a)); alignment is symmetric, so its pair is
// sorted before keying, which keeps one fact from being counted twice.
export function predicateKey(p) {
  if (p.kind === 'align') {
    const [x, y] = [p.a, p.b].sort();
    return `align|${p.value}|${x}|${y}`;
  }
  return `orientation|${p.value}|${p.a}|${p.b}`;
}

// Where `b` sits relative to `a` on one axis, given a tolerance: `null` when the
// two are within epsilon (they're aligned on this axis, not ordered along it).
function orientationFor(delta, epsilon, positive, negative) {
  if (Math.abs(delta) <= epsilon) return null;
  return delta > 0 ? positive : negative;
}

// Every qualitative predicate true of one ordered pair. A pair contributes at
// most one fact per axis: either the two are aligned on that axis, or one
// precedes the other along it.
function pairPredicates(a, b, epsilon) {
  const out = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // Vertical axis: aligned (a horizontal line through both) or one below the other.
  if (Math.abs(dy) <= epsilon) {
    out.push({ kind: 'align', a: a.id, b: b.id, value: 'horizontal' });
  } else {
    out.push({ kind: 'orientation', a: a.id, b: b.id, value: orientationFor(dy, epsilon, 'below', 'above') });
  }

  // Horizontal axis: aligned (a vertical line through both) or one right of the other.
  if (Math.abs(dx) <= epsilon) {
    out.push({ kind: 'align', a: a.id, b: b.id, value: 'vertical' });
  } else {
    out.push({ kind: 'orientation', a: a.id, b: b.id, value: orientationFor(dx, epsilon, 'right', 'left') });
  }

  return out;
}

// Which ordered pairs to read. `both` (the default) is the tight reading: only
// pairs where the user marked each endpoint, so the candidate set stays O(k²) in
// the marks. `any` widens to pairs with one marked endpoint, which is the useful
// fallback when `both` finds nothing. With no marks at all, every pair is read.
function pairsToRead(ns, marks, scope) {
  const marked = marks instanceof Set ? marks : new Set(marks || []);
  const pairs = [];
  for (const a of ns) {
    for (const b of ns) {
      if (a.id === b.id) continue;
      if (marked.size > 0) {
        const ma = marked.has(a.id);
        const mb = marked.has(b.id);
        if (scope === 'any' ? !(ma || mb) : !(ma && mb)) continue;
      }
      pairs.push([a, b]);
    }
  }
  return pairs;
}

// Read an arrangement as a deduplicated predicate list.
//
//   nodes — [{ id, x, y }] in layout coordinates
//   opts  — { epsilon?, epsilonRatio?, marks?, scope?: 'both' | 'any' }
export function predicates(nodes, opts = {}) {
  const ns = usableNodes(nodes);
  const epsilon = epsilonFor(ns, opts);
  const seen = new Map();

  for (const [a, b] of pairsToRead(ns, opts.marks, opts.scope || 'both')) {
    for (const p of pairPredicates(a, b, epsilon)) {
      const key = predicateKey(p);
      if (!seen.has(key)) seen.set(key, p);
    }
  }

  return [...seen.values()];
}

/** Predicates true in `current` and not in `baseline`. */
export function diff(current, baseline) {
  const before = new Set((baseline || []).map(predicateKey));
  return (current || []).filter((p) => !before.has(predicateKey(p)));
}

// Group predicates into the sets a single annotation could explain: one group
// per (kind, value), each holding the pairs that share that reading. These are
// exactly the extensional targets generalize.js tries to name with a selector.
export function groupPredicates(preds) {
  const groups = new Map();
  for (const p of preds || []) {
    const key = `${p.kind}|${p.value}`;
    if (!groups.has(key)) groups.set(key, { kind: p.kind, value: p.value, pairs: [] });
    groups.get(key).pairs.push([p.a, p.b]);
  }
  // Biggest groups first: a reading backed by more demonstrated pairs is both
  // likelier to be intended and likelier to generalize to a named relation.
  return [...groups.values()].sort((x, y) => y.pairs.length - x.pairs.length);
}

// The whole abduction step: read the arrangement, subtract what the current
// layout already gave you, and group what is left into candidate targets.
//
//   arrangement — [{ id, x, y }] the user produced
//   opts.baseline — [{ id, x, y }] the same nodes as the solver placed them.
//                   Omit only if you genuinely have no counterfactual; without
//                   it every incidental alignment reads as an assertion.
//   opts.marks    — ids the user said matter
//
// Returns { epsilon, scale, predicates, groups, satisfied } — the intermediates
// come back because they are what a UI needs to explain itself.
//
// `satisfied` is every predicate true of the arrangement, read over *all* nodes
// rather than only the marked ones. Generalization needs it to tell two very
// different things apart: a pair a candidate constrains that the drawing already
// honours (costless — accepting the constraint changes nothing there) from one
// it does not (a real prediction, which will move something). Scoring without
// that distinction punishes a relation for the pairs the solver happened to get
// right on its own, which is precisely backwards.
export function abduce(arrangement, opts = {}) {
  const scale = spatialScale(arrangement);
  const epsilon = epsilonFor(arrangement, opts);
  const shared = { epsilon, marks: opts.marks, scope: opts.scope };

  const observed = predicates(arrangement, shared);
  // The baseline is read with the same epsilon and the same pair scope, so the
  // subtraction compares like with like.
  const before = opts.baseline ? predicates(opts.baseline, shared) : [];
  const evidence = diff(observed, before);
  const satisfied = predicates(arrangement, { epsilon });

  return { scale, epsilon, predicates: evidence, groups: groupPredicates(evidence), satisfied };
}
