# spytial-graph

Write a small graph notation — nodes, edges, and inline spatial `@annotations` — and
render it as a **live SpyTial constraint diagram** with the standard
`<webcola-cnd-graph>` renderer. Drop a fenced ` ```spytial-graph ` block into Markdown and
it comes alive client-side, the way ` ```mermaid ` does.

```
A -> B : left
A -> C : right
class A,B,C tree

@orientation(selector=tree_edge, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

SpyTial gives you a faithful default layout for free; the `@annotations` refine it
(orientation, alignment, grouping, cycles) without your rebuilding anything. The notation
borrows Mermaid's edge arrows but is its own thing — there is no `graph TD` header, and the
Mermaid library is not a dependency.

> **New here? [GUIDE.md](GUIDE.md) is the 5-minute embedding guide.** This repo is the
> Live-Graph tool of the [SpyTial UIST 2026 demo](../spytial-uist-2026/) — one of three
> input modalities on the same `spytial-core` engine.

## Try it

Everything loads from CDN — no `npm install`:

```bash
npm run serve   # zero-dep static server (node), port 8100
# http://localhost:8100/playground/             ← live editor
# http://localhost:8100/examples/guide.html     ← the guide, rendered by spytial-graph itself
# http://localhost:8100/examples/binary-tree.html   ← programmatic API demo
```

(Any static file server works — a server is needed only because the pages load ES modules.)

## The notation

- **Edges:** `A -> B`; labeled `A -> B : left` (the label becomes a selector).
- **Nodes** are implicit from edges. Declare one to give it a label/shape: `A[Start]`,
  `A(Round)`, `A((Circle))`, `A{Decide}`, `A[[Sub]]`, `A[(Store)]`.
- **Classes:** `A:::tag` (chainable) or `class A,B,C tag`.
- **No header, no direction** — layout comes from the annotations, not a `TD`/`LR` keyword.

For pasting, the Mermaid-style arrows (`-->`, `-.->`, `==>`, `---`), pipe labels
(`A -->|left| B`), and a leading `graph`/`flowchart` line are also accepted.

## Annotations

Spatial operations, inline, one per line — `@name(arg=value, …)`:

| kind | annotations |
|---|---|
| **constraints** (layout) | `orientation`, `cyclic`, `align`, `group` |
| **directives** (styling) | `atomColor`, `size`, `icon`, `edgeColor`, `attribute`, `hideField`, `hideAtom`, `inferredEdge`, `tag`, `flag`, `projection` |

Values are barewords (`below`), quoted strings (`'left subtree'`, or a comprehension
selector `'{x: rect | …}'`), numbers, or lists (`[below, left]`). A `%%@name(...)` form is
also accepted, so a block stays valid if pasted into a vanilla Mermaid renderer. Unknown
names and malformed arguments come back on the result as `annotationErrors`. See
[GUIDE.md](GUIDE.md) for worked examples.

## In Markdown

Add one drop-in tag to a page that renders your Markdown — every block becomes a diagram,
and the renderer is injected for you if absent:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-mermaid/src/auto.js"></script>
```

…or wire it yourself:

```html
<script type="module">
  import { autoRender } from 'https://cdn.jsdelivr.net/npm/spytial-mermaid/src/markdown.js';
  autoRender();
</script>
```

| export (`src/markdown.js`) | |
|---|---|
| `autoRender(opts)` | render every `spytial-graph` block on the page (injects the engine if absent) |
| `renderSpytialGraphs(root = document, opts)` | render blocks under `root`; returns per-block results |
| `ensureEngineLoaded(opts)` | inject d3 + WebCola + spytial-core if the page hasn't already |
| `whenEngineReady(ms)` | resolves once the engine + custom element are available |

`opts`: `height` (number px or CSS string, default `360`; a block may override with
`data-height`), `theme` (`'light'`/`'dark'`), `injectEngine` (default `true`). It finds the
`<pre><code class="language-spytial-graph">` markup that marked, markdown-it, Prism,
highlight.js, MkDocs, and Docusaurus emit — no plugin needed.

## Pipeline

```
spytial-graph source (+ @annotations)
  └─ annotations.js → { source, specYaml }      lift @orientation(...) out of the source
  └─ parse.js       → { nodes, edges, classesPerNode }
  └─ relationalize  → { atoms, relations, hiddenRelations }
  └─ spytial-core:  new JSONDataInstance(data)
                    SGraphQueryEvaluator().initialize({ sourceData })
                    parseLayoutSpec(annotations)        (+ injected hideField directives)
                    new LayoutInstance(...).generateLayout → { layout, error, selectorErrors }
  └─ <webcola-cnd-graph>.renderLayout(layout)
```

