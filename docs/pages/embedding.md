# Embed in a document

Add a live graph diagram to an HTML page or a Markdown site.

## Quick start

Add the renderer once to your HTML page or Markdown site's template:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

Then write a fenced block in your document:

````markdown
```spytial-gdl
A -> B
```
````

The script renders each `spytial-gdl` block after Markdown becomes HTML.
Serve the page over HTTP; ES modules cannot run from a `file://` URL. See the
[drop-in example](../examples/drop-in.html) or [platform setup](#platform-setup).

## Platform setup

Add the [script](#quick-start) to your site template. Keep `type="module"`.

**Jekyll**, **Hugo**, **Pollen**, and other template based sites: put the script
in the layout (`_layouts/default.html`, a `head` partial, or `template.html`).

**MkDocs 1.5+**, in `mkdocs.yml`:

```yaml
extra_javascript:
  - path: https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js
    type: module
```

**Docusaurus**, in `docusaurus.config.js`:

```js
scripts: [{ src: 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js', type: 'module' }],
```

**VitePress**, in `.vitepress/config.js`:

```js
head: [['script', { type: 'module', src: 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js' }]],
```

**Starlight**, in `astro.config.mjs`:

```js
head: [{ tag: 'script', attrs: { type: 'module', src: 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js' } }],
```

**Sphinx 1.8+**, in `conf.py`:

```python
html_js_files = [
    ('https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js', {'type': 'module'}),
]
```

**Quarto**, in the YAML header or `_quarto.yml`:

```yaml
format:
  html:
    include-in-header:
      - text: <script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

### MkDocs

Default `fenced_code` output works. With Material or another Pygments based
highlighter, register a verbatim fence to preserve the source:

```yaml
markdown_extensions:
  - pymdownx.superfences:
      custom_fences:
        - name: spytial-gdl
          class: spytial-gdl
          format: !!python/name:pymdownx.superfences.fence_code_format
```

This emits `<pre class="spytial-gdl"><code>`.

### Hugo

Chroma's default output works. For a verbatim block, add a render hook at
`layouts/_default/_markup/render-codeblock-spytial-gdl.html`:

```html
<pre class="spytial-gdl"><code>{{ .Inner }}</code></pre>
```

### Pollen

In Markdown mode (`.pmd`), the `<pre class="brush: spytial-gdl">` output is
recognized. In markup mode (`.pm`), define a tag that emits `<pre>` and exclude
`pre` from decoding:

```racket
#lang racket/base
(require pollen/decode txexpr)
(provide (all-defined-out))

;; ◊spytial-gdl{ A -> B : left … }
(define (spytial-gdl . lines)
  `(pre ((class "spytial-gdl")) ,@lines))

(define (root . elements)
  (txexpr 'root empty
          (decode-elements elements
            #:txexpr-elements-proc decode-paragraphs
            #:string-proc (compose1 smart-quotes smart-dashes)
            #:exclude-tags '(pre))))
```

Without `#:exclude-tags`, `decode-paragraphs` changes the block structure and
`smart-dashes` changes `-->` to `–>`.

Pollen requires balanced braces. Use `◊spytial-gdl|{ … }|` for unbalanced braces.

### Platform issues

#### Smart punctuation

Pollen's `smart-quotes`/`smart-dashes` and CMS punctuation filters can change
`-->` to `–>` or `name='Team A'` to `name=’Team A’`. Exclude code blocks from
these filters.

#### Line numbers in table mode

Pygments (`linenums_style: table`) and Chroma (`lineNos: table`) move code into
a `<td>` without its language marker. The block then stays as code. Use the
[MkDocs fence](#mkdocs) or [Hugo hook](#hugo).

#### Client-side navigation

Docusaurus, VitePress, and Starlight replace page content without reloading.
`autoRender` renders blocks added after navigation. To use a custom route hook,
set `observe: false` and call [`renderSpytialGdls`](#the-functions).

#### Content Security Policy

The drop-in tag loads spytial-core, d3, and WebCola from jsDelivr. If your CSP
blocks the CDN, [self-host the engine](#self-hosting-the-engine). If loading
fails, the source remains visible and a notice appears above the block and in
the console.

#### Static Markdown hosts

GitHub, GitLab, and npm do not run JavaScript in rendered Markdown. They show
the source block. To view the diagram, open the file through
[`examples/md-viewer.html`](../examples/md-viewer.html).

### Other generators

The renderer also detects other generators that retain the language on `<pre>`,
`<code>`, a wrapping `<div>`, or `data-language`; see
[What gets detected](#what-gets-detected).
For other output, use an HTML container:

```html
<div class="spytial-gdl">
A -> B : left
A -> C : right
</div>
```

## Choose how your diagrams appear

Each diagram gets a 360px frame. Zoom, fit, and **View source** controls sit at
the bottom right. Editable diagrams open with their source editor visible.

To match a dark page, put `data-theme="dark"` on a parent element such as your
site's `<body>`. All diagrams inside it then use the dark graph and frame theme:

```html
<body data-theme="dark">
  <!-- Your Markdown content is rendered here. -->
</body>
```

If your site already sets CSS `color-scheme: dark`, the embed picks that up too.
For a single diagram with its own theme or height, use a hand-authored HTML block
in the page:

```html
<div class="spytial-gdl" data-theme="light" data-height="420">
A[Author] -> B[Reader]
</div>
```

`data-theme` overrides the page theme for that block; `data-height` sets its
frame height in pixels. Some Markdown processors let you put these attributes
on a fenced code block instead. If yours allows raw HTML, use the HTML block
without needing special fence syntax. Add `data-editable` to make that block
editable.

To change controls or the default height for every diagram, replace the drop-in
`auto.js` tag with this module script in your template (include only one of them):

```html
<script type="module">
  import { autoRender } from 'https://cdn.jsdelivr.net/npm/spytial-gdl/src/markdown.js';

  autoRender({
    height: 420,
    viewOptions: { toolbar: 'full' },
  });
</script>
```

spytial-core also accepts `toolbar: 'compact'` or `'none'`, and switches such as
`controls: { zoom: false, fit: false }`. An explicit `toolbar` setting uses its
usual placement; **View source** stays available. A block's `data-height` takes
precedence over the page-wide `height` option. See the [options table](#options).

## What gets detected

The renderer recognizes markup from common generators and HTML pages. It checks
several places for the language marker:

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
| `ensureEngineLoaded(opts)` | inject the spytial-core browser bundle if it is absent from the page. |
| `whenEngineReady(ms)` | resolve once the engine global is available (polls, with a timeout). |
| `observeBlocks(opts)` | watch for blocks added later and render them; returns a stop function. `autoRender` calls it for you. |

`src/auto.js` is `autoRender()` wrapped in a module, so the drop-in tag
`<script type="module" src=".../src/auto.js">` needs no code of your own.

## Options

`opts` is shared by `autoRender` and `renderSpytialGdls`:

| option | default | meaning |
|---|---|---|
| `height` | `360` | diagram height: a number of pixels, or any CSS length. A block overrides it with `data-height`. |
| `theme` | page theme, otherwise `'light'` | spytial-core theme name. `data-theme` on a block takes precedence; the nearest page `data-theme="light"` or `"dark"` is used when no theme is passed. |
| `viewOptions` | spytial-core zoom and fit buttons floated beside Source; editing controls on editable blocks | spytial-core presentation options. Pass `{ toolbar: 'none' }` to hide zoom and fit, `{ toolbar: 'compact' }` for the usual compact toolbar, or `{ toolbar: 'full' }` for every control. |
| `sourceOpen` | `false` | start read-only blocks with the source panel visible. Editable blocks already open with their source editor visible. |
| `editable` | `false` | render every block as the editor (see [Editable diagrams](#editable-diagrams)). |
| `observe` | `true` | (`autoRender` only) keep watching for blocks added after the first pass, so client-side navigation renders too. |
| `injectEngine` | `true` | inject the CDN engine scripts if absent. Set it to `false` if you load spytial-core yourself. |
| `deps` | built-in | override the engine bundle URL, to self-host or pin. |
| `timeoutMs` | `10000` | how long `whenEngineReady` polls before giving up. |

```js
// Render a fragment you built at runtime, dark, 420px tall:
await renderSpytialGdls(document.getElementById('panel'), { theme: 'dark', height: 420 });
```

For a copyable page example, see [Choose how your diagrams appear](#choose-how-your-diagrams-appear).

## The results array

`renderSpytialGdls` returns one entry per block, so you can react to failures:

```js
const results = await renderSpytialGdls(document);
const failed = results.filter((r) => r.error);
// each entry: { host, applied?, result?, error?, editable?, handle? }
```

`result` is the full [`renderSpytialGdl`](#renderspytialgdl) return for a read-only
block, and `handle` is the [editable handle](#the-handle) for an editable one.

## View and edit source

Every embed can show its source below the diagram. Read-only embeds start with it
hidden by default; click **View source** beside the zoom and fit controls to reveal
and copy it. The examples on this documentation site start with source open.
Editable blocks also open with their source editor visible: drag the graph or edit
the text and press **Update diagram** (⌘⏎). Use **Hide source** to close either panel.

## Self-hosting the engine

For an offline or version-pinned deploy, host the complete spytial-core browser
bundle yourself and pass its URL as `deps`. It includes d3 and WebCola.

```js
autoRender({
  deps: ['/vendor/spytial-core-complete.global.js'],
});
```

Or load spytial-core on the page yourself and call
`autoRender({ injectEngine: false })`.

## Editable diagrams

A read-only block draws the notation. An editable block renders the same graph onto
Spytial's `<structured-input-graph>` editor instead, so readers can add and delete
nodes, drag to connect edges, and rename relations, with constraints re-solving as
they go. They can copy the current notation at any point. Try it by dragging the
picture or by editing the text and pressing **Update diagram** (⌘⏎):

```spytial-gdl-editable
A -> B : left
A -> C : right

@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
@orientation(selector=_links, directions=[below])
```

The source editor below the diagram is live in both directions: edit the graph and
the text re-derives, edit the text and **Update diagram** pushes it back into the diagram.
**Copy source** copies the graph and its requirements. Graph edits preserve the
`@` rules verbatim.

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
- `source`: spytial-gdl text with inline requirements, same as the read-only path.
- `opts`: `{ rules?, extraSpec?, width?, height?, theme?, ariaLabel?, viewOptions? }`.

Editable diagrams use compact spytial-core controls with graph editing actions enabled.
Use `viewOptions` to customize them, for example `{ toolbar: 'full' }` or
`{ controls: { editing: false } }`.

Returns `{ applied: false, reason, … }` if the source has no nodes; otherwise the
handle below.

### The handle

| member | what it gives you |
|---|---|
| `getSource()` | get the edited graph as spytial-gdl source, with its `@` rules preserved |
| `getValue()` | the reified value: `{ atoms, relations }` JSON |
| `onChange(cb)` | runs `cb({ source, value, error })` after every edit; returns an unsubscribe function |
| `element` | the live `<structured-input-graph>` |
| `dataInstance` | the backing data instance |
| `diagnostics` | every problem found in the initial source, in the same shape as on the [read-only result](#the-result-object) |
| `applied`, `parsed`, `annotationErrors`, `parseErrors`, `hiddenRelations`, `rules` | render metadata, as on the read-only result |

`onChange` coalesces a burst of synchronous mutations (an edge rename is a remove
plus an add, for instance) into a single callback, and rebinds automatically if the
editor's "clear all" swaps in a fresh data instance. You get one clean event per
logical edit.

`diagnostics` describes the text that was applied (the initial source, or the last
**Update diagram**). The editor element itself reports only a constraint clash as you edit;
update the diagram again to refresh the rest.

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
use this serializer.

### Why source changes need a click

Text to diagram is an explicit apply (**Update diagram** / ⌘⏎) rather than continuous
binding. Continuous binding would fight the normalizing serializer mid-keystroke,
producing caret jumps, dropped `%%` comments, and lost node positions. Diagram to
text is live because the user is not editing that text.

## Programmatic API

Import the rendering API from the package with a bundler, or from the CDN
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
| `extractAnnotations(rawSource)` | extract inline `@` rules from source |
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
> `window.spytialcore`. `mountGraph` and `renderSpytialGdl` do not import it, which
> keeps this module a bare browser ES module. If it is absent, you get a
> clear "spytial-core is not loaded" error, and the Markdown path injects it for
> you.

### renderSpytialGdl

```text
renderSpytialGdl(graphEl, source, opts?) → Promise<result>
```

- `graphEl`: a `<webcola-cnd-graph>`, from `mountGraph`.
- `source`: spytial-gdl text with inline requirements.
- `opts`: see below.

#### opts

| option | default | meaning |
|---|---|---|
| `validator` | `'qualitative'` | constraint validator. `'qualitative'` gives IIS clash reporting plus a best-feasible counterfactual; `'kiwi'` is the alternative solver. |
| `rules` | none | raw spytial-core layout YAML, merged with inline requirements and styling rules. |
| `extraSpec` | none | extra spec YAML folded in via the class registry. |
| `viewOptions` | compact controls | spytial-core view options; for example `{ toolbar: 'full' }` restores its full toolbar, or `{ toolbar: 'none' }` hides its controls. |

All GDL render paths share the same presentation defaults. Read-only diagrams
show spytial-core's **+, −, and Fit** controls in the lower-right corner; editable
diagrams keep compact controls and graph editing actions. This applies to the
playground and programmatic examples as well as Markdown and HTML embeds.
Markdown/HTML wrappers additionally provide the source disclosure; callers with
their own source editor retain that editor.

An explicit `viewOptions.toolbar` uses spytial-core's usual toolbar placement. Defaults
are applied once per graph element, so re-rendering source preserves later host
customizations. Pass `viewOptions` again to update them on a subsequent render.

#### The result object

```text
{ applied, layout, error, selectorErrors, warnings, diagnostics,
  annotationErrors, parseErrors, parsed, data, instance, rules, hiddenRelations }
```

| field | meaning |
|---|---|
| `applied` | `true` if a layout was drawn onto the element |
| `layout` | the computed layout; on a clash, the best-feasible counterfactual; with a selector error, the layout under every other rule |
| `error` | the constraint error / UNSAT core, or `null` |
| `diagnostics` | problems as `[{ severity, message, line?, source }]`; `source` is `'parse'`, `'annotation'`, or `'engine'` |
| `selectorErrors` | raw engine records for unusable selectors |
| `warnings` | raw engine warnings |
| `annotationErrors` | malformed or unknown `@` rules, as `[{ line, text, message }]` |
| `parseErrors` | parser findings as `[{ line, text, severity, message }]` |
| `parsed` | `{ nodes, edges, classesPerNode, errors, labelLines, classLines }` from the parser |
| `data` | the relational `{ atoms, relations }` handed to spytial-core |
| `instance` | the `JSONDataInstance` built from `data` |
| `rules` | the layout YAML actually solved: the merged spec, or only the hidden-field directives if the engine refused it |
| `hiddenRelations` | selector-only relations hidden from drawing (`_links`, types, classes) |

When `source` has no nodes, you get
`{ applied: false, reason, parsed, annotationErrors, parseErrors, diagnostics }` instead.

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
@atomStyle(selector=Person, borderStyle(color='#795db4', width=2))
```

### Composing rules: registry and YAML

Inline requirements and styling rules are the primary authoring model, but they compose with two
lower-level inputs through the shared `mergeSpecStrings` concat. The resolution
order, per render:

1. specs registered with `registerSpec` for the classes used in this source, plus
   any `opts.extraSpec`;
2. the inline `@` rules compiled from the source;
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
which can be used between independent renders or tests.

### extractAnnotations and serializeToSpytialGdl

The two ends of the pipeline, usable standalone:

- `extractAnnotations(rawSource)` returns
  `{ source, specYaml, annotationLines, errors }`, lifting the `@…` lines out and
  compiling them to authoring YAML.
- `serializeToSpytialGdl(value, { annotations })` returns notation text, turning a
  `{ atoms, relations }` value back into spytial-gdl source. This is what powers
  the editable handle's [`getSource()`](#the-serializer-on-its-own).

### compileSpytialGdl

`compileSpytialGdl` parses the source and builds layout YAML without a DOM or
spytial-core. It can run on a server or in a test.

```js
import { compileSpytialGdl } from 'spytial-gdl';

const { ok, datum, rules, hiddenRelations, annotationMeta, annotationErrors } =
  compileSpytialGdl('a -> b : next\n@orientation(selector=next, directions=[right])');
```

- `datum` — `{ atoms, relations }`, the graph in relational form.
- `hiddenRelations` — selector-only relations excluded from drawing.
- `rules` — the complete layout spec as YAML, with every source already merged
  (registered class specs, inline `@` rules, `opts.rules`) and the selector-only
  relations already hidden. This is the exact string handed to the engine. Each
  inline rule carries a `source` block with its original text
  and line, which spytial-core 5.4+ cites in conflict reports; pass
  `{ provenance: false }` for the bare rules.
- `annotationMeta` — one record per compiled `@` rule (`line`, `name`, the
  `selectors` it names), which is how an engine diagnostic is mapped back to a
  line.
- `annotationErrors` — malformed or unknown `@` rules with their source lines.
- `ok` is `false`, with a `reason`, when the source parses to no nodes.

To put the compiled diagram through the engine without a DOM, `solveSpytialGdl(spytial, compiled, opts)`
takes the engine module (`window.spytialcore`, or `await import('spytial-core')`) and
returns `{ layout, error, selectorErrors, warnings, diagnostics, rules, … }`, the
same solve both render paths perform. That is what
`test/engine-diagnostics.test.mjs` runs against the installed core.

Both render paths call this, so what you get here is what a diagram gets. The
[conformance tests](https://github.com/sidprasad/spytial-gdl/blob/main/test/conformance.test.mjs)
use this path to check what the requirements entail without rendering.
