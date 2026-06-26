# The notation

*Nodes, edges, labels, types, classes. No header, no layout direction — layout comes from [annotations](annotations.md).*

A spytial-graph is a tiny text syntax. You write the graph; SpyTial lays it out.
There is no required header and no `TD`/`LR` direction: spatial operations come
from inline `@annotations`, so a `graph TD` preamble would do nothing. Leave it
out (it's tolerated and ignored, so pasted Mermaid still works).

## Edges

A node is implicit from any edge, so the smallest graph is one line:

```spytial-graph
A -> B
```

Label an edge after a colon. The **label is also a selector** you can target in
annotations — that's the heart of the model (see [Selectors](selectors.md)):

```spytial-graph
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

```spytial-graph
u1[Alice] -> u2[Bob]
u1 -> u3[Carol]
```

`u1` is written once with its label and then referenced bare; both edges attach to
the same node. You can also declare a node on its own line, with no edge:

```spytial-graph
solo[Just here]
```

## Sorts (types)

A `:::Sort` tag gives a node a **type**, so `selector: Person` then matches every
node of that type. Plain nodes have the implicit sort `Node`:

```spytial-graph
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

```spytial-graph
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
> [Selectors → collisions](selectors.md#collisions).

## Comments

`%%` starts a line comment (Mermaid-style); the rest of the line is ignored:

```spytial-graph
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

```spytial-graph
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
[`src/parse.js`](https://github.com/sidprasad/spytial-graph/blob/main/src/parse.js).

## Next

- **[Selectors](selectors.md)** — how labels, `_`, `_links`, types, and classes resolve.
- **[Annotations](annotations.md)** — turn those selectors into layout and style.
