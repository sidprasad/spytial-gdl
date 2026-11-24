import { extractAnnotations } from './annotations.js';
import { parseGraph, stripComments } from './parse.js';
import { DEFAULT_RELATION, ALL_EDGES_RELATION } from './relationalize.js';
import { formatNode } from './serialize.js';

// Keep existing whitespace when accepting suggested rules from either editor.
export function appendSourceRules(source, rules) {
  const newline = source.match(/\r?\n/)?.[0] || '\n';
  const gap = /(?:^|\n)\s*@[A-Za-z]/.test(source) ? 1 : 2;
  const trailingLines = source.match(/(?:\r?\n[ \t]*)*$/)[0].split('\n').length - 1;
  const separator = source ? newline.repeat(Math.max(gap - trailingLines, source.endsWith('\n') ? 0 : 1)) : '';
  return source + separator + rules.join(newline);
}

const edgeKey = (source, target, label) => JSON.stringify([source, target, label]);

function graphSnapshot(value) {
  const atoms = new Map(value.atoms.map(atom => [atom.id, {
    id: atom.id, label: atom.label ?? atom.id, type: atom.type || '',
    classes: new Set(Array.isArray(atom.labels?.classes) ? atom.labels.classes : []),
  }]));
  const edges = new Map();
  for (const relation of value.relations) {
    if (relation.name === ALL_EDGES_RELATION) continue;
    const label = !relation.name || relation.name === DEFAULT_RELATION ? null : relation.name;
    for (const { atoms: endpoints } of relation.tuples) {
      if (endpoints.length !== 2) continue;
      const [source, target] = endpoints;
      const key = edgeKey(source, target, label);
      if (edges.has(key)) edges.get(key).count++;
      else edges.set(key, { source, target, label, count: 1 });
    }
  }
  return { atoms, edges };
}

const arrowLine = (source, target, label, arrow = '->') =>
  `${source} ${arrow} ${target}${label ? ` : ${label}` : ''}`;

function reviseEdge(raw, statement, left, right, label) {
  const { syntax } = statement;
  if (label !== statement.label && label == null) return arrowLine(left, right, label, syntax.kind);
  let code = stripComments(raw).trim();
  const replace = (start, length, text) => { code = code.slice(0, start) + text + code.slice(start + length); };
  const edits = [[0, syntax.leftExpr.length, left], [syntax.rightStart, syntax.rightExpr.length, right]];
  if (label !== statement.label) {
    if (syntax.labelStart !== undefined) {
      const quote = syntax.quotedLabel || '';
      edits.push([syntax.labelStart, syntax.rawLabel.length, `${quote}${label}${quote}`]);
    } else {
      edits.push([code.length, 0, ` : ${label}`]);
    }
  }
  for (const edit of edits.sort((a, b) => b[0] - a[0])) replace(...edit);
  return code;
}

function editLine(raw, replacement) {
  const uncommented = stripComments(raw);
  const code = uncommented.trimEnd();
  const indent = code.slice(0, code.length - code.trimStart().length);
  if (replacement) return indent + replacement + raw.slice(code.length);
  // An inline comment becomes a standalone comment when its code is deleted.
  if (uncommented === raw) return '';
  const comment = raw.slice(uncommented.length);
  // A bare %%{ is only an opener when it occupies the whole line.
  return indent + (comment.trim() === '%%{' ? comment.replace('%%{', '%% {') : comment);
}

const parseSource = (source, options) => parseGraph(extractAnnotations(source).source, options);

// Keep a live copy of the authored source. Compare snapshots from core so its
// initial normalization (for example deduplicating edges) never edits the text.
export function trackEditableSource(source, initialValue) {
  let previous = graphSnapshot(initialValue);
  return value => {
    const current = graphSnapshot(value);
    source = patchSource(source, previous, current);
    previous = current;
    return source;
  };
}

