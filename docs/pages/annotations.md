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
layout has to solve for, rather than decorating a solved one.

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

`name` is not optional, even though a group without one would draw a perfectly
sensible unlabeled region: spytial-core refuses to parse it, and it fails the
*whole* spec rather than the one constraint, so every other annotation in the
diagram goes with it. The one exception is a negated group — `hold=never` — where
core generates a name, since nothing is drawn to caption.

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
| `group` | constraint | `selector`, `name` (except with `hold=never`), `addEdge?`, `textStyle(…)?`, `hold?` |
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

The table above is the whole language. spytial-gdl accepts exactly what the
current spytial-core schema marks current, so a form core has deprecated or
removed — `icon`, `atomColor`, `edgeColor`, `inferredEdge`'s inline `color` and
`style`, the old by-field `group` — is not a warning or a rewrite here; it is an
unknown annotation or argument, reported on its line like any other.

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

> **Style collisions are an error.** Two rules that set the same style leaf to
> different values fail with a `StyleCollisionError` instead of one silently
> winning. Rules that touch different leaves still compose freely, so
> `borderStyle(color=…)` from one rule and `textStyle(size=…)` from another is
> fine. This is checked when the diagram is drawn, so it surfaces in the browser
> rather than as an annotation error.

## Mermaid-safe annotations

A `%%@name(...)` form is also accepted. It's a Mermaid comment guard, so a block
survives being pasted into a vanilla Mermaid renderer, which ignores `%%` lines,
while still compiling here:

```text
%% @orientation(selector=_links, directions=[below])
```

The bare `@…` and the guarded `%% @…` forms compile identically.

## Errors and conflicts

Failures are reported by kind, and none of them is silent. Problems in the source
are caught before layout runs. Problems the engine finds — a name it cannot read
back, a rule it refuses, a selector it cannot use or that matches nothing — are
collected from the solve and reported beside the diagram, with the line of the
annotation they concern. Rules that cannot all hold are explained as a conflict.
The diagram renders best-effort at every stage.

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

The parser also refuses a name that could never work as a selector — an edge
label with a space in it, a hyphenated sort, a class spelled the same as an edge
label, a class line naming a node no line declares — and says which line and why,
rather than handing the engine a name it will read as something else. See
[Names](notation.md#edges) for the rule.

Both are non-fatal. The diagram still renders best-effort, and an embed shows a
**⚠ … in this source** band beneath it listing each problem by line. Every
problem, whichever stage found it, is also on the result's `diagnostics` list in
one shape, so a host can show them all at once:

| stage | failure | result field | embed panel |
|---|---|---|---|
| parse graph | bad line / ignored Mermaid / a name that cannot be a selector | `parseErrors`, `diagnostics` | ⚠ … in this source |
| lift annotations | bad `@name` / args | `annotationErrors`, `diagnostics` | ⚠ … in this source |
| solve | a selector the engine cannot use or that matches nothing; a spec it refuses | `diagnostics` (raw: `selectorErrors`, `warnings`) | ⚠ … in this source |
| solve constraints | rules can't all hold | `error` (UNSAT core) | ⚠ These rules can't all hold |

### What the engine reports

Selector problems are the engine's to find, and it finds two kinds.

A selector the engine cannot use — a sort where `@orientation` needs edges, an
edge label where `@atomStyle` needs nodes, a word its query grammar reserves
(`no`, `in`, `some`, and whichever others the installed release has) — is a
*selector error*. The engine skips that one rule, solves the rest, and the diagram
is drawn under the rules it could use, with the error beside it. There is no list
of reserved words in spytial-gdl: the grammar that reserves them reports them.

A selector that matches nothing at all — a typo'd label, a class you never
assigned — is a *warning*. The rule constrains nothing and the diagram draws as if
it were not there, which is the quietest way a diagram can be wrong; it is
reported so that it is not.

Both arrive on `diagnostics`, each with the line of the annotation it concerns,
and in an embed they share the **⚠ … in this source** band with the parse and
annotation errors. `selectorErrors` and `warnings` carry the engine's own records
for anyone who wants them raw.

A spec the engine's parser refuses outright is reported the same way, and the
diagram is drawn under no rules rather than not at all. The annotation compiler
catches the cases it knows from the schema first, so this is rare.

```js
const r = await renderSpytialGdl(graph, source);
for (const d of r.diagnostics) {
  // { severity: 'error' | 'warning', message, line?, source: 'parse' | 'annotation' | 'engine' }
  console.warn(`${d.line ? `line ${d.line}: ` : ''}${d.message}`);
}
```

Fix the selector to one of the [built-in forms](notation.md#the-built-in-selectors)
and it resolves.

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

Every rule spytial-gdl hands the engine carries the annotation it came from, as
written and with its line (`source`, a block spytial-core accepts from 5.4.0).
The engine cites that in place of its own rendering of the rule, so the conflict
report names `@orientation(selector=left, directions=[left]) (line 4)` rather
than a reconstruction of it. Older cores parse and ignore the block.

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
