# Embedding & API

*One tag lights up a whole page. This is the framework-agnostic integration surface.*

The embedding layer scans *already-rendered* HTML for the code blocks a Markdown
renderer produces and swaps each one for a live diagram. It is the same path the
` ```spytial-gdl ` blocks on this very site go through.

## What gets detected

A block is recognized from any of the markup that common renderers (and hand-authored
pages) emit:

| markup | source |
|---|---|
| `<pre><code class="language-spytial-gdl">` | marked · markdown-it · Prism · highlight.js |
| `<pre class="language-spytial-gdl">` | some pipelines |
| `<div class="spytial-gdl">` | hand-authored HTML |

`spytial` is accepted as an alias for `spytial-gdl`. Editable blocks use the
dedicated languages `spytial-gdl-editable` / `spytial-editable`, or a
`data-editable` attribute on the host — see [Editable diagrams](#editable-diagrams).

No plugin is needed for MkDocs, Docusaurus, marked, markdown-it, or GitHub-style
pipelines: they already emit the markup above.

## The functions

Import from `src/markdown.js` (or the CDN URL):

```js
import {
  autoRender, renderSpytialGdls, ensureEngineLoaded, whenEngineReady,
} from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/markdown.js';
```

| export | what it does |
|---|---|
| `autoRender(opts)` | render every block on the page once the DOM is ready (injects the engine if absent). The one-liner the drop-in tag calls. |
| `renderSpytialGdls(root = document, opts)` | render blocks under `root`; returns a per-block results array. Use after you inject HTML yourself. |
| `ensureEngineLoaded(opts)` | inject d3 + WebCola + spytial-core if they aren't already on the page. |
| `whenEngineReady(ms)` | resolve once the engine global is available (poll with timeout). |

`src/auto.js` is just `autoRender()` wrapped in a module, so the drop-in tag
`<script type="module" src=".../src/auto.js">` needs no code of your own.

## Options

`opts` is shared by `autoRender` and `renderSpytialGdls`:

| option | default | meaning |
|---|---|---|
| `height` | `360` | diagram height — a number (px) or any CSS length. A block overrides it with `data-height`. |
| `theme` | `'light'` | `'light'` or `'dark'`; themes the device chrome and the graph. |
| `editable` | `false` | render every block as the editor (see [Editable diagrams](#editable-diagrams)). |
| `injectEngine` | `true` | inject the CDN engine scripts if absent. Set `false` if you load spytial-core yourself. |
| `deps` | built-in | override the three engine script URLs (to self-host / pin). |
| `timeoutMs` | `10000` | how long `whenEngineReady` polls before giving up. |

```js
// Render a fragment you built at runtime, dark, 420px tall:
await renderSpytialGdls(document.getElementById('panel'), { theme: 'dark', height: 420 });
```

## The results array

`renderSpytialGdls` returns one entry per block, so you can react to failures:

```js
const results = await renderSpytialGdls(document);
const failed = results.filter((r) => r.error);
// each entry: { host, applied?, result?, error?, editable?, handle? }
```

`result` is the full [`renderSpytialGdl`](#renderspytialgdl) return for a
read-only block; `handle` is the [editable handle](#the-handle) for an
editable one.

## The Source panel

Every embed frames the diagram beside a collapsible **Source** panel that mirrors
the live notation:

- **Read-only blocks** open with the panel collapsed to a thin rail — click it to
  reveal the notation, **⧉ Copy** to lift it out.
- **Editable blocks** open with the panel expanded as a text editor: drag the graph
  *or* edit the text and **Run ▸** (⌘⏎) it back in, the two staying in sync.

When constraints clash, an attached, collapsible conflict panel appears *inside the
same border* — so the UNSAT report obviously belongs to the diagram, not the page
prose. See [Conflicts & UNSAT](annotations.md#errors-and-conflicts).

## Self-hosting the engine

For an offline or version-pinned deploy, host the three engine scripts yourself and
pass them as `deps` (load order matters — d3, then WebCola, then spytial-core):

```js
autoRender({
  deps: [
    '/vendor/d3.v4.min.js',
    '/vendor/cola.min.js',
    '/vendor/spytial-core-complete.global.js',
  ],
});
```

Or load spytial-core on the page yourself and call `autoRender({ injectEngine: false })`.
The exact dependency set is in [Architecture → dependencies](architecture.md#dependencies).

## Framework notes

- **MkDocs (Material).** Works out of the box. To stop the highlighter from
  mangling the block, register it as a custom fence (`pymdownx.superfences`) that
  renders verbatim, then load `auto.js` via `extra_javascript`.
- **Docusaurus.** Author the block in MDX; load `auto.js` from a client module or a
  `<script type="module">` in the page. Re-run `renderSpytialGdls` on route change
  if you use client-side navigation.
- **Static site generators (Eleventy, Hugo, Jekyll).** Any of them emit the
  `language-spytial-gdl` markup — add the drop-in tag to your base template.

## Editable diagrams

A read-only block draws the notation. An **editable** block renders the same graph
onto Spytial's `<structured-input-graph>` editor instead: readers add and delete
nodes, drag to connect edges, rename relations — constraints re-solve live — and
**re-get the notation** at any time. Try it (drag the picture, or edit the text and
press **Run ▸** / ⌘⏎):

```spytial-gdl-editable
A -> B : left
A -> C : right