## Programmatic API

```js
import { renderSpytialGraph, mountGraph } from 'spytial-mermaid';

// 1. Create (or reuse) a <webcola-cnd-graph> element inside a container.
const graph = mountGraph(document.getElementById('out'), { width: 800, height: 600 });

// 2. Render a spytial-graph source — spatial operations are inline @annotations.
const result = await renderSpytialGraph(graph, `
A -> B
A -> C

@orientation(selector=link, directions=[below])
`);
```

`renderSpytialGraph(graphEl, source, opts)` →
`{ applied, layout, error, selectorErrors, annotationErrors, parsed, data, instance, rules, hiddenRelations }`.

`mountGraph(container, { width, height, theme, ariaLabel })` creates/returns a
`<webcola-cnd-graph>`; if `container` already is one, it's returned as-is. `opts.validator`
is `'qualitative'` (default, IIS clash reporting) or `'kiwi'`.

For programmatic callers, the lower level still works and **composes** with annotations:
pass `opts.rules` (raw CnD YAML), or register a spec per class with `registerSpec(class, yaml)`
— all sources are concatenated via the shared `mergeSpecStrings`.

## Selectors

A graph edge can be selected by several relation names. Each edge is **drawn exactly once**;
the rest are *selector-only* (hidden from drawing):

| relation | arity | drawn? | selector example |
|---|---|---|---|
| `<label>` | 2 | ✅ drawn | `A -> B : left` → `selector: left` |
| `link` | 2 | ✅ drawn | unlabeled `A -> B` → `selector: link` |
| `edge` | 2 | hidden | every edge → `selector: edge` |
| `<class>` | 1 | hidden | `class A,B tree` → `selector: tree` |
| `<class>_edge` | 2 | hidden | edges between two `tree` nodes → `selector: tree_edge` |

Node **type** = the shape (`rect`, `circle`, `diamond`, `cylinder`, `subroutine`,
`asymmetric`, `round`) or `Node` for a plain `A`, so `selector: diamond` targets all
decision nodes.

**Name-collision warning:** if a class name and an edge label share a spelling, two
relations get that name (one unary, one binary). Name classes and labels distinctly.

## Why "draw each edge once" (the `hideField` trick)

The standard renderer draws an edge for **every** relation tuple, labeled with the relation
name (and a *unary* relation as a self-loop on each member). Since `relationalize.js` emits
each edge into several relations (its label *and* the catch-all `edge` *and* any
`<class>_edge`) plus a unary membership relation per class, drawing all of them would
produce duplicate lines and stray self-loops.

So `relationalize` marks every selector-only relation (`edge`, `<class>`, `<class>_edge`) as
**hidden**, and `index.js` injects a `hideField` directive for each before solving. A hidden
relation is removed from the drawn graph but stays in the data instance, so `selector: edge`
/ `selector: tree_edge` still resolve. Net effect: each edge is drawn once (carrying its
label, or none for `link`), while every selector still works.

## Conflicts (unsat)

When constraints can't all hold, `generateLayout` returns a counterfactual `layout` plus an
`error` (the minimal conflicting constraints / IIS). `renderSpytialGraph` sets the `unsat`
attribute on the `<webcola-cnd-graph>` element and returns the error structured; the
playground renders the best-feasible layout and shows the explanation modal. Malformed
selectors come back as `selectorErrors`.

## Dependencies (CDN)

The pages load, in order:

```
d3 v4         https://d3js.org/d3.v4.min.js
webcola       https://cdn.jsdelivr.net/npm/webcola@3.4.0/WebCola/cola.min.js
spytial-core  https://cdn.jsdelivr.net/npm/spytial-core@2.9.1/dist/browser/spytial-core-complete.global.js
```

`spytial-core-complete.global.js` auto-registers the `<webcola-cnd-graph>` custom element
and exposes the engine on `window.spytialcore` (legacy alias `CndCore`). The Markdown path
injects these three for you (`ensureEngineLoaded`); the playground additionally loads the
`spytial-core` React components bundle for its clash-explanation modal. For a fully offline
deploy, vendor the assets locally.

## Limitations

- **A small notation** — nodes, edges, labels, the shapes and classes in `parse.js`. No
  sequence/state/Gantt/pie diagrams.
- **Edge labels are relations**, not free text — see the collision warning above.
- **No automatic live re-render** on source change — call `renderSpytialGraph` again (the
  playground does this on Apply / ⌘⏎).
