# spytial-gdl

A small graph description language with its layout written inline.

[![CI](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml/badge.svg)](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/spytial-gdl.svg)](https://www.npmjs.com/package/spytial-gdl)

You write nodes, edges, and spatial `@annotations`, and Spytial renders the result
as a live, draggable constraint diagram. A fenced ` ```spytial-gdl ` block in
Markdown renders client-side, the way a ` ```mermaid ` block does.

```spytial-gdl
A -> B : left
A -> C : right

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

GitHub shows that block as text. To render it, open
`/examples/md-viewer.html?doc=../README.md`.

## Quickstart

Add one script tag to a page. It renders every `spytial-gdl` block and loads the
engine (d3, WebCola, spytial-core) from a CDN if the page does not already have it.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

From JavaScript:

```js
import { renderSpytialGdl, mountGraph } from 'spytial-gdl';

const graph = mountGraph(document.getElementById('out'));
await renderSpytialGdl(graph, 'A -> B\n@orientation(selector=_links, directions=[below])');
```

## Documentation

| | |
|---|---|
| [GUIDE.md](GUIDE.md) | the notation and how to embed it |
| [Introduction](docs/pages/introduction.md) | what the notation is for, and its scope |
| [The notation](docs/pages/notation.md) | edges, ids, sorts, classes, selectors |
| [Annotations](docs/pages/annotations.md) | constraints, directives, style blocks, conflicts |
| [Embedding & API](docs/pages/embedding.md) | `autoRender`, options, editable mode, full API |
| [Platforms](docs/pages/platforms.md) | MkDocs, Jekyll, Hugo, Docusaurus, Pollen, and the rest |
| [Architecture](docs/pages/architecture.md) | the render pipeline and dependencies |

The [playground](playground/) and [examples](examples/) are runnable.

## Local development

There is no `npm install`; the dependencies load from a CDN. A static server is
required because the pages are ES modules.

```bash
npm run serve
```

That serves `/docs/`, `/playground/`, and `/examples/` on port 8100.

```bash
npm test
```

## License

MIT
