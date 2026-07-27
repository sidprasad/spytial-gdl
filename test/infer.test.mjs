// Constraint inference — abduce.js (arrangement → predicates) and
// generalize.js (predicates → @annotation). Run with `npm test`.
//
// Both modules are pure: no DOM, no renderer, no spytial-core. Positions come in
// as plain {id,x,y} and annotations come out as text, so the whole inference
// path is exercised here without a browser.
//
// Screen coordinates throughout: x grows right, y grows DOWN, so a child drawn
// beneath its parent has the larger y.

import { parseGraph } from '../src/parse.js';
import { relationalize } from '../src/relationalize.js';
import { abduce, predicates, spatialScale, epsilonFor, groupPredicates, diff } from '../src/abduce.js';
import { generalize, explainGroup, scoreAgainst, candidates, emitLine } from '../src/generalize.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}

const dataFor = (src) => {
  const { atoms, relations } = relationalize(parseGraph(src));
  return { atoms, relations };
};
const has = (proposals, line) => proposals.some((p) => p.line === line);
const lines = (proposals) => proposals.map((p) => p.line).join('\n     ');

// ── abduce: the qualitative reading ─────────────────────────────────────────

{
  // Two rows of two. Scale is the 100-unit grid, so epsilon is 20.
  const nodes = [
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 200, y: 100 },
    { id: 'c', x: 100, y: 200 }, { id: 'd', x: 200, y: 200 },
  ];
  check('spatialScale is the nearest-neighbour spacing', spatialScale(nodes) === 100, String(spatialScale(nodes)));
  check('epsilon is scale-relative', epsilonFor(nodes) === 20, String(epsilonFor(nodes)));

  const ps = predicates(nodes);
  const found = (kind, value, a, b) => ps.some((p) => p.kind === kind && p.value === value && p.a === a && p.b === b);
  check('b is right of a', found('orientation', 'right', 'a', 'b'));
  check('a is left of b', found('orientation', 'left', 'b', 'a'));
  check('c is below a', found('orientation', 'below', 'a', 'c'));
  check('a is above c', found('orientation', 'above', 'c', 'a'));
  check('a and b share a horizontal line', ps.some((p) => p.kind === 'align' && p.value === 'horizontal' && p.a === 'a' && p.b === 'b'));
  check('a and c share a vertical line', ps.some((p) => p.kind === 'align' && p.value === 'vertical' && p.a === 'a' && p.b === 'c'));
  // A pair contributes at most one fact per axis: aligned OR ordered, never both.
  check('an aligned pair is not also ordered on that axis',
    !ps.some((p) => p.kind === 'orientation' && ['above', 'below'].includes(p.value) && p.a === 'a' && p.b === 'b'));
}

{
  // Nobody drags to the pixel. A 12-unit slip on a 100-unit grid (epsilon 20)
  // still reads as an alignment; a 60-unit gap does not.
  const sloppy = [
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 200, y: 112 },
    { id: 'c', x: 300, y: 100 },
  ];
  const ps = predicates(sloppy);
  check('a 12-unit slip still reads as aligned',
    ps.some((p) => p.kind === 'align' && p.value === 'horizontal' && p.a === 'a' && p.b === 'b'));

  const notAligned = predicates([
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 200, y: 160 }, { id: 'c', x: 300, y: 100 },
  ]);
  check('a 60-unit gap does not',
    !notAligned.some((p) => p.kind === 'align' && p.value === 'horizontal' && p.a === 'a' && p.b === 'b'));
}

{
  // Marks scope the reading. `both` (the default) only reads pairs where the
  // user marked each endpoint — that is what keeps candidates O(k²), and here it
  // is what excludes the incidental same-row alignment of b and c.
  const nodes = [
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 100, y: 200 }, { id: 'c', x: 300, y: 200 },
  ];
  const all = predicates(nodes);
  check('unmarked: the incidental b/c alignment is read',
    all.some((p) => p.kind === 'align' && p.value === 'horizontal' && [p.a, p.b].sort().join() === 'b,c'));

  const marked = predicates(nodes, { marks: new Set(['a', 'b']) });
  check('marked a+b: only the a/b pair is read',
    marked.every((p) => [p.a, p.b].sort().join() === 'a,b'), JSON.stringify(marked));
  check('marked a+b: the b/c alignment is gone',
    !marked.some((p) => [p.a, p.b].sort().join() === 'b,c'));

  const any = predicates(nodes, { marks: new Set(['a']), scope: 'any' });
  check('scope:any widens to pairs with one marked endpoint',
    any.some((p) => [p.a, p.b].sort().join() === 'a,c'));
}

