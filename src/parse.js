// Parser for spytial-gdl notation — a tiny graph syntax.
//
// You write nodes and edges; Spytial lays them out. There is no required header
// and no layout direction: spatial operations come from inline @annotations (see
// annotations.js), so a `graph TD` preamble would do nothing. Leave it out.
//
// Returns { nodes, edges, classesPerNode, errors, labelLines, classLines }:
//   nodes:           Map<id, { id, type, label, line, typeLine, labelLine }>
//                    (type/label null unless given; the lines are where each
//                    was first set, for diagnostics)
//   edges:           Array<{ source, target, kind, label, line }>
//   classesPerNode:  Map<id, Set<string>>
//   labelLines:      Map<label, line>   first line each edge label appears on
//   classLines:      Map<class, line>   first line each class is assigned on
//   badNames:        Set<name>          names reported here as unselectable and
//                    kept for display, so the engine check need not repeat it
//
// Names. An edge label, a sort, and a class are all selectors — the engine's
// query grammar reads them — so they have to be names that grammar can read
// back: letters, digits and `_`, not starting with a digit. What the grammar
// *reserves* (`no`, `in`, `some`, …) is the engine's to say and changes between
// releases, so it is not listed here: index.js asks the installed engine to
// resolve every name it hands over, and reports the ones it cannot. The three
// kinds share one namespace in the engine, so a spelling used for two of them
// is a collision, reported here.
//
// Edges:
//   A -> B               an edge
//   A -> B : left        a labeled edge (the label becomes a selector)
// Nodes (a node is implicit from any edge; the id is its name):
//   A                    bare id (the id is also the display label)
//   A[Alice]             a display label, mermaid-style — the id stays the identity
//                        that edges reference; without a label the id is shown.
//   A:::Person           the node's sort/type, so `selector: Person` matches it.
//                        One sort for now; a chain `A:::Person:::Employee` is
//                        reserved for a linear sort hierarchy (the leaf is the sort).
//   A[Alice]:::Person    a label and a sort together
//   class A,B,C tag      tag several nodes with a cross-cutting class
// Comments:  %% rest-of-line
//
// For paste-compatibility, a leading `graph`/`flowchart` line, the mermaid-style
// arrows (-->, -.->, ==>, ---), and pipe labels (A -->|x| B) are also accepted;
// the other mermaid bracket forms are read as a label too (inner text).

// A bracket wrapper after an id holds the node's display label, e.g. `A[Alice]`
// (mermaid-style). The forms ((x)), {x}, [[x]], [(x)], >x] are tolerated too.
const LABEL_BRACKET = /^[[({>]+(.+?)[\])}]+$/;

// Ordered longest-first so a longer arrow matches before one of its substrings
// (e.g. `-->` before `->`, which it contains as a tail).
const ARROW_TOKENS = ['-.->', '==>', '-->', '---', '->'];
const ARROW_ALT = '-\\.->|==>|-->|---|->'; // same set, for the pipe-label regex

// A `%%` at bracket depth 0 starts a comment. Inside a `[label]` it is text
// (`A["50%% off"]`), which a bare indexOf would cut the line at.
function stripComments(line) {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') { if (depth > 0) depth--; }
    else if (ch === '%' && line[i + 1] === '%' && depth === 0) return line.slice(0, i);
  }
  return line;
}

// The shape of a bare name in the engine's query grammar. `-` is excluded on
// purpose even though ids allow it: in that grammar it is set difference, so a
// label `left-child` reads as `left - child` and matches nothing, silently.
const SELECTOR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Names starting with `_` belong to spytial-gdl: relationalize.js emits `_` for
// the unlabeled edges and `_links` for every edge, and hides `_links` by name.
// An author's own `_links` would be hidden along with it.
const RESERVED_PREFIX = '_';

// Why `name` cannot serve as a selector, or null if its shape is fine. Returns
// { message, drop }: `drop` says the name must not reach the engine at all (a
// reserved spelling would be hidden or merged), as opposed to one that is merely
// unselectable and can stay for display.
function nameProblem(name, what) {
  if (name.startsWith(RESERVED_PREFIX)) {
    return {
      drop: true,
      message: `${what} "${name}" is reserved: names starting with _ belong to spytial-gdl ` +
        '(_ is the unlabeled edges, _links is every edge)',
    };
  }
  if (!SELECTOR_NAME.test(name)) {
    return {
      drop: false,
      message: `${what} "${name}" cannot be used as a selector: a name is letters, digits and _, ` +
        'not starting with a digit (no spaces, hyphens or punctuation)',
    };
  }
  return null;
}

// Strip one layer of surrounding quotes, if present.
function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

