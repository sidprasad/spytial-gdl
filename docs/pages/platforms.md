# Platforms

Putting diagrams in MkDocs, Jekyll, Hugo, Docusaurus, Pollen, and the rest.

Rendering happens in the browser, after your site generator has already turned
Markdown into HTML. Nothing hooks into the build: the script looks for the block
your generator emitted and swaps it for a diagram. So for any platform there are
only ever two questions — where the script tag goes, and whether anything
rewrote the block on the way out.

## The generators

Every one of these works with no plugin and no build step. The middle column is
what a ` ```spytial-gdl ` fence actually comes out as, which is worth knowing
only when something goes wrong.

| platform | the fence becomes | worth knowing |
|---|---|---|
| Jekyll · GitHub Pages | `<div class="language-spytial-gdl highlighter-rouge">` | Rouge has no lexer for us and falls back to plain text, which is what we want |
| MkDocs | `<pre><code class="language-spytial-gdl">` | the `fenced_code` default |
| MkDocs Material | `<div class="language-spytial-gdl highlight">` | Pygments; the [custom fence](#mkdocs) skips it |
| Hugo | `<code class="language-spytial-gdl" data-lang="…">` | Chroma |
| Docusaurus | `<div class="language-spytial-gdl codeBlockContainer…">` | Prism, one `<div>` per line |
| VitePress | `<div class="language-spytial-gdl">` | the wrapper also holds the copy button |
| Sphinx · MyST | `<div class="highlight-spytial-gdl notranslate">` | no `<code>` element at all |
| Astro · Starlight | `<pre data-language="spytial-gdl">` | Expressive Code, one `<div>` per line |
| Quarto · Pandoc | `<pre class="sourceCode spytial-gdl">` | |
| Eleventy · marked · markdown-it · hand-written HTML | `<pre><code class="language-spytial-gdl">` | |
| Pollen | whatever your tag function emits — [see below](#pollen) | |

Those eleven shapes are pinned by `test/platforms.test.mjs`, and
`test/platform-fixtures.html` renders all of them in a browser. They are facts
about someone else's output, so they get tests rather than trust.

## Where the script tag goes

The tag itself is the same everywhere, and `type="module"` is not optional:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

**Jekyll**, **Hugo**, **Pollen**, and anything else with a template you edit by
hand: paste it into the layout — `_layouts/default.html`, your `head` partial,
`template.html` — before `</body>`.

**MkDocs** (1.5 or newer, which is where `extra_javascript` learned about script
attributes):

```yaml
extra_javascript:
  - path: https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js
    type: module
```

**Docusaurus**, in `docusaurus.config.js` — `scripts` entries may be objects
carrying any attributes you like:

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

**Sphinx**, in `conf.py` (the attribute dict has been there since 1.8):

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

## MkDocs

The default `fenced_code` output needs nothing. If you use Material — or
anything else that runs the block through Pygments — the block still renders,
but Pygments is guessing a lexer for a language it has never heard of and
rebuilding the text out of `<span>`s to no purpose. Register the fence as
verbatim instead, exactly the way Material's own Mermaid setup does:

```yaml
markdown_extensions:
  - pymdownx.superfences:
      custom_fences:
        - name: spytial-gdl
          class: spytial-gdl
          format: !!python/name:pymdownx.superfences.fence_code_format
```

That emits `<pre class="spytial-gdl"><code>` with the source untouched.

## Hugo

Chroma's output works as it comes. For the verbatim equivalent of the MkDocs
custom fence, add a code block render hook at
`layouts/_default/_markup/render-codeblock-spytial-gdl.html`:

```html
<pre class="spytial-gdl"><code>{{ .Inner }}</code></pre>
```

## Pollen

Pollen works in both modes, but it is the one platform where the *decoder* can
quietly damage the block, so it needs its own paragraph.

In Markdown mode (`.pmd`) the fence comes out as
`<pre class="brush: spytial-gdl">`, which is matched. In markup mode (`.pm`),
give yourself a tag function — emitting a `<pre>` means one exclusion covers
both your code blocks and your diagrams:

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
            #:exclude-tags '(pre))))          ; ← the important line
```

Without `#:exclude-tags`, `decode-paragraphs` rebuilds the block as paragraphs
and `smart-dashes` rewrites `-->` as `–>`. See
[smart punctuation](#smart-punctuation) below for what that looks like.

`◊` never appears in the notation, so bodies need no escaping — but Pollen wants
balanced braces, and `◊spytial-gdl|{ … }|` is the escape if you ever write an
unbalanced one.

## Known issues

### Smart punctuation

A typographic filter upstream — Pollen's `smart-quotes`/`smart-dashes`, a CMS
"smart punctuation" pass — rewrites the block before it ever reaches us.
`-->` becomes `–>`, and every edge on that line disappears. `name='Team A'`
becomes `name=’Team A’`, which still parses, with the curly quotes now part of
the value instead of quoting it. Both are reported by name in the block's
diagnostics, because the parse error they cause otherwise points at the symptom.
The fix is upstream: exclude the block from that processing.

### Line numbers in table mode

Pygments (`linenums_style: table`) and Chroma (`lineNos: table`) move the code
into a `<td>` and drop the language marker on the way, so there is nothing left
to match and the block stays a code block. Use the [MkDocs custom
fence](#mkdocs) or the [Hugo render hook](#hugo), both of which sidestep the
highlighter entirely.

### Client-side navigation

Docusaurus, VitePress, Starlight and the other SPA-routed sites swap the page
body without a reload, so a one-shot pass would only ever cover the page you
landed on. `autoRender` watches for blocks that appear later and renders those
too; `autoRender({ observe: false })` turns that off if you would rather drive
[`renderSpytialGdls`](embedding.md#the-functions) from your own route hook.

### Content Security Policy

The drop-in tag pulls d3, WebCola and spytial-core from jsDelivr. If your CSP
forbids that, host the three yourself and name them in `deps` — see
[Self-hosting the engine](embedding.md#self-hosting-the-engine).

### Where it can't work

GitHub, GitLab, and npm render README Markdown without running JavaScript, so a
block stays a block of text there. That is the intended degradation rather than
a failure: the notation is meant to be legible as source, and a reader who wants
the picture can open the same file through
[`examples/md-viewer.html`](../examples/md-viewer.html).

## Something else?

The list above is not a whitelist — it is the set whose output has been checked.
Any pipeline that leaves the language on the `<pre>`, the `<code>`, a wrapping
`<div>`, or a `data-language` attribute is already detected; see [What gets
detected](embedding.md#what-gets-detected). If yours isn't, the fallback that
always works is a hand-authored container, which no generator will touch:

```html
<div class="spytial-gdl">
A -> B : left
A -> C : right
</div>
```
