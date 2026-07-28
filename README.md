# spytial-gdl

A small graph description language with its layout written inline.

[![CI](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml/badge.svg)](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml)

You write nodes, edges, and spatial `@annotations`, and Spytial renders the result
as a live, draggable constraint diagram. Drop a fenced ` ```spytial-gdl ` block
into Markdown and it renders client-side, the way a ` ```mermaid ` block does.

```spytial-gdl
A -> B : left
A -> C : right

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

Spytial lays out any graph without help; the `@annotations` are how you say what
the arrangement should mean. Orientation, alignment, grouping, and cycles are all
annotations, and none of them ask you to change the graph. The block above is
tagged ` ```spytial-gdl `, so this README renders it as a live diagram in any
Markdown pipeline that loads the script. See it at
`/examples/md-viewer.html?doc=../README.md`, or read the intro post,
[Your diagram doesn't know it's a family tree](examples/your-diagram-doesnt-know.md).

> **New here? Start with [GUIDE.md](GUIDE.md)**

## Try it

There is no `npm install`, since everything loads from a CDN:

```bash
npm run serve   # zero-dep static server, port 8100
# /docs/                       the documentation site
# /playground/                 live editor (View ⇄ Edit)
# /examples/drop-in.html       minimal HTML drop-in: one tag plus <div> blocks
# /examples/guide.html         the guide, rendered by spytial-gdl itself
# /examples/binary-tree.html   JavaScript API demo
# /examples/editable.html      editable graph: edit visually, re-get the notation
# /examples/two-way-editing.html   longer walkthrough of editing from either side
# /examples/md-viewer.html?doc=your-diagram-doesnt-know.md  intro post, rendered live
# /examples/md-viewer.html?doc=<file.md>   render any spytial-gdl .md live (incl. this README)
```

Any static server works. One is needed only because the pages load ES modules.

## The notation

- **Edges**: `A -> B`, or labeled as `A -> B : left`, where the label becomes a selector.
- **Nodes** are implicit from edges. The id is the name, and every node is a rectangle.
- **Labels**: `A[Alice]` gives a display label, mermaid-style; without one the id is
  shown. The id stays the stable identity that edges reference, which helps when the
  ids are generated.
- **Sorts**: `A:::Person` gives the node a type, so `selector: Person` matches it. A
  plain node is untyped, and `univ` selects every node regardless of type.
- **Classes**: `class A,B,C tag` tags several nodes with a cross-cutting group.
- **No header, no direction.** Layout comes from the annotations rather than a
  `TD`/`LR` keyword.

Mermaid arrows (`-->`, `-.->`, `==>`, `---`), pipe labels (`A -->|left| B`), and a
leading `graph`/`flowchart` line are also accepted, so existing diagrams paste in.

## Annotations

Spatial operations, inline, one per line, as `@name(arg=value, …)`:

| kind | annotations |
|---|---|
| constraints (layout) | `orientation`, `cyclic`, `align`, `group` |
| directives (styling) | `atomStyle`, `size`, `icon`, `edgeStyle`, `attribute`, `hideField`, `hideAtom`, `inferredEdge`, `tag`, `flag`, `projection` |

Values are barewords (`below`), quoted strings (`'left subtree'`, or a
comprehension `'{x: Person | …}'`), numbers, or lists (`[below, left]`). A
`%%@name(...)` form is accepted too, so a block survives being pasted into a
vanilla Mermaid renderer. Bad names or arguments come back on the result as
`annotationErrors`.

## Selectors

An edge's label is its relation name, which is what layout rules target. Two
built-in edge relations and the node sets fill out the rest:

| selector | selects |
|---|---|
| `<label>` | edges carrying that label. `A -> B : left` gives `left` |
| `_` | the unlabeled edges |
| `_links` | every edge |
| `<type>` | nodes of that sort. `A:::Person` gives `Person`; a plain node is untyped |
| `<class>` | nodes carrying that class. `class A,B team` gives `team` |
| `univ` | every node, whatever its type. The universal set |

Each edge is drawn once, under its label or under `_`. `_links` and the node-set
relations are selector-only: hidden from drawing so they don't double-draw, but
still resolving in selectors. Give a class and an edge label different names, since
a shared spelling collides them.

## In Markdown

One tag turns on rendering for a whole page, and the engine is injected if it isn't
already loaded. [GUIDE.md](GUIDE.md) is the full walkthrough. The short version:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

If you'd rather drive it, `src/markdown.js` exports:

| export | |
|---|---|
| `autoRender(opts)` | render every block on the page, injecting the engine if absent |
| `renderSpytialGdls(root = document, opts)` | render blocks under `root`; returns per-block results |
| `ensureEngineLoaded(opts)` | inject d3 + WebCola + spytial-core if absent |
| `whenEngineReady(ms)` | resolves once the engine is available |