{
  // Evidence is a diff. A predicate the solver already produced is not something
  // the user asserted, so moving one node leaves exactly one new fact behind.
  const baseline = [
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 200, y: 300 }, { id: 'c', x: 300, y: 100 },
  ];
  const arrangement = [
    { id: 'a', x: 100, y: 100 }, { id: 'b', x: 200, y: 100 }, { id: 'c', x: 300, y: 100 },
  ];
  const { predicates: evidence } = abduce(arrangement, { baseline });
  check('the a/c alignment present in the baseline is not evidence',
    !evidence.some((p) => p.kind === 'align' && [p.a, p.b].sort().join() === 'a,c'), JSON.stringify(evidence));
  check('the newly-created a/b alignment is evidence',
    evidence.some((p) => p.kind === 'align' && p.value === 'horizontal' && [p.a, p.b].sort().join() === 'a,b'));

  const unchanged = abduce(baseline, { baseline });
  check('an arrangement identical to the baseline is no evidence at all',
    unchanged.predicates.length === 0, JSON.stringify(unchanged.predicates));
}

{
  const ps = [
    { kind: 'orientation', a: 'p', b: 'x', value: 'below' },
    { kind: 'orientation', a: 'p', b: 'y', value: 'below' },
    { kind: 'align', a: 'x', b: 'y', value: 'horizontal' },
  ];
  const groups = groupPredicates(ps);
  check('predicates group by (kind, value)', groups.length === 2);
  check('the largest group comes first', groups[0].pairs.length === 2 && groups[0].value === 'below');
  check('diff is keyed, not identity-based', diff(ps, [{ kind: 'align', a: 'y', b: 'x', value: 'horizontal' }]).length === 2);
}

// ── generalize: naming the relation ─────────────────────────────────────────

{
  const data = dataFor(`
mr_e -> hindley : parentOf
mr_e -> catherine : parentOf
catherine -> edgar : spouse
edgar -> catherine : spouse
`);

  check('candidates include the named relation and its transpose',
    candidates(data).some((c) => c.selector === 'parentOf') &&
    candidates(data).some((c) => c.selector === '~parentOf'));

  // A symmetric demonstration must match a relation stored in both directions —
  // `spouse` holds (c,e) and (e,c) while the user only showed one alignment.
  const sym = scoreAgainst([['catherine', 'edgar']], [['catherine', 'edgar'], ['edgar', 'catherine']], true);
  check('symmetric scoring does not halve a both-ways relation', sym.coverage === 1, JSON.stringify(sym));
  const asym = scoreAgainst([['catherine', 'edgar']], [['catherine', 'edgar'], ['edgar', 'catherine']], false);
  check('ordered scoring does count the reverse tuple as extra', asym.coverage === 0.5, JSON.stringify(asym));

  // Align the spouses: mark exactly the two of them, drag them level.
  const arrangement = [
    { id: 'mr_e', x: 100, y: 100 },
    { id: 'hindley', x: 50, y: 200 },
    { id: 'catherine', x: 150, y: 200 },
    { id: 'edgar', x: 250, y: 200 },
  ];
  const alignEvidence = abduce(arrangement, { marks: new Set(['catherine', 'edgar']) });
  const alignProps = generalize(alignEvidence.groups, data);
  check('aligning two spouses proposes @align on spouse',
    has(alignProps, '@align(selector=spouse, direction=horizontal)'), `\n     ${lines(alignProps)}`);

  // Parents above children: mark the parent and both children.
  const orientEvidence = abduce(arrangement, { marks: new Set(['mr_e', 'hindley', 'catherine']) });
  const orientProps = generalize(orientEvidence.groups, data);
  check('placing children below proposes @orientation on parentOf',
    has(orientProps, '@orientation(selector=parentOf, directions=[below])'), `\n     ${lines(orientProps)}`);
  // `~parentOf` with [above] is the same claim; it must not surface twice.
  check('the transposed reading is normalized away, not proposed separately',
    !orientProps.some((p) => p.selector.startsWith('~')), `\n     ${lines(orientProps)}`);
  check('the top proposal is the exact one',
    orientProps[0].coverage === 1 && orientProps[0].missed === 0, JSON.stringify(orientProps[0]));
}

