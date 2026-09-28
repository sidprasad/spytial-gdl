# Layout requirements

## Selectors

Selectors come in two types: **unary** (sets of nodes) and **binary** (sets of
pairs of nodes).

1. **Node IDs and types are unary selectors.** `A` selects the node `A`.
   `univ` selects all nodes. `Person` selects all nodes of type `Person`.
   A class name selects all nodes in that class.
2. **Edge names are binary selectors.** For `A -> B : child`, `child` selects
   the pair `(A, B)`. It includes every pair joined by an edge named `child`.
   `_links` selects all edges; `_` selects unlabeled edges.
3. **Selectors can be composed relationally** using the
   [SGQ](https://github.com/sidprasad/simple-graph-query) /
   [Forge](https://forge-fm.org/) language.

Write a rule as `@name(option=value, ...)`. The `selector` says which nodes or
pairs the rule applies to.

## Constraints

Constraints control the positions, sizes, and visibility of nodes.
Edit an example’s source and choose **Update diagram** to try it.

### orientation: place nodes in a direction { #orientation }

Place the second node in each selected pair in a direction from the first.
For `A -> B`, this places `B` relative to `A`.

| Option | Values | Meaning |
|---|---|---|
| `selector` | Binary selector | Pairs to arrange. |
| `directions` | List of directions below | Where to place the second node. |
| `hold` (optional) | `always`, `never` | Require the relationship (default), or forbid it. |

| Direction | Position of the second node |
|---|---|
| `above`, `below` | Above or below the first node. |
| `left`, `right` | Left or right of the first node. |
| `directlyAbove`, `directlyBelow` | Above or below, on the same vertical line. |
| `directlyLeft`, `directlyRight` | Left or right, on the same horizontal line. |

Combine directions: `[below, right]` means below and to the right.

```spytial-gdl-editable
A -> B : child
A -> C : child

@orientation(selector=child, directions=[below])
```

### align: line nodes up { #align }

Put the two nodes in each selected pair on the same horizontal or vertical line.

| Option | Values | Meaning |
|---|---|---|
| `selector` | Binary selector | Pairs to align. |
| `direction` | `horizontal`, `vertical` | Line to share. |
| `hold` (optional) | `always`, `never` | Require alignment (default), or forbid it. |

```spytial-gdl-editable
A -> B : next
B -> C : next

@align(selector=next, direction=horizontal)
```

### cyclic: arrange a cycle in a ring { #cyclic }

Arrange a cycle as a ring.

| Option | Values | Meaning |
|---|---|---|
| `selector` | Binary selector | Pairs that form the cycle. |
| `direction` (optional) | `clockwise`, `counterclockwise` | Order around the ring. |
| `hold` (optional) | `always`, `never` | Require the relationship (default), or forbid it. |

```spytial-gdl-editable
A -> B
B -> C
C -> D
D -> A

@cyclic(selector=_links, direction=clockwise)
```

### group: enclose nodes in a region { #group }

Draw a labeled region around selected nodes. A unary selector makes one group;
a binary selector makes one group for each distinct first node in its pairs.

| Option | Values | Meaning |
|---|---|---|
| `selector` | Unary or binary selector | A set of members, or pairs of `(group, member)`. |
| `name` | Text | Region label; required unless `hold=never`. |
| `hold` (optional) | `always`, `never` | Require grouping (default), or forbid it. |
| `showLabel` (optional) | `true`, `false` | Show or hide the label. |
| `textStyle(...)` (optional) | [Style block](#style-blocks) | Label appearance. |
| `addEdge` (optional) | `none`, `togroup`, `fromgroup`, or a style block | Connector to or from the group. |

#### Unary: apples in one bag

`Apple` selects all the apples. They go into one bag.

```spytial-gdl-editable
gala[🍎 Gala]:::Apple
fuji[🍎 Fuji]:::Apple
honeycrisp[🍎 Honeycrisp]:::Apple

@group(selector=Apple, name='Bag')
```

#### Binary: several bags of apples

`contains` selects pairs such as `(bag1, gala)` and `(bag2, honeycrisp)`.
The first node identifies the bag; the second is an apple in that bag.
Apples with the same first node go into the same bag.

```spytial-gdl-editable
bag1[1]:::Bag -> gala[🍎 Gala]:::Apple : contains
bag1 -> fuji[🍎 Fuji]:::Apple : contains
bag2[2]:::Bag -> honeycrisp[🍎 Honeycrisp]:::Apple : contains
bag2 -> pinklady[🍎 Pink Lady]:::Apple : contains
bag2 -> braeburn[🍎 Braeburn]:::Apple : contains

@group(selector=contains, name='Bag')
@hideAtom(selector=Bag)
@hideField(field=contains)
```

The last two rules hide the bag nodes and their arrows, leaving the labeled
regions and apples visible.

### size: set node dimensions { #size }

Set the width and height of selected nodes.

| Option | Values | Meaning |
|---|---|---|
| `selector` (optional) | Unary selector | Nodes to resize; omit for all nodes. |
| `width` | Positive number | Node width in pixels. |
| `height` | Positive number | Node height in pixels. |

```spytial-gdl-editable
alice[Alice]:::Person -> acme[Acme]

@size(selector=Person, width=140, height=60)
```

### hideAtom: hide nodes { #hideatom }

Hide selected nodes.

| Option | Values | Meaning |
|---|---|---|
| `selector` | Unary selector | Nodes to hide. |

```spytial-gdl-editable
A -> B
A -> helper:::Helper

@hideAtom(selector=Helper)
```

`helper` is declared in the source but hidden in the diagram.

## Directives { #styling }

Use directives to change how nodes and edges are drawn.

| Directive | What it does |
|---|---|
| `atomStyle` | Style nodes selected by a unary `selector`; omit it for all nodes. |
| `edgeStyle` | Style edges named by `field`. Use `field=_` for unlabeled edges. |
| `attribute` | Show a field as a node attribute instead of an edge. |
| `hideField` | Hide a field's edges; the field can still be selected. |
| `inferredEdge` | Draw a derived edge from a binary selector. |
| `tag` | Add a tag to nodes. |
| `flag` | Set `name=hideDisconnected` or `name=hideDisconnectedBuiltIns`. |

For `edgeStyle`, `selector` narrows the **source nodes**, while `field` chooses
the edge name. `_links` is for selecting pairs; use the actual edge name to style them.

```spytial-gdl-editable
alice[Alice]:::Person -> acme[Acme] : works_at

@atomStyle(selector=Person, borderStyle(color=steelblue, width=2))
@edgeStyle(field=works_at, lineStyle(pattern=dashed))
```

### Style blocks

Put appearance options inside a named block, such as `lineStyle(pattern=dashed)`.

| Block | Options |
|---|---|
| `lineStyle(...)` | `color`, `pattern` (`solid`, `dashed`, `dotted`), `weight`, `highlight` |
| `textStyle(...)` | `size` (`small`, `normal`, `large`), `color` |
| `borderStyle(...)` | `color`, `width` |
| `fillStyle(...)` | `color` |

### Argument reference

<details markdown="1">
<summary>All rule arguments</summary>

`?` means optional; `(…)` means a style block.

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

</details>

`%% @name(...)` also works when rules need to survive as comments in Mermaid.
For use from JavaScript, see [composing rules](embedding.md#composing-rules-registry-and-yaml).
