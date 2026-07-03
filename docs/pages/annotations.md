# Annotations

*Spatial operations, written inline. Annotations are the layout.*

There is no `TD`/`LR` keyword in spytial-gdl. Every layout and styling decision
is an `@annotation` — a one-line operation that targets a [selector](notation.md#selectors)
and applies a constraint or a directive. A single block of text fully describes
both the graph and how it should be drawn.

## Anatomy

```text
@name(arg=value, arg2=[a, b], …)
```

- **One annotation per statement,** anywhere in the block (convention: after the
  graph). It usually fits on one line, but the arguments may **wrap across lines**
  up to the closing `)` — handy for long lists:

  ```text
  @orientation(
    selector=left,
    directions=[left],
  )
  ```

  A trailing comma before the `)` is fine, as is a trailing `;` or `%%` comment.
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

```spytial-gdl
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

```spytial-gdl
A -> B
B -> C
C -> D
D -> A

@cyclic(selector=_links, direction=clockwise)
```

### group

Draw a labeled region around the nodes a selector matches. `name` is the region's
caption:

```spytial-gdl
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

```spytial-gdl
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

```spytial-gdl
alice[Alice]:::Person -> acme[Acme]:::Company
bob[Bob]:::Person     -> acme

@atomColor(selector=Person, value='#cfe8d8')
@atomColor(selector=Company, value='#ffe7b3')
@edgeColor(selector=_links, value='#2d8659')
@orientation(selector=_links, directions=[left])
```

> **Note** — Directives map generically onto spytial-core's directive vocabulary:
> an annotation `@name(a=1, b=2)` compiles to `{ name: { a: 1, b: 2 } }`. The exact
> keyword arguments for `size`, `icon`, `attribute`, and friends are Spytial
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

## Errors and conflicts

Every failure has a distinct home. Source problems are caught before layout runs;
selectors that name nothing are reported apart from layouts that can't hold. The
diagram renders best-effort at every stage, and an embed surfaces each kind in its
own panel.

### Parse and annotation errors

Earliest of all: problems in the *source text*, before any layout runs. Two kinds,
both caught up front and both reported with line numbers:

- **Annotation errors** — an annotation that doesn't parse (unknown `@name`, a
  missing comma, an unterminated `(`). Come back as `annotationErrors` —
  `[{ line, text, message }]`; the offending annotation is dropped.
- **Parse errors** — a graph line the parser flagged. `parseErrors` —
  `[{ line, text, severity, message }]`. `severity: 'error'` is a line it couldn't
  read (a broken edge, junk); `severity: 'warning'` is a tolerated-but-ignored
  Mermaid construct (a `graph`/`flowchart` header, `classDef`).

Both are **non-fatal**: the diagram still renders best-effort, and an embed shows a
**⚠ … in this source** band beneath it listing each problem by line. So the four
stages are distinct, easy to tell apart:

| stage | failure | result field | embed panel |
|---|---|---|---|
| parse graph | bad line / ignored Mermaid | `parseErrors` | ⚠ … in this source |
| lift annotations | bad `@name` / args | `annotationErrors` | ⚠ … in this source |
| resolve selectors | `selector=` matches nothing | `selectorErrors` | ⚠ A selector didn't resolve |
| solve constraints | rules can't all hold | `error` (UNSAT core) | ⚠ These rules can't all hold |

### Selector errors

A different failure: a `selector=` that doesn't resolve to anything in the model
(a typo'd label, a class you never assigned). That's **not** a layout conflict — the
spec itself is malformed — so it's reported separately as `selectorErrors`, and the
degenerate layout is *not* drawn:

```js
const r = await renderSpytialGdl(graph, source);
if (r.selectorErrors.length) {
  // e.g. selector 'lft' didn't match any edges or nodes
}
```

In an embed this is the **⚠ A selector didn't resolve** panel. Fix the selector to
one of the [five forms](notation.md#the-built-in-selectors) and it resolves.

### When constraints conflict

Because layout is a set of constraints, you can ask for the impossible: two edges
that must both point right *and* form a cycle, a group that must enclose nodes
pulled apart by an orientation, and so on. Spytial treats this as a first-class
outcome, not a crash.

When the constraints can't all hold, the solver returns the **closest feasible
layout** — it still draws something useful — together with the **minimal conflict**:
the smallest subset of rules that, taken together, are unsatisfiable. That subset
is the *Irreducible Inconsistent Subsystem* (IIS), commonly called the UNSAT core.

This block asks two opposing edges of a 2-cycle to both go right — impossible:

```spytial-gdl
A -> B : x
B -> A : y

@orientation(selector=x, directions=[right])
@orientation(selector=y, directions=[right])
```

The diagram still renders a best-effort layout, and the attached **⚠ These rules
can't all hold** panel (expand it under the diagram) names exactly the constraints
in tension — not the whole spec, just the irreducible core.

### Reading it in an embed

Every embed reserves space for the conflict *inside the diagram's border*, so the
report obviously belongs to that diagram and not the surrounding prose:

- The panel only appears when there's a clash; it's collapsible.
- In an [editable block](embedding.md#editable-diagrams), it's **live** — resolve the clash (delete an
  offending edge, change a direction) and the panel clears on the spot.

The report is rendered by spytial-core's own IIS component — the same one the
[playground](../playground/) mounts — lazy-loaded the first time a clash appears, so
conflict-free pages never pay for it.

### Reading it from the API

[`renderSpytialGdl`](embedding.md#renderspytialgdl) surfaces the same information on
its result object:

```js
const r = await renderSpytialGdl(graph, source);
if (r.error) {
  // r.error — the constraint conflict (UNSAT core / positional / group-overlap)
  console.warn('layout conflict:', r.error.message);
}
// r.layout is still the best-feasible counterfactual; r.applied tells you if it drew.
```

`error` carries a shape that depends on the kind of clash — positional conflicts
carry `errorMessages`, group overlaps carry `overlappingNodes`/`source`, and so on.
The Markdown layer maps these onto spytial-core's `show*Error` dispatch to render
the panel; if you build your own UI, branch on those fields the same way.

## Composing with raw rules

Inline annotations are the primary authoring model, but they **compose** with two
lower-level inputs that feed the same layout spec: `opts.rules` (raw CnD YAML) and
the per-class `registerSpec` registry. All three are merged before solving. See
[Programmatic API → composing rules](embedding.md#composing-rules-registry-and-yaml).

## Next

- **[Embedding & API](embedding.md)** — put the diagram in a page, or drive it from JavaScript.
- **[The notation](notation.md)** — where selectors come from.
