// Conformance cases: a spytial-gdl source, and the spatial facts its compiled
// spec has to entail.
//
// Each case is written as notation, not as a datum and a spec — those are what
// spytial-gdl *produces*, so writing them by hand would test a transcription
// rather than the pipeline. test/conformance.test.mjs runs each `gdl` through
// compileSpytialGdl and hands the result to spytial-core's harness.
//
// The assertions are about entailment, not about a drawing. `must.rightOf(A)`
// means "every layout this spec permits puts these to A's right", so a case
// stays true across renderers, machines, and core releases. Nothing here checks
// a coordinate, and nothing here needs a browser.
//
// The negative assertions matter as much as the positive ones. A spec that
// constrains less than its author thought still draws a plausible picture; the
// only thing that catches it is asking what the spec does *not* say.
//
// Every node is given an explicit `:::Sort`, so the harness's datum check runs
// on all of these rather than being switched off. A plain `A` relationalizes to
// the empty type on purpose (see relationalize.js) and core's datum check
// rejects that — a disagreement conformance.test.mjs pins directly rather than
// papering over here.

export const CASES = [
  {
    name: 'a labeled chain runs left to right, all the way down',
    gdl: `
      a:::Node -> b:::Node : next
      b -> c:::Node : next
      @orientation(selector=next, directions=[right])
    `,
    assertions: [
      {
        query: 'must.rightOf(a)', equals: ['b', 'c'],
        because: 'orientation is transitive, so the whole tail is right of the head',
      },
      {
        query: 'must.above(a)', empty: true,
        because: 'the spec orders horizontally only — nothing fixes the vertical axis',
      },
      { query: 'nodes()', count: 3 },
    ],
  },

  {
    name: 'an unlabeled edge is still selectable through _links',
    gdl: `
      a:::Node -> b:::Node
      b -> c:::Node
      @orientation(selector=_links, directions=[below])
    `,
    assertions: [
      {
        query: 'must.below(a)', equals: ['b', 'c'],
        because: '_links holds every edge, so it constrains the unlabeled ones too',
      },
      {
        query: 'must.rightOf(a)', empty: true,
        because: 'ordering vertically says nothing about the horizontal axis',
      },
    ],
  },

  {
    name: '_links reaches edges that carry different labels',
    gdl: `
      a:::Node -> b:::Node : hit
      b -> c:::Node : miss
      @orientation(selector=_links, directions=[right])
    `,
    assertions: [
      {
        query: 'must.rightOf(a)', equals: ['b', 'c'],
        because: 'one selector covers both relations, which is what _links is for',
      },
    ],
  },

  {
    name: 'a two-way tree does not order the subtrees against each other',
    // The case worth reading. It is natural to assume the left subtree ends up
    // left of the root, and it does not: `ll` is constrained against `l` and
    // against nothing else, so a layout that puts it right of the root satisfies
    // the spec. A rendered picture usually hides this. `must` does not.
    gdl: `
      root:::Node -> l:::Node : left
      root -> r:::Node : right
      l -> ll:::Node : left
      l -> lr:::Node : right
      @orientation(selector=left, directions=[left, below])
      @orientation(selector=right, directions=[right, below])
    `,
    assertions: [
      {
        query: 'must.leftOf(root)', contains: ['l'],
        because: 'the root is joined to its own left child directly',
      },
      {
        query: 'must.leftOf(root)', excludes: ['lr'],
        because: 'lr is placed against l only, so the spec permits it right of the root',
      },
      {
        query: 'must.below(root)', contains: ['l', 'r', 'll', 'lr'],
        because: 'every edge also orders vertically, and that part is transitive',
      },
    ],
  },

  {
    name: 'a class becomes a group holding exactly its members',
    // The regression test for the bug this suite found: `@group(selector=…)`
    // with no name compiled to a spec core's parser threw on, which failed the
    // whole diagram. This case could not be written at all until that was fixed.
    gdl: `
      a:::Node -> b:::Node
      c:::Node -> d:::Node
      class a,b home
      class c,d away
      @group(selector=home, name=Home)
      @group(selector=away, name=Away)
    `,
    assertions: [
      { query: 'groups()', count: 2, because: 'one group per class, and no more' },
      { query: 'grouped(a, b)', nonEmpty: true, because: 'a and b share the home class' },
      {
        query: 'grouped(a, c)', empty: true,
        because: 'no group holds both — the classes are what separates them',
      },
    ],
  },

  {
    name: 'a node named by several edges stays one atom',
    // The relationalizer bug no datum check can catch: both the right answer and
    // the wrong one are well-formed graphs. Only counting says which you got.
    gdl: `
      a:::Node -> shared:::Node
      b:::Node -> shared
      c:::Node -> shared
      @orientation(selector=_links, directions=[right])
    `,
    assertions: [
      {
        query: 'nodes()', count: 4,
        because: 'shared is written four times and is still one atom',
      },
      { query: 'must.rightOf(a)', equals: ['shared'] },
    ],
  },

  {
    name: 'align fixes one axis and leaves the other free',
    gdl: `
      a:::Node -> b:::Node : row
      b -> c:::Node : row
      @align(selector=row, direction=horizontal)
    `,
    assertions: [
      {
        query: 'must.aligned.y(a)', contains: ['b', 'c'],
        because: 'a horizontal alignment puts them on one row',
      },
      {
        query: 'must.leftOf(a)', empty: true,
        because: 'aligning says they share a row, not what order they sit in',
      },
      {
        query: 'must.rightOf(a)', empty: true,
        because: 'the same in the other direction — align is not an ordering',
      },
    ],
  },

  {
    name: 'all three modalities agree about a one-way constraint',
    gdl: `
      a:::Node -> b:::Node : next
      @orientation(selector=next, directions=[right])
    `,
    assertions: [
      { query: 'must.rightOf(a)', equals: ['b'] },
      {
        query: 'cannot.leftOf(a)', contains: ['b'],
        because: 'forcing b right of a rules out every layout with b to its left',
      },
      {
        query: 'can.leftOf(a)', excludes: ['b'],
        because: 'can is the complement of cannot, so b must not appear here',
      },
    ],
  },

  {
    name: 'cyclic puts every atom of the fragment in the cycle, and orders none of them',
    gdl: `
      a:::Node -> b:::Node : ring
      b -> c:::Node : ring
      c -> a : ring
      @cyclic(selector=ring)
    `,
    assertions: [
      { query: 'cyclic(a)', equals: ['a', 'b', 'c'], because: 'the whole fragment is in the cycle, a included' },
      {
        query: 'must.rightOf(a)', empty: true,
        because: 'a cycle fixes membership, not rotation — no pair is ordered',
      },
      { query: 'must.below(a)', empty: true, because: 'the same on the vertical axis' },
    ],
  },

  {
    name: 'a two-atom cycle still counts as one',
    // A judgement core settled deliberately while building this query: cyclic()
    // is grounded in the selected fragment, so a two-atom ring counts even
    // though drawing it needs no extra constraint. Nothing forces that reading —
    // "a cycle needs three" is just as defensible — so it is pinned here.
    gdl: `
      a:::Node -> b:::Node : ring
      b -> a : ring
      @cyclic(selector=ring)
    `,
    assertions: [
      { query: 'cyclic(a)', equals: ['a', 'b'], because: 'two atoms are a cycle, however little it takes to draw' },
    ],
  },

  {
    name: 'hideAtom removes an atom, and says so',
    gdl: `
      a:::Node -> b:::Node
      c:::Node -> a
      @hideAtom(selector=c)
    `,
    assertions: [
      { query: 'hidden()', equals: ['c'], because: 'hidden() reports exactly what a hideAtom selector removed' },
      { query: 'nodes()', equals: ['a', 'b'], because: 'and the atom is gone from the layout' },
    ],
  },

  {
    name: 'hideDisconnected drops an atom without it being hidden()',
    // The distinction core's docs call out: an atom can be missing from nodes()
    // for reasons other than hideAtom, and hidden() reports only the latter. If
    // these two ever start agreeing, one of them changed meaning.
    gdl: `
      a:::Node -> b:::Node
      lonely:::Node
      @flag(name=hideDisconnected)
    `,
    assertions: [
      { query: 'nodes()', equals: ['a', 'b'], because: 'the disconnected atom is not drawn' },
      {
        query: 'hidden()', empty: true,
        because: 'no hideAtom selector removed it, so hidden() does not claim it',
      },
    ],
  },

  {
    name: 'size applies to what its selector names and nothing else',
    // Deliberately not 100x60: core auto-sizes short-label nodes to exactly
    // that, so querying those numbers would match atoms no size constraint
    // touched and the case would pass without meaning anything.
    gdl: `
      a:::Node -> b:::Node
      @size(selector=a, width=222, height=144)
    `,
    assertions: [
      { query: 'sized(222, 144)', equals: ['a'], because: 'only the selected atom was asked for that box' },
      { query: 'nodes()', count: 2, because: 'sizing draws no extra atoms and removes none' },
    ],
  },

  {
    name: 'hideField stops an edge being drawn, and keeps both endpoints',
    gdl: `
      a:::Node -> b:::Node : next
      @hideField(field=next)
    `,
    assertions: [
      { query: 'edges(a, b)', empty: true, because: 'the relation is hidden from drawing' },
      { query: 'nodes()', equals: ['a', 'b'], because: 'hiding the edge does not hide what it joined' },
    ],
  },

  {
    name: 'inferredEdge draws a link the data does not contain',
    gdl: `
      a:::Node -> b:::Node : next
      b -> c:::Node : next
      @inferredEdge(name=skips, selector='{x, y : Node | y in x.next.next}')
    `,
    assertions: [
      {
        query: 'edges(a, c)', nonEmpty: true,
        because: 'a and c are two hops apart and joined by no tuple, so this edge is the directive\'s doing',
      },
      { query: 'nodes()', count: 3, because: 'inferring an edge invents no atoms' },
    ],
  },

  {
    name: 'a directive constrains nothing',
    // Style belongs to `directives`, and the section split is generated rather
    // than transcribed (src/_spec-tables.js). This is the entailment side of
    // that: a spec of nothing but directives has to leave the layout free.
    gdl: `
      a:::Node -> b:::Node : next
      @edgeStyle(field=next, lineStyle(color=crimson))
      @atomStyle(selector=Node, fillStyle(color=beige))
    `,
    assertions: [
      { query: 'must.rightOf(a)', empty: true },
      { query: 'must.leftOf(a)', empty: true },
      { query: 'must.above(a)', empty: true },
      { query: 'must.below(a)', empty: true },
      { query: 'nodes()', count: 2, because: 'styling draws no extra atoms' },
    ],
  },
];
