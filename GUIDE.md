# Embedding spytial-graphs in Markdown

A **spytial-graph** is a small text notation for a graph with its layout written
inline. You write nodes, edges, and spatial operations as `@annotations`; SpyTial
solves the layout and draws a live, draggable diagram. It runs in the browser —
no build step, no server beyond static hosting.

## The 30-second version

Add one line to any page that renders your Markdown:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-mermaid/src/auto.js"></script>
```

Then write a fenced block, the way you'd write `mermaid`:

````markdown
```spytial-graph
A -> B
B -> C
@orientation(selector=link, directions=[right])
```
````

Every `spytial-graph` block on the page becomes a diagram. The script pulls in the
renderer (d3, WebCola, spytial-core) for you if the page doesn't already load it.

Wiring it yourself instead of the drop-in tag:

```html
<script type="module">
  import { autoRender } from 'https://cdn.jsdelivr.net/npm/spytial-mermaid/src/markdown.js';
  autoRender();
</script>
```

## The notation

A node is implicit from any edge, so the smallest graph is one line:

```spytial-graph
A -> B
```

Label an edge after a colon — the label is also a selector you can target:

```spytial-graph
A -> B : yes
A -> C : no
```

Nodes take an optional label, shape, and class:

```
A[Start]         rectangle, labeled "Start"
A(Round)         rounded      A((Circle))   circle      A{Decide}   diamond
A:::tag          tag A with the class `tag`
class A,B tag    tag several nodes at once
```

There is no header and no `TD`/`LR` direction. Layout comes from the annotations,
not from a keyword.

## Spatial operations

Annotations *are* the layout. Each is one line, `@name(arg=value, …)`:

| annotation | effect |
|---|---|
| `@orientation(selector=link, directions=[below])` | put each edge's target below its source |
| `@align(selector=row, direction=top)` | line nodes up on an axis |
| `@cyclic(selector=link, direction=clockwise)` | arrange a cycle as a ring |
| `@group(selector=team, name='Team A')` | draw a labeled region around a set |
| `@atomColor(selector=root, value='#ffe7b3')` | tint nodes |

A `selector` names nodes or edges: an edge label (`yes`), `link` for unlabeled
edges, a class (`tag`), a shape (`diamond`), or `edge` for all edges. A class
`team` also exposes `team_edge` — the edges between two of its members.

Put together — a binary tree, children below, left-left and right-right:

```spytial-graph
A -> B : left
A -> C : right
B -> D : left
B -> E : right
C -> F : left
C -> G : right
class A,B,C,D,E,F,G tree

@orientation(selector=tree_edge, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

If the constraints can't all hold, the diagram still draws the closest feasible
layout and explains the conflict — nothing silently disappears.

## Where it works

`autoRender` looks for the markup a Markdown renderer emits for a fenced block —
`<pre><code class="language-spytial-graph">`. That's what marked, markdown-it,
Prism, highlight.js, MkDocs, and Docusaurus produce, so no plugin is needed. To
render a fragment you injected yourself, call `renderSpytialGraphs(element)`.
