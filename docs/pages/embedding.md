# Markdown & HTML embedding

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
`data-editable` attribute on the host — see [Editable diagrams](editable.md).

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
| `editable` | `false` | render every block as the editor (see [Editable diagrams](editable.md)). |
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

`result` is the full [`renderSpytialGdl`](api.md#renderspytialgdl) return for a
read-only block; `handle` is the [editable handle](editable.md#the-handle) for an
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
prose. See [Conflicts & UNSAT](conflicts.md).

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

## Next

- **[Editable diagrams](editable.md)** — two-way blocks readers can edit and copy.
- **[Programmatic API](api.md)** — render without the Markdown layer at all.
