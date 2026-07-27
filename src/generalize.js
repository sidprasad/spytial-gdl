// Generalization — turn demonstrated pairs into an `@annotation` line.
//
// Abduction (abduce.js) says *what became true* of specific nodes: `hindley` is
// below `mr_e`, `catherine` and `edgar` share a horizontal line. That is an
// extensional fact about this drawing. A constraint has to be intensional — a
// claim about a *relation* — or it is just a pinned position wearing a costume.
//
// This module closes that gap. Given a demonstrated set of pairs, it looks for a
// selector whose denotation is that set, and emits the annotation:
//
//   {(catherine,edgar), (heathcliff,isabella)}  →  @align(selector=spouse, direction=horizontal)
//
// That step is the whole reason this feature is worth building. Every
// direct-manipulation constraint-inference system can record that two rectangles
// line up; naming the *relation* that explains why is what makes the result
// reusable — it holds for nodes not yet drawn, and for other data of the same
// schema.
//
// WHY THIS DOESN'T CALL THE SYNTHESIZER FIRST. spytial-core exposes
// `synthesizeBinarySelector`, a BFS over the relational grammar, and it is the
// right tool for expressions no name reaches (a join, a closure). But it demands
// *exact* set equality, and a person who aligns four of five `spouse` pairs has
// not produced an exact set. Worse, an exact-match search that cannot find
// `spouse` will happily build `spouse - (cathy->hareton)`, which overfits and
// reads as though it knew what it was doing.
//
// So the cheap, readable candidates are scored first, approximately: the named
// relations, their transposes, and the type/class products. Coverage is scored
// as precision — see `scoreAgainst` for why recall is the wrong question — ties
// break toward the shorter expression, and the pairs a candidate covers that the
// user did *not* demonstrate come back as `predicts`, a completion to offer
// rather than a mismatch to hide. Synthesis stays available through
// `opts.synthesize` for the cases names cannot reach.

import { DEFAULT_TYPE, DEFAULT_RELATION, ALL_EDGES_RELATION } from './relationalize.js';
import { OPPOSITE } from './abduce.js';

/** Ceiling on unary sources crossed into `A->B` products, to bound the search. */
export const MAX_UNARY_SOURCES = 12;

/** Minimum coverage for a candidate to be proposed at all. */
export const MIN_COVERAGE = 0.6;

// Ranking preference by where a candidate came from. A named relation is what a
// person would have written, so it wins ties against the same set expressed as a
// transpose or a type product.
const PREFERENCE = { relation: 0, links: 1, transpose: 2, product: 3, synthesized: 4 };

function arityOf(rel) {
  const t = rel && rel.tuples && rel.tuples[0];
  if (t && Array.isArray(t.atoms)) return t.atoms.length;
  if (rel && Array.isArray(rel.types)) return rel.types.length;
  return 0;
}

// Orientation is ordered; alignment is not. Keying symmetric pairs in sorted
// order is what lets a demonstrated `{(a,b)}` match a relation that happens to
// store both `(a,b)` and `(b,a)` — as a hand-written symmetric relation like
// `spouse` invariably does — instead of scoring it a spurious 0.5.
export function pairKey(a, b, symmetric) {
  return symmetric ? [a, b].sort().join('\0') : `${a}\0${b}`;
}

function pairSet(pairs, symmetric) {
  const s = new Set();
  for (const [a, b] of pairs || []) s.add(pairKey(a, b, symmetric));
  return s;
}

function unkey(k) {
  const [a, b] = k.split('\0');
  return [a, b];
}

// ── Candidate enumeration ───────────────────────────────────────────────────

function binaryRelations(data) {
  return (data.relations || []).filter((r) => arityOf(r) === 2);
}

function relationPairs(rel) {
  const out = [];
  for (const t of rel.tuples || []) {
    const a = t.atoms || [];
    if (a.length >= 2) out.push([a[0], a[1]]);
  }
  return out;
}

// The unary things a `A->B` product can be built from: declared sorts, the class
// names relationalize emits as unary relations, and `univ` for "any node".
function unarySources(data) {
  const sources = new Map();
  sources.set('univ', new Set((data.atoms || []).map((a) => a.id)));

  for (const atom of data.atoms || []) {
    const t = atom.type;
    if (!t || t === DEFAULT_TYPE) continue;
    if (!sources.has(t)) sources.set(t, new Set());
    sources.get(t).add(atom.id);
  }

  for (const rel of data.relations || []) {
    if (arityOf(rel) !== 1) continue;
    const members = new Set();
    for (const t of rel.tuples || []) {
      const a = t.atoms || [];
      if (a.length >= 1) members.add(a[0]);
    }
    if (members.size > 0 && !sources.has(rel.name)) sources.set(rel.name, members);
  }

  return [...sources.entries()].slice(0, MAX_UNARY_SOURCES);
}

