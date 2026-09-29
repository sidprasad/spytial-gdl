# Mermaid flowchart compatibility catalog

This catalog sets the **target policy**, not the current parser's feature list.
It follows the [Mermaid flowchart syntax reference](https://mermaid.ai/open-source/syntax/flowchart.html)
as read on 2026-09-29. The [graph notation](notation.md#mermaid-compatibility)
page describes what GDL accepts today.

| Policy | Meaning |
|---|---|
| **Auto** | Parse the Mermaid form and preserve its meaning in GDL. An exact conversion needs no compatibility warning. |
| **Guide** | Keep the graph only when its nodes and endpoint pairs remain truthful. Warn on the source line about the lost appearance or behavior and offer a specific migration example. |
| **Reject** | Stop rendering when accepting the input would invent or materially change graph structure or a layout dependency. Return a line-specific error with migration guidance. |

“Directive” below means a Spytial appearance rule such as `@atomStyle` or
`@edgeStyle`. `@orientation`, `@group`, and `@size` are **constraints**; they
can change what layouts are allowed. A Mermaid presentation preference must not
silently become a hard constraint.

## Graph declarations and node text

| Mermaid flowchart feature | Target | Translation or limit |
|---|---|---|
| `flowchart` / `graph` declaration | Auto | Recognize the diagram type. Treat its direction separately. |
| `TB`, `TD`, `BT`, `RL`, `LR` direction | Guide | `@orientation(selector=_links, …)` is a possible manual migration for a suitable graph, but requires every selected edge to obey that direction. Mermaid's direction is a layout preference. |
| Node IDs, rectangle nodes, and `[display text]` | Auto | Keep the ID as graph identity and the text as the display label. Repeated declarations use the final explicit label. |
| Quoted plain text, Unicode, and entity escapes | Auto | Decode and preserve the displayed text without turning markup into node IDs. |
| Optional semicolons and Mermaid's permitted spacing around links | Auto | Normalize these statement delimiters without changing IDs, labels, or edge order. |
| Markdown strings, formatting, wrapping, and HTML breaks | Guide | Plain text can survive, but rich text and Mermaid's wrapping behavior need text-renderer support. Warn when formatting is lost. |
| Legacy shapes such as round, stadium, diamond, cylinder, and double circle; `@{ shape: … }` shapes | Guide | Rectangle is automatic. GDL's `atomStyle` has fill, border, icon, and text options but no general node-shape field. Keep the label and warn if a non-rectangle shape is flattened. |
| `@{ icon: … }`, `@{ img: … }`, and Font Awesome icons | Guide | `@atomStyle(iconStyle(…))` and `@size` may cover a verified subset. Icon packs, remote assets, sizing, and label placement do not have a general exact mapping. |

## Links

| Mermaid flowchart feature | Target | Translation or limit |
|---|---|---|
| Ordinary directed links and selector-safe link labels, including pipe and inline link-text forms | Auto | Keep endpoints and label. A label that names a relation can also be selected by GDL rules. |
| Arbitrary link text, including spaces or formatting | Guide | GDL currently uses the relation name as the visible label, and relation names have selector restrictions. An exact conversion needs separate relation identity and display text. |
| Dotted links (`-.->`) and thick links (`==>`) | Auto | Generate `@edgeStyle` rules using `lineStyle(pattern=…)` or `lineStyle(weight=…)`, after verifying the visual mapping. |
| Longer links made with extra dashes, dots, or equals signs | Guide | The extra characters request a minimum rank span in Mermaid. GDL has no equivalent rank-distance rule; preserve the edge and warn about the lost request. |
| Open links (`---`), circle or cross ends, and multidirectional arrows | Guide | Preserve the connection, but warn because `edgeStyle` does not specify those endpoint markers. Never claim their arrowhead semantics were preserved. |
| Invisible links used for positioning | Reject | A visible link would lie about the diagram, while dropping it would discard a layout dependency. Require an explicit GDL layout rule instead. |
| Chained links and one-to-many / many-to-one declarations | Auto | Expand each declared connection into an edge, retaining source order for any later edge-index styles. |
| Edge IDs | Auto | Preserve an ID as edge metadata so later style statements can target it. The ID alone need not alter the drawing. |
| Per-edge style on identical parallel edges | Guide | `edgeStyle.selector` narrows by source; `edgeStyle.filter` narrows by source–target tuple. Two edges with the same field and endpoints still need distinct edge identity to style differently. |

The installed core matches `edgeStyle` by `field`, then optionally by source
`selector` and pair `filter`. Thus a shared `_` relation does **not** by itself
prevent styling one link. Automatic conversion must prove that a generated rule
matches only the intended edges and that it does not conflict with an authored
style rule.

## Subgraphs and layout

| Mermaid flowchart feature | Target | Translation or limit |
|---|---|---|
| `subgraph … end`, including nested subgraphs and links to a subgraph | Reject | `@group` can enclose selected nodes, but Mermaid subgraphs also have syntax for boundary links and nesting. Give a guide with a manual `class` + `@group` example. Tracked in [issue #31](https://github.com/sidprasad/spytial-gdl/issues/31). |
| Subgraph-local direction | Reject | Part of unsupported subgraph semantics; a GDL orientation requirement is not an automatic equivalent. |
| Collapsed subgraphs (`view: collapsed`) | Reject | Collapse hides internal nodes and redirects edges, which a plain `@group` does not do. |
| Theme, look, layout engine, curve selection, and diagram width | Guide | These belong to renderer or host configuration. Do not translate Mermaid's ELK/Dagre or D3 curve choices into GDL constraints or claim visual parity. |

For a simple enclosing region, the migration guide can show this GDL form:

```spytial-gdl
api -> db
class api,db backend
@group(selector=backend, name=Backend)
```

It does not cover every Mermaid subgraph, so the parser should not apply it
automatically.

## Styling, interaction, and metadata

| Mermaid flowchart feature | Target | Translation or limit |
|---|---|---|
| `style`, `classDef`, `class`, `:::class`, and `classDef default` | Auto for supported properties; Guide for the rest | Map fill, stroke, stroke width, text color, and supported text size to `@atomStyle`. A node-specific `style` needs an exact node selector. Interpret `:::class` as a Mermaid class only when the Mermaid context is unambiguous; GDL also uses `:::Type`. |
| `linkStyle` and edge-ID styling | Auto for supported properties; Guide for the rest | Map color, pattern, weight, and supported text styling to `@edgeStyle(field=…, selector=…, filter=…)`. Edge order or ID must resolve to precisely the intended connection; unsupported CSS properties get a warning. |
| External CSS classes | Guide | Styles supplied by the host page are outside the graph source. Do not promise that Mermaid's CSS selectors or precedence transfer to WebCola. |
| `click`, hyperlinks, callbacks, and tooltips | Guide | These are host interactions, not drawing directives. Do not turn pasted Mermaid callbacks into executable JavaScript. |
| Edge animation and animation classes | Guide | No equivalent GDL directive or renderer behavior is established. Preserve the static connection and warn. |
| `accTitle` and `accDescr` | Auto | Carry them to accessible graph-element metadata; they are not drawing directives. |
| `%%` comments | Auto | Ignore comments, including text after the marker, without changing graph data. |
| Front matter and Mermaid configuration | Guide | Do not apply pasted theme, security, renderer, or site-wide options to the host page. Explain the corresponding host configuration when one exists. |

## Current baseline

Today the parser accepts basic nodes, arrows, simple labels, class membership,
and comments. It warns when it discards flowchart direction, non-rectangle node
shape, dotted/thick/open link appearance, `classDef`, `style`, `linkStyle`, or
`click`. It rejects subgraphs and non-flowchart diagram types. Other rows above
are **decisions about desired behavior**, not claims of implemented support.

## Diagnostic and test rule

- An **Auto** form must have property-based tests for the conversion and for
  boundaries where the mapping stops being exact. Remove a compatibility warning
  only after the rendered result and editable path are verified.
- A **Guide** diagnostic must name the lost feature and carry a guide destination.
  Current warning UIs render messages as text, so clickable links require a
  structured help URL and UI support; a Markdown link embedded in the message
  is insufficient.
- A **Reject** form must produce no partial graph, clear an older rendering and
  warning badge, and return a line-specific hard error. Property-based tests
  should cover those behaviors for read-only and editable rendering.
- A recognized Mermaid construct must never silently become a node or an edge
  with different meaning. Non-flowchart Mermaid diagram types remain outside
  this catalog and are hard errors.
