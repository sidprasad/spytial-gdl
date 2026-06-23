# spytial-mermaid

Render [Mermaid](https://mermaid.js.org/) flowcharts as **live SpyTial constraint
diagrams**, using SpyTial's standard `<webcola-cnd-graph>` renderer.

You write a Mermaid declaration; SpyTial gives you a faithful default diagram for
free, then lets you refine it with compact spatial operations (orientation, alignment,
grouping, cycles) written **inline as `@annotations`** — without rebuilding it. This is
the **Live Mermaid** tool of the [Spytial UIST 2026 demo](../spytial-uist-2026/): one of
three input modalities on the same `spytial-core` engine.

Two things make it feel like Mermaid:

- **`spytial-graph` in markdown.** Drop a fenced ` ```spytial-graph ` block into any
  markdown doc and it renders client-side, exactly the way ` ```mermaid ` does
  (see [markdown integration](#spytial-graph-in-markdown)).
- **Inline `@annotations`.** Spatial operations live *in the diagram source* —
  `@orientation(selector=link, directions=[below])` — mirroring the Python decorator DSL,
  so one block describes both the graph and its layout (see [annotations](#inline-annotations)).

> **Shape A.** SpyTial owns both layout *and* drawing. Mermaid is just an input
> notation: we parse the Mermaid *syntax* ourselves, turn it into a relational data
> instance, solve the constraints, and draw with WebCola. (The previous prototype used
> "Shape B" — render Mermaid's SVG, then post-nudge node positions; that renderer is
> gone.) The Mermaid library itself is no longer a dependency.

## Try it

Everything loads from CDN — no `npm install` needed:

```bash
# from the spytial-mermaid directory
npm run serve            # zero-dep static server (node), port 8100
# open http://localhost:8100/playground/             ← Live Mermaid playground
# open http://localhost:8100/examples/markdown.html  ← spytial-graph in markdown
# open http://localhost:8100/examples/binary-tree.html   ← programmatic API demo
```

(Any static file server works — e.g. `python3 -m http.server`. A server is required
because the pages load `src/index.js` as an ES module.)

The **playground** is a Mermaid live editor: a single editor where you write the
flowchart and its `@annotations` together, plus a live constraint diagram you can drag,
zoom, and share via URL. Pick an example from the top-right menu.

## Inline annotations

Spatial operations are written **inline in the diagram source**, one per line, mirroring
the Python decorator DSL (`@orientation(...)`). A single block then describes both the
graph and how it should be laid out:

````
```spytial-graph
flowchart TD
  A -->|left| B
  A -->|right| C
  class A,B,C tree

@orientation(selector=tree_edge, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```
````

**Grammar** — one annotation per line; two forms are accepted:

```
@name(key=value, key2=[a, b], key3='quoted text')
%%@name(...)     ← mermaid-comment-guarded, so the block still degrades gracefully
%% @name(...)      if pasted into a vanilla Mermaid renderer
```

Values are barewords (`link`, `below`, `clockwise`), quoted strings (`'left subtree'`,
or a comprehension selector `'{x: rect | ...}'`), numbers, or lists (`[below, left]`).
The selector names are exactly the relations `relationalize` emits — see
[Selectors](#selectors-what-relationalize-emits).

**Vocabulary** (mirrors the Python `CONSTRAINT_TYPES` / `DIRECTIVE_TYPES`). Every
annotation compiles generically to `{ <name>: { ...args } }`, so all are supported:

| kind | annotations |
|---|---|
| **constraints** (layout) | `orientation`, `cyclic`, `align`, `group` |
| **directives** (styling) | `atomColor`, `size`, `icon`, `edgeColor`, `attribute`, `hideField`, `hideAtom`, `inferredEdge`, `tag`, `flag`, `projection` |

Examples:

```
@orientation(selector=link, directions=[right])          # pipeline reads left → right
@cyclic(selector=link, direction=clockwise)              # arrange the edge cycle as a ring
@align(selector=row, direction=top)                      # line up on a shared axis
@group(selector=leftSubtree, name='left subtree')        # draw a labeled region
@atomColor(selector=root, value='#ffe7b3')               # tint a node
@flag(name=hideDisconnected)                             # a rendering switch
```

Unknown names, malformed arguments, and missing commas are reported back on the result as
`annotationErrors` (`{ line, text, message }`); a selector that doesn't resolve comes back
as `selectorErrors`, as before.

## spytial-graph in markdown

`src/markdown.js` renders ` ```spytial-graph ` fenced blocks the way people render
` ```mermaid ` — entirely client-side, no build step. It scans *already-rendered* HTML
for the code blocks a markdown renderer produced and swaps each for a live diagram, so it
works with any pipeline (marked, markdown-it, MkDocs, Docusaurus, …).

Two scripts on the page — the engine, then one import — and you're done:

```html
<!-- d3 v4 + WebCola + spytial-core (engine + <webcola-cnd-graph>) -->
<script src="https://d3js.org/d3.v4.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/webcola@3.4.0/WebCola/cola.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/spytial-core@2.9.1/dist/browser/spytial-core-complete.global.js"></script>

<script type="module">
  import { initStartOnLoad } from './src/markdown.js';
  initStartOnLoad();              // à la mermaid.initialize({ startOnLoad: true })
</script>
```

| export | meaning |
|---|---|
| `initStartOnLoad(opts)` | wait for the engine, then render every `spytial-graph` block on the page. |
| `renderSpytialGraphs(root = document, opts)` | render the blocks under `root` (call after you inject HTML yourself); returns per-block results. |
| `whenEngineReady(timeoutMs)` | resolves once spytial-core + the custom element have loaded. |

`opts`: `height` (number px or CSS string, default `360`; a block may override with a
`data-height` attribute), `theme` (`'light'`/`'dark'`). See
[`examples/markdown.html`](examples/markdown.html) for an end-to-end demo using `marked`.

> **Distribution.** Like Mermaid (consumed as an ESM-from-CDN import), this ships as a
> no-build ES module — that *is* the "just like Mermaid" experience. A single-file global
> IIFE bundle and a markdown-it plugin are possible future add-ons; neither is needed for
> the markdown workflow above.

## Pipeline

```
mermaid source (+ inline @annotations)
  └─ annotations.js    → { source (annotations stripped), specYaml }
  └─ parse.js          → { nodes, edges, classesPerNode }
  └─ relationalize.js  → { atoms, relations, hiddenRelations }
  └─ spytial-core standard pipeline:
       new JSONDataInstance(data)
       SGraphQueryEvaluator().initialize({ sourceData })
       parseLayoutSpec(annotations + rules)   (+ injected hideField directives)
       new LayoutInstance(spec, evaluator, 0, true, undefined, 'qualitative')
       .generateLayout(instance)         → { layout, error, selectorErrors }
  └─ <webcola-cnd-graph>.renderLayout(layout)
```

## Public API

```js
import { renderMermaid, mountGraph } from 'spytial-mermaid';

// 1. Create (or reuse) a <webcola-cnd-graph> element inside a container.
const graph = mountGraph(document.getElementById('out'), { width: 800, height: 600 });

// 2. Render a spytial-graph source — spatial operations are inline @annotations.
const result = await renderMermaid(graph, `
graph TD
  A --> B
  A --> C

@orientation(selector=link, directions=[below])
`);
```

`renderMermaid(graphEl, source, opts)` →
`{ applied, layout, error, selectorErrors, annotationErrors, parsed, data, instance, rules, hiddenRelations }`.

| opt | meaning |
|---|---|
| `validator` | `'qualitative'` (default, IIS clash reporting) or `'kiwi'`. |
| `rules` | *(advanced)* extra CnD layout-spec YAML (string), merged with the inline annotations. |
| `extraSpec` | *(advanced)* extra YAML appended when merging from the registry. |

`mountGraph(container, { width, height, theme, ariaLabel })` — creates/returns a
`<webcola-cnd-graph>` element. If `container` already is one, it's returned as-is.

### Advanced: explicit specs and the class-keyed registry

Inline `@annotations` are the primary authoring model. For programmatic callers, the lower
level still works and **composes** with annotations: pass `opts.rules` (raw CnD YAML), or
register a spec per Mermaid class with `registerSpec(className, yaml)` — `renderMermaid`
merges the registered specs for whichever classes appear in the source. All sources are
concatenated via the shared `mergeSpecStrings` merge.

```js
import { registerSpec, clearRegistry } from 'spytial-mermaid';
registerSpec('tree', `constraints:\n  - orientation: { selector: tree_edge, directions: [below] }`);
clearRegistry();   // reset
```

## Selectors: what relationalize emits

A Mermaid edge can be selected by several relation names. Each mermaid edge is **drawn
exactly once**; the rest are *selector-only* (hidden from drawing, see below).

| relation | arity | drawn? | example selector |
|---|---|---|---|
| `<label>` | 2 | ✅ drawn | `A -->|left| B` → `selector: left` |
| `link` | 2 | ✅ drawn | unlabeled `A --> B` → `selector: link` |
| `edge` | 2 | hidden | every edge → `selector: edge` |
| `<class>` | 1 | hidden | `class A,B tree` → `selector: tree` |
| `<class>_edge` | 2 | hidden | edges between two `tree` nodes → `selector: tree_edge` |

Node **type** = the Mermaid shape (`rect`, `circle`, `diamond`, `cylinder`,
`subroutine`, `asymmetric`, `round`) or `MermaidNode` for a plain `A`, so
`selector: diamond` targets all decision nodes.

**Name-collision warning:** if a class name and an edge label share a spelling, two
relations get that name (one unary, one binary). Name classes and labels distinctly.

## Why "draw each edge once" (the `hideField` trick)

The standard renderer draws an edge for **every** relation tuple, labeled with the
relation name (and a *unary* relation as a self-loop on each member). Since
`relationalize.js` emits each edge into several relations (its label *and* the catch-all
`edge` *and* any `<class>_edge`) plus a unary membership relation per class, drawing all
of them would produce duplicate lines and stray self-loops.

So relationalize marks every selector-only relation (`edge`, `<class>`, `<class>_edge`)
as **hidden**, and `index.js` injects a `hideField` directive for each before solving:

```yaml
directives:
  - hideField: { field: edge }
  - hideField: { field: tree }
  - hideField: { field: tree_edge }
```

A hidden relation is removed from the drawn graph but stays in the data instance, so
`selector: edge` / `selector: tree_edge` still resolve. Net effect: each Mermaid edge is
drawn once (carrying its Mermaid label, or none for `link`), while every selector still
works.

## Conflicts (unsat)

When rules can't all hold, `generateLayout` returns a counterfactual `layout` plus an
`error` (the minimal conflicting constraints / IIS). `renderMermaid` sets the `unsat`
attribute on the `<webcola-cnd-graph>` element and returns the error structured; the
playground renders the best-feasible layout and shows the explanation modal. Malformed
selectors come back as `selectorErrors`.

## Dependencies (CDN)

The pages load, in order:

```
d3 v4         https://d3js.org/d3.v4.min.js
webcola       https://cdn.jsdelivr.net/npm/webcola@3.4.0/WebCola/cola.min.js
spytial-core  https://cdn.jsdelivr.net/npm/spytial-core@2.9.1/dist/browser/spytial-core-complete.global.js
components    https://cdn.jsdelivr.net/npm/spytial-core@2.9.1/dist/components/react-component-integration.global.js (+ .css)
```

`spytial-core-complete.global.js` auto-registers the `<webcola-cnd-graph>` custom
element and exposes the engine on `window.spytialcore` (legacy alias `CndCore`). The
components bundle supplies the playground's error/clash-explanation modal. For a fully
offline demo, vendor these four assets locally. (The markdown integration and
`examples/markdown.html` need only the first three — d3, WebCola, spytial-core.)

## Limitations

- **Flowchart subset only** — `graph TD|LR|TB|BT|RL` / `flowchart …`, the node shapes
  and arrow kinds in `parse.js`. No class/state/sequence/Gantt/pie diagrams.
- **Edge labels are relations**, not free text — see the collision warning above.
- **No automatic live re-render** on source change — call `renderMermaid` again
  (the playground does this on Apply / ⌘⏎).
