# spytial-gdl

A graph description language with spatial semantics.

[![CI](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml/badge.svg)](https://github.com/sidprasad/spytial-gdl/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/spytial-gdl.svg)](https://www.npmjs.com/package/spytial-gdl)

[Website](https://www.siddharthaprasad.com/spytial-gdl/) ·
[Playground](https://www.siddharthaprasad.com/spytial-gdl/playground/) ·
[Gallery](https://www.siddharthaprasad.com/spytial-gdl/gallery/) ·
[Documentation](https://www.siddharthaprasad.com/spytial-gdl/docs/) ·
[Agent skill](https://www.siddharthaprasad.com/spytial-gdl/SKILL.md)

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
The graph describes the expression; two requirements keep each operand below
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

For programmatic use, install the package:

```sh
npm install spytial-gdl
```

The [JavaScript API reference](https://www.siddharthaprasad.com/spytial-gdl/docs/#/embedding)
covers compilation, engine loading, rendering, and reading back graph edits.

## Use with an agent

Point your agent or workflow at the
[Spytial-GDL skill](https://www.siddharthaprasad.com/spytial-gdl/SKILL.md).
It guides graph authoring, spatial requirements, integration, and validation,
and points to the relevant reference for each task. No checkout of this
repository is needed. Give it the skill URL alongside your task, for example:

```text
Read and use https://www.siddharthaprasad.com/spytial-gdl/SKILL.md.
Then use it to diagram [the system, document, or graph described here].
Integrate the result into [the target page or project] and verify the graph
and its spatial requirements.
```

For reuse in an agent that supports Agent Skills, save the file as
`spytial-gdl/SKILL.md` inside that agent's supported skills directory and follow
its discovery or reload instructions. The skill uses public documentation links,
so it needs network access to fetch those references when used outside this
repository. Reading the URL provides task context; it does not install the skill.

Two focused skills support more involved authoring tasks:

| Skill | Use it to |
| --- | --- |
| [Spytial operations](https://www.siddharthaprasad.com/spytial-gdl/skills/spytial-operations/SKILL.md) | Translate spatial intent into GDL annotations or Core YAML using the operation manifest |
| [Spytial selectors](https://www.siddharthaprasad.com/spytial-gdl/skills/spytial-selectors/SKILL.md) | Select nodes, derive relationships, and check the exact tuples an expression returns |

The main skill links to these when needed. To install them independently, copy
the desired folder from `skills/` into your agent's supported skills directory.
They link to the Core and Simple Graph Query manifests and explain how to use
the versions installed by the host.

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
| [Requirements](https://www.siddharthaprasad.com/spytial-gdl/docs/#/annotations) | Spatial constraints, selectors, and styling |
| [Conversion](https://www.siddharthaprasad.com/spytial-gdl/docs/#/conversion) | Translating Mermaid flowcharts and Graphviz DOT, with compatibility limits |
| [Embedding and API](https://www.siddharthaprasad.com/spytial-gdl/docs/#/embedding) | Renderer setup, JavaScript APIs, and editable diagrams |
| [Examples](https://www.siddharthaprasad.com/spytial-gdl/examples/) | Runnable integrations with source you can reuse |
| [Changelog](https://github.com/sidprasad/spytial-gdl/blob/main/CHANGELOG.md) | Release history |

## Development

This repository owns notation, parsing, serialization, Markdown and HTML
embedding, and documentation. Fundamental layout semantics belong in
`spytial-core`. Do not edit generated artifacts. Run the smallest relevant
test for a change; use `npm test` for broad changes.

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

For graph control changes, also open `/test/presentation-fixtures.html` and
`/test/platform-fixtures.html` on the preview server. These exercise the direct
render APIs and document embeds against the installed browser engine.

## License

[MIT](https://github.com/sidprasad/spytial-gdl/blob/main/LICENSE)
