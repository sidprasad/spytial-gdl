# Start here

Spytial GDL turns a text description of a graph into an interactive diagram. Add layout requirements when position carries meaning; leave the rest to the layout engine.

## Try it

[Open the online playground](../playground/). Choose an example, drag the nodes, and change the source beside the diagram. Press **Apply** to see your changes. The [example gallery](../gallery/) shows diagrams adapted from real Mermaid and Graphviz layout questions.

## Put a diagram in a page

[Embed a diagram](embedding.md) in HTML or a Markdown site. The guide starts with a script tag and a fenced code block, then links to setup for MkDocs, Jekyll, Hugo, Docusaurus, and Pollen. A GitHub README can link to a live diagram, but cannot run the renderer itself.

## Write your own

The syntax reference has two parts:

- [Graph description](notation.md): nodes, edges, labels, types, and classes.
- [Layout requirements](annotations.md): orientation, alignment, grouping, styling, and conflicts.
