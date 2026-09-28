# Layout requirements syntax

## Selectors

A selector tells a requirement which nodes or edges to use. Selectors are
written in [Simple Graph Query (SGQ)](https://github.com/sidprasad/simple-graph-query),
which borrows relational expressions from [Forge](https://forge-fm.org/).

1. **Nodes.** A node ID selects that one node: `A` selects `A`. `univ` selects
   every node. A type name selects every node of that type: `Person` selects all
   nodes declared with `:::Person`.
2. **Edges.** An edge name selects the pairs of nodes joined by edges with that
   name. For `A -> B : child`, `child` includes the pair `(A, B)`. `_links`
   selects all edges; `_` selects only unlabeled edges such as `A -> B`.
3. **Combine them.** SGQ's Forge-style relational expressions let you combine
   node sets and edge relations to select more specific parts of a graph.

## Layout requirements

Write rules as `@name(key=value, ...)`.

| requirement | effect |
|---|---|
| `orientation` | place each edge's target relative to its source |
| `align` | line the endpoints of a relation up on an axis (horizontal/vertical) |
| `cyclic` | arrange a cycle as a ring |
| `group` | draw a labeled region around a set of nodes |
| `size` | fix the width and height of matching nodes |
| `hideAtom` | hide matching nodes |

`size` and `hideAtom` also affect layout solving.

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
named `_`, so `field=_` means every
plain edge, and a labeled edge is styled by its label, as in `field=works_at`. Its
optional `selector=` does not choose the edges; it only narrows which source nodes'
edges match.

`_links` selects edges for layout rules such as `@orientation`, but is hidden
from drawing. To style unlabeled edges, use `field=_`.

### Recipes

In the examples below, `rel` is an edge label (`a -> b : rel`) and `Person` is
a node type (`a[Ann]:::Person`). A class from `class a,b tag` can also be used
as a node selector.

| to do this | write |
|---|---|
| draw `rel` dotted | `@edgeStyle(field=rel, lineStyle(pattern=dotted))` |
| draw `rel` dashed | `@edgeStyle(field=rel, lineStyle(pattern=dashed))` |
| color `rel` | `@edgeStyle(field=rel, lineStyle(color=crimson))` |
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

Combine style fields in one rule:

```spytial-gdl
concept[blood pressure] -> measure[BP@6mo] : stands_for

@edgeStyle(field=stands_for, lineStyle(pattern=dotted, color='#795db4'), showLabel=false)
@orientation(selector=stands_for, directions=[below])
```

An `atomStyle` without `selector` styles every node.

### Argument reference

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

`hold=never` requires a relationship to be false. It applies to `orientation`,
`align`, `cyclic`, and `group`.

## Style blocks

Use nested style blocks for outlines, fills, lines, and labels:

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

Common style blocks:

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

> **Note.** A node's `borderStyle(color=…)` is what tints it in the default
> rendering. `fillStyle` paints the interior. Set `textStyle(color=…)` with a
> fill so the label remains readable in both themes.

## Mermaid-safe rules

A `%%@name(...)` form is also accepted. It is a Mermaid comment guard, so a block
survives being pasted into a vanilla Mermaid renderer, which ignores `%%` lines,
while still compiling here:

```text
%% @orientation(selector=_links, directions=[below])
```

The bare `@…` and the guarded `%% @…` forms compile identically.

## Composing with raw rules

Inline requirements and styling rules combine with raw spytial-core YAML in
`opts.rules` and class rules in the `registerSpec` registry. See
[Programmatic API → composing rules](embedding.md#composing-rules-registry-and-yaml).

## Next

- [Embedding & API](embedding.md): putting the diagram in a page, or driving it from JavaScript.
- [Graph description](notation.md): where edge labels, types, and classes are declared.
