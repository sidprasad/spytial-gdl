# spytial-gdl

[![CI](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml/badge.svg)](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/spytial-gdl.svg)](https://www.npmjs.com/package/spytial-gdl)

A graph description language with layout requirements. You write nodes and
edges, plus rules for the spatial relationships that matter. The graph renders
as an interactive diagram, and the rules keep holding as readers drag nodes.
Layout is done by [spytial-core](https://github.com/sidprasad/spytial-core).

```spytial-gdl
mul[×] -> div[÷] : lhs
mul -> three[3] : rhs
div -> six[6] : lhs
div -> two[2] : rhs

@orientation(selector=lhs, directions=[below, left])
@orientation(selector=rhs, directions=[below, right])
```

This is `(6 ÷ 2) × 3`. The two rules keep each left operand below and to the
left of its operator, and each right operand below and to the right.
[Try it in the playground.](https://www.siddharthaprasad.com/spytial-gdl/playground/)

## Use

Add the renderer to your page or site template:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

Then write diagrams in `spytial-gdl` fenced code blocks (Markdown) or
`<div class="spytial-gdl">` elements (HTML). ES modules cannot run from a
`file://` URL, so serve the page over HTTP(S).

GitHub does not run the renderer in READMEs, so the block above shows as source.

## Documentation

- [Graph description](https://www.siddharthaprasad.com/spytial-gdl/docs/#/notation)
- [Mermaid flowchart catalog](https://www.siddharthaprasad.com/spytial-gdl/docs/mermaid-flowchart-catalog/)
- [Layout requirements](https://www.siddharthaprasad.com/spytial-gdl/docs/#/requirements)
- [Embedding and JavaScript API](https://www.siddharthaprasad.com/spytial-gdl/docs/#/embedding)
- [Agent skill](https://www.siddharthaprasad.com/spytial-gdl/SKILL.md)
- [Changelog](CHANGELOG.md)

Mermaid flowcharts can be pasted into GDL. Unsupported Mermaid subgraphs and
non-flowchart diagrams produce an error instead of a partial diagram. Flowchart
features that lose styling or behavior produce line-specific warnings.

## Development

```sh
npm install
npm test
npm run serve   # site and playground at localhost:8100
```

The documentation uses Material for MkDocs. To build it with the live examples:

```sh
python3 -m venv .venv-docs
source .venv-docs/bin/activate
pip install -r requirements-docs.txt
npm run docs:build
npm run serve   # includes the built docs at localhost:8100/docs/
```

Edit Markdown in `docs/pages/`, then rebuild to preview changes. GitHub Pages
builds and publishes the same site automatically on pushes to `main`.

## License

[MIT](LICENSE)
