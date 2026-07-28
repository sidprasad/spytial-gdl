# Embedding spytial-gdls in Markdown

A **spytial-gdl** is a small text notation for a graph with its layout written
inline. You write nodes, edges, and spatial operations as `@annotations`, then
Spytial solves the layout and draws a live, draggable diagram. It runs in the
browser, with no build step and no server beyond static hosting.

## The short version

Add one line to any page that renders your Markdown:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

Then write a fenced block, the way you'd write `mermaid`:

````markdown
```spytial-gdl
A -> B
B -> C
@orientation(selector=_links, directions=[right])
```
````

Every `spytial-gdl` block on the page becomes a diagram. The script pulls in the
renderer (d3, WebCola, spytial-core) if the page doesn't already load it.

To wire it up yourself instead of using the drop-in tag:

```html
<script type="module">
  import { autoRender } from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/markdown.js';
  autoRender();
</script>
```

## Without a Markdown renderer

You don't need Markdown at all. In a hand-written HTML page, put the notation in a
`<div class="spytial-gdl">` and add the same tag, the way you'd drop in a
`<div class="mermaid">`. That's the whole integration:

```html
<div class="spytial-gdl">
  A -> B : left
  A -> C : right

  @orientation(selector=_links, directions=[below])
  @orientation(selector=left,  directions=[left])
  @orientation(selector=right, directions=[right])
</div>

<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

Every block becomes a live diagram on load. You don't call an init function or pass
any config. `class="language-spytial-gdl"` and `<pre class="spytial-gdl">` are
picked up too, so whatever markup you or a renderer emit gets caught. Indentation
inside the `<div>` is fine, since each line is trimmed.

Give each block a height, because the diagram fills its container:

```css
.spytial-gdl, .spytial-gdl-editable { height: 340px; }
```

For an editor instead of a static view, use `class="spytial-gdl-editable"`, or add
`data-editable` to the div. It opens with the **Source** panel beside the diagram
as a live text editor, so you can drag the graph or edit the text and **Run ▸**
(⌘⏎) it in, with both directions staying in sync. **⧉ Copy** lifts the notation
out.

One thing to know: the page has to be served by a static server rather than opened
as `file://`, because the tag is an ES module. A complete, runnable page is
[`examples/drop-in.html`](examples/drop-in.html).

## The notation

A node is implicit from any edge, so the smallest graph is one line:

```spytial-gdl
A -> B
```

Label an edge after a colon. That label is also a selector you can target:

```spytial-gdl
A -> B : hit
A -> C : miss
```

A node's id is its name. A `[bracket]` gives it a display label, mermaid-style;
without one, the id is shown:

```spytial-gdl
u1[Alice] -> u2[Bob]
```

A `:::Sort` tag gives the node a type, so `selector: Person` then matches every
node of that type:

```spytial-gdl
alice[Alice]:::Person -> acme[Acme]:::Company
bob[Bob]:::Person     -> acme

@atomStyle(selector=Person, borderStyle(color='#cfe8d8'))
```

Each part of a node does one job: the id is the identity edges reference, the label
is what's drawn, and the sort is what selectors match. A node takes one sort for
now. A chain like `:::Person:::Employee` (a linear hierarchy) is reserved for later.

For a cross-cutting group, tag nodes with `class A,B tag`. There is no header and
no `TD`/`LR` direction, since layout comes from the annotations rather than a
keyword.

## Spatial operations

Annotations are the layout. Each is one line, `@name(arg=value, …)`:

| annotation | effect |
|---|---|
| `@orientation(selector=_links, directions=[below])` | put each edge's target below its source |
| `@align(selector=row, direction=horizontal)` | line a relation's endpoints up on an axis |
| `@cyclic(selector=_links, direction=clockwise)` | arrange a cycle as a ring |
| `@group(selector=team, name='Team A')` | draw a labeled region around a set |
| `@atomStyle(selector=root, borderStyle(color='#ffe7b3'))` | tint a node's outline |
| `@edgeStyle(field=next, lineStyle(color=crimson, pattern=dashed))` | style a relation's edges |

Styling is written in blocks: `borderStyle`, `fillStyle`, and `textStyle` on a
node, `lineStyle` and `textStyle` on an edge. Each part of a node or edge is set
independently. See
[Annotations → style blocks](docs/pages/annotations.md#style-blocks).

A `selector` names nodes or edges:

- an edge label (`hit`) selects the edges carrying it
- `_` selects the unlabeled edges, and `_links` selects every edge
- a type (`Person`) or a class (`tag`) selects the matching nodes
- `univ` selects every node, whatever its type, since a plain node is untyped

Put together, a binary tree with children below, left-left and right-right:

```spytial-gdl
A -> B : left
A -> C : right
B -> D : left
B -> E : right
C -> F : left
C -> G : right

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

If the constraints can't all hold, the diagram still draws the closest feasible
layout and explains the conflict. Nothing is dropped quietly.

## Where it works

`autoRender` looks for the markup a Markdown renderer emits for a fenced block,
`<pre><code class="language-spytial-gdl">`. That's what marked, markdown-it, Prism,
highlight.js, MkDocs, and Docusaurus produce, so no plugin is needed. To render a
fragment you injected yourself, call `renderSpytialGdls(element)`.

## Editable blocks

Tag a block `spytial-gdl-editable` instead and it renders an editor rather than a
static diagram. Readers add and delete nodes, drag to connect edges, and rename
relations, with the constraints re-solving as they go:

````markdown
```spytial-gdl-editable
A -> B : left
A -> C : right

@orientation(selector=left, directions=[left])
```
````

Each editable block sits beside a collapsible **Source** panel that re-derives
spytial-gdl text from the edited graph on every edit, and the panel is editable
itself: type notation and **Run ▸** (⌘⏎) to push it into the diagram, with the two
staying in sync. **⧉ Copy** lifts the result back out, `@annotations` and all. A
hand-authored container with `data-editable` works too, as does
`autoRender({ editable: true })` to make every block editable.

To drive the editor yourself, outside Markdown, the handle re-gets the notation
with `getSource()` and the reified value with `getValue()` on every edit:

```js
import { renderSpytialGdlEditable } from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js';

const h = await renderSpytialGdlEditable(document.getElementById('out'), 'A -> B\nB -> C');
h.onChange(({ source, value }) => {
  console.log(source); // spytial-gdl notation, re-derived from the edited graph
  console.log(value);  // its reified value: { atoms, relations }
});
```
