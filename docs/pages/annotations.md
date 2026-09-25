# Layout requirements syntax

Add an `@` rule when a spatial relationship must hold. A rule uses a
[selector](notation.md#selectors) to name the graph elements it applies to.
Styling directives use the same syntax but change appearance rather than layout.

## Anatomy

```text
@name(arg=value, arg2=[a, b], …)
```

Write one requirement or styling directive per statement, anywhere in the block.
The convention is to put them after the graph. A statement usually fits on one
line, but its arguments may wrap up to the closing `)`, which helps with long lists:

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

Layout requirements place graph elements. Styling directives change their appearance.

## Layout requirements

| requirement | effect |
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

`directions` places each selected edge's target `above`, `below`, `left`, or
`right` of its source. Combine directions in a list:

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

`name` is required. Without it, the engine rejects the whole rule set. The
exception is a negated group (`hold=never`), which draws no labeled region.

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

For example, style node types and their connecting edges:

```spytial-gdl
alice[Alice]:::Person -> acme[Acme]:::Company
bob[Bob]:::Person     -> acme

@atomStyle(selector=Person, borderStyle(color='#795db4', width=2))
@atomStyle(selector=Company, borderStyle(color='#b85c38', width=2))
@edgeStyle(field=_, lineStyle(color='#795db4'))
@orientation(selector=_links, directions=[left])
```

`atomStyle` takes a node selector: a type, a class, or `univ`.
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
| restyle `rel`'s label | `@edgeStyle(field=rel, textStyle(size=small))` |
| style the unlabeled edges | `@edgeStyle(field=_, lineStyle(color='#795db4'))` |
| stop drawing `rel` entirely | `@hideField(field=rel)` |
| tint a node's outline | `@atomStyle(selector=Person, borderStyle(color=steelblue, width=2))` |
| fill a node's interior | `@atomStyle(selector=Person, fillStyle(color='#795db4'), textStyle(color=white))` |
| restyle a node's label | `@atomStyle(selector=Person, textStyle(size=large))` |
| resize nodes | `@size(selector=Person, width=140, height=60)` |
| hide nodes | `@hideAtom(selector=Person)` |

One rule carries as many blocks as you want, so a dotted, unlabeled connector
is a single line:

```spytial-gdl
concept[blood pressure] -> measure[BP@6mo] : stands_for

@edgeStyle(field=stands_for, lineStyle(pattern=dotted, color='#795db4'), showLabel=false)
@orientation(selector=stands_for, directions=[below])
```

These two are the ones you reach for first, so it's worth keeping them straight:
`edgeStyle` matches on `field`, the relation, and `atomStyle` on `selector`, a sort
or class. An `atomStyle` with no `selector` at all styles every node.

### Argument reference

Use the argument names below exactly. A misspelled name, missing required
argument, or unsupported value produces an error on its source line. The table
is checked against spytial-core's published schema.

`?` means optional; `(…)` marks a [style block](#style-blocks).

| rule | kind | arguments |
|---|---|---|
| `orientation` | constraint | `selector`, `directions`, `hold?` |
| `align` | constraint | `selector`, `direction`, `hold?` |
| `cyclic` | constraint | `selector`, `direction?`, `hold?` |
| `group` | constraint | `selector`, `name` (except with `hold=never`), `addEdge?`, `textStyle(…)?`, `showLabel?`, `hold?` |
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

The table lists every supported `@` rule. Deprecated forms such as `atomColor`,
`edgeColor`, and `inferredEdge`'s inline `color` are reported as unknown rules or
arguments.

> The [spytial-core](https://github.com/sidprasad/spytial-core) reference is
> authoritative. `test/spec-tables.test.mjs` checks this table against the
> vocabulary used by the compiler.

## Style blocks

`atomStyle` and `edgeStyle` don't take a single `color`. A node is a composite of
an outline, an interior fill, and a label, and an edge is a drawn line plus a
label. Each part is its own block, written as a nested call:

```spytial-gdl
@edgeStyle(field=next,
  lineStyle(color=crimson, pattern=dashed, weight=2),
  textStyle(size=small),
  showLabel=true)

@atomStyle(selector=Person,
  borderStyle(color='#b85c38', width=2),
  fillStyle(color='#795db4'),
  textStyle(size=large, color=white))
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
@inferredEdge(name=parent, selector='~children', lineStyle(pattern=dotted))
@attribute(field=weight, textStyle(size=small))
@group(selector=Team.members, name=Team,
  addEdge(points=togroup, lineStyle(pattern=dashed)),
  textStyle(size=small))
```

Blocks wrap across lines and take the `%%` guard like any other `@` rule, and
everything is optional, so write only the parts you mean.

> **Note.** A node's `borderStyle(color=…)` is what tints it in the default
> rendering. `fillStyle` paints the interior and is opt-in. If a diagram looks
> unchanged after you set `fillStyle`, you probably wanted `borderStyle`. Set
> `textStyle(color=…)` with a fill so the label remains readable in both themes.

> **Style collisions are an error.** Two rules that set the same style leaf to
> different values fail with a `StyleCollisionError` instead of one silently
> winning. Rules that touch different leaves still compose freely, so
> `borderStyle(color=…)` from one rule and `textStyle(size=…)` from another is
> fine. This is checked when the diagram is drawn, so it surfaces in the browser
> rather than as a rule error.

## Mermaid-safe rules

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
rule they concern. Rules that cannot all hold are explained as a conflict.
The diagram renders best-effort at every stage.

### Source errors

These come first: problems in the source text, before any layout runs. There are
two kinds, both caught up front and both reported with line numbers.

Malformed `@` rules, such as an unknown `@name`, a missing comma, or an
unterminated `(`, appear in `annotationErrors` as `{ line, text, message }`.
The compiler drops the offending rule.

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
| read `@` rules | bad `@name` / args | `annotationErrors`, `diagnostics` | ⚠ … in this source |
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

Both arrive on `diagnostics`, each with the line of the rule it concerns,
and in an embed they share the **⚠ … in this source** band with the parse and
rule errors. `selectorErrors` and `warnings` carry the engine's own records
for anyone who wants them raw.

A spec the engine's parser refuses outright is reported the same way, and the
diagram is drawn under no rules rather than not at all. The rule compiler
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

Every rule spytial-gdl hands the engine carries the `@` statement it came from, as
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

Inline requirements and styling rules are the primary authoring model, but they
compose with two
lower-level inputs that feed the same layout spec: `opts.rules`, which is raw CnD
YAML, and the per-class `registerSpec` registry. All three are merged before
solving. See
[Programmatic API → composing rules](embedding.md#composing-rules-registry-and-yaml).

## Next

- [Embedding & API](embedding.md): putting the diagram in a page, or driving it from JavaScript.
- [The notation](notation.md): where selectors come from.
