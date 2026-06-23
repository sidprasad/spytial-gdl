// Turn the parsed flowchart structure into the JSON shape JSONDataInstance
// accepts: { atoms, relations, types? }, plus the list of relation names that
// should be drawn as *selectors only* (hidden from the rendered graph).
//
// Why "draw-once": the standard webcola-cnd-graph renderer draws an edge for
// EVERY binary relation tuple, labeled with the relation name. If we emitted an
// edge into several relations at once (a catch-all, a per-label, a per-class
// relation), the same A→B pair would be drawn 2–3 times as overlapping lines.
// So we split relations into two kinds:
//
//   DRAWN (exactly one per mermaid edge):
//     - one relation named by the edge's mermaid label  (`A -->|left| B` → `left`)
//     - `link`  for unlabeled edges                      (`A --> B`      → `link`)
//   SELECTOR-ONLY (hidden via a `hideField` directive — see index.js):
//     - `edge`             — every edge, so `selector: edge` still works
//     - `<className>`      — class membership (the renderer would otherwise
//                            draw a self-loop on each member)
//     - `<className>_edge` — edges between two members of a class
//
// Mapping decisions:
//   - Atom type = mermaid shape name (rect, circle, diamond, …) or
//     'MermaidNode' for plain `A` declarations. Lets `selector: rect`
//     target all rectangles via type-based selection.
//   - For every class that appears on any node we also emit a unary membership
//     relation named for the class (`selector: tree` → tree-class nodes), hidden
//     so its per-member self-loops aren't drawn.
//   - Class names are stored on each atom under `labels.classes`, matching the
//     documented use of the `labels?` field for host-specific metadata.

const DEFAULT_TYPE = 'MermaidNode';

// Relation name carrying unlabeled edges. Kept in sync with index.js, which
// blanks this label on the rendered edges (an unlabeled mermaid edge should
// not show the word "link"). Exported so callers can recognize it.
export const DEFAULT_RELATION = 'link';

function nodeType(node) {
  if (!node) return DEFAULT_TYPE;
  return node.shape && node.shape !== 'default' ? node.shape : DEFAULT_TYPE;
}

export function relationalize({ nodes, edges, classesPerNode }) {
  const atoms = [];
  for (const [id, node] of nodes) {
    const atom = {
      id,
      type: nodeType(node),
      label: node.label ?? id,
    };
    const classes = classesPerNode.get(id);
    if (classes && classes.size > 0) {
      atom.labels = { classes: Array.from(classes) };
    }
    atoms.push(atom);
  }

  const relations = [];
  const hiddenRelations = []; // binary relation NAMES to hide from drawing

  const tupleFor = (e) => ({
    atoms: [e.source, e.target],
    types: [nodeType(nodes.get(e.source)), nodeType(nodes.get(e.target))],
  });

  if (edges.length > 0) {
    // ── DRAWN edges ────────────────────────────────────────────────────
    // One relation per distinct edge label (drawn, carrying the label), and a
    // single `link` relation for every unlabeled edge (drawn, label blanked).
    // Each mermaid edge lands in exactly one of these, so it draws once.
    const byLabel = new Map();
    const unlabeled = [];
    for (const e of edges) {
      if (e.label) {
        if (!byLabel.has(e.label)) byLabel.set(e.label, []);
        byLabel.get(e.label).push(e);
      } else {
        unlabeled.push(e);
      }
    }

    if (unlabeled.length > 0) {
      relations.push({
        id: 'link',
        name: DEFAULT_RELATION,
        types: [DEFAULT_TYPE, DEFAULT_TYPE],
        tuples: unlabeled.map(tupleFor),
      });
    }

    for (const [label, labelEdges] of byLabel) {
      // `A -->|left| B` exposes a relation named `left` so users can write
      // `selector: left` directly — and it carries the visible edge label.
      //
      // Collision warning: if a node class and an edge label share a name,
      // two relations end up with the same name (one binary, one unary).
      // Users should name distinctly.
      relations.push({
        id: `lbl_${label}`,
        name: label,
        types: [DEFAULT_TYPE, DEFAULT_TYPE],
        tuples: labelEdges.map(tupleFor),
      });
    }

    // ── SELECTOR-ONLY edges (hidden) ───────────────────────────────────
    // Catch-all `edge` holds EVERY edge so `selector: edge` sees all of them.
    // It duplicates the drawn relations above, so it must be hidden.
    relations.push({
      id: 'edge',
      name: 'edge',
      types: [DEFAULT_TYPE, DEFAULT_TYPE],
      tuples: edges.map(tupleFor),
    });
    hiddenRelations.push('edge');
  }

  // Collect every class name used anywhere.
  const allClasses = new Set();
  for (const cs of classesPerNode.values()) {
    for (const c of cs) allClasses.add(c);
  }

  for (const cls of allClasses) {
    const members = [];
    for (const [id, classes] of classesPerNode) {
      if (classes.has(cls)) members.push(id);
    }

    // Unary membership relation. `selector: tree` binds to tree-class nodes.
    // The renderer draws a unary relation as a self-loop on each member, so we
    // hide it too — selectors and grouping still resolve against the data
    // instance, but no self-loops are drawn.
    relations.push({
      id: `cls_${cls}`,
      name: cls,
      types: [DEFAULT_TYPE],
      tuples: members.map(id => ({
        atoms: [id],
        types: [nodeType(nodes.get(id))],
      })),
    });
    hiddenRelations.push(cls);

    // Binary subset of `edge` localized to this class, e.g. `tree_edge` lets
    // `orientation: { selector: tree_edge, directions: [below] }` target only
    // edges between two tree-class nodes. Emitted even when empty so the
    // selector always resolves to arity 2. Duplicates drawn edges → hidden.
    const memberSet = new Set(members);
    const inClass = edges.filter(e => memberSet.has(e.source) && memberSet.has(e.target));
    const edgeRelName = `${cls}_edge`;
    relations.push({
      id: `cls_${cls}_edge`,
      name: edgeRelName,
      types: [DEFAULT_TYPE, DEFAULT_TYPE],
      tuples: inClass.map(tupleFor),
    });
    hiddenRelations.push(edgeRelName);
  }

  return { atoms, relations, hiddenRelations };
}
