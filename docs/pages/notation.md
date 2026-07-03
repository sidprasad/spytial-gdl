# The notation

*Nodes, edges, labels, types, classes. No header, no layout direction — layout comes from [annotations](annotations.md).*

A spytial-gdl is a tiny text syntax. You write the graph; Spytial lays it out.
There is no required header and no `TD`/`LR` direction: spatial operations come
from inline `@annotations`, so a `graph TD` preamble would do nothing. Leave it
out (it's tolerated and ignored, so pasted Mermaid still works).

## Edges

A node is implicit from any edge, so the smallest graph is one line:

```spytial-gdl
A -> B
```

Label an edge after a colon. The **label is also a selector** you can target in
annotations — that's the heart of the model (see [Selectors](#selectors)):

```spytial-gdl
A -> B : hit
A -> C : miss

@orientation(selector=hit,  directions=[right])
@orientation(selector=miss, directions=[below])
```

> **Note** — A few words are reserved by the selector grammar, so avoid them as
> edge labels: `yes`, `no`, `true`, `false`, `then`, `else`. Use a plain
> identifier (`hit`, `pass`, `child`) instead.

## Nodes, labels, and ids

A node's **id is its name**. A `[bracket]` gives it a display **label**,
mermaid-style — without one, the id is shown. The id stays the stable identity
that edges reference (handy for generated ids):

```spytial-gdl
u1[Alice] -> u2[Bob]
u1 -> u3[Carol]
```

`u1` is written once with its label and then referenced bare; both edges attach to
the same node. You can also declare a node on its own line, with no edge:

```spytial-gdl
solo[Just here]
```

## Sorts (types)

A `:::Sort` tag gives a node a **type**, so `selector: Person` then matches every
node of that type. A plain node is **untyped** — with no sort it carries no type
name, so no named `selector` matches it; only `univ` (the universal set) reaches
every node regardless of type:

```spytial-gdl
alice[Alice]:::Person -> acme[Acme]:::Company
bob[Bob]:::Person     -> acme

@atomColor(selector=Person, value='#cfe8d8')
@atomColor(selector=Company, value='#ffe7b3')
```

The id is the identity edges reference; the label is what's drawn; the sort is what
selectors match. **One sort per node for now** — a chain `:::Person:::Employee` (a
linear sort hierarchy) is reserved for later; today the most specific (last)
segment wins.

## Classes

For a cross-cutting group that isn't a type, tag nodes with `class A,B,C tag`. A
class is a selector too, so you can style or group the whole set at once:

```spytial-gdl
A -> B
A -> C
D -> E

class A,B,C teamA
class D,E teamB

@group(selector=teamA, name='Team A')
@group(selector=teamB, name='Team B')
```

> **Note** — Name a class and an edge label **distinctly**. A shared spelling
> collides them, since both resolve as selectors. See
> [Selectors → collisions](#collisions).

## Comments

`%%` starts a line comment (Mermaid-style); the rest of the line is ignored:

```spytial-gdl
A -> B   %% the spine
B -> C
```

A `%%@name(...)` form is also how you can guard an annotation so a block still
degrades gracefully if pasted into a vanilla Mermaid renderer — see
[Annotations](annotations.md#mermaid-safe-annotations).

## Mermaid compatibility

Existing flowcharts paste in. These are all accepted and normalized:

| Mermaid form | read as |
|---|---|
| leading `graph TD` / `flowchart LR` | ignored (no layout direction here) |
| `A --> B`, `A -.-> B`, `A ==> B`, `A --- B` | an edge (arrow style is not significant) |
| `A -->|left| B` | a labeled edge — label `left` |
| `A[Alice]`, `A(Alice)`, `A{Alice}`, `A((Alice))` | a node with display label `Alice` |
| `classDef …` | ignored (CSS styling is not this notation's domain) |

So the canonical arrow is `->`, but `-->` works; the canonical label is `A -> B : left`,
but `A -->|left| B` works. Pick one style and stay consistent.

```spytial-gdl
flowchart TD
  A -->|left| B
  A -->|right| C
  class A,B,C tree

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

## What the parser produces

For the curious, `parseGraph(source)` returns three structures:

- `nodes` — `Map<id, { id, type, label }>` (type/label `null` unless given)
- `edges` — `Array<{ source, target, kind, label }>`
- `classesPerNode` — `Map<id, Set<string>>`

These are relationalized into atoms and relations before layout — see
[Architecture](architecture.md#the-pipeline). The full grammar lives in
[`src/parse.js`](https://github.com/sidprasad/spytial-gdl/blob/main/src/parse.js).

## Selectors

Every annotation targets a **selector**: a name that resolves to a set of edges or
a set of nodes. This is what makes layout a *query over the model* rather than
per-node markup — one rule, every matching element.

### The built-in selectors

| selector | selects |
|---|---|
| `<label>` | edges carrying that label — `A -> B : left` → `left` |
| `_` | the unlabeled edges (plain `A -> B`) |
| `_links` | **every** edge, labeled or not |
| `<type>` | nodes of that sort — `A:::Person` → `Person`; a plain node is untyped |
| `<class>` | nodes carrying that class — `class A,B team` → `team` |
| `univ` | **every** node, whatever its type — the universal set |

The first three select **edges**; the last three select **nodes**. An annotation
that wants edges (like `@orientation`) takes an edge selector; one that wants nodes
(like `@group` or `@atomColor`) takes a node selector.

### Edge selectors

The label after a colon *is* the relation name. Target it directly:

```spytial-gdl
A -> B : reports_to
C -> B : reports_to
B -> D : owns

@orientation(selector=reports_to, directions=[above])
@orientation(selector=owns, directions=[right])
```

`_` is the relation that unlabeled edges carry; `_links` is the union of all edges.
Use `_links` for a baseline that applies to everything, then refine per label:

```spytial-gdl
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

### Node selectors: types and classes

A **type** comes from `:::Sort`; a **class** comes from `class … tag`. Both select
node sets, and you can use either wherever a node selector is expected:

```spytial-gdl
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

A node with no `:::Sort` is **untyped**: it belongs to no named type, so a named
selector never touches it by accident. To reach *every* node regardless of type —
typed, classed, or plain — use `univ`, the universal set:

```spytial-gdl
a[Root] -> b:::Service
a -> c:::Client

@atomColor(selector=univ, value='#f3f4f6')
@orientation(selector=_links, directions=[below])
```

One `univ` rule tints all three nodes the same — the untyped `Root` included.
Reach for it when a rule should apply to the whole diagram; when you want *some*
nodes styled differently, give those a type or a class and target that instead —
two `atomColor` rules that both match a node (say `univ` and `Service`) are a
color conflict, not a last-one-wins override (see the note below).

> **Note** — `atomColor` won't paint one node two colors: if a node is matched by
> two `atomColor` selectors with different values, the engine reports a color
> conflict rather than picking one. Keep a node's color coming from a single
> selector (here, its type), and use other directives (`group`, `tag`) for the
> cross-cutting set.

### Drawn once

Each edge is **drawn exactly once** — under its own label, or under `_` if it has
none. `_links` and the node-set relations (your types and classes) are
**selector-only**: they resolve in selectors but are hidden from drawing, so they
never double-draw an edge or render a phantom relation. (`univ` is a built-in
universal set, not a relation, so there's nothing to hide.) You don't have to
manage this; the engine emits the necessary `hideField` directives for you.

The practical effect: targeting `_links` changes layout for every edge without
adding a second arrow on top of the labeled one.

### Collisions

Because labels, types, and classes all live in one selector namespace, a name
means whatever shares its spelling. **Keep them distinct.** If an edge label
`team` and a class `team` coexist, `selector=team` is ambiguous and one will shadow
the other. Rename one — e.g. edge label `member_of`, class `team`.

> **Note** — A selector that doesn't resolve to anything comes back as a
> `selectorError` rather than failing silently. In an embed, the **⚠ A selector
> didn't resolve** panel names it; from the API it's the `selectorErrors` array on
> the result. See [Errors and conflicts](annotations.md#selector-errors).

### Advanced: comprehensions

A selector can also be a set comprehension, for finer targeting than a bare name —
e.g. `'{x: Person | …}'`. These are passed through to Spytial's query evaluator.
Quote the whole expression so its braces and pipe survive parsing:

```text
@group(selector='{p: Person | some p.reports_to}', name='Managers')
```

For everyday diagrams the named forms above are all you need.

## Next

- **[Annotations](annotations.md)** — turn these selectors into layout and style.
- **[Embedding & API](embedding.md)** — render the notation in a page or from JavaScript.
