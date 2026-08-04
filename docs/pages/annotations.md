# Annotations

How to write the layout: the `@` operations and the arguments they take.

There is no `TD`/`LR` keyword in spytial-gdl. Every layout and styling decision is
an `@annotation`, a one-line operation that targets a
[selector](notation.md#selectors) and applies a constraint or a directive. One
block of text describes both the graph and how it should be drawn.

## Anatomy

```text
@name(arg=value, arg2=[a, b], …)
```

One annotation per statement, anywhere in the block, though the convention is to
put them after the graph. An annotation usually fits on one line, but the arguments
may wrap up to the closing `)`, which helps with long lists:

```text
@orientation(
  selector=left,
  directions=[left],
)
```

A trailing comma before the `)` is fine, as is a trailing `;` or `%%` comment.
Arguments are `key=value`, comma-separated. Values are barewords (`below`), quoted
strings (`'left subtree'`), numbers (`3`, `3.5`), lists (`[below, left]`), or a
quoted comprehension (`'{x: Person | …}'`). Lists may nest.

There are two kinds. Constraints shape layout and directives style. They differ
only in which bucket they compile to, and the value syntax is identical.

## Constraints (layout)

| constraint | effect |
|---|---|
| `orientation` | place each edge's target relative to its source |
| `align` | line the endpoints of a relation up on an axis (horizontal/vertical) |
| `cyclic` | arrange a cycle as a ring |
| `group` | draw a labeled region around a set of nodes |
| `size` | fix the width and height of matching nodes |
| `hideAtom` | hide matching nodes |

`size` and `hideAtom` read like styling but are constraints: both change what the
layout has to solve for, rather than decorating a solved one. Core accepts them
among the directives too, behind a deprecation warning, which is why they are
sometimes written there.

### orientation

This is the one you'll use most. `directions` is a list of one or more of `above`,
`below`, `left`, `right`, applied to every edge in the selector, with the target
placed relative to the source:

```spytial-gdl
A -> B : left
A -> C : right
B -> D
C -> E

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

Stacking directions combines them, so `[below, right]` puts the target
down-and-to-the-right.

Each direction has a `directly` form (`directlyAbove`, `directlyBelow`,
`directlyLeft`, `directlyRight`) that also pins the two nodes to a shared axis, so
the target lands squarely on the source rather than merely on that side of it.
`directions=[directlyBelow]` is `[below]` plus the vertical `align` you would
otherwise write by hand:

```text
@orientation(selector=stands_for, directions=[directlyBelow])
```

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
is `horizontal` or `vertical`. Unlike `group`, `align` takes a binary (edge)
selector, because it aligns pairs rather than a node set:

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
| `atomStyle` | how matching nodes look: outline, fill, icon, label ([style blocks](#style-blocks)) |
| `edgeStyle` | how matching edges look: line, label ([style blocks](#style-blocks)) |
| `attribute` | show a field as a node attribute instead of an edge |
| `hideField` | hide a relation from drawing (still selectable) |
| `inferredEdge` | draw a derived/virtual edge |
| `tag` | annotate nodes with a tag |
| `flag` | a layout flag, e.g. `flag(name=hideDisconnected)` |

The common ones set color:

```spytial-gdl
alice[Alice]:::Person -> acme[Acme]:::Company
bob[Bob]:::Person     -> acme

@atomStyle(selector=Person, borderStyle(color='#cfe8d8'))
@atomStyle(selector=Company, borderStyle(color='#ffe7b3'))
@edgeStyle(field=_, lineStyle(color='#1f4396'))
@orientation(selector=_links, directions=[left])
```

The two styling directives match differently, which is the easiest thing to get
wrong here. `atomStyle` takes a node selector: a type, a class, or `univ`.
`edgeStyle` takes a `field`, meaning the relation's name. Unlabeled edges are all
named `_` (see [drawn once](notation.md#drawn-once)), so `field=_` means every
plain edge, and a labeled edge is styled by its label, as in `field=works_at`. Its
optional `selector=` doesn't choose the edges; it only narrows which source nodes'
edges match.

`_links` is the wrong answer for `edgeStyle` even though it works for
`@orientation`. It's a selector-only relation, hidden from drawing, so `edgeStyle`
never matches it.

### Recipes

Copy-paste, then swap the names. Throughout, `rel` is an edge label
(`a -> b : rel`) and `Person` is a node sort (`a[Ann]:::Person`). A class from
`class a,b tag` works anywhere `Person` does.

| to do this | write |
|---|---|
| draw `rel` dotted | `@edgeStyle(field=rel, lineStyle(pattern=dotted))` |
| draw `rel` dashed | `@edgeStyle(field=rel, lineStyle(pattern=dashed))` |
| colour `rel` | `@edgeStyle(field=rel, lineStyle(color=crimson))` |
| thicken `rel` | `@edgeStyle(field=rel, lineStyle(weight=3))` |
| drop `rel`'s label | `@edgeStyle(field=rel, showLabel=false)` |
| restyle `rel`'s label | `@edgeStyle(field=rel, textStyle(size=small, color=gray))` |
| style the unlabeled edges | `@edgeStyle(field=_, lineStyle(color=gray))` |
| stop drawing `rel` entirely | `@hideField(field=rel)` |
| tint a node's outline | `@atomStyle(selector=Person, borderStyle(color=steelblue, width=2))` |
| fill a node's interior | `@atomStyle(selector=Person, fillStyle(color='#eef6ff'))` |
| restyle a node's label | `@atomStyle(selector=Person, textStyle(size=large))` |
| resize nodes | `@size(selector=Person, width=140, height=60)` |
| hide nodes | `@hideAtom(selector=Person)` |

One rule carries as many blocks as you want, so a dotted, grey, unlabeled connector
is a single line:

```spytial-gdl
concept[blood pressure] -> measure[BP@6mo] : stands_for

@edgeStyle(field=stands_for, lineStyle(pattern=dotted, color='#94a3b8'), showLabel=false)
@orientation(selector=stands_for, directions=[below])
```

These two are the ones you reach for first, so it's worth keeping them straight:
`edgeStyle` matches on `field`, the relation, and `atomStyle` on `selector`, a sort
or class. An `atomStyle` with no `selector` at all styles every node.

### Argument reference

An annotation maps onto spytial-core's vocabulary directly: `@name(a=1, b=2)`
compiles to `{ name: { a: 1, b: 2 } }`. So the argument names matter, and a
misspelled one is not harmless — core keeps what it doesn't recognise and then
does nothing with it, so the rule silently stops applying.

spytial-gdl checks each annotation against the arguments core actually reads, so
a typo, a missing required argument, or a value outside a closed vocabulary is
reported with a line number instead. The table it checks against is generated
from the schema spytial-core publishes, which is why it can be trusted to match
the engine rather than to have been right when someone last typed it out.

`?` means optional; `(…)` marks a [style block](#style-blocks).

| annotation | kind | arguments |
|---|---|---|
| `orientation` | constraint | `selector`, `directions`, `hold?` |
| `align` | constraint | `selector`, `direction`, `hold?` |
| `cyclic` | constraint | `selector`, `direction?`, `hold?` |
| `group` | constraint | `selector`, `name?`, `addEdge?`, `textStyle(…)?`, `hold?` |
| `size` | constraint | `width`, `height`, `selector?` |
| `hideAtom` | constraint | `selector` |
| `atomStyle` | directive | `selector?` (absent means every node), `fillStyle(…)?`, `borderStyle(…)?`, `iconStyle(…)?`, `textStyle(…)?`, `showLabel?` |
| `edgeStyle` | directive | `field`, `selector?`, `filter?`, `lineStyle(…)?`, `textStyle(…)?`, `showLabel?`, `hidden?` |
| `attribute` | directive | `field`, `selector?`, `filter?`, `textStyle(…)?` |
| `tag` | directive | `toTag`, `name`, `value`, `textStyle(…)?` |
| `hideField` | directive | `field`, `selector?`, `filter?` |
| `inferredEdge` | directive | `name`, `selector`, `draw?`, `lineStyle(…)?`, `textStyle(…)?` |
| `flag` | directive | `name`: `hideDisconnected` or `hideDisconnectedBuiltIns` |

`hold=never` negates a constraint — it asserts the relationship must *not* hold.
Only the constraints listed with it take it; `size` and `hideAtom` accept the key
syntactically and ignore it, so writing it there would quietly mean the opposite
of what it says, and spytial-gdl rejects it rather than emitting a no-op.

Two forms are deprecated but still compile, since core still reads them:
`@icon(selector, path, showLabels?)`, which `atomStyle`'s `iconStyle(…)` block
replaces, and `@group(field, groupOn, addToGroup, selector?)`, which the binary
selector form replaces. Both warn.

> The [spytial-core](https://github.com/sidprasad/spytial-core) reference stays
> authoritative. `test/spec-tables.test.mjs` holds the table above to the same
> generated vocabulary the compiler uses, so it cannot fall behind the engine
> without a test saying so.

## Style blocks

`atomStyle` and `edgeStyle` don't take a single `color`. A node is a composite of
an outline, an interior fill, and a label, and an edge is a drawn line plus a
label. Each part is its own block, written as a nested call:

```spytial-gdl
@edgeStyle(field=next,
  lineStyle(color=crimson, pattern=dashed, weight=2),
  textStyle(size=small, color=gray),
  showLabel=true)

@atomStyle(selector=Person,
  borderStyle(color=steelblue, width=2),
  fillStyle(color='#eef6ff'),
  textStyle(size=large))
```

The blocks are one shared vocabulary, so the same names mean the same thing
wherever they appear:

| block | fields | styles |
|---|---|---|
| `lineStyle` | `color`, `pattern` (`solid`/`dashed`/`dotted`), `weight`, `highlight` | a drawn line |
| `textStyle` | `size` (`small`/`normal`/`large`), `color` | a label |
| `borderStyle` | `color`, `width` | a node's outline |
| `fillStyle` | `color` | a node's interior |

`inferredEdge`, `attribute`, `tag`, and a group's `addEdge` connector take them
too:

```spytial-gdl
@inferredEdge(name=parent, selector='~children', lineStyle(color=gray, pattern=dotted))
@attribute(field=weight, textStyle(size=small))
@group(selector=Team.members, name=Team,
  addEdge(points=togroup, lineStyle(pattern=dashed)),
  textStyle(color=navy))
```

Blocks wrap across lines and take the `%%` guard like any other annotation, and
everything is optional, so write only the parts you mean.

> **Note.** A node's `borderStyle(color=…)` is what tints it in the default
> rendering. `fillStyle` paints the interior and is opt-in. If a diagram looks
> unchanged after you set `fillStyle`, you probably wanted `borderStyle`.

### The older `atomColor` / `edgeColor`

Both still compile, since they're rewritten to the blocks above, so existing
diagrams keep working unchanged:

| you wrote | it compiles to |
|---|---|
| `@atomColor(selector=S, value=V)` | `@atomStyle(selector=S, borderStyle(color=V))` |
| `@edgeColor(field=F, value=V, style=P)` | `@edgeStyle(field=F, lineStyle(color=V, pattern=P))` |
| `@inferredEdge(…, color=V, style=P)` | `@inferredEdge(…, lineStyle(color=V, pattern=P))` |

`atomColor`'s `value` becomes the outline rather than the fill, which is what it
has always drawn. Prefer the block forms in new diagrams.

> **Breaking in spytial-core 3.0: style collisions are an error.** Two rules that
> set the same style leaf to different values now fail with a
> `StyleCollisionError` instead of one silently winning. Rules that touch different
> leaves still compose freely, so `borderStyle(color=…)` from one rule and
> `textStyle(size=…)` from another is fine. This is checked when the diagram is
> drawn, so it surfaces in the browser rather than as an annotation error.

## Mermaid-safe annotations

A `%%@name(...)` form is also accepted. It's a Mermaid comment guard, so a block
survives being pasted into a vanilla Mermaid renderer, which ignores `%%` lines,
while still compiling here:

```text
%% @orientation(selector=_links, directions=[below])
```

The bare `@…` and the guarded `%% @…` forms compile identically.

## Errors and conflicts

Failures are reported separately by kind. Source problems are caught before layout
runs, and selectors that name nothing are reported apart from layouts that can't
hold. The diagram renders best-effort at every stage, and an embed surfaces each
kind in its own panel.

### Parse and annotation errors

These come first: problems in the source text, before any layout runs. There are
two kinds, both caught up front and both reported with line numbers.

Annotation errors are annotations that don't parse, such as an unknown `@name`, a
missing comma, or an unterminated `(`. They come back as `annotationErrors`, an
array of `{ line, text, message }`, and the offending annotation is dropped.

Parse errors are graph lines the parser flagged. They come back as `parseErrors`,
an array of `{ line, text, severity, message }`. A `severity` of `'error'` is a
line it couldn't read, like a broken edge or junk; `'warning'` is a
tolerated-but-ignored Mermaid construct, like a `graph`/`flowchart` header or
`classDef`.

Both are non-fatal. The diagram still renders best-effort, and an embed shows a
**⚠ … in this source** band beneath it listing each problem by line. The four
stages stay distinct, so you can tell them apart:

| stage | failure | result field | embed panel |
|---|---|---|---|
| parse graph | bad line / ignored Mermaid | `parseErrors` | ⚠ … in this source |
| lift annotations | bad `@name` / args | `annotationErrors` | ⚠ … in this source |
| resolve selectors | `selector=` matches nothing | `selectorErrors` | ⚠ A selector didn't resolve |
| solve constraints | rules can't all hold | `error` (UNSAT core) | ⚠ These rules can't all hold |

### Selector errors

A different failure: a `selector=` that doesn't resolve to anything in the model,
such as a typo'd label or a class you never assigned. That isn't a layout conflict,
since the spec itself is malformed, so it's reported separately as `selectorErrors`
and the degenerate layout is not drawn:

```js
const r = await renderSpytialGdl(graph, source);
if (r.selectorErrors.length) {
  // e.g. selector 'lft' didn't match any edges or nodes
}
```

In an embed this is the **⚠ A selector didn't resolve** panel. Fix the selector to
one of the [five forms](notation.md#the-built-in-selectors) and it resolves.

### When constraints conflict

Layout is a set of constraints, so you can ask for the impossible: two edges that
must both point right and also form a cycle, a group that must enclose nodes pulled
apart by an orientation, and so on. Spytial reports this as an outcome rather than
crashing.

When the constraints can't all hold, the solver returns the closest feasible
layout, so it still draws something useful, together with the minimal conflict: the
smallest subset of rules that are unsatisfiable taken together. That subset is the
*Irreducible Inconsistent Subsystem* (IIS), usually called the UNSAT core.

This block asks two opposing edges of a 2-cycle to both go right, which can't
happen:

```spytial-gdl
A -> B : x
B -> A : y

@orientation(selector=x, directions=[right])
@orientation(selector=y, directions=[right])
```

The diagram still renders a best-effort layout, and the attached **⚠ These rules
can't all hold** panel, which you can expand under the diagram, names exactly the
constraints in tension rather than the whole spec.

### Reading it in an embed

Every embed reserves space for the conflict inside the diagram's border, so the
report belongs to that diagram rather than to the surrounding prose. The panel only
appears when there's a clash, and it's collapsible. In an
[editable block](embedding.md#editable-diagrams) it's live: resolve the clash by
deleting an offending edge or changing a direction, and the panel clears on the
spot.

The report is rendered by spytial-core's own IIS component, the same one the
[playground](../playground/) mounts. It's lazy-loaded the first time a clash
appears, so conflict-free pages never load it.

### Reading it from the API

[`renderSpytialGdl`](embedding.md#renderspytialgdl) surfaces the same information
on its result object:

```js
const r = await renderSpytialGdl(graph, source);
if (r.error) {
  // r.error is the constraint conflict (UNSAT core / positional / group-overlap)
  console.warn('layout conflict:', r.error.message);
}
// r.layout is still the best-feasible counterfactual; r.applied tells you if it drew.
```

`error` carries a shape that depends on the kind of clash. Positional conflicts
carry `errorMessages`, group overlaps carry `overlappingNodes` and `source`, and so
on. The Markdown layer maps these onto spytial-core's `show*Error` dispatch to
render the panel; if you build your own UI, branch on those fields the same way.

## Composing with raw rules

Inline annotations are the primary authoring model, but they compose with two
lower-level inputs that feed the same layout spec: `opts.rules`, which is raw CnD
YAML, and the per-class `registerSpec` registry. All three are merged before
solving. See
[Programmatic API → composing rules](embedding.md#composing-rules-registry-and-yaml).

## Next

- [Embedding & API](embedding.md): putting the diagram in a page, or driving it from JavaScript.
- [The notation](notation.md): where selectors come from.
