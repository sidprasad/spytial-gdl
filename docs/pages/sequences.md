# Sequences of states

A `gdl-sequence` contains complete graph snapshots under one layout policy.
Use it for a data structure before and after an operation, successive steps of
an algorithm, or revisions of a dependency graph. Node ids connect the same
objects across snapshots, so an arrangement you drag can help you inspect the
next state or return to an earlier one.

```gdl-sequence
policy: stability

@orientation(selector=next, directions=[right])
@align(selector=next, direction=horizontal)

state before {
  a[A] -> c[C] : next
}

state {
  a[A] -> b[B] : next
  b -> c[C] : next
}

state after {
  a[A] -> b[B] : next
  b -> c[C] : next
  c -> d[D] : next
}
```

Try dragging A before moving forward and backward. The one-pane/two-pane buttons
switch between **One state** and **Two states**.

## State blocks and shared rules

Write `state { ... }` or `state name { ... }`. An id is optional; if supplied,
it must be unique within the sequence. Use letters, digits, underscores or
hyphens, starting with a letter or underscore. Position in the source determines
order: `state s10` before `state s2` is still the first state. The viewer always
shows the position, including for anonymous states.

Each block is a **complete graph**. Repeat the nodes, edges, labels, types and
classes you want in that snapshot. A node missing from the next block disappears;
`state {}` is an empty graph. Reuse a node's id to preserve its identity across
states. State ids name whole snapshots and do not establish node identity.

Put shared `@annotations` before the first state. They apply to every block and
combine with annotations inside that block. Local rules accumulate with shared
rules; there are no overrides. Conflicting requirements are reported as they
are for an ordinary GDL graph. Graph declarations belong inside state blocks.

A type, class or relation used anywhere in the collection can be empty in
another state. A shared rule selecting it then has nothing to apply to there.
Unknown selector names still receive core's usual diagnostics. A node id that
is absent is not automatically declared as an empty node selector.

## Navigation and dragging

The integer slider and Previous/Next buttons navigate whole states. **One
state** shows one graph. **Two states** shows consecutive graphs with independent
dragging:

| Action | Arrangement used for entering states |
| --- | --- |
| One-state move, forward or backward | The graph you are leaving |
| Two-state Next | The old right pane; it stays as the new left pane |
| Two-state Previous | The old left pane; it stays as the new right pane |
| Jump to a later pair | Both entering graphs use one snapshot of the outgoing right pane |
| Jump to an earlier pair | Both entering graphs use one snapshot of the outgoing left pane |

Overlapping panes keep their existing arrangement. Dragging one pane does not
move the other. Select a pane's header, or interact with its graph, to keep that
pane when switching to One state. Switching to Two states at the last state
shows its predecessor on the left.

Switching views fits each camera to its new pane size while keeping node
positions. Navigation within a view carries the departing camera and fits it
when a node would be clipped, using core's public bounds/viewport APIs. The
graph's **Fit** control is also available for manual adjustment.

Returning to a state lays it out from the arrangement you just left. There is
no saved canonical layout per state and no recall of positions for nodes absent
from the departing graph. Different navigation paths can produce different
valid arrangements. Layout hints remain subject to the destination's spatial
requirements; a drag is not a new authored constraint.

## Policies

Declare `policy:` once, before the first state. It defaults to `stability`.
The viewer uses the policy from the source throughout navigation across the
whole collection. To change it, edit `policy:` and apply the updated source.

| Source value | Behavior |
| --- | --- |
| `stability` | Seed persistent nodes from the live departing arrangement |
| `ignore_history` | Solve afresh without the departing positions |
| `change_emphasis` | Retain unchanged nodes and perturb nodes whose incident connections changed |
| `random_positioning` | Seed nodes at random positions in the visible area |

These are spytial-core's policies. GDL scopes stability hints to the departing
snapshot so independent embeds and paired panes do not share core's brief
absent-node recall. Core owns layout, drag constraints and policy transforms.

## Playground and embedding

Choose **A list across states** in the [playground](../../playground/). In a
playground `.gdl` file, put `gdl-sequence` on the first non-comment line so the
editor can distinguish the sequence from an ordinary graph. Edit the state
blocks in the source and press Apply. The structural graph editor is available
for individual graph documents.

For Markdown, use the `gdl-sequence` fence as above with the same renderer
script as [ordinary diagrams](embedding.md). The header line is optional inside
that fence. HTML can use `<div class="gdl-sequence">` with the source as text.
`spytial-gdl-sequence` is also accepted as a fence/container alias.

```html
<div id="sequence" style="height:420px"></div>
```

```js
import { mountGdlSequence, compileGdlSequence } from 'spytial-gdl';

const source = `policy: stability
state before { a -> c }
state { a -> b
  b -> c }
state after { a -> b }`;

const viewer = mountGdlSequence(document.querySelector('#sequence'), source);
await viewer.ready;
await viewer.next();
await viewer.previous();
await viewer.goTo('after');   // optional id, or a zero-based numeric index
await viewer.setView('pair'); // 'single' or 'pair'
console.log(viewer.state);   // visible states, graph elements, diagnostics
// viewer.dispose();        // remove the UI and release readers/renderers

const compiled = compileGdlSequence(source); // no DOM or core needed
```

Load spytial-core on the page as described in the [JavaScript API](embedding.md).
`mountGdlSequence` accepts the ordinary graph compilation/view options plus
`view`, a zero-based starting `index`, `theme`, `ariaLabel`,
`onChange(snapshot)` and `onError(error)`. `setTheme(theme)` updates the viewer.
In pair mode a requested index selects the left state, clamped to keep the last
pair within bounds. Switching view modes preserves the selected pane.

`parseGdlSequence` exposes just the envelope parser, and `isGdlSequence` detects
the standalone `gdl-sequence` header. Compilation and render diagnostics retain
line numbers in the complete source document.
