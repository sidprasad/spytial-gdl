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
ES modules cannot run from a `file://` URL, so serve the page over HTTP(S). See
[platform setup](#platform-setup).

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

### Potential Platform issues

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
set `observe: false` and call `renderSpytialGdls(root)` from `src/markdown.js`.

#### Content Security Policy

The drop-in tag loads spytial-core, d3, and WebCola from jsDelivr. If your CSP
blocks the CDN, load spytial-core yourself and call
`autoRender({ injectEngine: false })`. If loading
fails, the source remains visible and a notice appears above the block and in
the console.

#### Static Markdown hosts

GitHub, GitLab, and npm do not run JavaScript in rendered Markdown. They show
the source block. Link to a live diagram instead; the playground's **Share**
button creates one.

## Editable diagrams

Use the `spytial-gdl-editable` fence to let readers edit the graph as well as
drag it:

```spytial-gdl-editable
A -> B : left
A -> C : right

@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
@orientation(selector=_links, directions=[below])
```

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
| `renderSpytialGdlEditable(container, source, opts)` | render onto the editor, returning a handle with `getSource()` and `onChange(cb)` |
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
| `preservePositions` | `false` | On a rerender of the same graph, pass its current positions and viewport to spytial-core's `renderLayout` as `priorPositions`. New rules settle from the arrangement already on screen. |

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

#### Where diagnostics appear

For a rendered diagram, Mermaid syntax warnings appear in the graph element's
built-in, expandable warning panel alongside spytial-core's layout warnings.
For `spytial-gdl` Markdown fences and HTML blocks handled by `autoRender`, a
band below the diagram also shows warnings and errors with source line numbers.
The playground shows the first diagnostic in its status line and logs the full
list to the browser console.

Direct calls to `renderSpytialGdl` or `renderSpytialGdlEditable` return the full
list in `result.diagnostics` and display warnings in the graph element's panel;
they do not print diagnostics to the console. A host should use the returned
list to display errors, including unsupported Mermaid syntax that prevents a
layout from rendering. Mermaid parser warnings are also in `parseErrors`; the
separate `warnings` result field contains only raw warnings from spytial-core.

When `source` has no nodes or contains unsupported Mermaid diagram syntax, you get
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
  `{ atoms, relations }` value back into spytial-gdl source.

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
