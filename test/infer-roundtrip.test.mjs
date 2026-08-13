// The round trip that matters: spec → layout → spec.
//
//   1. take spytial-gdl source that carries @annotations
//   2. compile it through the REAL spytial-core pipeline to layout constraints
//   3. realize those constraints as concrete node positions
//   4. throw the annotations away, and hand the positions to inference as though
//      a user had arranged the diagram that way by hand
//   5. check the annotations come back
//
// The oracle is mechanical — the original annotations are the ground truth, and
// they were not written for this test — so there is no hand-authored reference to
// grade against and no way to quietly grade our own homework.
//
// WHY THIS DOES NOT USE core's `solveForPositions`. It exists, and it is the
// obvious choice, but it is a bare Kiwi solve with no separation objective: on
// the family tree below it puts `hindley` and `edgar` both at (0,0). Positions
// that satisfy the constraints but stack nodes on top of each other would make
// every pair read as "aligned", and the test would be exercising nothing. So the
// realizer here is a small layered one — the same shape as real hierarchical
// layout, where siblings share a row.
//
// WHY THAT IS NOT CIRCULAR. The realizer works from core's constraint objects
// (`{top,bottom}`, `{left,right}`, `{node1,node2,axis}`) and knows nothing about
// selectors or annotations. Inference works from bare coordinates and knows
// nothing about constraints. They meet only at real (x,y) numbers. A realizer
// bug — placing `top` below `bottom`, say — would make recovery return the
// opposite direction and fail the test rather than hide anything.
//
// AND IT IS GATED. Every realization is verified against the very constraints it
// came from before any recovery is asserted. A case whose realization does not
// verify is reported as skipped, never as passed, so this file cannot pass for
// the wrong reason.
//
// The second half of this file covers selector SYNTHESIS — the fallback for
// demonstrations no name in the source explains. It lives here because it needs
// the same spytial-core build.
//
// Needs a spytial-core build; skips cleanly (exit 0) without one.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGraph } from '../src/parse.js';
import { relationalize } from '../src/relationalize.js';
import { extractAnnotations } from '../src/annotations.js';
import { abduce } from '../src/abduce.js';
import { generalize, explainGroup } from '../src/generalize.js';
import { proposeCycles } from '../src/cycles.js';
import { makeSynthesizer, synthesisAvailable } from '../src/synthesize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// A sibling checkout first, so a core change can be tried here before it ships;
// the installed devDependency otherwise. With only the sibling to go on, this
// skipped on every CI run — none of the checks below had ever run there.
const CORE_DIRS = [
  resolve(__dirname, '../../spytial-core/dist'),
  resolve(__dirname, '../node_modules/spytial-core/dist'),
];
const BUNDLE_REL = 'browser/spytial-core-complete.global.js';
const CORE_DIR = CORE_DIRS.find((d) => existsSync(resolve(d, BUNDLE_REL))) ?? CORE_DIRS[0];

let pass = 0, fail = 0, skip = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.error(`FAIL    ${name}  ${extra}`); }
}
function note(msg) { skip++; console.log(`  skip  ${msg}`); }

const BUNDLE = resolve(CORE_DIR, BUNDLE_REL);
if (!existsSync(BUNDLE)) {
  console.log(`  skip  no spytial-core build at ${CORE_DIRS.join(' or ')} — run npm install.`);
  console.log('\n0 passed, 0 failed, 1 skipped');
  process.exit(0);
}

// The bundle registers custom elements on import and kicks off async work that
// has no DOM to land in; that rejection is expected under stubs and unrelated to
// the layout pipeline, which is fully synchronous.
process.on('unhandledRejection', () => {});

