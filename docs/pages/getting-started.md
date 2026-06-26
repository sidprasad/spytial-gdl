# Getting started

*One tag turns on rendering for a whole page. Here's the 30-second version, then the details.*

## The 30-second drop-in

Add one line to any page that renders your Markdown (or to a hand-written HTML
page). Everything loads from CDN — there is no `npm install` and no build step:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-graph/src/auto.js"></script>
```

Then write a fenced block the way you'd write `mermaid`:

````markdown
```spytial-graph
A -> B
B -> C
@orientation(selector=_links, directions=[right])
```
````

Every `spytial-graph` block on the page becomes a live diagram. The script pulls
in the renderer (d3, WebCola, spytial-core) for you if the page doesn't already
load it. The result:

```spytial-graph
A -> B
B -> C
@orientation(selector=_links, directions=[right])
```

## In plain HTML (no Markdown renderer)

You don't need Markdown at all. In a hand-written page, put the notation in a
`<div class="spytial-graph">` and add the same one tag — the way you'd drop a
`<div class="mermaid">` into a page. A complete, runnable page:

```html
<!DOCTYPE html>
<meta charset="utf-8" />
<style>.spytial-graph { height: 340px; }</style>

<div class="spytial-graph">
  A -> B : left
  A -> C : right

  @orientation(selector=_links, directions=[below])
  @orientation(selector=left,  directions=[left])
  @orientation(selector=right, directions=[right])
</div>

<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-graph/src/auto.js"></script>
```

On load, every block becomes a live diagram — no init call, no config. The block
also accepts `class="language-spytial-graph"` and `<pre class="spytial-graph">`,
so whatever markup you (or a renderer) emit is caught. Indentation inside the
`<div>` is fine; each line is trimmed.

> **Note** — The page must be **served** (any static server) rather than opened as
> `file://`, because the tag is an ES module. See *Running locally* below.

## Wiring it yourself

If you'd rather control timing, height, or theme, import `autoRender` instead of
the drop-in tag:

```html
<script type="module">
  import { autoRender } from 'https://cdn.jsdelivr.net/npm/spytial-graph/src/markdown.js';
  autoRender({ height: 420, theme: 'dark' });
</script>
```

Or render a specific subtree after you inject HTML yourself — see
[Markdown & HTML embedding](embedding.md) for the full surface.

## Give each block a height

The diagram fills its container, so a block needs a height:

```css
.spytial-graph, .spytial-graph-editable { height: 340px; }
```

A single block can override it with `data-height` (a number of pixels or any CSS
length), or set a default for the page with `autoRender({ height })`.

## Running locally

Clone the repo and start the zero-dependency static server:

```bash
npm run serve   # serves the repo on http://localhost:8100
```

Then open:

| URL | what it is |
|---|---|
| `/docs/` | this documentation site |
| `/playground/` | live editor (View ⇄ Edit) |
| `/examples/` | every embedding mode, runnable |

Any static server works — one is needed only because the pages load ES modules.

## Pinning versions for production

The CDN URLs above always fetch the latest published `spytial-graph` and, through
it, a pinned `spytial-core`. For a reproducible deploy, vendor the three engine
scripts locally (d3 v4, `webcola@3.4.0`, `spytial-core`) and point the tag at your
own copy — see [Architecture](architecture.md#dependencies) for the exact set and
load order.

## Next

- **[The notation](notation.md)** — write the graph.
- **[Annotations](annotations.md)** — write the layout.
- **[Editable diagrams](editable.md)** — let readers edit and copy the notation back out.