{
  // A demonstration that lands squarely below is `directlyBelow`, not `below`
  // plus a separate vertical alignment.
  const data = dataFor(`root -> child : parentOf`);
  const arrangement = [{ id: 'root', x: 100, y: 100 }, { id: 'child', x: 100, y: 200 }];
  const props = generalize(abduce(arrangement).groups, data);
  check('below + vertical alignment merges into directlyBelow',
    has(props, '@orientation(selector=parentOf, directions=[directlyBelow])'), `\n     ${lines(props)}`);
  check('the merged proposal records what it replaced',
    props.find((p) => p.value === 'directlyBelow').mergedFrom.length === 2);
  check('the two halves are not also proposed on their own',
    !has(props, '@orientation(selector=parentOf, directions=[below])') &&
    !has(props, '@align(selector=parentOf, direction=vertical)'), `\n     ${lines(props)}`);
}

{
  // The four-of-five case: a partial demonstration should still name the
  // relation, and report the pair it would additionally constrain rather than
  // inventing an expression that denotes exactly the four shown.
  const data = dataFor(`
a1 -> a2 : spouse
b1 -> b2 : spouse
c1 -> c2 : spouse
d1 -> d2 : spouse
e1 -> e2 : spouse
`);
  const y = { a: 100, b: 200, c: 300, d: 400, e: 900 };
  const arrangement = [
    { id: 'a1', x: 100, y: y.a }, { id: 'a2', x: 300, y: y.a },
    { id: 'b1', x: 100, y: y.b }, { id: 'b2', x: 300, y: y.b },
    { id: 'c1', x: 100, y: y.c }, { id: 'c2', x: 300, y: y.c },
    { id: 'd1', x: 100, y: y.d }, { id: 'd2', x: 300, y: y.d },
    // e is left where the solver had it — not aligned.
    { id: 'e1', x: 100, y: y.e }, { id: 'e2', x: 300, y: y.e + 150 },
  ];
  // The solver had every pair sitting crooked; the user levelled four of them.
  // Supplying that baseline is what makes the alignment the *only* evidence —
  // the left/right ordering was already true, so it is not something they showed.
  const baseline = arrangement.map((n) => (/2$/.test(n.id) && n.id !== 'e2' ? { ...n, y: n.y + 60 } : { ...n }));
  const marks = new Set(['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2']);
  const ev = abduce(arrangement, { marks, baseline });
  const props = generalize(ev.groups, data, { satisfied: ev.satisfied });
  const align = props.find((p) => p.line === '@align(selector=spouse, direction=horizontal)');
  check('four of five still names spouse', !!align, `\n     ${lines(props)}`);
  check('it reports covering four', align && align.covered === 4, JSON.stringify(align));
  check('it predicts the fifth pair rather than failing',
    align && align.predicts.length === 1 && align.predicts[0].sort().join() === 'e1,e2',
    JSON.stringify(align && align.predicts));
  check('the fifth pair really is a prediction — the drawing does not satisfy it',
    align && align.consistent === 0, JSON.stringify(align && align.consistentPairs));
  check('coverage is 4/5', align && Math.abs(align.coverage - 0.8) < 1e-9, String(align && align.coverage));
  check('nothing overfits to exactly the four shown',
    !props.some((p) => p.selector.includes('-') && p.selector.includes('(')), `\n     ${lines(props)}`);
}

{
  // Sorts give `A->B` product selectors, which is how a cross-family rule like
  // the Wuthering Heights `Earnshaw->Linton` gets recovered.
  const data = dataFor(`
e1:::Earnshaw -> l1:::Linton : knows
e2:::Earnshaw -> l2:::Linton : knows
`);
  const arrangement = [
    { id: 'e1', x: 100, y: 100 }, { id: 'e2', x: 100, y: 200 },
    { id: 'l1', x: 400, y: 100 }, { id: 'l2', x: 400, y: 200 },
  ];
  const props = generalize(abduce(arrangement).groups, data);
  check('a sort cross-product is available as a selector',
    props.some((p) => p.selector === 'Earnshaw->Linton'), `\n     ${lines(props)}`);
  check('the named relation is offered too', props.some((p) => p.selector === 'knows'), `\n     ${lines(props)}`);
  // Both are exactly consistent with the drawing, so the tie breaks on how much
  // of the demonstration each accounts for. Every Earnshaw is left of every
  // Linton, not just the two joined by `knows`, so the cross-product explains
  // strictly more — and it is what the Wuthering Heights spec actually writes.
  check('the selector explaining more of the demonstration ranks higher',
    props.findIndex((p) => p.selector === 'Earnshaw->Linton') < props.findIndex((p) => p.selector === 'knows'),
    `\n     ${lines(props)}`);
}

