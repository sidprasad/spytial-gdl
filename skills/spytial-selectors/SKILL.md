---
name: spytial-selectors
description: Write and debug Simple Graph Query selectors for Spytial. Use when selecting node sets, deriving or filtering relations, or diagnosing empty selections and tuple-shape errors.
license: MIT
---

# Write Spytial selectors

Produce an expression that selects exactly the intended nodes or tuples from
the user's graph and has the shape its consuming operation expects. Selectors
query graph data; they do not describe current screen coordinates.

## Use the query language the host supports

Read the [Simple Graph Query manifest](https://cdn.jsdelivr.net/npm/simple-graph-query@3.2.0/docs/sgq-language.json)
for identifiers, quoting, reserved words, builtins, and `constructs`, including
precedence and evaluation support. The accompanying
[language reference](https://cdn.jsdelivr.net/npm/simple-graph-query@3.2.0/LANGUAGE.md)
explains relational operators. These are pinned to the version used to check
this skill; prefer `docs/sgq-language.json` and `LANGUAGE.md` from the query
package used by the host's engine. Syntax accepted by the grammar is not always
implemented by the evaluator.

Read the consuming operation's selector field in the
[Core manifest](https://cdn.jsdelivr.net/npm/spytial-core@6.3.1/docs/spytial-language.json)
(`items[].fields[].accepts`), or the installed `spytial-core/language.json`.
For GDL, its [manifest](https://www.siddharthaprasad.com/spytial-gdl/spytial-gdl-language.json)
provides compatible upstream links and built-in selectors. Its
[notation reference](https://www.siddharthaprasad.com/spytial-gdl/docs/pages/notation.md)
covers the names GDL creates. These names have stricter rules than arbitrary
SGQ identifiers; backquoting a query does not legalize an invalid GDL declaration.

## Decide the result shape first

- **Unary:** a set of nodes, for node styling or one unkeyed group.
- **Binary:** ordered `(source, target)` pairs, for orientation or alignment.
  A grouping operation instead interprets them as `(key, member)`.
- **Boolean or number:** useful inside a predicate, but not a node or edge set.
  For example, `some child` is a boolean; `child` is a relation.

`Person` is a node set only if the graph declares that type or class. GDL's
`univ` reaches all nodes, `_links` all edges, and `_` only unlabeled edges.
Labels shown inside `[brackets]` are display text; use stable node IDs in queries.
Relations, types, and classes share a namespace. Use the manifest's atom-literal
syntax when a specific ID needs disambiguation.

## Build the expression from the graph

Use the simplest expression that denotes the intended set. Combine node sets
with union `+`, intersection `&`, or difference `-`. For relations:

- `~r` reverses tuples; `r.s` joins matching endpoints.
- `^r` follows one or more steps; `*r` also includes identity pairs. Check for
  self-pairs, especially on cyclic input, before using closure for orientation.
- `S <: r` keeps tuples starting in node set `S`; `r :> T` keeps those ending in
  `T`. `S -> T` constructs all pairs, not only edges present in the graph.
- `{p: Person | condition}` returns matching people. Multiple binders return
  tuples. Put boolean conditions inside a comprehension when a set is required.

For this family:

```spytial-gdl
alice[Alice]:::Person -> bob[Bob]:::Person : child
alice -> cara[Cara]:::Person : child
bob -> dana[Dana]:::Person : child
```

| Intent | Selector | Expected result on this graph |
| --- | --- | --- |
| Alice's children | `alice.child` | Nodes `bob`, `cara` |
| Alice's descendants | `alice.^child` | Nodes `bob`, `cara`, `dana` |
| Grandparent-to-grandchild pairs | `child.child` | Pair `(alice, dana)` |
| People who have children | `{p: Person \| some p.child}` | Nodes `alice`, `bob` |
| Distinct people sharing a parent | `(~child.child) - iden` | Pairs `(bob, cara)`, `(cara, bob)` |
| Parent-child edges ending at leaves | `child :> {p: Person \| no p.child}` | Pairs `(alice, cara)`, `(bob, dana)` |

The sibling expression deliberately returns both directions. That is useful for
alignment; orienting both pairs to the right would contradict itself. Selection
and operation must be considered together. Descendants and siblings are derived
queries here, not additional asserted facts in the input graph.

Quote a compound selector as a whole in GDL or YAML so the host preserves its
spaces and punctuation. For example, on the graph above:

```text
@atomStyle(selector='{p: Person | some p.child}', fillStyle(color='#eef6ff'))
@align(selector='(~child.child) - iden', direction=horizontal)
```

Do not substitute JavaScript, CSS selectors, or full Alloy/Forge models. Use only
the supported expression fragment, and parenthesize to make composition clear.

## Evaluate before trusting the rule

Check against the actual graph, not just the parser. With a compiled GDL graph,
the Core evaluator can inspect the selector independently of a layout solve:

```js
import { JSONDataInstance, SGraphQueryEvaluator } from 'spytial-core';

// compiled is the checked result of compileSpytialGdl(source).
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: new JSONDataInstance(compiled.datum) });
const selection = evaluator.evaluate('(~child.child) - iden');
console.log(selection); // Inspect result tuples, isErrorResult, and diagnostics.
```

Compare exact tuples, their arity and direction, and representative exclusions.
An empty result may be correct for the data; distinguish that from a misspelled
name or absent type using diagnostics. An unresolved name can produce an empty
set without throwing. Check cycles, self-pairs, and isolated nodes when relevant.
Then solve the consuming operation to catch shape errors and spatial conflicts.

Return the expression with its expected result shape and a plain-language
explanation of what it selects. If evaluation was possible, report what it
matched; otherwise state that the selection remains unverified.