function patchSource(source, before, after) {
  const removed = new Map();
  const added = new Map();
  const deletedAtoms = new Set([...before.atoms.keys()].filter(id => !after.atoms.has(id)));
  const changedAtoms = new Set();
  const affected = new Set();
  const removedClasses = new Map();
  const newClasses = new Map();

  for (const [id, atom] of after.atoms) {
    const old = before.atoms.get(id);
    if (!old) affected.add(id);
    else if (old.label !== atom.label || old.type !== atom.type) {
      changedAtoms.add(id);
      affected.add(id);
    }
    for (const name of atom.classes) {
      if (old?.classes.has(name)) continue;
      if (!newClasses.has(name)) newClasses.set(name, []);
      newClasses.get(name).push(id);
    }
    for (const name of old?.classes || []) {
      if (atom.classes.has(name)) continue;
      if (!removedClasses.has(name)) removedClasses.set(name, new Set());
      removedClasses.get(name).add(id);
    }
  }
  for (const [key, edge] of before.edges) {
    const remaining = after.edges.get(key)?.count || 0;
    if (edge.count > remaining) removed.set(key, remaining ? edge.count - remaining : Infinity);
  }
  for (const [key, edge] of after.edges) {
    const count = edge.count - (before.edges.get(key)?.count || 0);
    if (count > 0) added.set(key, { ...edge, count });
  }
  if (!(deletedAtoms.size || affected.size || removed.size || added.size || removedClasses.size || newClasses.size)) return source;

  const lines = source.split(/(?<=\n)/);
  const statements = [];
  parseSource(source, { onStatement: (line, statement) => statements.push([line - 1, statement]) });
  const anchor = statements.at(-1)?.[0] ?? -1;

  // A rename or reconnection changes one tuple into another. Update its line
  // in place when the matching old and new edges are unambiguous.
  function replacementEdge(key, edge) {
    if (removed.size !== 1 || added.size !== 1 || after.edges.has(key)) return null;
    const [newKey, next] = added.entries().next().value;
    if (next.count !== 1 || deletedAtoms.has(edge.source) || deletedAtoms.has(edge.target)) return null;
    const sameSource = next.source === edge.source, sameTarget = next.target === edge.target;
    if (!(sameSource && sameTarget) && !(next.label === edge.label && (sameSource || sameTarget))) return null;
    added.delete(newKey);
    // Core removes an entire duplicate tuple. Keep only one source line for the replacement.
    return next;
  }

  for (const [index, statement] of statements.reverse()) {
    const raw = lines[index];
    if (statement.kind === 'class') {
      const ids = statement.ids.filter(id => !deletedAtoms.has(id) && !removedClasses.get(statement.name)?.has(id));
      if (ids.length !== statement.ids.length) lines[index] = editLine(raw, ids.length ? `class ${ids.join(',')} ${statement.name}` : '');
    } else if (statement.kind === 'node') {
      const { id } = statement.node;
      if (deletedAtoms.has(id)) lines[index] = editLine(raw, '');
      else if (changedAtoms.has(id)) lines[index] = editLine(raw, formatNode(after.atoms.get(id)));
    } else {
      const { left, right, label, syntax: { leftExpr, rightExpr } } = statement;
      const key = edgeKey(left.id, right.id, label || null);
      const count = removed.get(key);
      const deleting = deletedAtoms.has(left.id) || deletedAtoms.has(right.id);
      if (count || deleting) {
        const next = !deleting && replacementEdge(key, before.edges.get(key));
        if (count === 1) removed.delete(key);
        else if (count) removed.set(key, count - 1);
        affected.add(left.id).add(right.id);
        lines[index] = editLine(raw, next ? reviseEdge(raw, statement,
          next.source === left.id && !changedAtoms.has(left.id) ? leftExpr : formatNode(after.atoms.get(next.source)),
          next.target === right.id && !changedAtoms.has(right.id) ? rightExpr : formatNode(after.atoms.get(next.target)),
          next.label,
        ) : '');
      } else if (changedAtoms.has(left.id) || changedAtoms.has(right.id)) {
        lines[index] = editLine(raw, reviseEdge(raw, statement,
          changedAtoms.has(left.id) ? formatNode(after.atoms.get(left.id)) : leftExpr,
          changedAtoms.has(right.id) ? formatNode(after.atoms.get(right.id)) : rightExpr,
          label,
        ));
      }
    }
  }

  // An edge can be the only declaration of a surviving node or its label/type.
  const { nodes } = parseSource(lines.join(''));
  const additions = [];
  for (const id of affected) {
    const atom = after.atoms.get(id);
    const node = nodes.get(id);
    if (atom && (!node || (node.label ?? id) !== atom.label || (node.type ?? '') !== atom.type)) {
      additions.push(formatNode(atom));
    }
  }
  for (const edge of added.values()) {
    for (let i = 0; i < edge.count; i++) additions.push(arrowLine(edge.source, edge.target, edge.label));
  }
  for (const [name, ids] of newClasses) additions.push(`class ${ids.join(',')} ${name}`);
  if (!additions.length) return lines.join('');

  // Insert next to the graph statements, ahead of any trailing rules/comments.
  const newline = source.match(/\r?\n/)?.[0] || '\n';
  const head = lines.slice(0, anchor + 1).join('');
  const tail = lines.slice(anchor + 1).join('');
  return head + (head && !head.endsWith('\n') ? newline : '') + additions.join(newline) +
    (tail || source.endsWith('\n') ? newline : '') + tail;
}
