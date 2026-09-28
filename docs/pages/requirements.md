# Layout requirements syntax

Write rules as `@name(key=value, ...)`. Selectors determine which nodes or
edges a rule applies to.

## Selectors

Selectors are [Simple Graph Query expressions](https://github.com/sidprasad/simple-graph-query/blob/main/LANGUAGE.md).
The language uses a fragment of Forge, an Alloy dialect, with extensions and
omissions. This section covers the names Spytial GDL exposes for graph elements.
For GDL rules, selectors identify nodes or edge pairs.

### The built-in selectors

| selector | selects |
|---|---|
| `<label>` | edges carrying that label. `A -> B : left` gives `left` |
| `_` | the unlabeled edges (plain `A -> B`) |
| `_links` | every edge, labeled or not; does not draw additional edges |
| `<type>` | nodes of that type. `cs:::Course` gives `Course`; a plain node is untyped |
| `<class>` | nodes carrying that class. `class A,B team` gives `team` |
| `univ` | every node, whatever its type. The universal set |

The first three select edges and the last three select nodes. A rule that
places edges, like `@orientation`, takes an edge selector; one that acts on nodes,
like `@group` or `@atomStyle`, takes a node selector.

### Edge selectors

The label after a colon is the relation name. Target it directly:

```spytial-gdl
A -> B : reports_to
C -> B : reports_to
B -> D : owns

@orientation(selector=reports_to, directions=[above])
@orientation(selector=owns, directions=[right])
```

`_` is the relation that unlabeled edges carry, and `_links` is the union of all
edges. Use `_links` for a baseline that applies to everything, then refine per
label:

```spytial-gdl
root -> a : left
root -> b : right
a -> a1
b -> b1

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

`_links` puts all four targets below their sources. The `left` and `right`
requirements also place those labeled targets to either side. The unlabeled
edges match only `_links`.

### Node selectors: types and classes

A type comes from `:::Type` and a class comes from `class … tag`. Both select node
sets, and you can use either wherever a node selector is expected:

```spytial-gdl
db[DB]:::Service
api[API]:::Service -> db
web[Web]:::Client -> api

class db critical

@atomStyle(selector=Service, borderStyle(color='#795db4', width=2))
@atomStyle(selector=Client, borderStyle(color='#b85c38', width=2))
@group(selector=critical, name='Critical')
@orientation(selector=_links, directions=[left])
```

The types `Service` and `Client` tint nodes by role, and the class `critical` draws
a region around the one node tagged with it. A type says what a node is; a class is
a tag you can apply across types.

A node with no `:::Type` is untyped. It belongs to no named type, so a named
selector never touches it by accident. To reach every node regardless of type,
typed or classed or plain, use `univ`:

```spytial-gdl
a[Root] -> b:::Service
a -> c:::Client

@atomStyle(selector=univ, borderStyle(width=3))
@orientation(selector=_links, directions=[below])
```

`univ` gives all three nodes a thicker outline, including the untyped `Root`.

### Advanced: comprehensions

A set comprehension can select nodes by a condition. Quote the expression so
GDL passes it to Simple Graph Query intact:

```text
@group(selector='{p: Person | some p.reports_to}', name='Managers')
```

## Layout requirements

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
