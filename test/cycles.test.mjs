// Cycle abduction — cycles.js (arrangement → `@cyclic`). Run with `npm test`.
//
// Pure: no DOM, no renderer, no spytial-core. Positions are plain {id,x,y}.
//
// Screen coordinates throughout: x grows right, y grows DOWN. So going right →
// down → left → up is CLOCKWISE as drawn, and `atan2(y-cy, x-cx)` increases in
// that direction. Every expected direction below is what a person looking at the
// diagram would say.

import { parseGraph } from '../src/parse.js';
import { relationalize } from '../src/relationalize.js';
import {
  ringOrder, windingOf, detectCycles, proposeCycles, MIN_CYCLE_NODES,
} from '../src/cycles.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}

const dataFor = (src) => {
  const { atoms, relations } = relationalize(parseGraph(src));
  return { atoms, relations };
};
const lines = (ps) => ps.map((p) => p.line).join('\n     ');
const index = (nodes) => new Map(nodes.map((n) => [n.id, n]));

// A square, centred at (500,500). Clockwise on screen from 3 o'clock.
const SQUARE = {
  a: { id: 'a', x: 600, y: 500 },   // right   — 3 o'clock
  b: { id: 'b', x: 500, y: 600 },   // below   — 6 o'clock
  c: { id: 'c', x: 400, y: 500 },   // left    — 9 o'clock
  d: { id: 'd', x: 500, y: 400 },   // above   — 12 o'clock
};
const square = () => Object.values(SQUARE).map((n) => ({ ...n }));

// Five points evenly spaced on a circle of radius 100, same centre.
const PENT = [
  { id: 'p0', x: 600.0000, y: 500.0000 },
  { id: 'p1', x: 530.9017, y: 595.1057 },
  { id: 'p2', x: 419.0983, y: 558.7785 },
  { id: 'p3', x: 419.0983, y: 441.2215 },
  { id: 'p4', x: 530.9017, y: 404.8943 },
];

// ── ringOrder: the structural half ──────────────────────────────────────────

{
  const closed = ringOrder([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]);
  check('a closed 4-ring is a ring', !!closed && closed.closed === true);
  check('the ring is walked in relation order',
    !!closed && closed.order.join('') === 'abcd', closed && closed.order.join(''));

  const open = ringOrder([['a', 'b'], ['b', 'c'], ['c', 'd']]);
  check('an open path also qualifies', !!open && open.closed === false);
  check('the path starts where nothing points',
    !!open && open.order[0] === 'a', open && open.order.join(''));

  check('a 3-ring is too small to be a claim',
    ringOrder([['a', 'b'], ['b', 'c'], ['c', 'a']]) === null);
  check('MIN_CYCLE_NODES is 4', MIN_CYCLE_NODES === 4);

  check('a branch is not a traversal',
    ringOrder([['a', 'b'], ['a', 'c'], ['c', 'd'], ['d', 'e']]) === null);
  check('a merge is not a traversal',
    ringOrder([['a', 'c'], ['b', 'c'], ['c', 'd'], ['d', 'e']]) === null);
  check('a self-loop is not a traversal',
    ringOrder([['a', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'd']]) === null);

  check('two disjoint rings are not one ring',
    ringOrder([['a', 'b'], ['b', 'a'], ['c', 'd'], ['d', 'e'], ['e', 'c']]) === null);
  check('a ring plus a stray path is not one ring',
    ringOrder([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['w', 'x'], ['x', 'y']]) === null);

  check('a repeated tuple is not a branch',
    ringOrder([['a', 'b'], ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]) !== null);
}

// ── windingOf: the geometric half ───────────────────────────────────────────