// Every selector we are willing to propose, with the pair set it denotes.
// Computed directly from `{atoms, relations}` — no evaluator, so this module
// stays a pure function that runs in a plain Node test.
export function candidates(data, opts = {}) {
  const out = [];
  const seenSelector = new Set();
  const add = (selector, kind, pairs) => {
    if (seenSelector.has(selector)) return;
    seenSelector.add(selector);
    out.push({ selector, kind, pairs });
  };

  for (const rel of binaryRelations(data)) {
    const name = rel.name;
    if (!name) continue;
    const pairs = relationPairs(rel);
    if (pairs.length === 0) continue;
    const kind = name === ALL_EDGES_RELATION || name === DEFAULT_RELATION ? 'links' : 'relation';
    add(name, kind, pairs);
    // The transpose lets a demonstration read in the opposite order still find
    // its explanation; emitLine normalizes `~R` away before it reaches the user.
    add(`~${name}`, 'transpose', pairs.map(([a, b]) => [b, a]));
  }

  if (opts.products !== false) {
    const sources = unarySources(data);
    for (const [srcName, srcIds] of sources) {
      for (const [dstName, dstIds] of sources) {
        if (srcIds.size === 0 || dstIds.size === 0) continue;
        const pairs = [];
        for (const a of srcIds) for (const b of dstIds) if (a !== b) pairs.push([a, b]);
        if (pairs.length > 0) add(`${srcName}->${dstName}`, 'product', pairs);
      }
    }
  }

  return out;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

// How well a candidate's denotation explains what was demonstrated.
//
//   covered    — demonstrated pairs the candidate accounts for
//   missed     — demonstrated pairs it does not (it under-explains)
//   consistent — pairs it covers that were never demonstrated but that the
//                drawing *already* satisfies. Costless, and evidence FOR the
//                candidate: the user did not have to move these because the
//                solver had them right, which is exactly what you would expect
//                if the relation really is the rule.
//   predicts   — pairs it covers that are neither demonstrated nor currently
//                true. These are the real generalization: accepting the
//                constraint will move something. NOT an error — this is how a
//                four-of-five demonstration becomes the constraint the user
//                meant — but it is the thing to show them before they accept.
//
// `satisfiedPairs` is the already-true set, keyed the same way. Omit it and
// every uncovered pair counts as a prediction, which is the conservative
// reading.
//
// COVERAGE IS PRECISION, NOT RECALL. The score is "what fraction of what this
// selector denotes actually holds in the drawing" — `missed` is reported but
// deliberately kept OUT of the denominator. A demonstration is normally
// explained by *several* annotations working together, and each one only has to
// account for its own share: laying a binary tree out puts every child on one
// side or the other, and neither `@orientation(leftChild, [left])` nor
// `@orientation(rightChild, [right])` explains more than half the pairs the user
// produced. Scoring by recall rejects both and proposes nothing. Scoring by
// precision asks the question that actually matters before accepting a
// constraint: if I add this line, does it agree with everything on screen?
export function scoreAgainst(demoPairs, candidatePairs, symmetric, satisfiedPairs) {
  const demo = pairSet(demoPairs, symmetric);
  const cand = pairSet(candidatePairs, symmetric);
  const already = satisfiedPairs instanceof Set ? satisfiedPairs : new Set();

  const covered = [];
  const missed = [];
  for (const k of demo) (cand.has(k) ? covered : missed).push(k);

  const consistent = [];
  const predicts = [];
  for (const k of cand) {
    if (demo.has(k)) continue;
    (already.has(k) ? consistent : predicts).push(k);
  }

  return {
    covered: covered.length,
    coveredPairs: covered.map(unkey),
    // Demonstrated pairs this selector does not account for. Informational: some
    // other annotation is expected to, and `generalize` proposes a set.
    missed: missed.length,
    missedPairs: missed.map(unkey),
    consistent: consistent.length,
    consistentPairs: consistent.map(unkey),
    predicts: predicts.map(unkey),
    coverage: cand.size === 0 ? 0 : (covered.length + consistent.length) / cand.size,
  };
}

// ── Annotation emission ─────────────────────────────────────────────────────

// Anything that makes `~x` mean something other than "the transpose of the whole
// of x": an operator, a paren, or whitespace after the leading `~`.
const COMPOUND = /[\s().~^*+&-]/;

// Only a transpose of a bare *name* can be rewritten away.
//
// `@orientation(selector=~R, directions=[above])` and
// `@orientation(selector=R, directions=[below])` are the same claim, so
// normalizing keeps the proposal in the form a person would have typed and
// collapses the two readings of one demonstration into one suggestion. That
// rewrite is sound because `~` there applies to the entire selector.
//
// It is NOT sound for a compound expression, and synthesis returns those. The
// sibling selector `~parentOf.parentOf` parses as `(~parentOf).parentOf` — the
// `~` binds to the first name only. Stripping it yields `parentOf.parentOf`,
// which is the *grandparent* relation, and for an orientation the direction gets
// reversed on top of that. The annotation would then constrain a different set
// of nodes in the opposite direction, while looking entirely reasonable.
function isSimpleTranspose(selector) {
  return selector.startsWith('~') && selector.length > 1 && !COMPOUND.test(selector.slice(1));
}

function normalize(selector, kind, value) {
  if (!isSimpleTranspose(selector)) return { selector, value };
  const bare = selector.slice(1);
  if (kind === 'align') return { selector: bare, value };
  return { selector: bare, value: OPPOSITE[value] || value };
}

/** The annotation text for a (kind, selector, value) triple. */
export function emitLine(kind, selector, value) {
  if (kind === 'align') return `@align(selector=${selector}, direction=${value})`;
  if (kind === 'cyclic') return `@cyclic(selector=${selector}, direction=${value})`;
  return `@orientation(selector=${selector}, directions=[${value}])`;
}

// ── Generalization ──────────────────────────────────────────────────────────

// Exported because cycles.js ranks `@cyclic` proposals into the same list, and
// two orderings over one panel would be a bug waiting to happen.
export function rank(a, b) {
  if (b.coverage !== a.coverage) return b.coverage - a.coverage;
  // Among equally-consistent selectors, prefer the one that accounts for more of
  // what the user actually did — the alternative is a technically-true line
  // about a single pair outranking the rule.
  if (b.covered !== a.covered) return b.covered - a.covered;
  const pa = PREFERENCE[a.source] ?? 9;
  const pb = PREFERENCE[b.source] ?? 9;
  if (pa !== pb) return pa - pb;
  if (a.selector.length !== b.selector.length) return a.selector.length - b.selector.length;
  return a.selector < b.selector ? -1 : a.selector > b.selector ? 1 : 0;
}

// Explain one demonstrated group (all the pairs sharing a reading, e.g. every
// pair where the second node ended up below the first) with ranked selectors.
// The pairs this group's reading is already true of, drawn from `abduce`'s
// `satisfied` list — the predicates over every node, not just the marked ones.
function satisfiedPairsFor(satisfied, group, symmetric) {
  const s = new Set();
  for (const p of satisfied || []) {
    if (p.kind !== group.kind || p.value !== group.value) continue;
    s.add(pairKey(p.a, p.b, symmetric));
  }
  return s;
}

export function explainGroup(group, data, opts = {}) {
  const symmetric = group.kind === 'align';
  const minCoverage = typeof opts.minCoverage === 'number' ? opts.minCoverage : MIN_COVERAGE;
  const already = satisfiedPairsFor(opts.satisfied, group, symmetric);

  const scored = [];
  for (const cand of candidates(data, opts)) {
    // A transposed selector under `align` is the same set as the untransposed
    // one, so scoring it would only produce a duplicate proposal.
    if (symmetric && cand.kind === 'transpose') continue;
    const s = scoreAgainst(group.pairs, cand.pairs, symmetric, already);
    if (s.covered === 0 || s.coverage < minCoverage) continue;
    const { selector, value } = normalize(cand.selector, group.kind, group.value);
    scored.push({
      kind: group.kind,
      selector,
      value,
      source: cand.kind,
      line: emitLine(group.kind, selector, value),
      demonstrated: group.pairs.length,
      ...s,
    });
  }

  // Distinct candidates can normalize onto the same line (`R`/`~R` under a
  // symmetric demonstration). Keep the best-ranked instance of each.
  scored.sort(rank);
  const byLine = new Map();
  for (const s of scored) if (!byLine.has(s.line)) byLine.set(s.line, s);
  const best = [...byLine.values()];

  // Last resort: let simple-graph-query's real synthesizer search the relational
  // grammar for an expression no name reaches — siblings as `~parentOf.parentOf`,
  // ancestors as `^parentOf`. It requires exact set equality, so it fires only
  // when the approximate pass found nothing, which is exactly when the target
  // really is a derived relation rather than a sloppy demonstration of a named
  // one. See synthesize.js for why that ordering matters.
  if (best.length === 0 && typeof opts.synthesize === 'function') {
    try {
      // An alignment is symmetric, but the group stores one direction per
      // unordered pair. A derived symmetric relation denotes both — `~r.r - iden`
      // holds (a,b) *and* (b,a) — so handing over the half set would ask for an
      // expression that cannot exist and the search would come back empty.
      const target = symmetric
        ? group.pairs.flatMap(([a, b]) => [[a, b], [b, a]])
        : group.pairs;
      const expr = opts.synthesize(target);
      if (expr && String(expr).trim()) {
        const { selector, value } = normalize(String(expr).trim(), group.kind, group.value);
        best.push({
          kind: group.kind, selector, value, source: 'synthesized',
          line: emitLine(group.kind, selector, value),
          demonstrated: group.pairs.length,
          covered: group.pairs.length, coveredPairs: group.pairs.slice(),
          missed: 0, missedPairs: [], consistent: 0, consistentPairs: [],
          predicts: [], coverage: 1,
        });
      }
    } catch (_) { /* synthesis is best-effort; a failure just means no proposal */ }
  }

  return best;
}

// `below` plus a vertical alignment over the same pairs is exactly what
// `directlyBelow` means — the target lands squarely on the source rather than
// merely beneath it. Detecting the pair and merging it keeps the proposal in the
// most precise form the language offers, instead of two annotations that say
// together what one says better.
const DIRECTLY = {
  'below|vertical': 'directlyBelow',
  'above|vertical': 'directlyAbove',
  'left|horizontal': 'directlyLeft',
  'right|horizontal': 'directlyRight',
};

// The merged form is *added*, not substituted. `directlyBelow` is a strictly
// stronger claim than `below`, and stronger is not automatically better: a
// demonstration can support the ordering firmly while supporting the alignment
// only partly, in which case the plain form is the honest suggestion and the
// merged one over-commits. Scoring them side by side and letting `dropEntailed`
// remove whichever is genuinely redundant keeps that judgment in one place.
//
// THE MERGED SCORE IS MEASURED, NOT ESTIMATED. Both halves are claims about the
// selector's whole denotation, so combining them is sound — but the conjunction
// holds exactly where *both* halves hold, which `min(a, b)` only bounds from
// above. Two halves at 0.7 whose failures fall on different pairs leave the
// conjunction true of 0.4 of the denotation while `min` reports 0.7. Worse, an
// ordering demonstrated on one set of pairs and an alignment demonstrated on a
// disjoint set would merge into a `directly*` line that nothing demonstrated at
// all. So intersect the sets and count.
//
// The orientation side supplies the denominator and the keys: `directlyBelow`
// applies to each *ordered* pair of the selector. The alignment side is
// symmetric, so its pairs are matched unordered.
function mergeDirectly(proposals, minCoverage) {
  const aligns = proposals.filter((p) => p.kind === 'align');
  const merged = [];

  for (const p of proposals) {
    if (p.kind !== 'orientation') continue;
    const partner = aligns.find(
      (a) => a.selector === p.selector && DIRECTLY[`${p.value}|${a.value}`]
    );
    if (!partner) continue;

    const alignHolds = new Set(
      [...partner.coveredPairs, ...partner.consistentPairs].map(([a, b]) => pairKey(a, b, true))
    );
    const alignDemonstrated = new Set(partner.coveredPairs.map(([a, b]) => pairKey(a, b, true)));
    const bothHold = ([a, b]) => alignHolds.has(pairKey(a, b, true));

    // The selector's full denotation, as the orientation pass keyed it, and the
    // part of it the ordering holds on — `predicts` is precisely the rest.
    const orientationHolds = [...p.coveredPairs, ...p.consistentPairs];
    const denotation = [...orientationHolds, ...p.predicts];
    const holds = orientationHolds.filter(bothHold);
    const demonstrated = p.coveredPairs.filter(([a, b]) => alignDemonstrated.has(pairKey(a, b, true)));

    const coverage = denotation.length === 0 ? 0 : holds.length / denotation.length;
    // Nothing demonstrated both facts about the same pair, or the conjunction is
    // not well enough supported to be worth offering. Either way the two halves
    // remain on their own — this only ever withholds the merged line.
    if (demonstrated.length === 0 || coverage < minCoverage) continue;

    const holdsKeys = new Set(holds.map(([a, b]) => pairKey(a, b, false)));
    const value = DIRECTLY[`${p.value}|${partner.value}`];
    merged.push({
      ...p,
      value,
      line: emitLine('orientation', p.selector, value),
      coverage,
      covered: demonstrated.length,
      coveredPairs: demonstrated,
      consistent: holds.length - demonstrated.length,
      consistentPairs: holds.filter(([a, b]) => !alignDemonstrated.has(pairKey(a, b, true))),
      // Accepting moves every pair of the denotation where the conjunction does
      // not already hold.
      predicts: denotation.filter(([a, b]) => !holdsKeys.has(pairKey(a, b, false))),
      mergedFrom: [p.line, partner.line],
    });
  }

  return [...merged, ...proposals];
}

// `@orientation(R, [directlyBelow])` says everything `@orientation(R, [below])`
// and `@align(R, vertical)` say. Offering all three is noise when the strong one
// is at least as well supported — but when it is *less* supported, its weaker
// halves are separate claims worth keeping, because the user may have meant only
// one of them. So a proposal is dropped only if something that entails it scores
// at least as well.
function entails(strong, weak) {
  if (strong.selector !== weak.selector) return false;
  const parts = Object.entries(DIRECTLY).find(([, v]) => v === strong.value);
  if (!parts) return false;
  const [dir, axis] = parts[0].split('|');
  if (weak.kind === 'orientation' && weak.value === dir) return true;
  return weak.kind === 'align' && weak.value === axis;
}

function dropEntailed(proposals) {
  return proposals.filter(
    (weak) => !proposals.some((strong) => strong !== weak && entails(strong, weak) && strong.coverage >= weak.coverage)
  );
}

// Which group is worth spending the one synthesis attempt on.
//
// The smallest. An exact expression over few pairs is both likelier to exist and
// cheaper to find, while a large arbitrary set — "these nine pairs happen to run
// left to right" — almost never has one, so the search exhausts and the cost is
// paid for nothing. Ties go to an alignment: the derived relations actually
// worth synthesizing (siblings, cousins) are symmetric.
function synthesisTarget(groups) {
  let best = null;
  for (const g of groups || []) {
    if (!g || !g.pairs || g.pairs.length === 0) continue;
    if (!best || g.pairs.length < best.pairs.length) { best = g; continue; }
    if (g.pairs.length === best.pairs.length && g.kind === 'align' && best.kind !== 'align') best = g;
  }
  return best;
}

// The whole generalization step.
//
//   groups — from abduce(): [{ kind, value, pairs }]
//   data   — { atoms, relations } (what relationalize.js produces)
//   opts   — { minCoverage?, products?, synthesize?, maxPerGroup? }
//
// Returns ranked proposals, best first. Each carries the annotation `line`, what
// it `covered` / `missed`, and what it `predicts` — the pairs it would also
// constrain, which is the question to put to the user rather than a defect.
export function generalize(groups, data, opts = {}) {
  const maxPerGroup = typeof opts.maxPerGroup === 'number' ? opts.maxPerGroup : 3;

  // Synthesis gets ONE attempt per demonstration, not one per group.
  //
  // A search costs the same whether it succeeds or fails, and a search that
  // fails has to exhaust the grammar — measured at ~30s for depth 3, flat in the
  // size of the graph. The groups here are all readings of a single gesture, so
  // running the search once per group asks the same question five ways and
  // multiplies the worst case by five. One drag of four nodes produced five
  // groups and froze the page for over two minutes before this.
  const chosen = typeof opts.synthesize === 'function' ? synthesisTarget(groups) : null;
  const withoutSynthesis = { ...opts, synthesize: undefined };

  const all = [];
  for (const group of groups || []) {
    const groupOpts = group === chosen ? opts : withoutSynthesis;
    all.push(...explainGroup(group, data, groupOpts).slice(0, maxPerGroup));
  }

  // One line is one suggestion, however many readings produced it.
  const minCoverage = typeof opts.minCoverage === 'number' ? opts.minCoverage : MIN_COVERAGE;
  const byLine = new Map();
  for (const p of mergeDirectly(all, minCoverage).sort(rank)) if (!byLine.has(p.line)) byLine.set(p.line, p);
  return dropEntailed([...byLine.values()]).sort(rank);
}