@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
@orientation(selector=_links, directions=[below])
```

The **Source** panel beside the diagram is live in both directions: edit the graph
and the text re-derives; edit the text and **Run ▸** pushes it back into the
diagram. **⧉ Copy** lifts the result out, `@annotations` and all. Your spatial
annotations are re-appended verbatim on every round-trip — editing the graph's
*data* never rewrites your layout rules.

### Turning a block editable

Three equivalent ways, in order of locality:

````markdown
```spytial-gdl-editable
A -> B
```
````

```html
<div class="spytial-gdl" data-editable>A -> B</div>
```

```js
autoRender({ editable: true });   // every block on the page becomes an editor
```

### Driving the editor from JavaScript

Outside Markdown, render onto an element and get a **handle** back:

```js
import { renderSpytialGdlEditable } from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js';

const h = await renderSpytialGdlEditable(document.getElementById('out'), `
A -> B : left
A -> C : right

@orientation(selector=left, directions=[left])
`);

h.onChange(({ source, value }) => {
  console.log(source); // spytial-gdl notation, re-derived from the edited graph
  console.log(value);  // its reified value — { atoms, relations } JSON
});
```

### renderSpytialGdlEditable

```text
renderSpytialGdlEditable(container, source, opts?) → Promise<handle>
```

- `container` — an `Element` to mount into, or a `<structured-input-graph>` itself.
- `source` — spytial-gdl text with inline `@annotations` (same as the read-only path).
- `opts` — `{ rules?, extraSpec?, width?, height?, theme?, ariaLabel? }`.

Returns `{ applied: false, reason, … }` if the source has no nodes; otherwise the
handle below.

### The handle

| member | what it gives you |
|---|---|
| `getSource()` | re-get spytial-gdl notation for the current graph (your `@annotations` re-appended verbatim) |
| `getValue()` | the reified value — `{ atoms, relations }` JSON |
| `onChange(cb)` | runs `cb({ source, value, error })` after every edit; returns an unsubscribe function |
| `element` | the live `<structured-input-graph>` |
| `dataInstance` | the backing data instance |
| `applied`, `parsed`, `annotationErrors`, `hiddenRelations`, `rules` | render metadata, as on the read-only result |

`onChange` coalesces a burst of synchronous mutations (e.g. an edge rename =
remove + add) into a single callback, and rebinds automatically if the editor's
"clear all" swaps in a fresh data instance — so you get exactly one clean event per
logical edit.

### The serializer on its own

`getSource()` is built on `serializeToSpytialGdl`, the inverse of the render
pipeline. You can call it directly on any `{ atoms, relations }` object (or anything
with a `reify()` method):

```js
import { serializeToSpytialGdl } from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js';

const notation = serializeToSpytialGdl(value, { annotations: annotationLines });
```

The playground's **Edit** toggle and [`examples/editable.html`](https://github.com/sidprasad/spytial-gdl/blob/main/examples/editable.html)
are built on exactly this.

### Why explicit Run, not live binding

Text → diagram is an **explicit apply** (Run ▸ / ⌘⏎), not continuous binding.
Continuous binding would fight the normalizing serializer mid-keystroke — caret
jumps, dropped `%%` comments, lost node positions. Diagram → text *is* live, since
there's no text the user is mid-edit on. This split is what keeps both directions
feeling stable.

## Programmatic API

Everything the embedding layer does, you can do directly. Import from the package
(bundler) or the CDN (`https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js`):

```js
import { renderSpytialGdl, mountGraph } from 'spytial-gdl';

