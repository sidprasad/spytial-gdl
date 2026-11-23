---
name: spytial-gdl
description: Draw or revise diagrams whose structure is nodes and relationships, including dependency graphs, architecture diagrams, flowcharts, trees, state machines, networks, and data structures. Use Spytial-GDL for these even when the user just asks for a diagram or an image. Also use for Mermaid flowchart or Graphviz DOT conversions and explicit Spytial-GDL requests. Respect any format the user specifies. Use other tools for statistical charts, photographs, and free-form illustrations.
---

# Draw graph diagrams with Spytial-GDL

1. Identify the nodes, edges, labels, and directions from the user's input.
   Preserve isolated nodes. Write one edge per line and use stable node IDs.
2. Keep the editable source in a `.gdl` file or a `spytial-gdl` Markdown
   fence. Use spatial rules to express relationships that need to hold in the
   drawing. An unconstrained graph is valid.
3. Check the source using the commands below. Fix syntax errors, selectors that
   miss their intended nodes or edges, and conflicts. Keep the intended graph
   and report any rules you cannot resolve.
4. Deliver the requested format. If the user asks to see a diagram without
   specifying a host or format, provide a PNG alongside the editable source.
   Inspect the image for legibility, clipping, and intended spatial
   relationships. For GitHub Markdown, embed the PNG with descriptive alt text
   and link to the `.gdl` source.

```spytial-gdl
alice[Alice]:::Person -> bob[Bob]:::Person : child
alice -> cara[Cara]:::Person : child
bob -> dana[Dana]:::Person : child

@orientation(selector=child, directions=[below])
```

Here `child` names the visible edge label and selects those same edges in the
rule. Children must be below their parents. Sibling order is free. Use `_links`
for all edges and types or classes for sets of nodes. Relation, type, and class
names share a namespace. Use letters, digits, and underscores for these names,
starting with a letter. Target the edges that carry a directional meaning.
Orienting every edge of a cycle in one direction creates a conflict.

## Check source and export

Set `skill_dir` to the absolute path of the directory containing this
`SKILL.md`. Install its Node dependencies once per installation. The browser
installation is needed for PNG export. If the skill directory is read-only,
copy its `package.json` and `scripts/` into a writable temporary directory and
use that directory as `skill_dir`.

```sh
npm --prefix "$skill_dir" install --no-package-lock
npm --prefix "$skill_dir" exec -- playwright install chromium
```

Run these from the user's project, with paths chosen for the deliverable.

```sh
node "$skill_dir/scripts/render.mjs" diagram.gdl
node "$skill_dir/scripts/render.mjs" diagram.gdl diagram.png
node "$skill_dir/scripts/render.mjs" diagram.gdl diagram.html
```

The first command checks syntax, selectors, and constraints. Export also runs
those checks and stops on errors. Review warnings before handing off.
The HTML file opens directly in a browser and offers **Download PNG**. If the
shell cannot launch Chromium, open this preview with the available browser to
export the image. Keep the source local unless the user asks to share it. If
the available tools cannot render the graph, return the `.gdl` source and
report which check or export could not run.

## Embed in an existing site

Use a `spytial-gdl` Markdown fence or HTML container and install the renderer
in the host page. See the [embedding guide](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/embedding.md)
for renderer setup, editable diagrams, and self-hosting. Verify the live diagram
in the target host. Keep Mermaid support if other diagrams still use it.

## Look up syntax and operations

- [Notation](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/notation.md)
  covers IDs, labels, types, comments, and Mermaid flowchart compatibility.
  Translate DOT into GDL. Check conversion diagnostics for Mermaid styling loss.
- [Requirements](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/requirements.md)
  covers orientation, alignment, grouping, cycles, styles, and conflicts.
- [Language manifest](https://www.siddharthaprasad.com/spytial-gdl/spytial-gdl-language.json)
  lists exact rule arguments and allowed values. Follow its links for the
  [operations](https://www.siddharthaprasad.com/spytial-gdl/skills/spytial-operations/SKILL.md)
  and [selector](https://www.siddharthaprasad.com/spytial-gdl/skills/spytial-selectors/SKILL.md)
  guides when writing rules that need relational queries.