function parseNodeExpr(raw) {
  // Pull off the `:::Sort` chain first. One sort for now — the most specific
  // (last) segment; earlier segments are reserved for a linear sort hierarchy.
  const sorts = [];
  const expr = raw.trim().replace(/:::([\w-]+)/g, (_, s) => {
    sorts.push(s);
    return '';
  }).trim();

  // ID is the leading identifier (letters, digits, underscore, hyphen).
  const m = expr.match(/^([\w-]+)(.*)$/);
  if (!m) return null;
  const id = m[1];
  const rest = m[2].trim();

  // A [bracket] holds the display label (mermaid-style), not the type. If the
  // whole remainder is a label bracket, that's the label; if a label bracket is
  // followed by more text, that trailing text is garbage (`A[x] oops`) — we peel
  // the label and hand the leftover back as `trailing` for the caller to report,
  // rather than dropping it silently.
  let label = null;
  let trailing = null;
  if (rest) {
    const full = rest.match(LABEL_BRACKET);            // whole rest is one label bracket
    if (full) {
      label = unquote(full[1].trim()) || null;
    } else {
      const lead = rest.match(/^[[({>]+(.+?)[\])}]+/);  // a label bracket, then leftover
      if (lead) {
        label = unquote(lead[1].trim()) || null;
        trailing = rest.slice(lead[0].length).trim() || null;
      } else {
        trailing = rest;                                // no bracket at all → all garbage
      }
    }
  }

  const type = sorts.length ? sorts[sorts.length - 1] : null;
  return { id, type, label, trailing };
}

// The first arrow token in `line`, at bracket depth 0 and outside quotes — so an
// arrow inside a `[label]` or a quoted string (`A["a --> b"] -> B`) is not
// mistaken for the edge delimiter. Longest token wins at a given position (`-->`
// before the `->` it contains).
function findArrow(line) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '(' || ch === '{') { depth++; continue; }
    if (ch === ']' || ch === ')' || ch === '}') { if (depth > 0) depth--; continue; }
    if (depth === 0) {
      for (const tok of ARROW_TOKENS) {
        if (line.startsWith(tok, i)) return { tok, i };
      }
    }
  }
  return null;
}

// Split a trailing ` : label` off an edge's target side. The colon must be
// preceded by whitespace and sit at bracket depth 0, so it can't be confused
// with a `:::class` tag or a colon inside a `[label]`.
function splitLabel(rightRaw) {
  let depth = 0;
  for (let i = 0; i < rightRaw.length; i++) {
    const ch = rightRaw[i];
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth--;
    else if (ch === ':' && depth === 0 && /\s/.test(rightRaw[i - 1] || '')) {
      const node = rightRaw.slice(0, i).trim();
      const label = rightRaw.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      return { node, label: label || null };
    }
  }
  return { node: rightRaw.trim(), label: null };
}

// A typographic filter upstream of the renderer — Pollen's `smart-dashes` /
// `smart-quotes` decoder, a CMS "smart punctuation" pass — rewrites `-->` to
// `–>` and `'x'` to `’x’`. The arrow stops being an arrow, and the parse error
// that follows points at the symptom. Only consulted for a line that already
// failed, so naming the real cause costs nothing when it doesn't apply.
const SMART_DASH = /[–—]/;
const SMART_QUOTE = /[‘’“”]/;
function typographyHint(line) {
  const what = SMART_DASH.test(line) ? 'dashes' : SMART_QUOTE.test(line) ? 'quotes' : null;
  return what
    ? ` — this line contains typographic ${what}, so a smart-punctuation filter has` +
      ' rewritten the block; exclude it from that processing upstream'
    : '';
}

function parseEdgeLine(line) {
  // mermaid-style pipe label first: `A -->|label| B`.
  const piped = line.match(new RegExp(`^(.+?)\\s*(${ARROW_ALT})\\s*\\|([^|]+)\\|\\s*(.+)$`));
  if (piped) {
    return { leftExpr: piped[1].trim(), rightExpr: piped[4].trim(), kind: piped[2], label: piped[3].trim() };
  }
  const arrow = findArrow(line);
  if (!arrow) return null;
  const leftRaw = line.slice(0, arrow.i);
  const rightRaw = line.slice(arrow.i + arrow.tok.length);
  const { node, label } = splitLabel(rightRaw); // ` : label` form
  return { leftExpr: leftRaw.trim(), rightExpr: node, kind: arrow.tok, label };
}

