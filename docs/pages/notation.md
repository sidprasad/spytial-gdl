# Graph description syntax

Write nodes and edges as text. Add labels, types, or classes when you need them.
Use [layout requirements](annotations.md) to say where graph elements belong.

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
edge with that label (see [Selectors](#selectors)):

```spytial-gdl
A -> B : hit
A -> C : miss

@orientation(selector=hit,  directions=[right])
@orientation(selector=miss, directions=[below])
```

> **Names.** Edge labels, types, and classes can contain letters, digits, and
> underscores, and must start with a letter. Spaces, hyphens, and reserved query
> words are rejected with a line number.

## Nodes, labels, and ids

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

> **Note.** Give a class and an edge label different names. A shared spelling
> collides them, since both resolve as selectors. See
> [Selectors → collisions](#collisions).

## Comments

`%%` starts a line comment, Mermaid-style, and the rest of the line is ignored:

```spytial-gdl
A -> B   %% the spine
B -> C
```

There is also a `%%@name(...)` form, which guards a rule so a block still
degrades gracefully if it gets pasted into a vanilla Mermaid renderer. See
[Requirements](annotations.md#mermaid-safe-rules).

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

## Selectors

Selectors name sets of edges or nodes. A layout requirement can then apply to
every matching element, without naming each node separately.

### The built-in selectors

| selector | selects |
|---|---|
| `<label>` | edges carrying that label. `A -> B : left` gives `left` |
| `_` | the unlabeled edges (plain `A -> B`) |
| `_links` | every edge, labeled or not |
| `<type>` | nodes of that type. `cs:::Course` gives `Course`; a plain node is untyped |
| `<class>` | nodes carrying that class. `class A,B team` gives `team` |
| `univ` | every node, whatever its type. The universal set |

The first three select edges and the last three select nodes. A rule that
places edges, like `@orientation`, takes an edge selector; one that acts on nodes,
like `@group` or `@atomStyle`, takes a node selector.

### Edge selectors

The label after a colon is the relation name. Target it directly:

```spytial-gdl
A -> B : reports_to
C -> B : reports_to
B -> D : owns

@orientation(selector=reports_to, directions=[above])
@orientation(selector=owns, directions=[right])
```

`_` is the relation that unlabeled edges carry, and `_links` is the union of all
edges. Use `_links` for a baseline that applies to everything, then refine per
label:

```spytial-gdl
root -> a : left
root -> b : right
a -> a1
b -> b1

@orientation(selector=_links, directions=[below])
@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
```

`_links` puts all four targets below their sources. The `left` and `right`
requirements also place those labeled targets to either side. The unlabeled
edges match only `_links`.

### Node selectors: types and classes

A type comes from `:::Type` and a class comes from `class … tag`. Both select node
sets, and you can use either wherever a node selector is expected:

```spytial-gdl
db[DB]:::Service
api[API]:::Service -> db
web[Web]:::Client -> api

class db critical

@atomStyle(selector=Service, borderStyle(color='#795db4', width=2))
@atomStyle(selector=Client, borderStyle(color='#b85c38', width=2))
@group(selector=critical, name='Critical')
@orientation(selector=_links, directions=[left])
```

The types `Service` and `Client` tint nodes by role, and the class `critical` draws
a region around the one node tagged with it. A type says what a node is; a class is
a tag you can apply across types.

A node with no `:::Type` is untyped. It belongs to no named type, so a named
selector never touches it by accident. To reach every node regardless of type,
typed or classed or plain, use `univ`:

```spytial-gdl
a[Root] -> b:::Service
a -> c:::Client

@atomStyle(selector=univ, borderStyle(width=3))
@orientation(selector=_links, directions=[below])
```

`univ` gives all three nodes a thicker outline, including the untyped `Root`.
If a type needs a different outline, target that type instead of applying an
overlapping `univ` style.

> **Note.** `atomStyle` won't paint one node two colors. If a node is matched by
> two selectors that set the same style leaf to different values, the engine
> reports a `StyleCollisionError` rather than picking one. Rules that set different
> leaves do compose, so a `univ` rule setting `textStyle(size=small)` alongside a
> `Service` rule setting `borderStyle(color=…)` is fine. Keep any one leaf coming
> from a single selector, usually the node's type, and use other directives
> (`group`, `tag`) for the cross-cutting set.

### Drawn once

`_links` selects every edge but draws no extra arrows. Types, classes, and `univ`
also exist for selection; they do not add visible edges to the diagram.

### Collisions

Labels, types, and classes all live in one selector namespace, so a name means
whatever shares its spelling. If an edge label `team` and a class `team` coexist,
`selector=team` can only reach one of them. The parser reports that as an error on
the second one's line, and when a class is involved it drops the class, because
hiding the class's relation by name would otherwise hide the edges too. Rename one
of them, for instance edge label `member_of` against class `team`. A class line
that names a node no line declares is reported the same way.

> **Note.** A selector that doesn't resolve to what you meant is reported rather
> than failing silently. One the engine cannot use (a sort where edges are needed,
> a reserved word) is a selector error; one that matches nothing is a warning.
> Both arrive on the result's `diagnostics` with the rule's line, and in an
> embed they appear in the **⚠ … in this source** band under the diagram. See
> [What the engine reports](annotations.md#what-the-engine-reports).

### Advanced: comprehensions

A selector can also be a set comprehension, for finer targeting than a bare name,
for instance `'{x: Person | …}'`. These get passed through to Spytial's query
evaluator. Quote the whole expression so its braces and pipe survive parsing:

```text
@group(selector='{p: Person | some p.reports_to}', name='Managers')
```

## Machine-readable reference

The [language manifest](../spytial-gdl-language.json) lists authoring forms,
requirement arguments, style blocks, and allowed values. It links to the upstream
selector manifest. The same file is exported as `spytial-gdl/language.json`.
Run `npm run manifest` to regenerate it; `npm test` checks that it is current.

## Next

- [Layout requirements](annotations.md): arrange and style the graph.
- [Embed in a document](embedding.md): render it in a page or from JavaScript.