function loadCore() {
  const stub = () => ({
    style: {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, addEventListener() {}, attachShadow() { return stub(); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    setProperty() {}, removeProperty() {}, classList: { add() {}, remove() {} },
  });
  globalThis.window = globalThis;
  globalThis.document = { createElement: stub, createElementNS: stub, head: stub(), body: stub(), addEventListener() {} };
  globalThis.HTMLElement = class {};
  globalThis.customElements = { define() {}, get() { return undefined; } };
  globalThis.navigator = { userAgent: 'node' };
  (0, eval)(readFileSync(BUNDLE, 'utf8'));
  return globalThis.spytialcore;
}

let core = null;
try { core = loadCore(); }
catch (e) {
  console.log(`  skip  spytial-core not loadable under stubs (${e.message})`);
  console.log('\n0 passed, 0 failed, 1 skipped');
  process.exit(0);
}

// ── compile: source → layout constraints, through the real pipeline ─────────

function compile(src) {
  const { source, specYaml } = extractAnnotations(src);
  const { atoms, relations } = relationalize(parseGraph(source));
  const instance = new core.JSONDataInstance({ atoms, relations });
  const evaluator = new core.SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const spec = core.parseLayoutSpec(specYaml || '');
  const li = new core.LayoutInstance(spec, evaluator, 0, true, undefined, 'qualitative');
  const result = li.generateLayout(instance);
  return { data: { atoms, relations }, layout: result.layout, error: result.error };
}

// ── realize: constraints → positions ────────────────────────────────────────

const SPACING = 200;

// Which of the three constraint shapes this is, by the fields it carries.
const asTop = (c) => (c && c.top && c.bottom ? [c.top.id, c.bottom.id] : null);
const asLeft = (c) => (c && c.left && c.right ? [c.left.id, c.right.id] : null);
const asAlign = (c) => (c && c.node1 && c.node2 && c.axis ? [c.node1.id, c.node2.id, c.axis] : null);

function unionFind(ids) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  return { find, union };
}

// Longest-path layering: a node sits one level below the deepest thing that must
// precede it. Nodes with no ordering between them land on the same level, which
// is what keeps siblings in a row — the property the degenerate Kiwi solve
// destroys and the property inference needs in order to see a shared row at all.
function layer(ids, edges) {
  const succ = new Map(ids.map((id) => [id, []]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const [a, b] of edges) {
    if (!succ.has(a) || !succ.has(b)) continue;
    succ.get(a).push(b);
    indeg.set(b, indeg.get(b) + 1);
  }
  const level = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  let seen = 0;
  while (queue.length) {
    const n = queue.shift();
    seen++;
    for (const m of succ.get(n)) {
      level.set(m, Math.max(level.get(m), level.get(n) + 1));
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) queue.push(m);
    }
  }
  // A cycle in the ordering means the spec is unsatisfiable on this axis; the
  // caller's verification will catch it, so just report it rather than looping.
  return seen === ids.length ? level : null;
}

function realize(layout) {
  const ids = layout.nodes.map((n) => n.id);
  const constraints = layout.constraints || [];

  // Alignment first: aligned nodes share a coordinate, so they must be layered
  // as one unit rather than reconciled afterwards.
  const xf = unionFind(ids);   // same x  (axis 'x' — "vertically aligned")
  const yf = unionFind(ids);   // same y  (axis 'y' — "horizontally aligned")
  for (const c of constraints) {
    const a = asAlign(c);
    if (!a) continue;
    const [n1, n2, axis] = a;
    (axis === 'x' ? xf : yf).union(n1, n2);
  }

  const xEdges = [];
  const yEdges = [];
  for (const c of constraints) {
    const l = asLeft(c);
    if (l) { xEdges.push([xf.find(l[0]), xf.find(l[1])]); continue; }
    const t = asTop(c);
    if (t) yEdges.push([yf.find(t[0]), yf.find(t[1])]);
  }

  const xClasses = [...new Set(ids.map(xf.find))];
  const yClasses = [...new Set(ids.map(yf.find))];
  const xLevel = layer(xClasses, xEdges);
  const yLevel = layer(yClasses, yEdges);
  if (!xLevel || !yLevel) return null;

  const pos = new Map(ids.map((id) => [id, {
    id, x: xLevel.get(xf.find(id)) * SPACING, y: yLevel.get(yf.find(id)) * SPACING,
  }]));

  // Siblings — two children of one parent, say — share a row and have nothing
  // ordering them horizontally, so they get the same level and the same point.
  // The spec permits any horizontal order, so pick one: nudge them apart *within*
  // their level, by strictly less than the gap to the next level. Every Left
  // constraint compares different levels, so it still holds; a node whose x is
  // pinned by a multi-member alignment class is left alone.
  const xClassSize = new Map();
  for (const id of ids) {
    const r = xf.find(id);
    xClassSize.set(r, (xClassSize.get(r) || 0) + 1);
  }
  const cells = new Map();
  for (const p of pos.values()) {
    const key = `${p.x}|${p.y}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }
  for (const group of cells.values()) {
    if (group.length < 2) continue;
    const movable = group.filter((p) => xClassSize.get(xf.find(p.id)) === 1);
    const step = SPACING / (movable.length + 1);
    movable.forEach((p, k) => { p.x += k * step; });
  }

  // Two sets of nodes with no constraint between them get identical levels and
  // land on top of each other — two spouse pairs, say, each aligned internally
  // but unrelated to the other. Give every connected component its own band of
  // rows. A uniform translation of a whole component preserves every ordering
  // and alignment inside it (they are all relative), and there is nothing across
  // components to preserve, so this cannot invalidate the spec.
  const cf = unionFind(ids);
  for (const c of constraints) {
    const rel = asTop(c) || asLeft(c) || asAlign(c);
    if (rel) cf.union(rel[0], rel[1]);
  }
  const bands = [...new Set(ids.map(cf.find))];
  const bandIndex = new Map(bands.map((root, i) => [root, i]));
  const height = Math.max(...[...pos.values()].map((p) => p.y), 0) + SPACING;
  for (const p of pos.values()) p.y += bandIndex.get(cf.find(p.id)) * height;

  return [...pos.values()];
}

// ── verify: does the realization actually satisfy the spec it came from? ────

function verify(layout, positions) {
  const at = new Map(positions.map((p) => [p.id, p]));
  const problems = [];
  for (const c of layout.constraints || []) {
    const t = asTop(c);
    if (t) {
      const [a, b] = t.map((id) => at.get(id));
      if (!(a && b && a.y < b.y)) problems.push(`${t[0]} should be above ${t[1]}`);
      continue;
    }
    const l = asLeft(c);
    if (l) {
      const [a, b] = l.map((id) => at.get(id));
      if (!(a && b && a.x < b.x)) problems.push(`${l[0]} should be left of ${l[1]}`);
      continue;
    }
    const al = asAlign(c);
    if (al) {
      const [n1, n2, axis] = al;
      const [a, b] = [at.get(n1), at.get(n2)];
      const same = axis === 'x' ? a && b && a.x === b.x : a && b && a.y === b.y;
      if (!same) problems.push(`${n1}/${n2} should share ${axis}`);
    }
  }
  // Two nodes at one point would make every predicate about them meaningless.
  const seen = new Map();
  for (const p of positions) {
    const key = `${p.x}|${p.y}`;
    if (seen.has(key)) problems.push(`${seen.get(key)} and ${p.id} coincide`);
    seen.set(key, p.id);
  }
  return problems;
}

// ── the round trip ──────────────────────────────────────────────────────────

// `expect` is the annotation line(s) the recovery must produce. `directly*` is a
// legitimate strengthening — a layout in which children sit squarely below their
// parent satisfies both `[below]` and `[directlyBelow]` — so a case can name
// either form as acceptable.
const cases = [
  {
    name: 'parents above children',
    src: `mr_e -> hindley : parentOf
mr_e -> catherine : parentOf
hindley -> hareton : parentOf

@orientation(selector=parentOf, directions=[below])`,
    expect: [['@orientation(selector=parentOf, directions=[below])',
              '@orientation(selector=parentOf, directions=[directlyBelow])']],
  },
  {
    name: 'spouses on a line',
    src: `c -> e : spouse
e -> c : spouse
h -> i : spouse
i -> h : spouse

@align(selector=spouse, direction=horizontal)`,
    expect: [['@align(selector=spouse, direction=horizontal)']],
  },
  {
    name: 'a chain laid out left to right',
    src: `a -> b : next
b -> c : next
c -> d : next

@orientation(selector=next, directions=[right])`,
    expect: [['@orientation(selector=next, directions=[right])',
              '@orientation(selector=next, directions=[directlyRight])']],
  },
  {
    name: 'two relations, two rules',
    src: `p -> l : leftChild
p -> r : rightChild

@orientation(selector=leftChild, directions=[left])
@orientation(selector=rightChild, directions=[right])`,
    expect: [
      ['@orientation(selector=leftChild, directions=[left])',
       '@orientation(selector=leftChild, directions=[directlyLeft])'],
      ['@orientation(selector=rightChild, directions=[right])',
       '@orientation(selector=rightChild, directions=[directlyRight])'],
    ],
  },
  {
    name: 'every edge points down',
    src: `a -> b
b -> c
a -> d

@orientation(selector=_links, directions=[below])`,
    // `_links` and `_` denote the same set here (all edges are unlabeled), so
    // either name is a correct recovery.
    expect: [['@orientation(selector=_links, directions=[below])',
              '@orientation(selector=_links, directions=[directlyBelow])',
              '@orientation(selector=_, directions=[below])',
              '@orientation(selector=_, directions=[directlyBelow])']],
  },
];

for (const c of cases) {
  const { data, layout, error } = compile(c.src);
  if (!layout || error) { note(`${c.name} — spec did not solve (${error || 'no layout'})`); continue; }

  const positions = realize(layout);
  if (!positions) { note(`${c.name} — constraints could not be layered`); continue; }

  const problems = verify(layout, positions);
  if (problems.length) { note(`${c.name} — realization does not satisfy its own spec: ${problems.join('; ')}`); continue; }

  // No baseline and no marks: the user is taken to have arranged the whole
  // diagram deliberately, which is the strongest reading of a demonstration and
  // the one this test wants.
  const evidence = abduce(positions, {});
  const proposals = generalize(evidence.groups, data, { satisfied: evidence.satisfied });
  const got = proposals.map((p) => p.line);

  for (const accepted of c.expect) {
    check(`${c.name} — recovers ${accepted[0]}`,
      accepted.some((line) => got.includes(line)),
      `\n     got:\n     ${got.join('\n     ') || '(nothing)'}`);
  }
}

// ── selector synthesis: the demonstrations no name explains ─────────────────

check('synthesis is reachable through the core global', synthesisAvailable());

const instanceFor = (src) => {
  const { atoms, relations } = relationalize(parseGraph(src));
  return { data: { atoms, relations }, instance: new core.JSONDataInstance({ atoms, relations }) };
};

{
  // Siblings. There is no `sibling` relation to name — the set is a join against
  // a transpose, minus the identity — so the approximate pass has nothing to
  // offer and synthesis is the only way to explain the demonstration.
  const { data, instance } = instanceFor(`p -> a : parentOf\np -> b : parentOf`);
  const synthesize = makeSynthesizer(instance);
  check('a synthesizer can be built from a live data instance', typeof synthesize === 'function');

  const group = { kind: 'align', value: 'horizontal', pairs: [['a', 'b']] };

  check('no named selector explains aligning two siblings',
    explainGroup(group, data).length === 0,
    JSON.stringify(explainGroup(group, data).map((p) => p.line)));

  const withSynth = explainGroup(group, data, { synthesize });
  check('synthesis explains it', withSynth.length > 0);
  check('and the result is a derived expression, not a bare name',
    withSynth[0] && /[.~^]/.test(withSynth[0].selector), JSON.stringify(withSynth[0] && withSynth[0].line));
  check('tagged as synthesized so it can be ranked behind names',
    withSynth[0] && withSynth[0].source === 'synthesized');
}

{
  // Grandparents: a plain join. Orientation rather than alignment, so the target
  // is used in the order demonstrated.
  const { data, instance } = instanceFor(`g -> p : parentOf\np -> c : parentOf`);
  const group = { kind: 'orientation', value: 'below', pairs: [['g', 'c']] };
  const props = explainGroup(group, data, { synthesize: makeSynthesizer(instance) });
  check('synthesis reaches a grandparent join',
    props.length > 0 && /\./.test(props[0].selector), JSON.stringify(props.map((p) => p.line)));
}

{
  // Names must still win. Synthesis is a fallback, not a competitor: when a
  // relation in the source already explains the demonstration, the search must
  // not run at all — an exact expression would score a perfect 1.0 and outrank
  // the readable name the user actually wrote.
  const { data, instance } = instanceFor(`x -> y : rel\nz -> w : rel`);
  let called = 0;
  const counting = (pairs) => { called++; return makeSynthesizer(instance)(pairs); };
  const group = { kind: 'orientation', value: 'below', pairs: [['x', 'y'], ['z', 'w']] };
  const props = explainGroup(group, data, { synthesize: counting });
  check('a named relation explains it', props.some((p) => p.selector === 'rel'), JSON.stringify(props.map((p) => p.line)));
  check('and synthesis was never invoked', called === 0, `called ${called} times`);
}

{
  // Whatever synthesis returns has to survive the annotation parser — a
  // synthesized selector carries parentheses, `~`, `.` and spaces, none of which
  // a hand-written one usually does. A proposal that cannot be applied is worse
  // than no proposal.
  const { data, instance } = instanceFor(`p -> a : parentOf\np -> b : parentOf`);
  const group = { kind: 'align', value: 'horizontal', pairs: [['a', 'b']] };
  const props = explainGroup(group, data, { synthesize: makeSynthesizer(instance) });
  const line = props[0] && props[0].line;
  const { errors, specYaml } = extractAnnotations(line || '');
  check('a synthesized annotation parses', line && errors.length === 0,
    `${line} → ${JSON.stringify(errors)}`);
  check('and compiles to a layout spec', !!(specYaml && specYaml.includes('align')), specYaml);
  // The selector must survive intact: a bare unquoted value containing spaces
  // would be re-read as something else entirely.
  check('the derived selector survives the YAML round trip',
    specYaml && specYaml.includes('iden'), specYaml);
}

// ── cyclic: the same round trip, for the directive no pair can express ──────
//
// This section earns its keep by settling one question that reading the source
// cannot: whether core's "clockwise" and cycles.js's "clockwise" are the same
// word. Core compiles `@cyclic` by placing member i of the fragment at
// `(R cos θ, R sin θ)` with θ increasing, then reading those as screen
// coordinates — so for a 4-ring it emits `left(b,a)` and `top(a,b)`, putting the
// first member at 3 o'clock and the second at 6. cycles.js measures the turn
// with `atan2(y-cy, x-cx)`, which increases in that same direction because y
// runs downward. The two agree. If either side ever flips, the direction
// assertions below fail rather than the feature silently proposing rings that
// come back mirrored.

const cyclicCases = [
  {
    name: 'a clockwise ring',
    src: `a -> b : next
b -> c : next
c -> d : next
d -> a : next

@cyclic(selector=next, direction=clockwise)`,
    expect: '@cyclic(selector=next, direction=clockwise)',
  },
  {
    name: 'a counterclockwise ring',
    src: `a -> b : next
b -> c : next
c -> d : next
d -> a : next

@cyclic(selector=next, direction=counterclockwise)`,
    expect: '@cyclic(selector=next, direction=counterclockwise)',
  },
  {
    name: 'a five-node ring',
    src: `a -> b : next
b -> c : next
c -> d : next
d -> e : next
e -> a : next

@cyclic(selector=next, direction=clockwise)`,
    expect: '@cyclic(selector=next, direction=clockwise)',
  },
  {
    name: 'an open path arranged as a ring',
    src: `a -> b : step
b -> c : step
c -> d : step

@cyclic(selector=step, direction=clockwise)`,
    expect: '@cyclic(selector=step, direction=clockwise)',
  },
];

for (const c of cyclicCases) {
  const { data, layout, error } = compile(c.src);
  if (!layout || error) { note(`${c.name} — spec did not solve (${error || 'no layout'})`); continue; }

  const positions = realize(layout);
  if (!positions) { note(`${c.name} — constraints could not be layered`); continue; }

  const problems = verify(layout, positions);
  if (problems.length) { note(`${c.name} — realization does not satisfy its own spec: ${problems.join('; ')}`); continue; }

  const got = proposeCycles(positions, null, data, {}).map((p) => p.line);
  check(`${c.name} — recovers ${c.expect}`, got.includes(c.expect),
    `\n     got:\n     ${got.join('\n     ') || '(nothing)'}`);
}

{
  // The false-positive guard, on real solver output rather than hand-placed
  // points. A chain laid out left to right is four nodes and three edges, and
  // four points are nearly always near *some* circle — so an arrangement that
  // was never a ring must not read as one.
  const { data, layout, error } = compile(`a -> b : next
b -> c : next
c -> d : next

@orientation(selector=next, directions=[right])`);
  if (!layout || error) { note(`a chain is not a ring — spec did not solve`); }
  else {
    const positions = realize(layout);
    if (!positions) note('a chain is not a ring — constraints could not be layered');
    else {
      const got = proposeCycles(positions, null, data, {}).map((p) => p.line);
      check('a chain laid out by the solver is not a ring', got.length === 0,
        `\n     got:\n     ${got.join('\n     ')}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