// Returns { nodes, edges, classesPerNode, errors, labelLines, classLines }, where
// `errors` is a list of { line, text, severity, message } with 1-based `line`:
//   severity 'error'   — a line we couldn't read (a broken edge/class, or junk),
//                        or a name that cannot work as written (see the header)
//   severity 'warning' — a Mermaid construct we accept for paste-compatibility
//                        but ignore (a `graph`/`flowchart` header, `classDef`),
//                        or something legal but probably unintended (a node
//                        given two labels, an edge written twice)
// Rendering stays best-effort: a bad line is reported and skipped, never fatal.
export function parseGraph(source) {
  const rawLines = String(source ?? '').split(/\r?\n/);

  const nodes = new Map();
  const edges = [];
  const classesPerNode = new Map();
  const errors = [];
  const labelLines = new Map();   // edge label → first line
  const classLines = new Map();   // class → first line
  const classTexts = new Map();   // class → that line's text, for the report
  const edgeSeen = new Map();     // "src\0tgt\0label" → first line
  const badNames = new Set();     // names reported here as unselectable but kept for display

  const addClass = (id, c) => {
    if (!classesPerNode.has(id)) classesPerNode.set(id, new Set());
    classesPerNode.get(id).add(c);
  };
  const addNode = (n, at, text) => {
    if (!n) return;
    if (!nodes.has(n.id)) {
      nodes.set(n.id, {
        id: n.id, type: n.type, label: n.label, line: at,
        typeLine: n.type != null ? at : null, labelLine: n.label != null ? at : null,
      });
      return;
    }
    // Prefer an explicit sort / label when it appears on any mention — and say
    // so when a later mention contradicts an earlier one, since "last wins" is
    // otherwise invisible.
    const existing = nodes.get(n.id);
    if (n.type != null) {
      if (existing.type != null && existing.type !== n.type) {
        errors.push({ line: at, text, severity: 'warning',
          message: `node "${n.id}" was given sort ${existing.type} on line ${existing.typeLine} ` +
            `and ${n.type} here; the last one wins` });
      }
      existing.type = n.type;
      existing.typeLine = at;
    }
    if (n.label != null) {
      if (existing.label != null && existing.label !== n.label) {
        errors.push({ line: at, text, severity: 'warning',
          message: `node "${n.id}" was labeled "${existing.label}" on line ${existing.labelLine} ` +
            `and "${n.label}" here; the last one wins` });
      }
      existing.label = n.label;
      existing.labelLine = at;
    }
  };
  // A node's sort is a selector name. A reserved one is cleared so it cannot
  // reach the engine; an unselectable one stays for display and is reported.
  const checkSort = (n, at, text) => {
    if (!n || n.type == null) return;
    const problem = nameProblem(n.type, 'sort');
    if (!problem) return;
    errors.push({ line: at, text, severity: 'error', message: problem.message });
    if (problem.drop) n.type = null;
    else badNames.add(n.type);
  };

  rawLines.forEach((raw, idx) => {
    const line = stripComments(raw).trim();
    if (!line) return;                       // blank or comment-only — nothing to do
    const at = idx + 1;

    // Tolerated-but-ignored Mermaid constructs. We accept them so pasted diagrams
    // render, but flag them (as warnings) so authors learn the native notation:
    // there is no layout direction here, and styling is a directive, not CSS.
    if (/^(?:graph|flowchart)\b/i.test(line)) {
      errors.push({ line: at, text: line, severity: 'warning',
        message: "ignored: spytial-gdl has no 'graph'/'flowchart' header — layout comes from @annotations" });
      return;
    }
    if (/^classDef\b/.test(line)) {
      errors.push({ line: at, text: line, severity: 'warning',
        message: 'ignored: Mermaid classDef is not used — style nodes with directives like @atomStyle / @size' });
      return;
    }

    // class A,B,C someClass
    const classAssign = line.match(/^class\s+([\w,\s-]+)\s+([\w-]+)\s*;?$/);
    if (classAssign) {
      const cls = classAssign[2];
      const problem = nameProblem(cls, 'class');
      if (problem) {
        errors.push({ line: at, text: line, severity: 'error', message: problem.message });
        if (problem.drop) return;
        badNames.add(cls);
      }
      const ids = classAssign[1].split(',').map(s => s.trim()).filter(Boolean);
      for (const id of ids) addClass(id, cls);
      if (!classLines.has(cls)) { classLines.set(cls, at); classTexts.set(cls, line); }
      return;
    }
    // Starts like a class line but doesn't fit `class id1,id2 name`.
    if (/^class\b/.test(line)) {
      errors.push({ line: at, text: line, severity: 'error',
        message: 'malformed class line — expected `class id1,id2 name`' });
      return;
    }

    // Edge?
    const edge = parseEdgeLine(line);
    if (edge) {
      const left = parseNodeExpr(edge.leftExpr);
      const right = parseNodeExpr(edge.rightExpr);
      if (left && right) {
        checkSort(left, at, line);
        checkSort(right, at, line);
        addNode(left, at, line);
        addNode(right, at, line);
        // The label is the relation name and a selector. A reserved one is
        // dropped (the edge stays, unlabeled); an unselectable one stays as the
        // edge's text and is reported.
        let label = edge.label;
        if (label != null) {
          const problem = nameProblem(label, 'edge label');
          if (problem) {
            errors.push({ line: at, text: line, severity: 'error', message: problem.message });
            if (problem.drop) label = null;
            else badNames.add(label);
          }
        }
        const key = `${left.id} ${right.id} ${label ?? ''}`;
        if (edgeSeen.has(key)) {
          errors.push({ line: at, text: line, severity: 'warning',
            message: `duplicate edge ${left.id} -> ${right.id}${label != null ? ' : ' + label : ''} ` +
              `(first on line ${edgeSeen.get(key)}); both are drawn` });
        } else {
          edgeSeen.set(key, at);
        }
        if (label != null && !labelLines.has(label)) labelLines.set(label, at);
        edges.push({ source: left.id, target: right.id, kind: edge.kind, label, line: at });
        for (const [side, n] of [['source', left], ['target', right]]) {
          if (n.trailing) errors.push({ line: at, text: line, severity: 'error',
            message: `unexpected text after ${side} node "${n.id}": ${n.trailing}${typographyHint(line)}` });
        }
      } else {
        errors.push({ line: at, text: line, severity: 'error',
          message: `malformed edge — could not read a node id on one side of the arrow${typographyHint(line)}` });
      }
      return;
    }

    // Standalone node declaration (e.g. `A[Alice]:::Person;`)
    const stripped = line.replace(/;$/, '').trim();
    const node = parseNodeExpr(stripped);
    if (node) {
      checkSort(node, at, line);
      addNode(node, at, line);
      if (node.trailing) errors.push({ line: at, text: line, severity: 'error',
        message: `unexpected text after node "${node.id}": ${node.trailing}${typographyHint(line)}` });
      return;
    }

    // Nothing recognized this line.
    errors.push({ line: at, text: line, severity: 'error',
      message: `unrecognized line${typographyHint(line)}` });
  });

  // ── whole-graph checks ──────────────────────────────────────────────────────
  // These need every line read first: a class may be assigned before the node
  // it names is declared, and a collision is between two lines.

  // A class line naming something no line declares. relationalize.js would emit
  // a tuple over an atom that does not exist, which the engine rejects deep in
  // layout generation with no line to point at.
  for (const [id, cs] of [...classesPerNode]) {
    if (nodes.has(id)) continue;
    for (const c of cs) {
      errors.push({ line: classLines.get(c), text: classTexts.get(c), severity: 'error',
        message: `class "${c}" names "${id}", which no edge or node line declares; ` +
          `it was dropped from the class` });
    }
    classesPerNode.delete(id);
  }

  // One namespace, three kinds of name. The engine resolves a bare name to one
  // thing, so a spelling used for two of them is not "both": relationalize.js
  // would hand the engine two relations under one name, and hiding the class's
  // relation by name would hide the edges too. The class is the one dropped,
  // because it is the one whose hiding does the damage; a sort keeps its type.
  const dropClass = (c) => {
    for (const [id, cs] of classesPerNode) {
      cs.delete(c);
      if (cs.size === 0) classesPerNode.delete(id);
    }
    classLines.delete(c);
    classTexts.delete(c);
  };
  const sortLines = new Map();
  for (const n of nodes.values()) {
    if (n.type != null && !sortLines.has(n.type)) sortLines.set(n.type, n.typeLine);
  }
  for (const [c, at] of [...classLines]) {
    const text = classTexts.get(c);
    if (labelLines.has(c)) {
      errors.push({ line: at, text, severity: 'error',
        message: `"${c}" is both an edge label (line ${labelLines.get(c)}) and a class; ` +
          `a selector can only reach one of them, so the class was dropped. Rename one of them` });
      dropClass(c);
    } else if (sortLines.has(c)) {
      errors.push({ line: at, text, severity: 'error',
        message: `"${c}" is both a sort (line ${sortLines.get(c)}) and a class; ` +
          `a selector can only reach one of them, so the class was dropped. Rename one of them` });
      dropClass(c);
    }
  }
  for (const [s, at] of sortLines) {
    if (!labelLines.has(s)) continue;
    errors.push({ line: at, text: rawLines[at - 1] ? stripComments(rawLines[at - 1]).trim() : '',
      severity: 'error',
      message: `"${s}" is both an edge label (line ${labelLines.get(s)}) and a sort; ` +
        `a selector named ${s} will reach one of them, not both. Rename one of them` });
  }

  return { nodes, edges, classesPerNode, errors, labelLines, classLines, badNames };
}
