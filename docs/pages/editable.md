# Editable diagrams

*The round-trip is the point: `text → visual → edit → text`.*

A read-only block draws the notation. An **editable** block renders the same graph
onto SpyTial's `<structured-input-graph>` editor instead: readers add and delete
nodes, drag to connect edges, rename relations — constraints re-solve live — and
**re-get the notation** at any time. Try it (drag the picture, or edit the text and
press **Run ▸** / ⌘⏎):

```spytial-graph-editable
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

## Turning a block editable

Three equivalent ways, in order of locality:

````markdown
```spytial-graph-editable
A -> B
```
````

```html
<div class="spytial-graph" data-editable>A -> B</div>
```

```js
autoRender({ editable: true });   // every block on the page becomes an editor
```

## Driving the editor from JavaScript

Outside Markdown, render onto an element and get a **handle** back:

```js
import { renderSpytialGraphEditable } from 'https://cdn.jsdelivr.net/npm/spytial-graph/src/index.js';

const h = await renderSpytialGraphEditable(document.getElementById('out'), `
A -> B : left
A -> C : right

@orientation(selector=left, directions=[left])
`);

h.onChange(({ source, value }) => {
  console.log(source); // spytial-graph notation, re-derived from the edited graph
  console.log(value);  // its reified value — { atoms, relations } JSON
});
```

### renderSpytialGraphEditable

```text
renderSpytialGraphEditable(container, source, opts?) → Promise<handle>
```

- `container` — an `Element` to mount into, or a `<structured-input-graph>` itself.
- `source` — spytial-graph text with inline `@annotations` (same as the read-only path).
- `opts` — `{ rules?, extraSpec?, width?, height?, theme?, ariaLabel? }`.

Returns `{ applied: false, reason, … }` if the source has no nodes; otherwise the
handle below.

### The handle

| member | what it gives you |
|---|---|
| `getSource()` | re-get spytial-graph notation for the current graph (your `@annotations` re-appended verbatim) |
| `getValue()` | the reified value — `{ atoms, relations }` JSON |
| `onChange(cb)` | runs `cb({ source, value, error })` after every edit; returns an unsubscribe function |
| `element` | the live `<structured-input-graph>` |
| `dataInstance` | the backing data instance |
| `applied`, `parsed`, `annotationErrors`, `hiddenRelations`, `rules` | render metadata, as on the read-only result |

`onChange` coalesces a burst of synchronous mutations (e.g. an edge rename =
remove + add) into a single callback, and rebinds automatically if the editor's
"clear all" swaps in a fresh data instance — so you get exactly one clean event per
logical edit.

## The serializer on its own

`getSource()` is built on `serializeToSpytialGraph`, the inverse of the render
pipeline. You can call it directly on any `{ atoms, relations }` object (or anything
with a `reify()` method):

```js
import { serializeToSpytialGraph } from 'https://cdn.jsdelivr.net/npm/spytial-graph/src/index.js';

const notation = serializeToSpytialGraph(value, { annotations: annotationLines });
```

The playground's **Edit** toggle and [`examples/editable.html`](https://github.com/sidprasad/spytial-graph/blob/main/examples/editable.html)
are built on exactly this.

## Why explicit Run, not live binding

Text → diagram is an **explicit apply** (Run ▸ / ⌘⏎), not continuous binding.
Continuous binding would fight the normalizing serializer mid-keystroke — caret
jumps, dropped `%%` comments, lost node positions. Diagram → text *is* live, since
there's no text the user is mid-edit on. This split is what keeps both directions
feeling stable.

## Next

- **[Programmatic API](api.md)** — the read-only `renderSpytialGraph` and full result shape.
- **[Examples](examples.md)** — *Diagrams that edit back*, the explorable build on this.
