---
name: spytial-operations
description: Write and debug Spytial spatial requirements and styling operations. Use when translating layout intent into Spytial-GDL requirements or Spytial-Core YAML rules.
license: MIT
---

# Write Spytial operations

Translate the user's intended spatial relationship into supported operations on
the right graph elements. Preserve the graph's meaning and the host's existing
authoring format. Do not add artificial data edges merely to influence layout.

## Read the manifests for the host

- [GDL manifest](https://www.siddharthaprasad.com/spytial-gdl/spytial-gdl-language.json):
  use `annotations` and `styleBlocks` for accepted `@operation(...)` arguments,
  nested blocks, and allowed values. Installed export: `spytial-gdl/language.json`.
- [Core layout manifest](https://cdn.jsdelivr.net/npm/spytial-core@6.3.1/docs/spytial-language.json):
  use `items` to find an operation by `id`. Read its `sections`, `fields`,
  selector `accepts`, semantic notes, and `supportsHold`; use `blocks` for style
  fields and `deprecations` for obsolete forms. Installed export:
  `spytial-core/language.json`.
- [Selector manifest](https://cdn.jsdelivr.net/npm/simple-graph-query@3.2.0/docs/sgq-language.json):
  expression syntax and evaluation support. Use the
  [selectors skill](https://www.siddharthaprasad.com/spytial-gdl/skills/spytial-selectors/SKILL.md)
  when the operation needs a derived or filtered relation.

The pinned links describe the versions used to check this skill. Prefer manifests
from the packages actually installed or loaded by the host. The GDL manifest's
`upstream` links locate compatible Core and selector manifests; compare its
`coreVersion` with the runtime and Core's `languageVersion` before adopting a
newer feature. Core support alone does not establish that GDL accepts the same
surface syntax. For an unavailable operation, explain the gap or propose a
supported composition instead of inventing a rule.

For prose and examples, read the
[GDL requirements reference](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/annotations.md)
or the Core manifest's `documentation` links as needed.

## Choose operations by meaning

First state which elements should satisfy which relationship, and whether this
is required meaning or a presentation preference. Check the selector's tuples
before choosing directions; an edge name such as `parent` does not establish
which end is the parent.

| Intent | Operation and selector shape |
| --- | --- |
| Place a target below, above, left, or right of its source | `orientation` on ordered pairs; directions are target relative to source |
| Put related nodes on the same row or column | `align` on pairs; horizontal shares Y, vertical shares X |
| Arrange an actual cycle around a ring | `cyclic` on the cycle's relation |
| Enclose one set of nodes | `group` on a unary node set, with a `name` |
| Create a group for each key | `group` on `(key, member)` pairs; the key is not automatically a member |
| Change node appearance | `atomStyle` on a unary node set |
| Change drawn edges of a relation | `edgeStyle(field=...)`; optional `selector` narrows source nodes, `filter` narrows tuples |

Consult the manifest's `accepts` for less common tuple shapes. For example, some
operations accept longer tuples using the first and last columns; do not assume
all columns affect the constraint.

Use ordinary `below` when horizontal placement is free. `directlyBelow` also
requires a shared X coordinate and can overconstrain branching graphs. Similarly,
horizontal alignment says nothing about left-to-right order. Direction lists
are conjunctions, not alternatives.

## Derive relationships without changing the data

For this family, children should be below parents and children sharing a parent
should share a row:

```spytial-gdl
alice[Alice]:::Person -> bob[Bob]:::Person : child
alice -> cara[Cara]:::Person : child
bob -> dana[Dana]:::Person : child

@orientation(selector=child, directions=[below])
@align(selector='(~child.child) - iden', direction=horizontal)
```

`~child.child` relates people who share a parent; subtracting `iden` removes
self-pairs. It selects `(bob, cara)` and `(cara, bob)` here. The expression
supports alignment without adding a drawn sibling edge or ordering the siblings.

For a host requesting Core YAML, the equivalent rules are:

```yaml
constraints:
  - orientation:
      selector: child
      directions: [below]
  - align:
      selector: '(~child.child) - iden'
      direction: horizontal
```

Core YAML sections are lists of single-key mappings. Validate fields and values
against the manifest: Core can silently ignore unknown keys, so successful YAML
parsing is insufficient. Keep `@` rules in GDL and YAML in Core spec inputs.

## Check composition and diagnose failures

Rules accumulate; later rules do not cancel earlier ones. Never orient every
edge of a cycle in the same direction. `hold=never` negates supported constraints;
it does not disable them. Check `supportsHold` before using it. Overlapping style
rules that disagree on the same property can also conflict.

For GDL, inspect `compileSpytialGdl(source)`'s `ok`, `parseErrors`, and
`annotationErrors`, then use `solveSpytialGdl(core, compiled)` and inspect `error`,
`selectorErrors`, `warnings`, and `diagnostics`. For Core YAML, use the host's
actual data instance and evaluator when solving the spec. A relaxed drawing
after a conflict is not evidence that the original requirements hold.

Separate a selector that picks the wrong tuples from a valid selection with
contradictory rules. Repair the former by evaluating the selector; repair the
latter against the user's intended meaning. Return the rules, explain the
relationships they enforce and leave free, and report any unresolved conflict.