{
  // Nothing demonstrated, nothing proposed — and a demonstration no selector
  // explains stays unexplained instead of being force-fit.
  const data = dataFor(`a -> b : r\nc -> d : r`);
  check('no evidence yields no proposals', generalize([], data).length === 0);
  const nonsense = [{ kind: 'align', value: 'horizontal', pairs: [['a', 'd']] }];
  check('an unexplainable demonstration yields no proposal',
    explainGroup(nonsense[0], data).length === 0,
    JSON.stringify(explainGroup(nonsense[0], data).map((p) => p.line)));
}

check('emitLine writes orientation', emitLine('orientation', 'parentOf', 'below') === '@orientation(selector=parentOf, directions=[below])');
check('emitLine writes align', emitLine('align', 'spouse', 'horizontal') === '@align(selector=spouse, direction=horizontal)');
check('emitLine writes cyclic', emitLine('cyclic', 'next', 'clockwise') === '@cyclic(selector=next, direction=clockwise)');

// ── the synthesis budget ────────────────────────────────────────────────────
//
// A synthesis search costs the same whether it hits or misses, and a miss has to
// exhaust the grammar — ~30s at depth 3, measured. The groups from one gesture
// are readings of the same thing, so running the search per group multiplies
// that for no new information. These use a fake synthesizer: what is under test
// is how often `generalize` reaches for it and with what, not what core returns.

{
  // Four nodes dragged into a ring. No named relation explains any reading of
  // it, so every group falls through to synthesis — which is exactly the case
  // that froze the page for over two minutes.
  const data = dataFor(`a -> b : next
b -> c : next
c -> d : next
d -> a : next`);
  const ring = [
    { id: 'a', x: 231.5, y: 270 }, { id: 'b', x: 71.5, y: 430 },
    { id: 'c', x: -88.5, y: 270 }, { id: 'd', x: 71.5, y: 110 },
  ];
  const column = [
    { id: 'a', x: 93, y: 30 }, { id: 'b', x: 50, y: 190 },
    { id: 'c', x: 50, y: 350 }, { id: 'd', x: 93, y: 510 },
  ];
  const ev = abduce(ring, { baseline: column, marks: new Set(['a', 'b', 'c', 'd']) });
  check('a ring produces several unexplainable groups', ev.groups.length > 1, String(ev.groups.length));

  const asked = [];
  const fake = (pairs) => { asked.push(pairs); return null; };
  generalize(ev.groups, data, { satisfied: ev.satisfied, synthesize: fake });
  check('synthesis is attempted once per demonstration, not once per group',
    asked.length === 1, `attempted ${asked.length} times for ${ev.groups.length} groups`);
}

{
  // The one attempt goes to the smallest group: a short expression is likelier
  // to denote three pairs exactly than nine, and the search costs the same
  // either way.
  const data = dataFor(`a -> b : r`);
  const groups = [
    { kind: 'orientation', value: 'left', pairs: [['a', 'b'], ['b', 'c'], ['c', 'd']] },
    { kind: 'orientation', value: 'below', pairs: [['a', 'c']] },
  ];
  let got = null;
  generalize(groups, data, { synthesize: (pairs) => { got = pairs; return null; } });
  check('the smallest group gets the attempt',
    got && got.length === 1, got && JSON.stringify(got));
}

{
  // Tie on size: prefer the alignment. The derived relations worth synthesizing
  // — siblings, cousins — are symmetric, and `explainGroup` expands a symmetric
  // target to both directions, so the pair count doubles on the way through.
  const data = dataFor(`a -> b : r`);
  const groups = [
    { kind: 'orientation', value: 'left', pairs: [['x', 'y']] },
    { kind: 'align', value: 'horizontal', pairs: [['p', 'q']] },
  ];
  let got = null;
  generalize(groups, data, { synthesize: (pairs) => { got = pairs; return null; } });
  check('a tie goes to the alignment',
    got && got.flat().includes('p'), got && JSON.stringify(got));
}