{
  const byId = index(square());

  const cw = windingOf(['a', 'b', 'c', 'd'], byId);
  check('right → down → left → up reads as clockwise',
    !!cw && cw.direction === 'clockwise', cw && cw.direction);
  check('a full turn is a full turn',
    !!cw && Math.abs(Math.abs(cw.sweep) - 2 * Math.PI) < 1e-9, cw && String(cw.sweep));

  const ccw = windingOf(['a', 'd', 'c', 'b'], byId);
  check('the same square walked backwards is counterclockwise',
    !!ccw && ccw.direction === 'counterclockwise', ccw && ccw.direction);

  // A ring is a ring at any zoom. Yiliang's version used a 100px constant here,
  // which silently stops holding when the diagram is scaled.
  const big = index(square().map((n) => ({ ...n, x: n.x * 10, y: n.y * 10 })));
  const scaled = windingOf(['a', 'b', 'c', 'd'], big);
  check('the radius test is scale-relative',
    !!scaled && scaled.direction === 'clockwise' && Math.abs(scaled.radiusSpread) < 1e-9);

  const row = index([
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 },
    { id: 'c', x: 200, y: 0 }, { id: 'd', x: 300, y: 0 },
  ]);
  check('a straight row is not a ring', windingOf(['a', 'b', 'c', 'd'], row) === null);

  const lopsided = index([...square().slice(0, 3), { id: 'd', x: 5000, y: 400 }]);
  check('one node flung far out is not a ring',
    windingOf(['a', 'b', 'c', 'd'], lopsided) === null);

  const stacked = index([
    { id: 'a', x: 5, y: 5 }, { id: 'b', x: 5, y: 5 },
    { id: 'c', x: 5, y: 5 }, { id: 'd', x: 5, y: 5 },
  ]);
  check('four nodes at one point are not a ring',
    windingOf(['a', 'b', 'c', 'd'], stacked) === null);

  const pent = index(PENT);

  // A pentagram visits all five points at a constant radius and turns
  // monotonically — but twice round, so it is not this ring.
  const star = windingOf(['p0', 'p2', 'p4', 'p1', 'p3'], pent);
  check('a pentagram winds twice and is rejected', star === null);

  // Passes the sweep test (exactly one turn) but backtracks on the way.
  const zigzag = windingOf(['p0', 'p2', 'p1', 'p3', 'p4'], pent);
  check('a zigzag that still totals one turn is rejected', zigzag === null);
  {
    // Guard the guard: the case above is only interesting if it is the
    // monotonicity test that catches it, not the sweep test.
    const loose = windingOf(['p0', 'p2', 'p1', 'p3', 'p4'], pent, { minMonotonicity: 0 });
    check('...and it is monotonicity, not sweep, that rejects it',
      !!loose && Math.abs(Math.abs(loose.sweep) - 2 * Math.PI) < 1e-6, loose && String(loose.sweep));
  }

  const clean = windingOf(['p0', 'p1', 'p2', 'p3', 'p4'], pent);
  check('the pentagon in order is a clockwise ring',
    !!clean && clean.direction === 'clockwise' && clean.monotonicity > 0.99);

  check('a node with no position is not a ring',
    windingOf(['a', 'b', 'c', 'nowhere'], byId) === null);
}

// ── detectCycles: structure and geometry together ───────────────────────────

const RING_SRC = `a -> b : next
b -> c : next
c -> d : next
d -> a : next`;

{
  const data = dataFor(RING_SRC);
  const found = detectCycles(square(), data);
  const sels = found.map((f) => f.selector);

  check('the named relation is found', sels.includes('next'), sels.join(','));
  check('so is the all-edges relation', sels.includes('_links'), sels.join(','));
  check('and the transpose', sels.includes('~next'), sels.join(','));
  check('the named ring is clockwise',
    found.find((f) => f.selector === 'next').direction === 'clockwise');
  check('the transposed ring runs the other way',
    found.find((f) => f.selector === '~next').direction === 'counterclockwise');

  // The same four nodes in a row: the relation is unchanged, the drawing is not.
  const row = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, x: 100 * i, y: 0 }));
  check('structure alone is not enough', detectCycles(row, data).length === 0);
}

