# Architecture

What each module does between the source text and the drawn diagram.

spytial-gdl is a thin authoring layer over
[Spytial](https://github.com/sidprasad/spytial-core)'s constraint-layout engine. It
parses a small notation, turns it into a relational data instance, compiles your
`@annotations` into a layout spec, and hands both to spytial-core, which owns both
solving the layout and drawing it.

## The pipeline

Here it is as a spytial-gdl, of course:

```spytial-gdl
src[spytial-gdl source]:::Ours -> anno[annotations.js]:::Ours
anno -> parse[parse.js]:::Ours
parse -> rel[relationalize.js]:::Ours
rel -> core[spytial-core]:::Engine
core -> draw[webcola-cnd-graph]:::Renderer

@orientation(selector=_links, directions=[below])
@atomStyle(selector=Ours, borderStyle(color='#eef0f3'))
@atomStyle(selector=Engine, borderStyle(color='#cfe8d8'))
@atomStyle(selector=Renderer, borderStyle(color='#ffe7b3'))
```

Stage by stage:

| stage | module | does |
|---|---|---|
| lift annotations | `annotations.js` | pull `@orientation(...)` and the rest out of the source, giving `{ source, specYaml }` |
| parse | `parse.js` | `{ nodes, edges, classesPerNode }` |
| relationalize | `relationalize.js` | `{ atoms, relations, hiddenRelations }` |
| solve | spytial-core | `JSONDataInstance` → `SGraphQueryEvaluator` → `parseLayoutSpec` → `LayoutInstance.generateLayout` → `{ layout, error, selectorErrors }` |
| draw | `<webcola-cnd-graph>` | `.renderLayout(layout)` |

The custom element owns layout as well as drawing, which is the design decision
everything else follows from. spytial-gdl never positions anything itself. It
produces a spec and a data instance, and `LayoutInstance.generateLayout` does the
constraint solving. That's why an over-constrained input comes back as a
counterfactual plus a UNSAT core
([Conflicts](annotations.md#errors-and-conflicts)) instead of a broken picture.

## Why annotations become YAML

Spatial operations used to live in a separate CnD "rules" YAML spec.
`extractAnnotations` compiles the inline `@name(...)` decorators into that same
authoring YAML, as one-line flow-map list items under `constraints:` and
`directives:`. So inline annotations, the per-class `registerSpec` registry, and a
raw `opts.rules` string all merge through one shared concat
([API → composing rules](embedding.md#composing-rules-registry-and-yaml)). The
decorator syntax mirrors Spytial's Python DSL (`spytial-py`), which lets a graph
and its layout travel together as one block of text.

## Selector-only relations

`_links` and the node-set relations (your sorts and classes) have to be queryable
in selectors without being drawn. Otherwise `@orientation(selector=_links)` would
paint a second arrow over every labeled edge. `relationalize` flags these as
`hiddenRelations` and the renderer injects `hideField` directives for them, so they
are present to the evaluator and absent from the canvas. None of it is yours to
manage.

## Dependencies

The engine is three scripts, loaded in dependency order. The Markdown path injects
them from a CDN if the page doesn't already have them; for the programmatic API you
include them yourself.

| dependency | role |
|---|---|
| d3 **v4** | WebCola's rendering/data substrate |
| `webcola@3.4.0` | the constraint-layout solver Spytial drives |
| `spytial-core@^4.0` | the engine: registers `<webcola-cnd-graph>`, exposes `window.spytialcore` |

spytial-core is a peer dependency. spytial-gdl doesn't `import` it, which is what
lets its own modules load as bare browser ES modules. spytial-core auto-registers
the custom element and exposes the engine on `window.spytialcore`, with `CndCore`
as a legacy alias. Vendor all three locally for an offline or version-pinned deploy
([Embedding → self-hosting](embedding.md#self-hosting-the-engine)).

## File map

| file | responsibility |
|---|---|
| `src/parse.js` | the notation grammar |
| `src/annotations.js` | inline `@annotation` extraction into authoring YAML |
| `src/relationalize.js` | graph into `{ atoms, relations, hiddenRelations }` |
| `src/registry.js` | per-class spec registry, plus `mergeSpecStrings` |
| `src/serialize.js` | the inverse: value into spytial-gdl notation |
| `src/index.js` | `mountGraph` / `renderSpytialGdl` / editable, and the render pipeline |
| `src/markdown.js` | block detection, the framed device, the UNSAT panel |
| `src/auto.js` | the drop-in `autoRender()` tag |

## These docs

This site is static and zero-build. It renders its own Markdown client-side with
marked, then renders every ` ```spytial-gdl ` block with the same
`renderSpytialGdls` you'd embed. The shell is
[`docs/app.js`](https://github.com/sidprasad/spytial-gdl/blob/main/docs/app.js),
and it imports from the same `src/` you would.

## Next

- [Embedding & API](embedding.md#programmatic-api): the entry points named above.
- [Conflicts & errors](annotations.md#errors-and-conflicts): what `generateLayout` returns on a clash.