const graph = mountGraph(document.getElementById('out'), { width: 800, height: 600 });
const result = await renderSpytialGdl(graph, `
A -> B
A -> C

@orientation(selector=_links, directions=[below])
`);
```

The full export surface:

| export | kind |
|---|---|
| `mountGraph(container, opts)` | create/return a read-only `<webcola-cnd-graph>` |
| `renderSpytialGdl(graphEl, source, opts)` | render source onto it |
| `mountInputGraph(container, opts)` | create/return an editable `<structured-input-graph>` |
| `renderSpytialGdlEditable(container, source, opts)` | render onto the editor → [handle](#the-handle) |
| `serializeToSpytialGdl(value, opts)` | the notation serializer (inverse of render) |
| `extractAnnotations(rawSource)` | lift inline `@annotations` out of source |
| `registerSpec`, `clearRegistry`, `mergeSpecStrings`, `mergeSpecsForClasses` | the rule registry / merge helpers |

### mountGraph

```text
mountGraph(container, opts?) → <webcola-cnd-graph>
```

Creates (or reuses) a read-only graph element inside `container` and returns it.
If `container` already *is* a `<webcola-cnd-graph>`, it's returned as-is; otherwise
an existing child of that tag is reused, or a new one is created and appended.

`opts`: `{ width?, height?, theme?, ariaLabel? }` — set as attributes on a freshly
created element.

> **Note** — spytial-core is a **peer dependency** loaded on the page (the global
> `window.spytialcore`). `mountGraph`/`renderSpytialGdl` don't import it, so this
> module stays a bare browser ES module. If it isn't present you get a clear
> "spytial-core is not loaded" error; the Markdown path injects it for you. See
> [Architecture](architecture.md#dependencies).

### renderSpytialGdl

```text
renderSpytialGdl(graphEl, source, opts?) → Promise<result>
```

- `graphEl` — a `<webcola-cnd-graph>` (from `mountGraph`).
- `source` — spytial-gdl text with inline `@annotations`.
- `opts` — see below.

#### opts

| option | default | meaning |
|---|---|---|
| `validator` | `'qualitative'` | constraint validator. `'qualitative'` gives IIS clash reporting + a best-feasible counterfactual; `'kiwi'` is the alternative solver. |
| `rules` | — | raw CnD layout YAML, merged with the inline annotations (advanced escape hatch). |
| `extraSpec` | — | extra spec YAML folded in via the class registry. |

#### The result object

```text
{ applied, layout, error, selectorErrors, annotationErrors, parseErrors,
  parsed, data, instance, rules, hiddenRelations }
```

| field | meaning |
|---|---|
| `applied` | `true` if a layout was drawn onto the element |
| `layout` | the computed layout; on a clash, the best-feasible **counterfactual** |
| `error` | the constraint error / UNSAT core, or `null` (see [Conflicts](annotations.md#errors-and-conflicts)) |
| `selectorErrors` | selectors that didn't resolve — `[]` when clean |
| `annotationErrors` | malformed/unknown annotations — `[{ line, text, message }]` |
| `parseErrors` | graph lines the parser flagged — `[{ line, text, severity, message }]`, `severity` `'error'` or `'warning'` (an ignored Mermaid construct) |
| `parsed` | `{ nodes, edges, classesPerNode, errors }` from the parser |
| `data` | the relational `{ atoms, relations }` handed to spytial-core |
| `instance` | the `JSONDataInstance` built from `data` |
| `rules` | the merged layout YAML actually solved |
| `hiddenRelations` | selector-only relations hidden from drawing (`_links`, types, classes) |

When `source` has no nodes, you instead get `{ applied: false, reason, parsed, annotationErrors, parseErrors }`.

#### Re-rendering

The read-only view does **not** auto-re-render. To update a diagram, call
`renderSpytialGdl` again on the same element with new source (the playground does
this on ⌘⏎). For live editing with a notation round-trip, use
[`renderSpytialGdlEditable`](#editable-diagrams) instead.

```spytial-gdl
A:::Person -> B:::Person : knows
B -> C:::Person : knows
C -> A : knows

@cyclic(selector=knows, direction=clockwise)
@atomColor(selector=Person, value='#e7defb')
```

### Composing rules: registry and YAML

Inline `@annotations` are the primary authoring model, but they **compose** with
two lower-level inputs through the shared `mergeSpecStrings` concat. The resolution
order, per render:

1. specs registered with `registerSpec` for the **classes used** in this source,
   plus any `opts.extraSpec`;
2. the inline `@annotation` spec compiled from the source;
3. an explicit `opts.rules` string.

```js
import { registerSpec, renderSpytialGdl, mountGraph } from 'spytial-gdl';

// Reusable layout for any node tagged `class … server`:
registerSpec('server', `
directives:
  - atomColor: { selector: server, value: '#dbe9ff' }
`);

const g = mountGraph(el);
await renderSpytialGdl(g, 'a:::Box -> b:::Box\nclass a,b server', {
  rules: 'constraints:\n  - orientation: { selector: _links, directions: [right] }',
});
```

`mergeSpecStrings([...])` is the same concat the registry uses, exposed for callers
who assemble specs themselves. `clearRegistry()` empties the per-class registry
(handy between independent renders / tests).

### extractAnnotations and serializeToSpytialGdl

The two ends of the pipeline, usable standalone:

- `extractAnnotations(rawSource)` → `{ source, specYaml, annotationLines, errors }`
  — lifts the `@…` lines out and compiles them to authoring YAML.
- `serializeToSpytialGdl(value, { annotations })` → notation text — the inverse,
  turning a `{ atoms, relations }` value back into spytial-gdl source. This powers
  the editable handle's [`getSource()`](#the-serializer-on-its-own).

## Next

- **[Conflicts & errors](annotations.md#errors-and-conflicts)** — reading the panels when something clashes.
- **[Architecture](architecture.md)** — what happens between source and pixels.
