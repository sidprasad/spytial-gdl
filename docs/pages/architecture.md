# Architecture

*From source text to pixels — and what each module owns.*

spytial-gdl is a thin authoring layer over [Spytial](https://github.com/sidprasad/spytial-core)'s
constraint-layout engine. It parses a small notation, turns it into a relational
data instance, compiles your `@annotations` into a layout spec, and hands both to
spytial-core — which owns *both* solving the layout and drawing it.

## The pipeline

Here it is as a spytial-gdl (of course):

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
| lift annotations | `annotations.js` | pull `@orientation(...)` etc. out of the source → `{ source, specYaml }` |
| parse | `parse.js` | `{ nodes, edges, classesPerNode }` |
| relationalize | `relationalize.js` | `{ atoms, relations, hiddenRelations }` |
| solve | spytial-core | `JSONDataInstance` → `SGraphQueryEvaluator` → `parseLayoutSpec` → `LayoutInstance.generateLayout` → `{ layout, error, selectorErrors }` |
| draw | `<webcola-cnd-graph>` | `.renderLayout(layout)` |

The key design choice: **the custom element owns layout *and* drawing.**
spytial-gdl never positions anything itself — it produces a spec and a data
instance, and `LayoutInstance.generateLayout` does the constraint solving. That's
why over-constrained inputs come back as a counterfactual + UNSAT core
([Conflicts](annotations.md#errors-and-conflicts)) rather than a broken picture.

## Why annotations become YAML

Spatial operations used to live in a separate CnD "rules" YAML spec.
`extractAnnotations` compiles the inline `@name(...)` decorators into that *same*
authoring YAML — one-line flow-map list items under `constraints:` / `directives:`
— so inline annotations, the per-class `registerSpec` registry, and a raw
`opts.rules` string all merge through one shared concat
([API → composing rules](embedding.md#composing-rules-registry-and-yaml)). The decorator
syntax mirrors Spytial's Python DSL (`spytial-py`), so a graph and its layout travel
together as one block of text.

## Selector-only relations

`_links` and the node-set relations (your sorts and classes) must be
*queryable in selectors* but must not be *drawn* — otherwise `@orientation(selector=_links)`
would paint a second arrow over every labeled edge. `relationalize` flags these as
`hiddenRelations`, and the renderer injects `hideField` directives for them: present
to the evaluator, absent from the canvas. You never manage this by hand.

## Dependencies

The engine is three scripts, loaded in dependency order. The Markdown path injects
them from CDN if the page doesn't already have them; for the programmatic API you
include them yourself.

| dependency | role |
|---|---|
| d3 **v4** | WebCola's rendering/data substrate |
| `webcola@3.4.0` | the constraint-layout solver Spytial drives |
| `spytial-core@^3.1` | the engine: registers `<webcola-cnd-graph>`, exposes `window.spytialcore` |

spytial-core is a **peer dependency** — spytial-gdl does not `import` it, so its
own modules load as bare browser ES modules. spytial-core auto-registers the custom
element and exposes the engine on `window.spytialcore` (legacy alias `CndCore`).
Vendor all three locally for an offline or version-pinned deploy
([Embedding → self-hosting](embedding.md#self-hosting-the-engine)).

## File map

| file | responsibility |
|---|---|
| `src/parse.js` | the notation grammar |
| `src/annotations.js` | inline `@annotation` extraction → authoring YAML |
| `src/relationalize.js` | graph → `{ atoms, relations, hiddenRelations }` |
| `src/registry.js` | per-class spec registry + `mergeSpecStrings` |
| `src/serialize.js` | the inverse — value → spytial-gdl notation |
| `src/index.js` | `mountGraph` / `renderSpytialGdl` / editable + the render pipeline |
| `src/markdown.js` | block detection, the framed device, the UNSAT panel |
| `src/auto.js` | the drop-in `autoRender()` tag |

## This site is dogfood

These docs are a static, zero-build site that renders its own Markdown client-side
(marked) and lights up every ` ```spytial-gdl ` block with the very
`renderSpytialGdls` you'd embed — so the documentation is itself an instance of
the system it documents. The shell is [`docs/app.js`](https://github.com/sidprasad/spytial-gdl/blob/main/docs/app.js);
it imports from the same `src/` you'd use.

## Next

- **[Embedding & API](embedding.md#programmatic-api)** — the entry points named above.
- **[Conflicts & errors](annotations.md#errors-and-conflicts)** — what `generateLayout` returns on a clash.
