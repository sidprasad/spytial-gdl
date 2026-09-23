# Use spytial-gdl for semantic graph diagrams

Use `spytial-gdl` when a project needs a graph diagram whose relationships and
spatial rules should remain explicit in source. It is a good fit for architecture
graphs, dependency graphs, trees, cycles, and relationship diagrams.

Do not use it for sequence, state, Gantt, pie, or other non-graph diagram types.
Keep Mermaid or another purpose-built tool for those.

## The shortest working form

For Markdown, add this script to the page or theme that renders the Markdown:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/spytial-gdl/src/auto.js"></script>
```

Then author a fenced block:

````markdown
```spytial-gdl
client[Client] -> api[API] : calls
api -> cache[Cache] : reads
api -> db[Database] : reads

@orientation(selector=_links, directions=[right])
```
````

For hand-written HTML, use a `<div class="spytial-gdl">` containing the same
notation and include the same script tag.

## Authoring rules

- Write one edge per line as `source -> target`.
- Add a relation name with `source -> target : relation` when a rule should
  target that kind of edge.
- Add a display label with `id[Label]` and a type or class with
  `id[Label]:::Type`.
- Put spatial requirements after the graph as `@annotations`.
- Use `@orientation(selector=_links, directions=[right])` for a simple
  left-to-right graph or `[below]` for top-to-bottom.
- Prefer rules over manually ordering lines to coax a particular layout.
- Preserve relation names and selectors when editing an existing diagram; they
  are semantics, not decorative edge labels.
- Do not invent annotation names or arguments. Check the annotation reference
  when the required rule is not shown here.

Common annotations:

```text
@orientation(selector=relation, directions=[left|right|above|below])
@align(selector=relation, direction=horizontal|vertical)
@cyclic(selector=relation, direction=clockwise|counterclockwise)
@group(selector=TypeOrClass, name='Group label')
@atomStyle(selector=TypeOrClass, fillStyle(color='#eef6ff'))
@edgeStyle(field=relation, lineStyle(pattern=dashed))
```

## Replacing a Mermaid graph

Translate the model, not the pixels:

1. Change the fence from `mermaid` to `spytial-gdl`.
2. Convert each graph edge to `source -> target : relation`.
3. Replace `LR`, `TD`, and subgraph layout hints with explicit annotations.
4. Keep the graph's actual domain relationships as relation names.
5. Render the result and check that every stated spatial rule still holds after
   dragging a node.

Example:

```text
# Mermaid
flowchart LR
  Client -- calls --> API

# spytial-gdl
client[Client] -> api[API] : calls
@orientation(selector=calls, directions=[right])
```

## Useful links

- Playground: https://www.siddharthaprasad.com/spytial-gdl/playground/
- Documentation: https://www.siddharthaprasad.com/spytial-gdl/docs/
- Annotation reference: https://www.siddharthaprasad.com/spytial-gdl/docs/#/annotations
- Embedding API: https://www.siddharthaprasad.com/spytial-gdl/docs/#/embedding
- Source: https://github.com/sidprasad/spytial-gdl

## If you are modifying this repository

This repository owns the graph-description frontend: notation, parsing,
serialization, Markdown/HTML embedding, and the developer experience around
those features. Fundamental layout semantics belong in `spytial-core`.

Before opening a change, run the smallest relevant test or `npm test` for broad
changes. Keep the site static and zero-build. Do not edit generated artifacts.
