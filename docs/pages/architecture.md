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
| ask the engine | `diagnostics.js` | every declared name read back through the evaluator; every rule through `parseLayoutSpec` on its own, refused ones left out |
| solve | spytial-core | `JSONDataInstance` → `SGraphQueryEvaluator` → `parseLayoutSpec` → `LayoutInstance.generateLayout` → `{ layout, error, selectorErrors, warnings }` |
| report | `diagnostics.js` | `selectorErrors` and `warnings` normalized and mapped back to annotation lines, onto one `diagnostics` list with the parser's and compiler's |
| draw | `<webcola-cnd-graph>` | `.renderLayout(layout)` |

The three engine-facing stages are one function, `solveSpytialGdl`, which both
render paths call and `test/engine-diagnostics.test.mjs` calls in Node.

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
| `spytial-core@^5.0` | the engine: registers `<webcola-cnd-graph>`, exposes `window.spytialcore` |

spytial-core is a peer dependency. spytial-gdl doesn't `import` it, which is what
lets its own modules load as bare browser ES modules. spytial-core auto-registers
the custom element and exposes the engine on `window.spytialcore`. Vendor all
three locally for an offline or version-pinned deploy
([Embedding → self-hosting](embedding.md#self-hosting-the-engine)).

## File map

| file | responsibility |
|---|---|
| `src/parse.js` | the notation grammar |
| `src/annotations.js` | inline `@annotation` extraction into authoring YAML |
| `src/relationalize.js` | graph into `{ atoms, relations, hiddenRelations }` |
| `src/registry.js` | per-class spec registry, plus `mergeSpecStrings` |
| `src/serialize.js` | the inverse: value into spytial-gdl notation |
| `src/diagnostics.js` | what the engine says about a diagram, read by field and pinned to lines |
| `src/index.js` | `compileSpytialGdl` (source into datum + spec), `solveSpytialGdl` (datum + spec through the engine), `mountGraph` / `renderSpytialGdl` / editable |
| `src/markdown.js` | block detection, the framed device, the UNSAT panel |
| `src/auto.js` | the drop-in `autoRender()` tag |

## Asking the engine, not modeling it

Most of what can go quietly wrong in a diagram is the engine's to know: whether
a bare name is one its query grammar reads, which of two things a shared spelling
resolves to, whether a rule parses, whether a selector matched anything. Each of
those moves between spytial-core releases, and a copy of the answer kept here
would describe the release it was copied from.

So `diagnostics.js` holds no such copy. Before the solve it hands every name the
notation declared — each edge label, sort and class — to the evaluator and checks
that what comes back is the thing declared; a word the grammar reserves comes
back refused, by the grammar that reserves it. It parses each rule on its own
through `parseLayoutSpec`, so a rule the installed release refuses is named and
left out rather than failing the whole spec. After the solve it reads
`selectorErrors` and `warnings` by field — `severity`, `code`, `selector`,
`context` — and shows `message` verbatim, never matching against it. A field a
future release drops degrades to a diagnostic without it.

The parser keeps only the part that is spytial-gdl's own: the shape of a name
(letters, digits, `_`), the `_` prefix it reserves for `_` and `_links`, and the
fact that labels, sorts and classes share one namespace.

`test/engine-diagnostics.test.mjs` pins the two claims this rests on against the
installed engine: that a solve result carries `warnings` and `selectorErrors` we
can read by field, and that the evaluator's answer about a name is the one we
report. The name checks are written as parity — for each candidate label the
suite asks the evaluator itself, then asserts we flag exactly those — so which
words are reserved is never asserted, only that we agree with the engine about
them.

## Testing what a spec means

A spec can be well-formed, validate against the schema, and still say less than
its author thought. The diagram then comes out plausible and wrong, and no string
comparison catches it — the YAML is exactly what we meant to emit; it just does
not *entail* what we meant.

`test/conformance.test.mjs` asks the entailment question directly, using
spytial-core's [conformance
harness](https://sidprasad.github.io/spytial-core/#/testing-integrations). Cases
are written as notation in `test/conformance/cases.mjs`, compiled with
[`compileSpytialGdl`](embedding.md#compilespytialgdl), and checked with modal
queries:

```yaml
- query: must.rightOf(a)
  equals: [b, c]
  because: orientation is transitive, so the whole tail is right of the head
- query: must.above(a)
  empty: true
  because: the spec orders horizontally only
```

`must.rightOf(a)` does not mean "b landed right of a in the layout I got". It
means every layout the spec permits puts b there — a fact about the spec, so it
holds across renderers, machines, and core releases, and needs no browser.

The negative assertions are the ones that earn their keep. `must.above(a)` being
empty is what pins down that the spec says nothing about the vertical axis; a
rendered picture would have put the nodes *somewhere* and told you nothing.

Every constraint has a case: `orientation` and `align` through the directional
and alignment queries, `group` through `groups()` / `grouped()`, `hideAtom`
through `hidden()`, `size` through `sized(w, h)`, and `cyclic` through
`cyclic(a)` — which reports membership, not rotation, since which way round a
ring is drawn is not something the spec entails. Directives are covered where
they change what a layout contains: `hideField` removes an edge, `inferredEdge`
adds one the data never held, and `flag(hideDisconnected)` drops an atom
*without* it turning up in `hidden()`, which reports only what `hideAtom` took.

Those last three queries arrived in spytial-core 4.4.2, once above the floor the
peer range set; on 5.0.0 the range itself guarantees them. An unrecognized query
now means a release retired one, and the suite names it rather than failing as a
dozen unrecognized queries.

This is the one part of the repo that needs `npm install` — the engine has to be
present to answer. CI installs without a lockfile, so it resolves the newest
`spytial-core` on the peer major every run: a release that changes what a spec
entails fails a build instead of surfacing in someone's diagram.

That is what the move to spytial-core 5 was checked with. The 5.0 major drops
React surfaces spytial-gdl never mounted — `InstanceBuilder`, `ProjectionControls`,
`ReplInterface` — and leaves the spec language untouched at 2026-07-29, so
regenerating `src/_spec-tables.js` moved a version stamp and nothing else. The
suite answered the question that claim rests on: every entailment in
`test/conformance/cases.mjs` comes back identical on 4.4.2, 4.4.3, 5.0.0 and
5.0.1. A vocabulary diff shows what a release *says* changed; this is what it
turned out to mean.

## These docs

This site is static and zero-build. It renders its own Markdown client-side with
marked, then renders every ` ```spytial-gdl ` block with the same
`renderSpytialGdls` you'd embed. The shell is
[`docs/app.js`](https://github.com/sidprasad/spytial-gdl/blob/main/docs/app.js),
and it imports from the same `src/` you would.

## Next

- [Embedding & API](embedding.md#programmatic-api): the entry points named above.
- [Conflicts & errors](annotations.md#errors-and-conflicts): what `generateLayout` returns on a clash.
