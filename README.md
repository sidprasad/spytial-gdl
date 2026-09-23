# spytial-gdl

A graph description language with spatial semantics.

[![CI](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml/badge.svg)](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/spytial-gdl.svg)](https://www.npmjs.com/package/spytial-gdl)

[Website](https://www.siddharthaprasad.com/spytial-gdl/) ·
[Playground](https://www.siddharthaprasad.com/spytial-gdl/playground/) ·
[Gallery](https://www.siddharthaprasad.com/spytial-gdl/gallery/) ·
[Documentation](https://www.siddharthaprasad.com/spytial-gdl/docs/) ·
[Agent guide](https://www.siddharthaprasad.com/spytial-gdl/AGENTS.md)

Describe nodes, edges, and the spatial relationships that matter. spytial-gdl
renders an interactive graph in your documents, preserving those relationships
as readers move the nodes. The graph and its layout rules remain plain text
that you can review, version, and edit alongside the document.

Use it for expression trees, dependencies, system diagrams, and other graphs
where arrangement helps explain structure. Layout is handled by
[spytial-core](https://github.com/sidprasad/spytial-core). When spatial rules
conflict, the renderer identifies the affected requirements and graph elements.

## An example

In the expression `(6 ÷ 2) × 3`, left and right distinguish the operands.
The graph describes the expression; two annotations keep each operand below
and on the appropriate side of its operator.

```spytial-gdl
mul[×] -> div[÷] : lhs
mul -> three[3] : rhs
div -> six[6] : lhs
div -> two[2] : rhs

@orientation(selector=lhs, directions=[below, left])
@orientation(selector=rhs, directions=[below, right])
```

[Try the live example](https://www.siddharthaprasad.com/spytial-gdl/docs/#/introduction/drawing-an-expression)
and drag the nodes. Their positions can change, but the operand relationships
remain in force. The introduction also demonstrates conflicting rules and
editing the graph itself.

Spatial rules express the author's intent. Satisfying them does not establish
that a graph correctly describes the underlying system.

## Add a graph to a document

For an HTML page, add a `spytial-gdl` container and load the renderer once:

```html
<div class="spytial-gdl">
mul[×] -> div[÷] : lhs
mul -> three[3] : rhs
div -> six[6] : lhs
div -> two[2] : rhs

@orientation(selector=lhs, directions=[below, left])
@orientation(selector=rhs, directions=[below, right])
</div>

<script type="module"
  src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

Serve the page over HTTP rather than opening it as a `file://` URL. The script
loads the rendering engine from a CDN; no build step is required.

For Markdown, add the same script to your site's template and use a fenced
code block with the language identifier `spytial-gdl`, as above. Use
`spytial-gdl-editable` to let readers edit the graph as well as move its nodes.
See the [platform setup guide](https://www.siddharthaprasad.com/spytial-gdl/docs/#/platforms)
for integration with your document tooling, or the
[embedding reference](https://www.siddharthaprasad.com/spytial-gdl/docs/#/embedding)
for self-hosting and version-pinned dependencies.

**On GitHub:** README files and PR descriptions display the GDL source but do
not run the renderer. Include a link to a live diagram, optionally accompanied
by an exported image. The playground's **Share** button creates a link containing
the graph source.

For a PR, `scripts/render-gdl-previews.py` can make that image and link from a
`.gdl` file. It opens the playground in Chromium, checks that the graph rendered,
and writes a PNG plus a manifest containing the live link. Commit the PNG and
paste the linked image into the PR description. See the
[GitHub PR preview recipe](docs/pages/platforms.md#github-pr-previews).

For programmatic use, install the package:

```sh
npm install spytial-gdl
```

The [JavaScript API reference](https://www.siddharthaprasad.com/spytial-gdl/docs/#/embedding)
covers compilation, engine loading, rendering, and reading back graph edits.

## Use with an agent

The [agent guide](https://www.siddharthaprasad.com/spytial-gdl/AGENTS.md) covers authoring, conversion, embedding, and
verification. Give your agent this instruction with the document or project:

```text
Read https://www.siddharthaprasad.com/spytial-gdl/AGENTS.md
Use spytial-gdl where a graph would help explain this document. Describe the
nodes and edges, and add spatial rules where position carries meaning.
Set up the renderer and verify the result in a browser. If the document
cannot run it, provide a link to the live graph.
```

You can also provide a Mermaid flowchart or Graphviz DOT graph for conversion.
This is not a drop-in replacement: DOT requires translation, not all styling
and syntax carry over, and Mermaid's sequence diagrams, Gantt charts, and
other non-graph formats are outside the language's scope.

For tools, the [language manifest](https://www.siddharthaprasad.com/spytial-gdl/spytial-gdl-language.json)
lists canonical graph forms and supported annotations, with links to the layout
and selector manifests. It is also exported as `spytial-gdl/language.json`.

## Reference

| Resource | Contents |
| --- | --- |
| [Introduction](https://www.siddharthaprasad.com/spytial-gdl/docs/#/introduction) | A live walkthrough of graph structure, spatial rules, conflicts, and editing |
| [Syntax](https://www.siddharthaprasad.com/spytial-gdl/docs/#/notation) | Nodes, edges, labels, types, classes, and Mermaid compatibility |
| [Annotations](https://www.siddharthaprasad.com/spytial-gdl/docs/#/annotations) | Spatial constraints, selectors, and styling |
| [Embedding and API](https://www.siddharthaprasad.com/spytial-gdl/docs/#/embedding) | Renderer setup, JavaScript APIs, and editable diagrams |
| [Examples](https://www.siddharthaprasad.com/spytial-gdl/examples/) | Runnable integrations with source you can reuse |
| [Changelog](https://github.com/sidprasad/spytial-gdl/blob/main/CHANGELOG.md) | Release history |

## Development

From a checkout, start the local site:

```sh
npm run serve
```

Open [localhost:8100](http://localhost:8100/) for the homepage, documentation,
playground, and examples. The preview loads its engine from a CDN, so it requires
network access but does not require a local dependency installation.

To install development dependencies and run the tests:

```sh
npm install
npm test
```

The suite checks parsing, annotations, round-tripping, embedding integrations,
and spatial semantics against spytial-core. For documentation changes, also
preview the affected page and verify its live examples.

## License

[MIT](https://github.com/sidprasad/spytial-gdl/blob/main/LICENSE)