`opts` takes `height` (default `360`, overridden per block by `data-height`),
`theme`, and `injectEngine`. It picks up the
`<pre><code class="language-spytial-gdl">` markup that marked, markdown-it, MkDocs,
and Docusaurus emit, so no plugin is needed.

Every embed frames the diagram beside a collapsible **Source** panel that mirrors
the live notation. Read-only blocks open with it collapsed to a thin rail, and you
click to reveal it. A block tagged ` ```spytial-gdl-editable ` (or any block
carrying `data-editable`, or `autoRender({ editable: true })`) renders the editor
and opens that panel as a text editor too, so you can drag the graph or edit the
text and **Run ▸** (⌘⏎) it back in, with the two staying in sync. **⧉ Copy** lifts
the notation out. Docs can ship a graph readers edit both ways and copy back out.

## Programmatic API

```js
import { renderSpytialGdl, mountGraph } from 'spytial-gdl';

const graph = mountGraph(document.getElementById('out'), { width: 800, height: 600 });
const result = await renderSpytialGdl(graph, `
A -> B
A -> C

@orientation(selector=_links, directions=[below])
`);
```

`renderSpytialGdl(graphEl, source, opts)` resolves to
`{ applied, layout, error, selectorErrors, annotationErrors, parseErrors, parsed, data, instance, rules, hiddenRelations }`.
`mountGraph(container, opts)` creates or returns a `<webcola-cnd-graph>`.
`opts.validator` is `'qualitative'` (the default, with IIS clash reporting) or
`'kiwi'`.

Lower-level inputs still work and compose with annotations: `opts.rules` (raw CnD
YAML) and the per-class `registerSpec` registry are merged through the shared
`mergeSpecStrings`.

## Editable mode

Render the same graph onto spytial-core's `<structured-input-graph>` editor instead
of the read-only view. Readers add and delete nodes, drag to connect edges, and
rename relations, with constraints re-solving as they go, and they can re-get the
notation at any point. That round-trip (text, visual, edit, text) is what the mode
is for.

```js
import { renderSpytialGdlEditable } from 'spytial-gdl';

const h = await renderSpytialGdlEditable(document.getElementById('out'), `
A -> B : left
A -> C : right

@orientation(selector=left, directions=[left])
`);

h.onChange(({ source, value }) => {
  console.log(source); // spytial-gdl notation, re-derived from the edited graph
  console.log(value);  // its reified value: { atoms, relations } JSON
});
```

`renderSpytialGdlEditable(container, source, opts)` returns a handle:

| handle | |
|---|---|
| `getSource()` | re-get spytial-gdl notation for the current graph, with your `@annotations` re-appended verbatim |
| `getValue()` | the reified value: `{ atoms, relations }` JSON |
| `onChange(cb)` | runs `cb({ source, value, error })` after every edit; returns an unsubscribe fn |
| `element`, `dataInstance` | the live `<structured-input-graph>` and its data instance |

`serializeToSpytialGdl(data, { annotations })` is that notation serializer on its
own, the inverse of the render pipeline, for a `{ atoms, relations }` object or
anything with a `reify()` method. The playground's **Edit** toggle and
`/examples/editable.html` are built on it.

## How it renders

```
spytial-gdl source (+ @annotations)
  └─ annotations.js → lift @orientation(...) out     → { source, specYaml }
  └─ parse.js       → { nodes, edges, classesPerNode }
  └─ relationalize  → { atoms, relations, hiddenRelations }
  └─ spytial-core   → JSONDataInstance → SGraphQueryEvaluator
                      → parseLayoutSpec → LayoutInstance.generateLayout
  └─ <webcola-cnd-graph>.renderLayout(layout)
```

When constraints can't all hold, `generateLayout` returns a best-feasible
counterfactual plus the minimal conflict (IIS), `renderSpytialGdl` sets the `unsat`
attribute, and the playground shows an explanation. Malformed selectors come back
as `selectorErrors`.

**Dependencies** (CDN, in order): d3 v4 · `webcola@3.4.0` · `spytial-core@4`. The
last of those auto-registers `<webcola-cnd-graph>` and exposes the engine on
`window.spytialcore`, and the Markdown path injects all three. Vendor them locally
for an offline deploy.

## Limitations

- The notation is small: nodes, edges, labels, types, classes (see `parse.js`).
  There are no sequence, state, Gantt, or pie diagrams.
- Edge labels are relations, not free text.
- The read-only view doesn't auto-re-render. Call `renderSpytialGdl` again, as the
  playground does on ⌘⏎. For live editing with a notation round-trip, use
  [editable mode](#editable-mode).
