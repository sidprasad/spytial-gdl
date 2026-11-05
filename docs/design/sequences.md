# Sequences of states with reader-directed continuity

Design and implementation notes, revised 5 November 2026. The initial version implements optional state ids, source-order navigation, shared/local annotations, the four global policies, single/pair views, Markdown embedding and playground support. See the [implemented syntax and API](../pages/sequences.md). The research evaluation, semantic change summaries and richer source-scoped recall discussed below remain proposals.

The initial version deliberately uses only the departing graph's live positions: it filters core's singleton stability recall out of the returned hints. There is no absent-node or per-state layout recall. A future core-owned policy factory would be needed to add isolated recall; the initial pairwise feature does not depend on it. Switching between single and pair view fits cameras to the new pane size while retaining graph geometry.

The product is an outer sequence document containing a collection of complete GDL graphs and one global sequence policy. Each member supplies a full graph and may add local layout requirements to the shared rules written before the states. The reader can arrange the displayed state, then carry that work into the state visited next, whether moving forward or backward through the collection. Start with two presentation options: one state, or two consecutive states. In the paired view the panes are independently draggable; navigation chooses the outgoing boundary pane as the source of continuity.

The sequence owns the policy choice. States do not contain policy overrides, and selecting single or paired view does not create additional policies. The navigation controller selects source/destination members and supplies their data and live geometry to the collection's policy. The current view is the starting point for the next view.

## The motivating task

An author explains a tree rotation in a course note. A reader spreads out a crowded subtree before stepping in either direction. Its surviving nodes should start the destination state from those positions. The parent/child constraints can require movement, but the renderer should preserve useful free choices such as the space the reader created.

This supports more than watching a movie: the reader can make an arrangement that helps answer their own question, and reuse it through the explanation. This is the specific benefit to validate against an ordinary sequence player.

## What people would use it for

| Task | Why multiple states help | Why carrying a drag helps | Fit |
| --- | --- | --- | --- |
| Teaching tree rotations, list insertion, pointer aliasing, union-find, BFS | Expose which links or labels change while object identity survives | Make room around a pointer or separate two branches, then retain that work | Strongest first use; short traces and existing graph notation |
| Sharing a bug reproduction in a technical document | Show exactly when an alias, cycle, or invalid relationship appears | Arrange the relevant objects once and follow them into the failing state | Strong; snapshots must come from the author or an external exporter |
| Explaining a model-checker counterexample | Inspect the relation changes that produce a violation | Keep the same actors recognizable across steps | Strong ecosystem fit; Cope and Drag already provides richer live model exploration |
| Reviewing a schema, service topology, or dependency migration | Compare successive stages in a migration | Keep persistent entities readable while inspecting neighboring stages | Plausible; distant before/after comparison is a possible later extension |
| Walking through a request or progressively revealing an architecture | Pace an explanation without maintaining many exported pictures | Sometimes helps isolate the route being explained | Real demand, but often a fixed-layout highlight/reveal tool is sufficient |

Large network monitoring, continuous simulation, video authoring, and branching execution exploration bring much larger requirements. They are poor first targets for a Markdown-oriented graph language. A sequence here is an ordered set of snapshots, not a transition system or an execution engine.

## Evidence and its limits

