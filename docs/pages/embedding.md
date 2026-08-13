# Embedding & API

Rendering a diagram in a page, and driving one from JavaScript.

The embedding layer scans already-rendered HTML for the code blocks a Markdown
renderer produces and swaps each one for a live diagram. It's the same path the
` ```spytial-gdl ` blocks on this site go through.

## What gets detected

A block is recognized from any of the markup that the common renderers, and
hand-authored pages, emit. Generators disagree about which element carries the
language, so all four places are checked:

| markup | source |
|---|---|
| `<pre><code class="language-spytial-gdl">` | marked · markdown-it · kramdown · Prism · highlight.js |
| `<pre class="language-spytial-gdl">`, `<pre class="spytial-gdl">` | pymdownx · Pandoc · MkDocs custom fences |
| `<code class="language-spytial-gdl">`, `<code class="spytial-gdl">` | Hugo (Chroma) · Quarto |
| `<div class="language-spytial-gdl">`, `<div class="highlight-spytial-gdl">` | Jekyll · MkDocs Material · Docusaurus · VitePress · Sphinx |
| `data-language` / `data-lang` attribute | Astro · Starlight · Hugo |
| `<div class="spytial-gdl">` | hand-authored HTML |

`spytial` is accepted as an alias for `spytial-gdl`. Editable blocks use the
dedicated languages `spytial-gdl-editable` and `spytial-editable`, or a
`data-editable` attribute on the host. See [Editable diagrams](#editable-diagrams).

The source is read back with the line structure restored, because several
pipelines rebuild a block one element per line (a `<div>` or a `<br>` where a
newline used to be) and the theme's copy button often sits inside the block.
When the block is wrapped in a container that holds nothing else, the container
is replaced along with it, so no empty themed box is left behind.

No platform needs a plugin. [Platforms](platforms.md) has the per-generator
recipes, where the script tag goes, and the handful of things that can still go
wrong.

## The functions

Import from `src/markdown.js`, or from the CDN URL:

```js
import {
  autoRender, renderSpytialGdls, ensureEngineLoaded, whenEngineReady,
} from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/markdown.js';
```

| export | what it does |
|---|---|
| `autoRender(opts)` | render every block on the page once the DOM is ready, injecting the engine if absent. The one-liner the drop-in tag calls. |
| `renderSpytialGdls(root = document, opts)` | render blocks under `root`; returns a per-block results array. Use it after you inject HTML yourself. |
| `ensureEngineLoaded(opts)` | inject d3 + WebCola + spytial-core if they aren't already on the page. |
| `whenEngineReady(ms)` | resolve once the engine global is available (polls, with a timeout). |
| `observeBlocks(opts)` | watch for blocks added later and render them; returns a stop function. `autoRender` calls it for you. |

`src/auto.js` is `autoRender()` wrapped in a module, so the drop-in tag
`<script type="module" src=".../src/auto.js">` needs no code of your own.

## Options

`opts` is shared by `autoRender` and `renderSpytialGdls`:

| option | default | meaning |
|---|---|---|
| `height` | `360` | diagram height: a number of pixels, or any CSS length. A block overrides it with `data-height`. |
| `theme` | `'light'` | `'light'` or `'dark'`; themes the device chrome and the graph. |
| `editable` | `false` | render every block as the editor (see [Editable diagrams](#editable-diagrams)). |
| `observe` | `true` | (`autoRender` only) keep watching for blocks added after the first pass, so client-side navigation renders too. |
| `injectEngine` | `true` | inject the CDN engine scripts if absent. Set it to `false` if you load spytial-core yourself. |
| `deps` | built-in | override the three engine script URLs, to self-host or pin. |
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

`result` is the full [`renderSpytialGdl`](#renderspytialgdl) return for a read-only
block, and `handle` is the [editable handle](#the-handle) for an editable one.

## The Source panel

Every embed frames the diagram beside a collapsible Source panel that mirrors the
live notation. Read-only blocks open with the panel collapsed to a thin rail: click
it to reveal the notation, then **⧉ Copy** to lift it out. Editable blocks open with
the panel expanded as a text editor, so you can drag the graph or edit the text and
**Run ▸** (⌘⏎) it back in, with the two staying in sync.

When constraints clash, a collapsible conflict panel appears inside the same
border, so the UNSAT report belongs to the diagram rather than to the page prose.
See [Conflicts & UNSAT](annotations.md#errors-and-conflicts).

## Self-hosting the engine

For an offline or version-pinned deploy, host the three engine scripts yourself and
pass them as `deps`. Load order matters: d3, then WebCola, then spytial-core.

```js
autoRender({
  deps: [
    '/vendor/d3.v4.min.js',
    '/vendor/cola.min.js',
    '/vendor/spytial-core-complete.global.js',
  ],
});
```

Or load spytial-core on the page yourself and call
`autoRender({ injectEngine: false })`. The exact dependency set is in
[Architecture → dependencies](architecture.md#dependencies).

## Framework notes

Jekyll, MkDocs, Hugo, Docusaurus, VitePress, Sphinx, Starlight, Quarto, Pollen
and Eleventy all work with the drop-in tag in their base template and nothing
else. [Platforms](platforms.md) gives each one's script-tag syntax, the two
places a highlighter can still get in the way, and what to do about it.

## Editable diagrams

A read-only block draws the notation. An editable block renders the same graph onto
Spytial's `<structured-input-graph>` editor instead, so readers can add and delete
nodes, drag to connect edges, and rename relations, with constraints re-solving as
they go. They can re-get the notation at any point. Try it, either by dragging the
picture or by editing the text and pressing **Run ▸** (⌘⏎):

```spytial-gdl-editable
A -> B : left
A -> C : right

