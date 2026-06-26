# Annotations

*Spatial operations, inline, one per line. Annotations are the layout.*

There is no `TD`/`LR` keyword in spytial-graph. Every layout and styling decision
is an `@annotation` — a one-line operation that targets a [selector](selectors.md)
and applies a constraint or a directive. A single block of text fully describes
both the graph and how it should be drawn.

## Anatomy

```text
@name(arg=value, arg2=[a, b], …)
```

- **One per line.** An annotation occupies its own line, anywhere in the block
  (convention: after the graph).
- **Arguments are `key=value`,** comma-separated.
- **Values** are barewords (`below`), quoted strings (`'left subtree'`), numbers
  (`3`, `3.5`), lists (`[below, left]`), or a quoted comprehension
  (`'{x: Person | …}'`). Lists may nest.

Two kinds: **constraints** shape layout; **directives** style. They differ only in
which bucket they compile to — the value syntax is identical.

## Constraints (layout)

| constraint | effect |
|---|---|
| `orientation` | place each edge's target relative to its source |
| `align` | line the endpoints of a relation up on an axis (horizontal/vertical) |
| `cyclic` | arrange a cycle as a ring |
| `group` | draw a labeled region around a set of nodes |

### orientation

The workhorse. `directions` is a list of one or more of `above`, `below`, `left`,
`right`, applied to every edge in the selector (target relative to source):

```spytial-graph
A -> B : left
A -> C : right
B -> D
C -> E

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

Stacking directions combines them — `[below, right]` puts the target down-and-to-the-right.

### cyclic

Arrange the nodes of a cycle as a ring. `direction` is `clockwise` or
`counterclockwise`:

```spytial-graph
A -> B
B -> C
C -> D
D -> A

@cyclic(selector=_links, direction=clockwise)
```

### group

Draw a labeled region around the nodes a selector matches. `name` is the region's
caption:

```spytial-graph
api -> db : reads
web -> api : calls

class api,db backend
class web frontend

@group(selector=backend, name='Backend')
@group(selector=frontend, name='Frontend')
@orientation(selector=_links, directions=[below])
```

### align

Line the two endpoints of each edge in a relation up on a shared axis. `direction`
is `horizontal` or `vertical`. Unlike `group`, `align` takes a **binary (edge)
selector** — it aligns *pairs*, not a node set:

```spytial-graph
a -> b : sib
b -> c : sib
c -> d : sib

@align(selector=sib, direction=horizontal)
```

Each `sib` edge keeps its source and target on the same horizontal line, so the
whole chain settles into a row.

## Directives (styling)

| directive | what it does |
|---|---|
| `atomColor` | fill color of matching nodes — `value='#rrggbb'` |
| `edgeColor` | color of matching edges — `value='#rrggbb'` |
| `size` | sizing of matching nodes |
| `icon` | render matching nodes with an icon |
| `attribute` | show a field as a node attribute instead of an edge |
| `hideField` | hide a relation from drawing (still selectable) |
| `hideAtom` | hide matching nodes |
| `inferredEdge` | draw a derived/virtual edge |
| `tag` | annotate nodes with a tag |
| `flag` | a layout flag, e.g. `flag(name=hideDisconnected)` |
| `projection` | project over a relation |

The common ones — color:

```spytial-graph
alice[Alice]:::Person -> acme[Acme]:::Company
bob[Bob]:::Person     -> acme

@atomColor(selector=Person, value='#cfe8d8')
@atomColor(selector=Company, value='#ffe7b3')
@edgeColor(selector=_links, value='#2d8659')
@orientation(selector=_links, directions=[left])
```

> **Note** — Directives map generically onto spytial-core's directive vocabulary:
> an annotation `@name(a=1, b=2)` compiles to `{ name: { a: 1, b: 2 } }`. The exact
> keyword arguments for `size`, `icon`, `attribute`, and friends are SpyTial
> directive kwargs; the [spytial-core](https://github.com/sidprasad/spytial-core)
> reference is authoritative for those. The four names above cover most diagrams.

## Mermaid-safe annotations

A `%%@name(...)` form is also accepted — a Mermaid comment guard — so a block
survives being pasted into a vanilla Mermaid renderer (which ignores `%%` lines)
while still compiling here:

```text
%% @orientation(selector=_links, directions=[below])
```

Both the bare `@…` and the guarded `%% @…` forms compile identically.

## When an annotation is wrong

Annotations are validated as they're lifted out of the source:

- **Unknown name** (`@orientaiton(...)`) or **malformed args** (a missing comma, a
  bad `key=value`) come back as `annotationErrors` — `[{ line, text, message }]` —
  and that line is dropped so it can't confuse the parser. The rest of the diagram
  still renders.
- A **selector that doesn't resolve** is a `selectorError` (see
  [Conflicts & UNSAT](conflicts.md#selector-errors)).
- A set of constraints that **can't all hold** draws the closest feasible layout
  plus the minimal conflict (the UNSAT core) — see
  [Conflicts & UNSAT](conflicts.md).

From the API, all three arrive on the result object from
[`renderSpytialGraph`](api.md#renderspytialgraph). In an embed, they surface in the
attached conflict panel.

## Composing with raw rules

Inline annotations are the primary authoring model, but they **compose** with two
lower-level inputs that feed the same layout spec: `opts.rules` (raw CnD YAML) and
the per-class `registerSpec` registry. All three are merged before solving. See
[Programmatic API → composing rules](api.md#composing-rules-registry-and-yaml).

## Next

- **[Selectors](selectors.md)** — what the `selector=` argument can name.
- **[Conflicts & UNSAT](conflicts.md)** — reading the panel when rules clash.
