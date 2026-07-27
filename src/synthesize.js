// Selector synthesis — the escape hatch for demonstrations no name explains.
//
// generalize.js scores a fixed menu of readable candidates: the named relations,
// their transposes, and the sort/class cross-products. That menu covers most of
// what people demonstrate, and it has the property that matters most for a
// suggestion — the user recognizes the answer, because it is a name from their
// own source.
//
// It cannot reach a relation that has no name. Align every pair of *siblings* and
// there is no `sibling` relation to find: the set is `~parentOf.parentOf - iden`,
// a join against a transpose. Same for grandparents (`parentOf.parentOf`),
// ancestors (`^parentOf`), or anything else that is a derived fact about the
// graph rather than an edge in it.
//
// simple-graph-query already solves exactly this. `synthesizeBinarySelector` runs
// a BFS over the relational grammar — identifiers, `+ & - . ^ * ~` — and returns
// the first expression whose denotation equals the target set. spytial-core
// re-exports it, and the CDN global carries it, so this is a call rather than a
// dependency.
//
// WHY IT IS A FALLBACK AND NOT THE FIRST RESORT. Synthesis demands *exact* set
// equality. A person who aligns four of five `spouse` pairs has not produced an
// exact set, and a search that cannot match `spouse` will happily keep going and
// build `spouse - (cathy->hareton)` instead: correct on the demonstration,
// overfitted, and authoritative-looking. The approximate pass finds `spouse` at
// 0.8 and says so. So names are scored first, and synthesis runs only when none
// of them clear the bar — which is precisely when the target really is a derived
// relation and an exact expression is the right answer.
//
// The search order helps here too: `buildBaseNodes` enqueues relations ahead of
// types ahead of atom literals, so a bare relation name is tested long before any
// expression that mentions an individual node.

function getCore() {
  const c =
    (typeof window !== 'undefined' && (window.spytialcore || window.CndCore || window.CnDCore)) ||
    globalThis.spytialcore ||
    globalThis.CndCore;
  return c || null;
}

/** Is selector synthesis reachable in this environment? */
export function synthesisAvailable() {
  const core = getCore();
  return !!(core && typeof core.synthesizeBinarySelector === 'function');
}

// An expression long enough to be suspicious is one that has almost certainly
// enumerated its way to the answer rather than characterized it. Such a thing is
// exactly right on the demonstration and wrong about the intent, which is the
// worst combination to show someone — so it is dropped rather than ranked low.
const MAX_EXPRESSION_LENGTH = 60;

// Build a `(pairs) => selectorText | null` for one data instance.
//
//   dataInstance — the LIVE IDataInstance (not a reified {atoms, relations});
//                  synthesis evaluates candidates against it
//   opts.maxDepth — grammar search depth (default 3, enough for `~r.r` and `^r`)
//
// Returns null when synthesis is unavailable, so callers can treat the whole
// feature as optional. Every failure mode — an unknown atom id, a search that
// finds nothing, a throw from inside the evaluator — comes back as null for that
// one call rather than breaking the surrounding proposal.
export function makeSynthesizer(dataInstance, opts = {}) {
  const core = getCore();
  if (!core || typeof core.synthesizeBinarySelector !== 'function') return null;
  if (!dataInstance || typeof dataInstance.getAtoms !== 'function') return null;

  let byId;
  try {
    byId = new Map(dataInstance.getAtoms().map((a) => [a.id, a]));
  } catch (_) {
    return null;
  }

  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 3;

  return function synthesize(pairs) {
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    // The synthesizer wants atom objects, not ids. An id with no atom behind it
    // means the arrangement has drifted from the data (a node deleted mid-session),
    // and a partial target would synthesize a confidently wrong expression.
    const atomPairs = [];
    for (const [a, b] of pairs) {
      const x = byId.get(a);
      const y = byId.get(b);
      if (!x || !y) return null;
      atomPairs.push([x, y]);
    }

    let expr;
    try {
      expr = core.synthesizeBinarySelector([{ pairs: atomPairs, dataInstance }], maxDepth);
    } catch (_) {
      return null;   // no expression in the grammar denotes exactly this set
    }

    const text = typeof expr === 'string' ? expr.trim() : '';
    if (!text || text.length > MAX_EXPRESSION_LENGTH) return null;
    return text;
  };
}