{
  // Structure alone, the other way round: four nodes drawn on a perfect circle,
  // but the relation connecting them branches.
  const data = dataFor(`a -> b : next
a -> c : next
c -> d : next`);
  check('geometry alone is not enough', detectCycles(square(), data).length === 0);
}

{
  // An open path whose nodes were placed around a circle. Core arranges a
  // fragment on a circle whether or not it closes, so this is a real ring.
  const data = dataFor(`a -> b : step
b -> c : step
c -> d : step`);
  const found = detectCycles(square(), data);
  const step = found.find((f) => f.selector === 'step');
  check('a path drawn as a ring is a ring', !!step && step.closed === false);
  check('an open path still reads clockwise', !!step && step.direction === 'clockwise');
}

// ── proposeCycles: what the user actually demonstrated ──────────────────────

// The ring, plus an unrelated edge so that `_links` is not itself a traversal.
const MIXED_SRC = `${RING_SRC}
x -> y : other`;

const OFFSIDE = [{ id: 'x', x: 2000, y: 2000 }, { id: 'y', x: 2100, y: 2000 }];
const mixed = () => [...square(), ...OFFSIDE.map((n) => ({ ...n }))];
const inARow = () => [
  ...['a', 'b', 'c', 'd'].map((id, i) => ({ id, x: 100 * i, y: 0 })),
  ...OFFSIDE.map((n) => ({ ...n })),
];

{
  const data = dataFor(MIXED_SRC);
  const ps = proposeCycles(mixed(), inARow(), data, { marks: new Set(['a']) });

  check('a demonstrated ring is proposed', ps.length === 1, lines(ps));
  check('and it is the line a person would type',
    ps[0] && ps[0].line === '@cyclic(selector=next, direction=clockwise)', ps[0] && ps[0].line);
  check('`next` and `~next` collapse to one suggestion', ps.length === 1, lines(ps));
  check('the named relation wins over the transpose',
    ps[0] && ps[0].source === 'relation', ps[0] && ps[0].source);
  check('the ring reports its members',
    ps[0] && ps[0].members.join('') === 'abcd', ps[0] && ps[0].members.join(''));
  check('accepting it credits every member',
    ps[0] && new Set(ps[0].coveredPairs.flat()).size === 4);
}

{
  const data = dataFor(MIXED_SRC);
  // The solver already drew the ring. Nothing was demonstrated.
  const ps = proposeCycles(mixed(), mixed(), data, { marks: new Set(['a']) });
  check('a ring the solver already drew is not evidence', ps.length === 0, lines(ps));
}

{
  const data = dataFor(MIXED_SRC);
  // Same ring, opposite sense. Turning a ring inside out is a demonstration.
  const flipped = mixed().map((n) => (n.id === 'b' || n.id === 'd' ? { ...n, y: 1000 - n.y } : n));
  const ps = proposeCycles(flipped, mixed(), data, { marks: new Set(['b']) });
  check('reversing a ring is a demonstration', ps.length === 1, lines(ps));
  check('and the reversal is reported',
    ps[0] && ps[0].value === 'counterclockwise', ps[0] && ps[0].value);
}

{
  const data = dataFor(MIXED_SRC);
  const ps = proposeCycles(mixed(), inARow(), data, { marks: new Set(['x']) });
  check('a ring nobody touched is not proposed', ps.length === 0, lines(ps));

  // One node dragged into place completes a ring of four; the other three never
  // moved. Requiring every member to be marked would miss exactly this.
  const one = proposeCycles(mixed(), inARow(), data, { marks: new Set(['d']) });
  check('one touched member is enough', one.length === 1, lines(one));
}

{
  const data = dataFor(MIXED_SRC);
  const ps = proposeCycles(mixed(), null, data, {});
  check('with no baseline and no marks, the ring still reads', ps.length === 1, lines(ps));
}

{
  check('no data means no proposals',
    proposeCycles(square(), null, null, {}).length === 0);
  check('an empty arrangement means no proposals',
    proposeCycles([], null, dataFor(RING_SRC), {}).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
