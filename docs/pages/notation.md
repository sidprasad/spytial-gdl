# Graph description syntax

Write nodes and edges as text. Add labels, types, or classes when you need them.
Use [layout requirements](requirements.md) to say where graph elements belong.



> **Names.** Edge labels, types, and classes can contain letters, digits, and
> underscores, and must start with a letter. Edge labels, types, and classes
> must have distinct names and cannot contain spaces and hyphens.

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


## Nodes, labels, and IDs

Write `id[Display label]` when the visible label should differ from the ID used
by edges:

```spytial-gdl
cs2[CS 2] -> algorithms[Algorithms and Data Structures]
cs2 -> systems[Systems]
```
Display labels can 

## Types

Add `:::Type` to assign a type to a set of nodes. 

```spytial-gdl
algorithms[Algorithms]:::Course -> fall[Fall term]:::Term
systems[Systems]:::Course      -> fall

@atomStyle(selector=Course, borderStyle(color='#795db4', width=2))
@atomStyle(selector=Term, borderStyle(color='#b85c38', width=2))
```

`univ` selects every node, including those without an explicitly declared type. A node can only have
one type.

## Comments

`%%` starts a line comment. One exception to this is `%%@name(...)` which is read as a requirement.

## Mermaid compatibility


| Mermaid form | read as |
|---|---|
| leading `graph TD` / `flowchart LR` | ignored (no layout direction here) |
| `A --> B`, `A -.-> B`, `A ==> B`, `A --- B` | an edge (arrow style is not significant) |
| `A -->\|left\| B` | a labeled edge, label `left` |
| `cs[Algorithms]`, `cs(Algorithms)`, `cs{Algorithms}`, `cs((Algorithms))` | a node with display label `Algorithms` |
| `classDef …` | ignored; use `@atomStyle` or `@edgeStyle` instead |



## Machine-readable reference

The [language manifest](https://www.siddharthaprasad.com/spytial-gdl/spytial-gdl-language.json) lists authoring forms,
requirement arguments, style blocks, and allowed values. It links to the upstream
selector manifest. The same file is exported as `spytial-gdl/language.json`.
Run `npm run manifest` to regenerate it; `npm test` checks that it is current.

## Next

- [Layout requirements](requirements.md): arrange and style the graph.
- [Embed in a document](embedding.md): render it in a page or from JavaScript.