@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
@orientation(selector=_links, directions=[below])
```

The Source panel beside the diagram is live in both directions: edit the graph and
the text re-derives, edit the text and **Run ▸** pushes it back into the diagram.
**⧉ Copy** lifts the result out, `@annotations` and all. Your spatial annotations
are re-appended verbatim on every round-trip, so editing the graph's data never
rewrites your layout rules.

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

Outside Markdown, render onto an element and get a handle back:

```js
import { renderSpytialGdlEditable } from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js';

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

### renderSpytialGdlEditable

```text
renderSpytialGdlEditable(container, source, opts?) → Promise<handle>
```

- `container`: an `Element` to mount into, or a `<structured-input-graph>` itself.
- `source`: spytial-gdl text with inline `@annotations`, same as the read-only path.
- `opts`: `{ rules?, extraSpec?, width?, height?, theme?, ariaLabel? }`.

Returns `{ applied: false, reason, … }` if the source has no nodes; otherwise the
handle below.

### The handle

| member | what it gives you |
|---|---|
| `getSource()` | re-get spytial-gdl notation for the current graph, with your `@annotations` re-appended verbatim |
| `getValue()` | the reified value: `{ atoms, relations }` JSON |
| `onChange(cb)` | runs `cb({ source, value, error })` after every edit; returns an unsubscribe function |
| `element` | the live `<structured-input-graph>` |
| `dataInstance` | the backing data instance |
| `applied`, `parsed`, `annotationErrors`, `hiddenRelations`, `rules` | render metadata, as on the read-only result |

`onChange` coalesces a burst of synchronous mutations (an edge rename is a remove
plus an add, for instance) into a single callback, and rebinds automatically if the
editor's "clear all" swaps in a fresh data instance. You get one clean event per
logical edit.

### The serializer on its own

`getSource()` is built on `serializeToSpytialGdl`, the inverse of the render
pipeline. You can call it directly on any `{ atoms, relations }` object, or on
anything with a `reify()` method:

```js
import { serializeToSpytialGdl } from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js';

const notation = serializeToSpytialGdl(value, { annotations: annotationLines });
```

