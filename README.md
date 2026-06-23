# spytial-graph

*Diagramming in your browser, with semantics.*

Write a small graph notation — nodes, edges, and inline spatial `@annotations` — and
SpyTial renders it as a **live, draggable constraint diagram**. Drop a fenced
` ```spytial-graph ` block into Markdown and it comes alive client-side, the way
` ```mermaid ` does.

```
A -> B : left
A -> C : right

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

You get a faithful default layout for free; the `@annotations` refine it — orientation,
alignment, grouping, cycles — without rebuilding anything. The arrow syntax will look
familiar, but it's its own notation: no `graph TD` header, and no Mermaid dependency.

> **New here? Start with [GUIDE.md](GUIDE.md)** 

## Try it

No `npm install` — everything loads from CDN:

```bash
npm run serve   # zero-dep static server, port 8100
# /playground/                 live editor
# /examples/guide.html         the guide, rendered by spytial-graph itself
# /examples/binary-tree.html   programmatic API demo
```

(Any static server works; one is needed only because the pages load ES modules.)

## The notation

- **Edges** — `A -> B`, or labeled `A -> B : left` (the label becomes a selector).
- **Nodes** are implicit from edges; the id is the name, and every node is a rectangle.
  A bracket gives the node a **type**: `A[Person]` makes `selector: Person` match it.
- **Classes** — `A:::tag` (chainable), or `class A,B,C tag` for several at once.
- **No header, no direction.** Layout comes from the annotations, not a `TD`/`LR` keyword.

Mermaid arrows (`-->`, `-.->`, `==>`, `---`), pipe labels (`A -->|left| B`), and a leading
`graph`/`flowchart` line are also accepted, so existing diagrams paste in.

## Annotations

Spatial operations, inline, one per line — `@name(arg=value, …)`:

| kind | annotations |
|---|---|
| **constraints** (layout) | `orientation`, `cyclic`, `align`, `group` |
| **directives** (styling) | `atomColor`, `size`, `icon`, `edgeColor`, `attribute`, `hideField`, `hideAtom`, `inferredEdge`, `tag`, `flag`, `projection` |

Values are barewords (`below`), quoted strings (`'left subtree'`, or a comprehension
`'{x: Person | …}'`), numbers, or lists (`[below, left]`). A `%%@name(...)` form is accepted
too, so a block survives being pasted into a vanilla Mermaid renderer. Bad names or
arguments come back on the result as `annotationErrors`.

## Selectors

An edge's label **is** its relation name — that's the model. Two built-in edge relations
and the node sets round it out:

| selector | selects |
|---|---|
| `<label>` | edges carrying that label — `A -> B : left` → `left` |
| `_` | the unlabeled edges |
| `_links` | every edge |
| `<type>` | nodes of that type — `A[Person]` → `Person` (untyped nodes are `Node`) |
| `<class>` | nodes carrying that class — `class A,B team` → `team` |

Each edge is **drawn once** (under its label, or `_`). `_links` and the node-set relations
are selector-only — hidden from drawing so they don't double-draw — but still resolve in
selectors. Name a class and an edge label distinctly; a shared spelling collides them.

## In Markdown

One tag turns on rendering for a whole page; the engine is injected if it isn't already
loaded. **[GUIDE.md](GUIDE.md) is the full walkthrough** — the short version:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-graph/src/auto.js"></script>
```

`src/markdown.js` exports, if you'd rather drive it:

| export | |
|---|---|
| `autoRender(opts)` | render every block on the page (injects the engine if absent) |
| `renderSpytialGraphs(root = document, opts)` | render blocks under `root`; returns per-block results |
| `ensureEngineLoaded(opts)` | inject d3 + WebCola + spytial-core if absent |
| `whenEngineReady(ms)` | resolves once the engine is available |

`opts`: `height` (default `360`; per-block `data-height`), `theme`, `injectEngine`. It picks
up the `<pre><code class="language-spytial-graph">` markup that marked, markdown-it, MkDocs,
and Docusaurus emit — no plugin needed.

## Programmatic API

```js
import { renderSpytialGraph, mountGraph } from 'spytial-graph';

const graph = mountGraph(document.getElementById('out'), { width: 800, height: 600 });
const result = await renderSpytialGraph(graph, `
A -> B
A -> C

@orientation(selector=_links, directions=[below])
`);
```

`renderSpytialGraph(graphEl, source, opts)` →
`{ applied, layout, error, selectorErrors, annotationErrors, parsed, data, instance, rules, hiddenRelations }`.
`mountGraph(container, opts)` creates/returns a `<webcola-cnd-graph>`. `opts.validator` is
`'qualitative'` (default, IIS clash reporting) or `'kiwi'`.

Lower-level inputs still work and **compose** with annotations: `opts.rules` (raw CnD YAML)
and the per-class `registerSpec` registry are merged through the shared `mergeSpecStrings`.

## How it renders

```
spytial-graph source (+ @annotations)
  └─ annotations.js → lift @orientation(...) out     → { source, specYaml }
  └─ parse.js       → { nodes, edges, classesPerNode }
  └─ relationalize  → { atoms, relations, hiddenRelations }
  └─ spytial-core   → JSONDataInstance → SGraphQueryEvaluator
                      → parseLayoutSpec → LayoutInstance.generateLayout
  └─ <webcola-cnd-graph>.renderLayout(layout)
```

When constraints can't all hold, `generateLayout` returns a best-feasible counterfactual plus
the minimal conflict (IIS); `renderSpytialGraph` sets the `unsat` attribute and the playground
shows an explanation. Malformed selectors come back as `selectorErrors`.

**Dependencies** (CDN, in order): d3 v4 · `webcola@3.4.0` · `spytial-core@2.9.1`. The last
auto-registers `<webcola-cnd-graph>` and exposes the engine on `window.spytialcore`; the
Markdown path injects all three. Vendor them locally for an offline deploy.

## Limitations

- A small notation — nodes, edges, labels, types, classes (see `parse.js`). No
  sequence/state/Gantt/pie diagrams.
- Edge labels are relations, not free text.
- No automatic live re-render — call `renderSpytialGraph` again (the playground does this on ⌘⏎).
