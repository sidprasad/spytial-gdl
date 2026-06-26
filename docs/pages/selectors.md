# Selectors

*An edge's label is its relation name. Selectors name the things annotations act on.*

Every annotation targets a **selector**: a name that resolves to a set of edges or
a set of nodes. This is what makes layout a *query over the model* rather than
per-node markup — one rule, every matching element.

## The five forms

| selector | selects |
|---|---|
| `<label>` | edges carrying that label — `A -> B : left` → `left` |
| `_` | the unlabeled edges (plain `A -> B`) |
| `_links` | **every** edge, labeled or not |
| `<type>` | nodes of that sort — `A:::Person` → `Person`; plain nodes are `Node` |
| `<class>` | nodes carrying that class — `class A,B team` → `team` |

The first three select **edges**; the last two select **nodes**. An annotation
that wants edges (like `@orientation`) takes an edge selector; one that wants nodes
(like `@group` or `@atomColor`) takes a node selector.

## Edge selectors

The label after a colon *is* the relation name. Target it directly:

```spytial-graph
A -> B : reports_to
C -> B : reports_to
B -> D : owns

@orientation(selector=reports_to, directions=[above])
@orientation(selector=owns, directions=[right])
```

`_` is the relation that unlabeled edges carry; `_links` is the union of all edges.
Use `_links` for a baseline that applies to everything, then refine per label:

```spytial-graph
root -> a : left
root -> b : right
a -> a1
b -> b1

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

Here every edge goes *below* its source (`_links`), and the two named relations add
a sideways bias on top. The plain `a -> a1` / `b -> b1` edges match only `_links`.

## Node selectors: types and classes

A **type** comes from `:::Sort`; a **class** comes from `class … tag`. Both select
node sets, and you can use either wherever a node selector is expected:

```spytial-graph
db[DB]:::Service
api[API]:::Service -> db
web[Web]:::Client -> api

class db critical

@atomColor(selector=Service, value='#dce8ff')
@atomColor(selector=Client, value='#e7defb')
@group(selector=critical, name='Critical')
@orientation(selector=_links, directions=[left])
```

The **types** `Service` and `Client` tint nodes by role; the **class** `critical`
draws a region around the one node that matters most. Types model *what a node is*;
classes model *a cross-cutting tag* — use whichever matches your intent.

> **Note** — `atomColor` won't paint one node two colors: if a node is matched by
> two `atomColor` selectors with different values, the engine reports a color
> conflict rather than picking one. Keep a node's color coming from a single
> selector (here, its type), and use other directives (`group`, `tag`) for the
> cross-cutting set.

## Drawn once

Each edge is **drawn exactly once** — under its own label, or under `_` if it has
none. `_links` and the node-set relations (`Node`, your types, your classes) are
**selector-only**: they resolve in selectors but are hidden from drawing, so they
never double-draw an edge or render a phantom relation. You don't have to manage
this; the engine emits the necessary `hideField` directives for you.

The practical effect: targeting `_links` changes layout for every edge without
adding a second arrow on top of the labeled one.

## Collisions

Because labels, types, and classes all live in one selector namespace, a name
means whatever shares its spelling. **Keep them distinct.** If an edge label
`team` and a class `team` coexist, `selector=team` is ambiguous and one will shadow
the other. Rename one — e.g. edge label `member_of`, class `team`.

> **Note** — A selector that doesn't resolve to anything comes back as a
> `selectorError` rather than failing silently. In an embed, the **⚠ A selector
> didn't resolve** panel names it; from the API it's the `selectorErrors` array on
> the result. See [Conflicts & UNSAT](conflicts.md#selector-errors).

## Advanced: comprehensions

A selector can also be a set comprehension, for finer targeting than a bare name —
e.g. `'{x: Person | …}'`. These are passed through to SpyTial's query evaluator.
Quote the whole expression so its braces and pipe survive parsing:

```text
@group(selector='{p: Person | some p.reports_to}', name='Managers')
```

For everyday diagrams the five named forms above are all you need.

## Next

- **[Annotations](annotations.md)** — the operations these selectors feed.
- **[Notation](notation.md)** — where labels, types, and classes come from.
