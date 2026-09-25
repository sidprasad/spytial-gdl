---
name: spytial-gdl
description: Create and integrate Spytial-GDL graph diagrams with spatial requirements. Use when authoring or editing Spytial-GDL, or converting Mermaid flowcharts or Graphviz DOT graphs to it.
license: MIT
---

# Spytial-GDL

Produce a graph that faithfully describes the user's material, with spatial
requirements that express the intended relationships. Deliver it in the user's
requested medium: source, an embedded interactive diagram, or a shareable result.
Work in the user's project; a checkout of Spytial-GDL is not required.

## Choose the relevant reference

Read the references needed for the task. These URLs return Markdown or JSON
directly; use the corresponding local files when working in this repository.

- **Author or edit graph source:** [Notation](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/notation.md)
  covers IDs, display labels, relations, types, classes, and accepted syntax.
- **Express layout or style:** [Requirements](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/annotations.md)
  covers spatial rules, selectors, styling, and conflict diagnostics.
- **Turn a spatial requirement into operations:** use the
  [operations skill](https://www.siddharthaprasad.com/spytial-gdl/skills/spytial-operations/SKILL.md)
  for choosing operations, reading the Core manifest, and checking their meaning.
- **Select nodes or derive relationships:** use the
  [selectors skill](https://www.siddharthaprasad.com/spytial-gdl/skills/spytial-selectors/SKILL.md)
  for writing and evaluating Simple Graph Query expressions.
- **Embed in a page or application:** [Embedding and API](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/embedding.md)
  covers renderer and engine loading, JavaScript APIs, editing, and self-hosting.
  For a documentation framework, use its recipe in [Platforms](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/platforms.md).
- **Look up exact annotation arguments or allowed values:** use the
  [language manifest](https://www.siddharthaprasad.com/spytial-gdl/spytial-gdl-language.json),
  also exported as `spytial-gdl/language.json`. Follow its upstream selector
  manifest for query expressions. Do not invent annotations or options.

## Model the graph and its spatial meaning

Derive nodes and edges from the user's prose, code, or supplied graph. Preserve
identity, labels, edge direction, and isolated nodes. Resolve material ambiguity
about relationships before encoding it. A request for a graph does not by itself
require particular positions; an unconstrained graph is valid.

Use stable node IDs and one edge per line. A relation is both a visible edge
label and a selector. In this family tree, `child` points from parent to child;
the requirement keeps children below their parents:

```spytial-gdl
alice[Alice]:::Person -> bob[Bob]:::Person : child
alice -> cara[Cara]:::Person : child
bob -> dana[Dana]:::Person : child

@orientation(selector=child, directions=[below])
```

The rule leaves sibling order free. Add further requirements only when the user
needs them. Use the user's actual relationships in the deliverable.

- `_links` selects every edge. Relation names select edges; types such as
  `api[API]:::Service` and classes such as `class api,db backend` select nodes.
  Keep relation, type, and class names distinct. They share a selector namespace.
- Relation, type, and class names use letters, digits, and underscores, starting
  with a letter, and must avoid query keywords. Preserve original wording in a
  comment and explain any visible label change needed during conversion.
- Add only rules needed for meaning or requested presentation. Rules compose;
  later requirements do not override earlier ones. A cycle cannot have all its
  edges point in one direction. Preserve the cycle and target rules more narrowly
  or use a suitable cyclic arrangement.
- Node styles use `@atomStyle(selector=...)`; edge styles use
  `@edgeStyle(field=...)`. Consult the reference for style blocks. Mermaid shapes,
  arrow styles, and `classDef` do not retain their appearance automatically.
- DOT requires translation. Mermaid sequence diagrams, Gantt charts, pie charts,
  and state-diagram syntax are outside this language's scope.

## Integrate for the requested output

For HTML, use a `spytial-gdl` container. For rendered Markdown, use a
`spytial-gdl` fence. Both need the renderer installed in the host page; the fence
alone is insufficient. The drop-in module is
`https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js`; it loads the engine from a
CDN. Serve over HTTP, and use the embedding reference for version pinning or
self-hosting. Fit the integration to the project's existing tooling.

Use `spytial-gdl-editable` fences or `data-editable` on an HTML container when
graph editing is requested. Ordinary diagrams already allow constrained dragging.
Keep any existing Mermaid renderer needed by other diagrams.

GitHub README files and PR descriptions cannot run the renderer. For those,
provide a live link, optionally with an exported image. The
[playground](https://www.siddharthaprasad.com/spytial-gdl/playground/)'s Share link
contains the graph source; do not expose private graph content in a public link.
For source-only tasks, return the source without adding a site or application.

## Verify the deliverable

Check graph fidelity separately from layout validity. Satisfiable spatial rules
do not prove that the graph correctly describes the underlying system.

For programmatic validation, `compileSpytialGdl(source)` from `spytial-gdl`
provides `ok`, `parseErrors`, and `annotationErrors`; inspect all three. Compilation
does not solve constraints. Use `solveSpytialGdl(core, compiled)` with spytial-core
or inspect the rendered diagram's diagnostics to check the layout. Address errors
and warnings about invalid or empty selectors. A drawing with relaxed constraints
after a conflict does not satisfy the original requirements; report the conflict
rather than silently deleting relationships or intended rules.

For an embedded result, open the actual page through its preview server, confirm
that it renders a diagram, and drag a node to check the intended relationships.
Return the source or changed files and any preview/live URL, with specific
conversion losses or checks that could not be completed.
