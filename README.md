# spytial-mermaid

Render [Mermaid](https://mermaid.js.org/) flowcharts as **live SpyTial constraint
diagrams**, using SpyTial's standard `<webcola-cnd-graph>` renderer.

You write a Mermaid declaration; SpyTial gives you a faithful default diagram for
free, then lets you refine it with compact spatial rules (orientation, alignment,
grouping, cycles) — without rebuilding it. This is the **Live Mermaid** tool of the
[Spytial UIST 2026 demo](../spytial-uist-2026/): one of three input modalities on the
same `spytial-core` engine.

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
# open http://localhost:8100/playground/            ← Live Mermaid playground
# open http://localhost:8100/examples/binary-tree.html   ← programmatic API demo
```

(Any static file server works — e.g. `python3 -m http.server`. A server is required
because the pages load `src/index.js` as an ES module.)

The **playground** is a Mermaid live editor: a Mermaid pane, a low-code Layout-rules
pane (structured builder ⇄ YAML), and a live constraint diagram you can drag, zoom, and
share via URL. Pick an example from the top-right menu.

## Pipeline

```
mermaid source
  └─ parse.js          → { nodes, edges, classesPerNode }
  └─ relationalize.js  → { atoms, relations, hiddenRelations }
  └─ spytial-core standard pipeline:
       new JSONDataInstance(data)
       SGraphQueryEvaluator().initialize({ sourceData })
       parseLayoutSpec(rules)            (+ injected hideField directives)
       new LayoutInstance(spec, evaluator, 0, true, undefined, 'qualitative')
       .generateLayout(instance)         → { layout, error, selectorErrors }
  └─ <webcola-cnd-graph>.renderLayout(layout)
```

## Public API

```js
import { renderMermaid, mountGraph, registerSpec, clearRegistry } from 'spytial-mermaid';

// 1. Create (or reuse) a <webcola-cnd-graph> element inside a container.
const graph = mountGraph(document.getElementById('out'), { width: 800, height: 600 });

// 2. Render mermaid + an optional CnD rules spec onto it.
const result = await renderMermaid(graph, `
graph TD
  A --> B
  A --> C
`, {
  rules: `
constraints:
  - orientation: { selector: link, directions: [below] }
`,
});
```

`renderMermaid(graphEl, source, opts)` →
`{ applied, layout, error, selectorErrors, parsed, data, instance, rules, hiddenRelations }`.

| opt | meaning |
|---|---|
| `rules` | CnD layout-spec YAML (string). If omitted, rules are merged from `registerSpec` (see below). |
| `extraSpec` | extra YAML appended when merging from the registry. |
| `validator` | `'qualitative'` (default, IIS clash reporting) or `'kiwi'`. |

`mountGraph(container, { width, height, theme, ariaLabel })` — creates/returns a
`<webcola-cnd-graph>` element. If `container` already is one, it's returned as-is.

### Optional: class-keyed spec registry

Instead of passing `rules`, you can register a spec per Mermaid class; `renderMermaid`
merges the specs for whichever classes appear in the source:

```js
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
components bundle supplies the playground's low-code rules editor and error modal. For a
fully offline demo, vendor these four assets locally.

## Limitations

- **Flowchart subset only** — `graph TD|LR|TB|BT|RL` / `flowchart …`, the node shapes
  and arrow kinds in `parse.js`. No class/state/sequence/Gantt/pie diagrams.
- **Edge labels are relations**, not free text — see the collision warning above.
- **No automatic live re-render** on source/rules change — call `renderMermaid` again
  (the playground does this on Apply / ⌘⏎).