There is direct, adjacent demand for author-controlled diagram sequences. In [Mermaid issue 3029](https://github.com/mermaid-js/mermaid/issues/3029), opened in May 2022, the requester describes the maintenance cost of repeatedly exporting partial diagrams and the problem of a video imposing its pace. It had ten positive reactions when checked on 4 November 2026. [Issue 7710](https://github.com/mermaid-js/mermaid/issues/7710), opened in May 2026, separately requests advancing diagrams by click or space, including flowcharts. These requests support reader-paced walkthroughs; they do not establish demand for changing graph topology or propagation of manual arrangements.

The [2013 Python Tutor paper](https://research.google/pubs/online-python-tutor-embeddable-web-based-program-visualization-for-cs-education/) reports more than 200,000 users and embedding in digital textbooks used at least at 25 universities. The system explicitly supports moving backward and forward through runtime data structures. [UC San Diego reported in March 2026](https://today.ucsd.edu/story/a-uc-san-diego-tool-teaching-code-to-25-million-is-even-more-critical-in-age-of-ai) that Python Tutor had reached over 25 million users. This is strong evidence for inspecting state sequences in education, rather than proof that those users want to author GDL or rearrange diagrams.

[Alloy 6's official description](https://alloytools.org/alloy6.html) documents a trace navigator and two consecutive states displayed together. That establishes a concrete workflow in the target ecosystem, but does not quantify demand for another tool. GDL's contribution would be making a selected, annotated trace portable into an explanation.

The visualization evidence is task-dependent. [Archambault, Purchase, and Pinaud, TVCG 2011](https://pubmed.ncbi.nlm.nih.gov/20498503/) found small multiples faster overall than animation across five comprehension tasks; animation had fewer errors for identifying additions within a timeslice. Mental-map preservation had little effect in that experiment. [Archambault and Purchase, GD 2012](https://eprints.gla.ac.uk/78675/) found preserving the mental map faster and more accurate for orientation tasks such as finding locations and routes. [Lee, Archambault, and Nacenta, TVCG 2020](https://arxiv.org/abs/2008.12747) found interactive timeslicing useful for comparing distant times on a large touch display. That display setting limits direct transfer to a small document embed.

The justified hypothesis is that continuity helps readers follow particular entities, while comparisons help them inspect changes. Neither the literature nor these feature requests establishes that propagating reader drags improves understanding. That is the distinctive hypothesis for this design.

## Three things that must stay separate

1. **Graph state:** nodes, relationships, labels, and classes in snapshot `G[i]`.
2. **Arrangement:** the current, mutable geometry of each displayed pane. A graph state can acquire different arrangements on different visits.
3. **Layout requirements:** the authored constraints `C[i]` that govern every valid arrangement.

Dragging a node changes the reader's arrangement. It does not execute a graph transition, mutate the snapshot, or change its layout requirements. This feature concerns ordinary view manipulation and continuity across states.

Policy chooses how previous geometry informs a new solve. Transition mode chooses whether reaching the resulting geometry is animated. Change highlighting reports data differences. These are independent settings: stable positions plus explicit change highlighting is the recommended default.

## Existing syntax and precedents

Cope and Drag already accepts this top-level `.cnd` YAML:

```yaml
temporal:
  policy: stability
```

It also accepts `temporal: stability` and the key alias `sequence`, including `sequence: { policy: stability }`. The four accepted policy strings are `ignore_history`, `stability`, `change_emphasis`, and `random_positioning`; the CnD default is `ignore_history`. See the actual [CnD pre-parser](../../../copeanddrag/packages/sterling/src/utils/cndPreParser.ts). CnD strips this block before calling core's layout-spec parser.

Core's policy mechanism is an API. The outer collection owns the policy selection and supplies it when rendering a member from another member's arrangement:

```js
await destinationGraph.renderLayout(destinationLayout, {
  policy: core.getSequencePolicy(policyName),
  priorPositions: sourceGraph.getLayoutState(),
  prevInstance: sourceInstance,
  currInstance: destinationInstance,
  transitionMode: 'morph',
});
```

`prevInstance` is the source of this rendering transition. It need not have a lower trace index than `currInstance`. The host supplies the ordered instances; GDL still needs a way to write them down.

Cope and Drag's actual view values are `single`, `window` (before/current/after), and `compare` (an arbitrary selected set). These are UI state, not fields of its `temporal:` policy configuration. In its current multi-view implementation, compare panes lay out independently, while a window lays its anchor fresh and seeds followers from that anchor. It does not implement the outgoing-left/outgoing-right handoff specified below. See [presentation choices](../../../copeanddrag/packages/sterling/src/components/AppDrawer/graph/state/time/PresentationModeSelect.tsx) and [MultiTemporalGraph](../../../copeanddrag/packages/sterling/src/components/GraphView/MultiTemporalGraph.tsx).

Reuse the real policy names. Use the proposed UI view name `pair` for exactly two consecutive states, rather than implying compatibility with CnD's existing three-slot `window` mode. Do not implement arbitrary compare sets in the first version.

There is also an external syntax precedent: [D2 composition](https://d2lang.com/tour/composition/) puts multiple named diagram boards in one file. Its `layers` are independent, `scenarios` inherit from the base, and [`steps`](https://d2lang.com/tour/steps) inherit graph definitions from the preceding step. That supports explicit named snapshots or steps as a familiar diagram-language concept. Its inheritance is about graph content; it does not establish the bidirectional, reader-edited layout behavior proposed here. Start with complete GDL snapshots; a later edit-based shorthand could compile to the same model.

### Mermaid syntax to borrow

Mermaid offers three relevant precedents in its official documentation:

| Existing syntax | Mermaid meaning | Fit for a GDL collection |
| --- | --- | --- |
| [`section Caption`](https://mermaid.js.org/syntax/timeline.html#grouping-of-time-periods-in-sections-ages) | Starts a timeline section that lasts until the next section header | A compact alternative, but its boundary remains implicit until the next header |
| [`subgraph Caption ... end`](https://mermaid.js.org/syntax/flowchart.html#subgraphs) | Groups nodes within a flowchart | Familiar block boundaries, but adds a closing line and suggests grouping inside one graph |
| [`state ID { ... }`](https://mermaid.js.org/syntax/stateDiagram.html#composite-states) | Defines a composite state containing internal states | Chosen block shape; make the ID optional and put a full GDL snapshot in its body |

Use `state <optional id> { ... }` for the collection's members. This borrows Mermaid's composite-state block shape while adapting its contents to full GDL snapshots and allowing anonymous states. The collection still owns one policy and the shared preamble rules. Braces make the shared/local rule boundaries explicit without making indentation significant. Optional IDs and snapshot navigation are GDL features, not a claim of unchanged Mermaid compatibility.

## Dragging and bidirectional navigation

**Use the arrangement the reader is leaving to seed the state they are entering.** This rule applies in both trace directions. Capture the whole settled source layout, including neighbors moved by constraints during a drag. Do not replay old drag deltas or restore an old destination layout over that live source.

For a source graph `G[s]` currently arranged as `L`, and destination `G[t]`:

```text
H = policy(L, G[s], G[t])
nextLayout = constrainedLayout(G[t], C[t], H)
```

Both `s < t` and `s > t` are valid. This is the existing core policy contract, with source/destination names making its meaning explicit. Moving backward does not mathematically invert a layout or undo the prior forward transition. It applies the same policy to a new ordered source/destination pair. For example, `change_emphasis` detects a removal in one direction and an addition in the other.

The graph's contents remain authored snapshots; the arrangement is session-dependent. `2 → 8 → 2` may return to a different layout of state 2, shaped by the reader's work in state 8. That is intentional. Do not introduce a chronological layout cache or persistent per-state placement targets to defeat it.

Keeping a parent at its old position may be impossible after a rotation. Preserve the remaining freedom, while satisfying the destination constraints. A drag improves the next view without becoming an immutable pin.

## One state or two consecutive states

In `single` view, Previous, Next, and slider jumps all use the displayed state's live arrangement as their source. A direct jump from 2 to 8 applies the policy from 2 to 8; it does not compute or display states 3–7. Moving back from 8 to 2 uses the current arrangement of 8.

In `pair` view, show `[i, i+1]` in chronological order. The two panes are independently draggable. Dragging one does not continuously move nodes in the other. Capture a navigation source only when the reader navigates:

| Action from `[i, i+1]` | Source captured before navigation | New pair |
| --- | --- | --- |
| Next | Right pane `i+1`, including its drags | Retain `i+1` as the left pane; generate `i+2` from that source |
| Previous | Left pane `i`, including its drags | Generate `i-1` from that source; retain `i` as the right pane |
| Jump to a later pair `[j, j+1]` | Outgoing right pane | Generate both destinations independently from the same captured source; retain any overlap |
| Jump to an earlier pair `[j, j+1]` | Outgoing left pane | Generate both destinations independently from the same captured source; retain any overlap |

This gives “independent side by side” a precise meaning: **independent manipulation while displayed, policy-based continuity when navigating.** Independence is not an instruction to ignore the chosen policy on navigation.

Retaining the overlapping state is the recommended interpretation of “reload from the current state.” Re-solving that same state is unnecessary and can change a carefully arranged source, especially under `random_positioning`. In an adjacent move the retained pane supplies the previous layout for the entering pane. Preserve its renderer and selection by its internal state key rather than keying graph components only by left/right column.

One consequence should be visible in the controls: dragging the left pane and pressing Next carries the right pane's arrangement, not the left pane's. Use button descriptions such as “Next: continue from right state” and “Previous: continue from left state.” Do not silently change the source to whichever pane was touched last.

On first loading a pair with no prior view, lay both out independently. Entering pair view from a single state retains that state and constructs its neighbor from it. Normally it becomes the left pane; at the last trace state, show its predecessor on the left and retain it on the right. Entering single view retains the selected pane (default left); this changes presentation without re-solving it. A one-state document disables pair view. At the first/last pair, disable Previous/Next respectively. On narrow displays stack the panes, with the same earlier/later semantics.

Keep the source pane's geometry frozen for one navigation transaction, so two destination renders cannot accidentally use each other's results. Source camera position travels with continuity; destination panes remain independently pannable afterward. Use a common scale for comparison where practical, and avoid automatic fitting after every navigation.

### Benefits, costs, and scope

| Choice | Benefit | Cost / consequence |
| --- | --- | --- |
| Carry in both directions | A reader's latest useful arrangement follows their exploration | Revisits are path-dependent; structural changes may accumulate geometric drift |
| Independently draggable panes | Inspect either state without forcing a second solve on every drag | The two views can diverge spatially; only the chosen boundary supplies the next seed |
| Retain the overlap on adjacent moves | The state being continued stays exactly as arranged | Renderer lifecycle must follow state identity rather than pane position |
| Same captured source for both panes on a jump | Clear source rule and independent destination solves | Large jumps can change substantially; label the actual source of the transition |
| Only `single` and `pair` initially | Small, understandable navigation surface | Distant comparisons and multi-frame windows wait for a later version |

Cache parsing and generated constraint structure as appropriate. A geometry cache is reusable only with the matching source arrangement/policy context; state ID alone is not a sufficient key. Layout undo can reverse a manipulation in the displayed scene; Previous is navigation, not undo. Reader arrangements remain local to the sequence session and do not rewrite GDL source.

## Authoring snapshots

Use an outer `gdl-sequence` document with one collection policy, shared annotations, and explicit state blocks:

```text
state <optional id> {
  <complete GDL graph and local requirements>
}
```

The braces define scope. Indentation is optional and only aids readability. In Markdown, `gdl-sequence` is the fence language:

````markdown
```gdl-sequence
policy: stability

@orientation(selector=next, directions=[right])

state before {
  a[A] -> b[B] : next
  b -> c[C] : next
}

state {
  a[A] -> b[B] : next
  b -> c[C] : next
  x[X]
}

state after {
  a[A] -> x[X] : next
  x -> b[B] : next
  b -> c[C] : next
  @align(selector=next, direction=horizontal)
}
```
````

The second state deliberately has no ID. The viewer displays “State 2”; named states may display their ID alongside the state number. Block order defines sequence order, regardless of the names provided. Every body is a full existing GDL document, with its own graph and optional local annotations.

The preamble before the first state contains the collection policy and any shared requirements or style annotations. Graph declarations belong inside state blocks. Shared rules belong in the preamble; local rules belong inside the relevant braces. An annotation between or after state blocks is rejected with a diagnostic asking the author to put it in the preamble or a state, avoiding ambiguous scope.

### Product contract: names and order

The main product risk is two apparent sources of ordering: block position and the optional identifier. An author can write `state s10 { ... }` followed by `state s2 { ... }` and expect numeric ordering. Names such as `start`, `retry`, and `finish` can also suggest a state machine with transition references, even though this document describes an ordered trace of complete snapshots.

Define one ordering contract: **source order is sequence order.** An optional state ID is an opaque address for that occurrence. It is never a sort key, timestamp, transition target, or request to update another block. The collection retains its authored order regardless of IDs and navigation direction. The selected sequence policy affects arrangements, not membership or ordering.

| Author action | Product behavior |
| --- | --- |
| Rename an explicit state ID | Keep the block's position and graph; references to the old ID need updating |
| Move a block | Change that snapshot's place in the sequence and the resulting adjacent comparisons |
| Insert an anonymous block | Insert a snapshot at that location; later ordinal labels shift |
| Use IDs such as `s10`, `s2`, or `finished` | Preserve declaration order without numeric, lexical, or semantic sorting |
| Repeat the same graph contents | Keep both occurrences, including unchanged or returning states; do not deduplicate |
| Repeat an explicit state ID | Report a duplicate ID; identical data or a repeated logical condition is still permitted using anonymous states or different occurrence IDs |

Show position independently of identity: `2 of 5 · after_insert`, or simply `2 of 5` for an anonymous state. Keep timeline ticks and state pickers in source order. In pair view display consecutive positions in increasing order even when arriving through backward navigation. Label navigation “Previous state” and “Next state” so their meaning is adjacency in the sequence, distinct from a browser's visit history.

Keep anonymous blocks the easiest authoring path. IDs earn their place when an embed needs stable addressing; authors should not have to assign numbered IDs merely to get an order the file already provides. Do not introduce a second `order:` list, derive order from names, or require references between blocks. Formatters and serializers must preserve block order.

There is also an ID-versus-label tradeoff. A stable address should survive changes to the wording shown to readers. For the initial version, displaying the optional ID is adequate; the ID should not be advertised as a freely editable descriptive caption with durable links. If presentation captions become important, add a distinct caption feature based on that need, rather than making renaming an ID silently break public references. Quoted caption syntax is outside the current scope.

For subsequent author validation, show authors a short sequence with `s10`, `s2`, and an anonymous state. Ask which graph Next displays, what changes after renaming or moving a block, and how to express a return to an earlier logical condition. Also test inserting an unchanged snapshot and stepping backward in pair view. Check whether readers can predict order from the editor and viewer without consulting a syntax reference. These are validation questions, not findings about current users.

### State identity and node identity

State IDs are optional. When supplied, they are unquoted identifiers and must be unique within the collection. They can support links and host APIs without forcing every author to invent names. Anonymous states receive internal keys scoped to a parsed document, with automatic labels “State 1,” “State 2,” and so on. Those keys are not persistent public IDs. An explicit state ID does not change the state's position in the sequence.

Node IDs have a different purpose: the same node ID identifies the same entity across member graphs, and is how a sequence policy carries positions between them. A changed display label does not change node identity. Reusing an ID for an unrelated object creates false continuity. Each collection has its own identity scope, so separate diagrams containing `a` cannot share arrangement memory.

Every graph body remains a full snapshot. Missing nodes and edges are absent, not inherited. A node with no incident edges must be declared explicitly. Reordering blocks changes their order and automatic numbering; optional IDs can remain unchanged.

### Shared and local requirements

For each state, use both the shared preamble annotations and that state's own annotations:

```text
requirements(state) = shared requirements + local requirements(state)
```

Evaluate shared selectors separately against each state's graph. The example's `next` selector means the `next` edges in that state, not the union of edges across the collection. Shared rules do not introduce graph nodes or edges. State-local rules apply only inside their block and are never carried into another block.

Constraints are additive. A local constraint does not override an opposite universal constraint. If the shared rules require a connection to point right and a state locally requires it to point left, report a conflict in that state and cite both rules. Do not silently discard a universal rule. Styling follows the existing style-resolution semantics; do not invent a general constraint-override system.

A shared selector may match nothing in a particular state, for example before a relationship is introduced. That should be an empty application, while genuinely unknown selector names still receive diagnostics. Validate common symbols against the collection's vocabulary and ensure the evaluator can represent their absence in individual members. This is an integration requirement, not a claim that the current single-graph compiler already handles every missing-symbol case.

The policy is also declared once in the preamble. Use core's canonical `stability` spelling; `stable` is not currently registered by core. Keep the four canonical policy names initially. An omitted policy defaults to `stability`, an intentional difference from CnD's `ignore_history` default. A policy declaration inside a state is an error, rather than an override.

`single` and `pair` are presentation options on the collection's viewer, kept outside individual graphs. The source declares the collection policy; it stays fixed while the document is mounted. Change the declaration and apply the source to use another policy. Viewer controls select position and view only. Default to single view. A future persistent initial-view option belongs to the sequence header or embed configuration.

### Parsing and diagnostics

Require at least one state block and reject duplicate explicit state IDs. Preserve source order, original line numbers, and the scope of every annotation. Match each outer closing brace with GDL-aware scanning: braces inside node labels, quoted strings, or comments do not end a state; nested braces in selector comprehensions or other valid GDL constructs must remain balanced. Do not split on the first `}`. Sequence-level state blocks do not nest.

A block can be empty (`state { }`), representing an empty graph state. An unclosed state reports an error at its opening brace; a stray closing brace reports its own source line. Header entries and shared annotations are valid only in the preamble. A line containing a graph node named `state` inside a body remains ordinary GDL; it does not introduce a nested sequence member.

The existing standalone `spytial-gdl` fence remains a single graph. The `gdl-sequence` fence selects a container parser that removes the collection header and outer state wrappers before invoking the existing GDL pipeline. Global annotation provenance points back to the preamble; local provenance points to the relevant state body. The outer syntax must not reach core's `parseLayoutSpec` or become invented graph nodes.

Full snapshots cost repetition of data, but shared rules eliminate repeated layout specifications. A later edit-based shorthand could reduce graph repetition if real authoring experience justifies deletion and inheritance semantics. Empty graph states are valid collection members even though today's single-graph compiler rejects zero-node input; the adapter must handle them explicitly without implicitly resetting the sequence session.

## Navigation and policies

The compact embedded player has Previous/Next, an integer slider, `State 3 of 8`, and a meaningful state label. Ticks represent snapshots, not elapsed time. Timestamps can be labels until the language explicitly models duration. A fractional slider position must not imply that an intermediate graph is a valid state.

In pair view the slider selects the left index of a consecutive pair, from `0` to `N-2`, and the label reports both states. In single view its range is `0` to `N-1`. Use short morphs for deliberate adjacent moves, subject to reduced-motion preferences. Scrubbing coalesces pending requests; a jump uses the appropriate currently displayed source rather than replaying skipped states. Distinguish requested from displayed state while rendering, and freeze the source before an asynchronous render can replace it. If rapid input reverses direction while a request is pending, select the source edge from the last committed pair, not from unfinished target panes.

Change summaries name their baseline. The paired comparison reports chronological changes from left to right even when the navigation that produced the pair went backward. A single-state transition summary reports changes from the actual source to the actual destination. Neither should imply that a jump from 2 to 8 was a transition from 7 to 8.

| Core policy | User-facing meaning | Benefit | Cost and drag behavior |
| --- | --- | --- | --- |
| `stability` | Preserve arrangement | Persistent IDs retain useful placement in either navigation direction | Less freedom to optimize each frame; a structural change can still force movement |
| `ignore_history` | Arrange each entering state independently | New frames can find a useful layout afresh | Live drags survive in a retained overlapping pane, but do not seed newly entering panes |
| `change_emphasis` | Move changed structure | Can make changed connectivity conspicuous | Core intentionally jitters changed nodes; this can resemble meaningful motion and partially undo reader positioning |
| `random_positioning` | Randomize layout | Useful as an experimental baseline | Poor reading default and inherently variable; keep advanced/experimental |

Default to `stability` and explicit, non-geometric change cues. Authors select the other policies with the source declaration; the viewer has no policy control or runtime override. Unknown names should produce a GDL diagnostic instead of silently falling back to core's `ignore_history`.

Compute semantic diffs from the original parsed graph: added/removed nodes and labeled directed edges, changed labels/types/classes. Do not count `_links` as another edge change; it is an internal duplicate relation. Core's `change_emphasis` fingerprints incident tuples, so it is not a substitute for a GDL label/content diff.

Keep surviving graph-reader selection by ID; announce removal without unexpectedly choosing another node. Provide a text change summary and native keyboard-accessible state controls. Required spatial relationships still come from the current state's accepted rules. An “as arranged” answer can change after a drag; a “required” answer cannot change from a drag alone. Autoplay is optional and off by default; printing should show labeled snapshots or a documented representative state.

## Integration and implementation risks

The existing boundary is promising: [src/index.js](../../src/index.js) separates compilation, solving, and rendering, and already has a `preservePositions` path. However, ordinary rendering clears the graph and the preserving path forwards positions without sequence-policy context. Repeated calls to the public static render function are therefore insufficient for this feature.

Proposed layering:

```text
compileGdlSequence(sequenceSource)
  → { policy, sharedRules, states: [{ key, id?, source, compiledGraph }, ...] }

createSequenceController(container, compiledSequence, { view: 'single' })
  → seek(stateOrPairStart), next(), previous(), setView('single' | 'pair'), dispose()

mountSequenceControls(container, controller)
```

The existing single-graph entry points retain their behavior. Sequence diagnostics carry state number, optional ID, and original source line. A bad state stays at its timeline position with a clear error; never silently skip it. If a state shows conflicting diagnostic geometry, label it as such. Retain the last valid source for retry; if a chosen source is invalid, render the target fresh with an explicit warning rather than treating failed geometry as trusted continuity. Source/class registries and graph readers remain scoped to each pane's current compiled state.

For each navigation, pass the selected source's settled positions and actual source/destination data instances to core's policy-aware `renderLayout`. Capture after constraint resolution, including constrained neighbors moved during a drag. The full layout snapshot is sufficient for ordinary positional carry; there is no persistent placement target layer. Ensure a superseded render cannot commit geometry or reader state after a newer request. For an adjacent pair move, preserve the overlap and construct only the entering pane.

Core integration considerations and follow-up work:

- The current exported `stability` object closes over mutable recall memory. `getSequencePolicy` returns that singleton. Two embeds or independently arranged panes sharing it can contaminate one another; copying the object does not copy its closure. A future recall feature needs a core-owned factory with source-scoped/forkable session memory. The initial GDL implementation filters all hints not present in the departing snapshot, avoiding this dependency. Pair rendering must not let solve order determine which sibling positions are recalled. The selected source arrangement and its policy context define recall, not chronological replay or unrelated pane activity. Empty states must not implicitly reset an otherwise live session.
- `priorPositions` supplies hints for a new solve; it is not an exact restoration API. That is appropriate for an entering state in either direction. For an overlapping state, retain the existing renderer rather than relying on a second solve to recreate the same arrangement.
- In morph mode core can implicitly warm-start when no explicit policy is supplied. For independent layouts, pass `ignore_history` explicitly with the instance pair; omitting options is not a dependable opt-out in that mode. The first frame should use an explicit fresh render.
- Core's current renderer passes a placeholder `spec` in its policy context. Avoid proposing custom policies that inspect actual layout requirements until that integration is corrected.
- The documentation mentions `generateSequenceLayouts`, but it is absent from the inspected renderer source and generated element declaration. Build against verified APIs rather than that convenience method.

These shared policy/session behaviors belong in spytial-core. GDL owns state syntax, labels, source-pane selection, navigation, semantic diffs, and renderer lifecycle. Core's existing policy vocabulary and pairwise API remain the basis of the implementation.

## What to build and what would justify continuing

First build finite sequences with full snapshots, stable node IDs, the four existing policy choices, stability as the default, state labels, integer navigation, bidirectional carry, and exactly `single`/`pair` views. Keep structural graph editing inside a sequence, arbitrary compare sets, larger windows, live streams, branches, loop semantics, patch syntax, and presentation export out of that first scope.

The main cost is source selection, independent pane lifecycles, and stateful policy isolation. Removing chronological replay and permanent placement targets makes the navigation model substantially smaller than the previous proposal.

Verify with scenarios that exercise the contract:

1. In single view, a drag in state 2 changes a surviving node's seed on navigation both to state 3 and to state 1, while preserving satisfiable destination constraints.
2. A rotation moves nodes whose old positions conflict with its requirements while retaining remaining reader-created spacing.
3. A reverse visit is generated from the live source, rather than silently restoring an older destination arrangement; skipped states are not rendered.
4. In pair `[2,3]`, dragging either pane leaves the other unchanged. Next preserves pane 3 exactly and generates 4 from it; Previous preserves pane 2 exactly and generates 1 from it.
5. A jump captures the outgoing edge once and seeds both entering states from that source; reversing the order of destination solves cannot change their seeds.
6. Identical IDs in independent embeds or separate pane lineages cannot leak recall positions. Policy changes, mode switches, empty states, rapid reversals, conflicts, reduced motion, and reader-node removal have explicit outcomes.

Then test two different hypotheses. First, ask educators/documentation authors to bring a real explanation and author it: do sequences reduce maintenance versus duplicated static diagrams, and do they choose to publish a second example? Second, compare readers using (a) static before/after diagrams, (b) a sequence with local-only dragging, and (c) the same sequence with bidirectional carry. Use entity tracking, explaining a pointer update, and locating a fault as tasks. Counterbalance order and measure correctness, time, repeated layout repairs, unexpected movement, and confidence. Include backward navigation, a case where destination constraints require movement, and a test of whether people understand which paired pane supplies Next/Previous.

Continue with propagation if readers reuse arrangements and answer better or expend materially less repair effort without losing accuracy. If authors want paced explanations but readers rarely rearrange, keep the simpler sequence player. If comparisons do most of the work, prioritize paired views over richer animation. Existing evidence supports testing this design; it does not pre-decide that outcome.