// ── a synthesized selector is not a transposed name ─────────────────────────
//
// `~R` and `R` denote transposed sets, so `@orientation(~R, [above])` can be
// rewritten as `@orientation(R, [below])`. That rewrite is only valid when `~`
// applies to the whole selector. Synthesis returns expressions where it does not.

{
  const data = dataFor(`p -> a : parentOf\np -> b : parentOf`);
  const group = { kind: 'orientation', value: 'below', pairs: [['a', 'b']] };

  // `~parentOf.parentOf` parses as `(~parentOf).parentOf` — siblings. Strip the
  // `~` and it becomes `parentOf.parentOf`, which is grandparents, and the
  // direction flips on top of that.
  const compound = explainGroup(group, data, { synthesize: () => '~parentOf.parentOf' });
  check('a compound synthesized selector is emitted unchanged',
    compound[0] && compound[0].selector === '~parentOf.parentOf',
    compound[0] && compound[0].line);
  check('and its direction is not reversed',
    compound[0] && compound[0].value === 'below', compound[0] && compound[0].line);

  // A synthesized *bare* transpose is still worth normalizing: there the `~`
  // really does apply to everything.
  const simple = explainGroup(group, data, { synthesize: () => '~parentOf' });
  check('a bare transpose is still normalized away',
    simple[0] && simple[0].selector === 'parentOf', simple[0] && simple[0].line);
  check('and that one does flip direction',
    simple[0] && simple[0].value === 'above', simple[0] && simple[0].line);
}

// ── merging into `directly*` is scored, not assumed ─────────────────────────

{
  // One selector, three pairs. The ordering holds on two of them and the
  // alignment holds on two — but not the same two, so the conjunction holds on
  // exactly one. Scoring the merge as min(2/3, 2/3) would clear the bar; the
  // truth is 1/3 and does not.
  const data = dataFor(`a -> b : r\nc -> d : r\ne -> f : r`);
  const groups = [
    { kind: 'orientation', value: 'below', pairs: [['a', 'b']] },
    { kind: 'align', value: 'vertical', pairs: [['a', 'b']] },
  ];
  const satisfied = [
    { kind: 'orientation', value: 'below', a: 'c', b: 'd' },   // ordering also holds here
    { kind: 'align', value: 'vertical', a: 'e', b: 'f' },      // alignment holds somewhere else
  ];
  const props = generalize(groups, data, { satisfied });
  const lines = props.map((p) => p.line);

  check('both halves are proposed on their own',
    lines.includes('@orientation(selector=r, directions=[below])')
      && lines.includes('@align(selector=r, direction=vertical)'), lines.join(' | '));
  check('but they do not merge when the conjunction is unsupported',
    !lines.some((l) => /directlyBelow/.test(l)), lines.join(' | '));
}

{
  // The same shape, with the two halves holding on the same pairs. Now the
  // conjunction really does hold, and the merged line is the better suggestion.
  const data = dataFor(`a -> b : r\nc -> d : r`);
  const groups = [
    { kind: 'orientation', value: 'below', pairs: [['a', 'b']] },
    { kind: 'align', value: 'vertical', pairs: [['a', 'b']] },
  ];
  const satisfied = [
    { kind: 'orientation', value: 'below', a: 'c', b: 'd' },
    { kind: 'align', value: 'vertical', a: 'c', b: 'd' },
  ];
  const props = generalize(groups, data, { satisfied });
  const directly = props.find((p) => /directlyBelow/.test(p.line));
  check('a supported conjunction still merges', !!directly, props.map((p) => p.line).join(' | '));
  check('and it is scored on the pairs where both hold',
    directly && directly.coverage === 1 && directly.covered === 1,
    directly && `coverage ${directly.coverage} covered ${directly.covered}`);
}

{
  // Nothing to synthesize for, nothing spent.
  const data = dataFor(`x -> y : rel\nz -> w : rel`);
  let called = 0;
  generalize(
    [{ kind: 'orientation', value: 'below', pairs: [['x', 'y'], ['z', 'w']] }],
    data,
    { synthesize: () => { called++; return null; } }
  );
  check('a named relation still spends nothing', called === 0, `called ${called} times`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