The playground's **Edit** toggle and
[`examples/editable.html`](https://github.com/sidprasad/spytial-gdl/blob/main/examples/editable.html)
are built on exactly this.

### Why explicit Run, not live binding

Text to diagram is an explicit apply (**Run ▸** / ⌘⏎) rather than continuous
binding. Continuous binding would fight the normalizing serializer mid-keystroke,
producing caret jumps, dropped `%%` comments, and lost node positions. Diagram to
text is live, since there's no text the user is in the middle of editing.

## Programmatic API

Everything the embedding layer does, you can do directly. Import from the package
if you use a bundler, or from the CDN
(`https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js`):

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
| `renderSpytialGdlEditable(container, source, opts)` | render onto the editor, returning a [handle](#the-handle) |
| `serializeToSpytialGdl(value, opts)` | the notation serializer, inverse of render |
| `extractAnnotations(rawSource)` | lift inline `@annotations` out of source |
| `registerSpec`, `clearRegistry`, `mergeSpecStrings`, `mergeSpecsForClasses` | the rule registry and merge helpers |

### mountGraph

```text
mountGraph(container, opts?) → <webcola-cnd-graph>
```

Creates, or reuses, a read-only graph element inside `container` and returns it. If
`container` already is a `<webcola-cnd-graph>`, it comes back as-is; otherwise an
existing child of that tag is reused, or a new one is created and appended.

`opts` is `{ width?, height?, theme?, ariaLabel? }`, set as attributes on a freshly
created element.

> **Note.** spytial-core is a peer dependency loaded on the page, as the global
> `window.spytialcore`. `mountGraph` and `renderSpytialGdl` don't import it, which
> is what keeps this module a bare browser ES module. If it isn't present you get a
> clear "spytial-core is not loaded" error, and the Markdown path injects it for
> you. See [Architecture](architecture.md#dependencies).

### renderSpytialGdl

```text
renderSpytialGdl(graphEl, source, opts?) → Promise<result>
```

- `graphEl`: a `<webcola-cnd-graph>`, from `mountGraph`.
- `source`: spytial-gdl text with inline `@annotations`.
- `opts`: see below.

#### opts

| option | default | meaning |
|---|---|---|
| `validator` | `'qualitative'` | constraint validator. `'qualitative'` gives IIS clash reporting plus a best-feasible counterfactual; `'kiwi'` is the alternative solver. |
| `rules` | none | raw CnD layout YAML, merged with the inline annotations. An advanced escape hatch. |
| `extraSpec` | none | extra spec YAML folded in via the class registry. |

#### The result object

```text
{ applied, layout, error, selectorErrors, annotationErrors, parseErrors,
  parsed, data, instance, rules, hiddenRelations }
```

| field | meaning |
|---|---|
| `applied` | `true` if a layout was drawn onto the element |
| `layout` | the computed layout; on a clash, the best-feasible counterfactual |
| `error` | the constraint error / UNSAT core, or `null` (see [Conflicts](annotations.md#errors-and-conflicts)) |
| `selectorErrors` | selectors that didn't resolve; `[]` when clean |
| `annotationErrors` | malformed or unknown annotations, as `[{ line, text, message }]` |
| `parseErrors` | graph lines the parser flagged, as `[{ line, text, severity, message }]`, where `severity` is `'error'` or `'warning'` (an ignored Mermaid construct) |
| `parsed` | `{ nodes, edges, classesPerNode, errors }` from the parser |
| `data` | the relational `{ atoms, relations }` handed to spytial-core |
| `instance` | the `JSONDataInstance` built from `data` |
| `rules` | the merged layout YAML actually solved |
| `hiddenRelations` | selector-only relations hidden from drawing (`_links`, types, classes) |

When `source` has no nodes, you get
`{ applied: false, reason, parsed, annotationErrors, parseErrors }` instead.

#### Re-rendering

The read-only view does not auto-re-render. To update a diagram, call
`renderSpytialGdl` again on the same element with new source; that's what the
playground does on ⌘⏎. For live editing with a notation round-trip, use
[`renderSpytialGdlEditable`](#editable-diagrams) instead.

```spytial-gdl
A:::Person -> B:::Person : knows
B -> C:::Person : knows
C -> A : knows

@cyclic(selector=knows, direction=clockwise)
@atomStyle(selector=Person, borderStyle(color='#e7defb'))
```

### Composing rules: registry and YAML

Inline `@annotations` are the primary authoring model, but they compose with two
lower-level inputs through the shared `mergeSpecStrings` concat. The resolution
order, per render:

1. specs registered with `registerSpec` for the classes used in this source, plus
   any `opts.extraSpec`;
2. the inline `@annotation` spec compiled from the source;
3. an explicit `opts.rules` string.

```js
import { registerSpec, renderSpytialGdl, mountGraph } from 'spytial-gdl';

// Reusable layout for any node tagged `class … server`:
registerSpec('server', `
directives:
  - atomStyle: { selector: server, borderStyle: { color: '#dbe9ff' } }
`);

const g = mountGraph(el);
await renderSpytialGdl(g, 'a:::Box -> b:::Box\nclass a,b server', {
  rules: 'constraints:\n  - orientation: { selector: _links, directions: [right] }',
});
```

`mergeSpecStrings([...])` is the same concat the registry uses, exposed for callers
who assemble specs themselves. `clearRegistry()` empties the per-class registry,
which is handy between independent renders or tests.

### extractAnnotations and serializeToSpytialGdl

The two ends of the pipeline, usable standalone:

- `extractAnnotations(rawSource)` returns
  `{ source, specYaml, annotationLines, errors }`, lifting the `@…` lines out and
  compiling them to authoring YAML.
- `serializeToSpytialGdl(value, { annotations })` returns notation text, turning a
  `{ atoms, relations }` value back into spytial-gdl source. This is what powers
  the editable handle's [`getSource()`](#the-serializer-on-its-own).

### compileSpytialGdl

Everything spytial-gdl does *before* the engine: no DOM, no `spytial-core`, no
rendering. Useful on a server, in a test, or anywhere you want the spec without a
diagram.

```js
import { compileSpytialGdl } from 'spytial-gdl';

const { ok, datum, rules, hiddenRelations, annotationErrors } =
  compileSpytialGdl('a -> b : next\n@orientation(selector=next, directions=[right])');
```

- `datum` — `{ atoms, relations }`, the graph in relational form.
- `rules` — the complete layout spec as YAML, with every source already merged
  (registered class specs, inline annotations, `opts.rules`) and the selector-only
  relations already hidden. This is the exact string handed to the engine.
- `ok` is `false`, with a `reason`, when the source parses to no nodes.

Both render paths call this, so what you get here is what a diagram gets. That is
also what lets [the conformance
suite](architecture.md#testing-what-a-spec-means) check what our specs entail
without rendering anything.

## Next

- [Conflicts & errors](annotations.md#errors-and-conflicts): reading the panels when something clashes.
- [Architecture](architecture.md): what happens between source and pixels.
