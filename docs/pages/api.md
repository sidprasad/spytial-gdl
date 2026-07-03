# Programmatic API

*Render without the Markdown layer — mount a graph element and draw onto it.*

Everything the embedding layer does, you can do directly. Import from the package
(bundler) or the CDN (`https://cdn.jsdelivr.net/npm/spytial-gdl/src/index.js`):

```js
import { renderSpytialGdl, mountGraph } from 'spytial-gdl';

const graph = mountGraph(document.getElementById('out'), { width: 800, height: 600 });
const result = await renderSpytialGdl(graph, `
A -> B
A -> C

@orientation(selector=_links, directions=[below])
`);
```

The full export surface:

| export | kind |
|---|---|
| `mountGraph(container, opts)` | create/return a read-only `<webcola-cnd-graph>` |
| `renderSpytialGdl(graphEl, source, opts)` | render source onto it |
| `mountInputGraph(container, opts)` | create/return an editable `<structured-input-graph>` |
| `renderSpytialGdlEditable(container, source, opts)` | render onto the editor → [handle](editable.md#the-handle) |
| `serializeToSpytialGdl(value, opts)` | the notation serializer (inverse of render) |
| `extractAnnotations(rawSource)` | lift inline `@annotations` out of source |
| `registerSpec`, `clearRegistry`, `mergeSpecStrings`, `mergeSpecsForClasses` | the rule registry / merge helpers |

## mountGraph

```text
mountGraph(container, opts?) → <webcola-cnd-graph>
```

Creates (or reuses) a read-only graph element inside `container` and returns it.
If `container` already *is* a `<webcola-cnd-graph>`, it's returned as-is; otherwise
an existing child of that tag is reused, or a new one is created and appended.

`opts`: `{ width?, height?, theme?, ariaLabel? }` — set as attributes on a freshly
created element.

> **Note** — spytial-core is a **peer dependency** loaded on the page (the global
> `window.spytialcore`). `mountGraph`/`renderSpytialGdl` don't import it, so this
> module stays a bare browser ES module. If it isn't present you get a clear
> "spytial-core is not loaded" error; the Markdown path injects it for you. See
> [Architecture](architecture.md#dependencies).

## renderSpytialGdl

```text
renderSpytialGdl(graphEl, source, opts?) → Promise<result>
```

- `graphEl` — a `<webcola-cnd-graph>` (from `mountGraph`).
- `source` — spytial-gdl text with inline `@annotations`.
- `opts` — see below.

### opts

| option | default | meaning |
|---|---|---|
| `validator` | `'qualitative'` | constraint validator. `'qualitative'` gives IIS clash reporting + a best-feasible counterfactual; `'kiwi'` is the alternative solver. |
| `rules` | — | raw CnD layout YAML, merged with the inline annotations (advanced escape hatch). |
| `extraSpec` | — | extra spec YAML folded in via the class registry. |

### The result object

```text
{ applied, layout, error, selectorErrors, annotationErrors, parseErrors,
  parsed, data, instance, rules, hiddenRelations }
```

| field | meaning |
|---|---|
| `applied` | `true` if a layout was drawn onto the element |
| `layout` | the computed layout; on a clash, the best-feasible **counterfactual** |
| `error` | the constraint error / UNSAT core, or `null` (see [Conflicts](conflicts.md)) |
| `selectorErrors` | selectors that didn't resolve — `[]` when clean |
| `annotationErrors` | malformed/unknown annotations — `[{ line, text, message }]` |
| `parseErrors` | graph lines the parser flagged — `[{ line, text, severity, message }]`, `severity` `'error'` or `'warning'` (an ignored Mermaid construct) |
| `parsed` | `{ nodes, edges, classesPerNode, errors }` from the parser |
| `data` | the relational `{ atoms, relations }` handed to spytial-core |
| `instance` | the `JSONDataInstance` built from `data` |
| `rules` | the merged layout YAML actually solved |
| `hiddenRelations` | selector-only relations hidden from drawing (`_links`, types, classes) |

When `source` has no nodes, you instead get `{ applied: false, reason, parsed, annotationErrors, parseErrors }`.

### Re-rendering

The read-only view does **not** auto-re-render. To update a diagram, call
`renderSpytialGdl` again on the same element with new source (the playground does
this on ⌘⏎). For live editing with a notation round-trip, use
[`renderSpytialGdlEditable`](editable.md) instead.

```spytial-gdl
A:::Person -> B:::Person : knows
B -> C:::Person : knows
C -> A : knows

@cyclic(selector=knows, direction=clockwise)
@atomColor(selector=Person, value='#e7defb')
```

## Composing rules: registry and YAML

Inline `@annotations` are the primary authoring model, but they **compose** with
two lower-level inputs through the shared `mergeSpecStrings` concat. The resolution
order, per render:

1. specs registered with `registerSpec` for the **classes used** in this source,
   plus any `opts.extraSpec`;
2. the inline `@annotation` spec compiled from the source;
3. an explicit `opts.rules` string.

```js
import { registerSpec, renderSpytialGdl, mountGraph } from 'spytial-gdl';

// Reusable layout for any node tagged `class … server`:
registerSpec('server', `
directives:
  - atomColor: { selector: server, value: '#dbe9ff' }
`);

const g = mountGraph(el);
await renderSpytialGdl(g, 'a:::Box -> b:::Box\nclass a,b server', {
  rules: 'constraints:\n  - orientation: { selector: _links, directions: [right] }',
});
```

`mergeSpecStrings([...])` is the same concat the registry uses, exposed for callers
who assemble specs themselves. `clearRegistry()` empties the per-class registry
(handy between independent renders / tests).

## extractAnnotations and serializeToSpytialGdl

The two ends of the pipeline, usable standalone:

- `extractAnnotations(rawSource)` → `{ source, specYaml, annotationLines, errors }`
  — lifts the `@…` lines out and compiles them to authoring YAML.
- `serializeToSpytialGdl(value, { annotations })` → notation text — the inverse,
  turning a `{ atoms, relations }` value back into spytial-gdl source. This powers
  the editable handle's [`getSource()`](editable.md#the-serializer-on-its-own).

## Next

- **[Editable diagrams](editable.md)** — the editor element and its handle.
- **[Conflicts & UNSAT](conflicts.md)** — `error` and `selectorErrors`, read in detail.
- **[Architecture](architecture.md)** — what happens between source and pixels.
