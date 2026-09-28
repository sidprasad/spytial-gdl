# Graph description syntax

Write nodes and edges as text. Add labels, types, or classes when you need them.
Use [layout requirements](requirements.md) to say where graph elements belong.

There is no required header. Mermaid's `graph TD` and `flowchart LR` headers are
accepted but ignored; direction comes from layout requirements.

The examples below render live, with their source visible beneath each diagram.

## Edges

Write one edge per line. Reuse an ID to connect edges to the same node:

```spytial-gdl
A -> B
B -> C
```

A label after `:` names a relationship. A layout requirement can target every
edge with that label (see [Selectors](requirements.md#selectors)):

```spytial-gdl
A -> B : hit
A -> C : miss

@orientation(selector=hit,  directions=[right])
@orientation(selector=miss, directions=[below])
```

> **Names.** Edge labels, types, and classes can contain letters, digits, and
> underscores, and must start with a letter. Edge labels, types, and classes
> must have distinct names. Spaces, hyphens, and reserved query words are invalid.

## Nodes, labels, and IDs

Write `id[Display label]` when the visible label should differ from the ID used
by edges:

```spytial-gdl
cs2[CS 2] -> algorithms[Algorithms]
cs2 -> systems[Systems]
```

Both edges use the same `cs2` node. A node can also appear without an edge:

```spytial-gdl
solo[Just here]
```

## Types

Add `:::Type` to select nodes of that type for styling or grouping. In this
example, `Course` and `Term` select different sets of nodes:

```spytial-gdl
algorithms[Algorithms]:::Course -> fall[Fall term]:::Term
systems[Systems]:::Course      -> fall

@atomStyle(selector=Course, borderStyle(color='#795db4', width=2))
@atomStyle(selector=Term, borderStyle(color='#b85c38', width=2))
```

`univ` selects every node, including untyped ones. A node has one type; in a
chain such as `:::Course:::Seminar`, only the last type, `Seminar`, applies.

## Classes

Use a class to select nodes across types. Write `class A,B,C tag`, then use
`selector=tag` to style or group them:

```spytial-gdl
A -> B
A -> C
D -> E

class A,B,C teamA
class D,E teamB

@group(selector=teamA, name='Team A')
@group(selector=teamB, name='Team B')
```

## Comments

`%%` starts a line comment, Mermaid-style, and the rest of the line is ignored:

```spytial-gdl
A -> B   %% the spine
B -> C
```

There is also a `%%@name(...)` form. Vanilla Mermaid treats it as a comment;
Spytial GDL reads it as a rule. See
[Requirements](requirements.md#mermaid-safe-rules).

## Mermaid compatibility

These Mermaid flowchart forms parse, with the changes shown below:

| Mermaid form | read as |
|---|---|
| leading `graph TD` / `flowchart LR` | ignored (no layout direction here) |
| `A --> B`, `A -.-> B`, `A ==> B`, `A --- B` | an edge (arrow style is not significant) |
| `A -->\|left\| B` | a labeled edge, label `left` |
| `cs[Algorithms]`, `cs(Algorithms)`, `cs{Algorithms}`, `cs((Algorithms))` | a node with display label `Algorithms` |
| `classDef …` | ignored; use `@atomStyle` or `@edgeStyle` instead |

The native forms are `A -> B` and `A -> B : left`. Mermaid arrows and labels
let you paste an existing flowchart and then add requirements:

```spytial-gdl
flowchart TD
  A -->|left| B
  A -->|right| C
  class A,B,C tree

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

## Machine-readable reference

The [language manifest](../spytial-gdl-language.json) lists authoring forms,
requirement arguments, style blocks, and allowed values. It links to the upstream
selector manifest. The same file is exported as `spytial-gdl/language.json`.
Run `npm run manifest` to regenerate it; `npm test` checks that it is current.

## Next

- [Layout requirements](requirements.md): arrange and style the graph.
- [Embed in a document](embedding.md): render it in a page or from JavaScript.
