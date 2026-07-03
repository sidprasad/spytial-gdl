# Conflicts & UNSAT

*Over-constrain a layout and nothing disappears — you get the closest feasible diagram plus the minimal reason.*

Because layout is a set of constraints, you can ask for the impossible: two edges
that must both point right *and* form a cycle, a group that must enclose nodes
pulled apart by an orientation, and so on. Spytial treats this as a first-class
outcome, not a crash.

## The best-feasible counterfactual

When the constraints can't all hold, the solver returns the **closest feasible
layout** — it still draws something useful — together with the **minimal conflict**:
the smallest subset of rules that, taken together, are unsatisfiable. That subset
is the *Irreducible Inconsistent Subsystem* (IIS), commonly called the UNSAT core.

This block asks two opposing edges of a 2-cycle to both go right — impossible:

```spytial-gdl
A -> B : x
B -> A : y

@orientation(selector=x, directions=[right])
@orientation(selector=y, directions=[right])
```

The diagram still renders a best-effort layout, and the attached **⚠ These rules
can't all hold** panel (expand it under the diagram) names exactly the constraints
in tension — not the whole spec, just the irreducible core.

## Reading it in an embed

Every embed reserves space for the conflict *inside the diagram's border*, so the
report obviously belongs to that diagram and not the surrounding prose:

- The panel only appears when there's a clash; it's collapsible.
- In an [editable block](editable.md), it's **live** — resolve the clash (delete an
  offending edge, change a direction) and the panel clears on the spot.

The report is rendered by spytial-core's own IIS component — the same one the
[playground](../playground/) mounts — lazy-loaded the first time a clash appears, so
conflict-free pages never pay for it.

## Reading it from the API

[`renderSpytialGdl`](api.md#renderspytialgdl) surfaces the same information on
its result object:

```js
const r = await renderSpytialGdl(graph, source);
if (r.error) {
  // r.error — the constraint conflict (UNSAT core / positional / group-overlap)
  console.warn('layout conflict:', r.error.message);
}
// r.layout is still the best-feasible counterfactual; r.applied tells you if it drew.
```

`error` carries a shape that depends on the kind of clash — positional conflicts
carry `errorMessages`, group overlaps carry `overlappingNodes`/`source`, and so on.
The Markdown layer maps these onto spytial-core's `show*Error` dispatch to render
the panel; if you build your own UI, branch on those fields the same way.

## Selector errors

A different failure: a `selector=` that doesn't resolve to anything in the model
(a typo'd label, a class you never assigned). That's **not** a layout conflict — the
spec itself is malformed — so it's reported separately as `selectorErrors`, and the
degenerate layout is *not* drawn:

```js
const r = await renderSpytialGdl(graph, source);
if (r.selectorErrors.length) {
  // e.g. selector 'lft' didn't match any edges or nodes
}
```

In an embed this is the **⚠ A selector didn't resolve** panel. Fix the selector to
one of the [five forms](selectors.md#the-five-forms) and it resolves.

## Source errors — parse and annotation

Earliest of all: problems in the *source text*, before any layout runs. Two kinds,
both caught up front and both reported with line numbers:

- **Annotation errors** — an annotation that doesn't parse (unknown `@name`, a
  missing comma, an unterminated `(`). Come back as `annotationErrors` —
  `[{ line, text, message }]`; the offending annotation is dropped.
- **Parse errors** — a graph line the parser flagged. `parseErrors` —
  `[{ line, text, severity, message }]`. `severity: 'error'` is a line it couldn't
  read (a broken edge, junk); `severity: 'warning'` is a tolerated-but-ignored
  Mermaid construct (a `graph`/`flowchart` header, `classDef`).

Both are **non-fatal**: the diagram still renders best-effort, and an embed shows a
**⚠ … in this source** band beneath it listing each problem by line. So the four
stages are distinct, easy to tell apart:

| stage | failure | result field | embed panel |
|---|---|---|---|
| parse graph | bad line / ignored Mermaid | `parseErrors` | ⚠ … in this source |
| lift annotations | bad `@name` / args | `annotationErrors` | ⚠ … in this source |
| resolve selectors | `selector=` matches nothing | `selectorErrors` | ⚠ A selector didn't resolve |
| solve constraints | rules can't all hold | `error` (UNSAT core) | ⚠ These rules can't all hold |

## Next

- **[Selectors](selectors.md)** — avoid selector errors with the five resolving forms.
- **[Architecture](architecture.md)** — where in the pipeline each check happens.
