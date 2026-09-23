# spytial-gdl

A small graph description language with its layout written inline.

**[Website](https://www.siddharthaprasad.com/spytial-gdl/)** ·
**[Playground](https://www.siddharthaprasad.com/spytial-gdl/playground/)** ·
**[Point an agent at AGENTS.md](AGENTS.md)**

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

Have your agent use it when writing documents:

```text
Read https://www.siddharthaprasad.com/spytial-gdl/AGENTS.md
Use spytial-gdl when a graph would help explain the documents you write. Describe the nodes and edges, and add spatial rules where position carries meaning. Set up the renderer for this project and check the result in a browser. If the document cannot run it, link to a live diagram instead.
```

The guide also covers translating Mermaid flowcharts and Graphviz DOT graphs,
renderer setup, and verification. Conversion is not a drop-in replacement:
DOT needs translation, and Mermaid's non-graph diagram types need their own renderer.

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
| [Syntax reference](docs/pages/notation.md) | edges, ids, sorts, classes, selectors |
| [Language manifest](spytial-gdl-language.json) | machine-readable authoring forms and annotation vocabulary; also exported as `spytial-gdl/language.json` |
| [Annotations](docs/pages/annotations.md) | constraints, directives, style blocks, conflicts |
| [Embedding & API](docs/pages/embedding.md) | `autoRender`, options, editable mode, full API |
| [Platforms](docs/pages/platforms.md) | MkDocs, Jekyll, Hugo, Docusaurus, Pollen, and the rest |
| [Architecture](docs/pages/architecture.md) | the render pipeline and dependencies |
| [CHANGELOG.md](CHANGELOG.md) | what each release changed |

The [playground](playground/) and [examples](examples/) are runnable.

## Local development

The pages need no `npm install` because the engine loads from a CDN. A static
server is required for ES modules.

```bash
npm run serve
```

That serves `/docs/`, `/playground/`, and `/examples/` on port 8100.

The tests are the one thing that does need an install. `test/conformance.test.mjs`
asks spytial-core what the specs we emit actually entail, so it needs the engine
locally rather than from a CDN.

```bash
npm install && npm test
```

## License

MIT
