// Tests for the graph parser's error channel (parse.js). Run with `npm test`.
// parseGraph is best-effort: it renders what it can and reports the rest as
// { line, text, severity, message }. 'warning' = a tolerated-but-ignored Mermaid
// construct; 'error' = a line it genuinely couldn't read.

import { parseGraph } from '../src/parse.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}
const j = (v) => JSON.stringify(v);

// ── clean input reports nothing ──────────────────────────────────────────────
{
  const g = parseGraph('A -> B : left\nA -> C\nclass A,C team\nLonely');
  check('clean graph → no errors', g.errors.length === 0, j(g.errors));
  check('clean graph → edges + nodes intact', g.edges.length === 2 && g.nodes.size === 4, `edges=${g.edges.length} nodes=${g.nodes.size}`);
}

// ── tolerated-but-ignored Mermaid constructs → warnings ──────────────────────
{
  const g = parseGraph('graph TD\nA -> B');
  check('graph header → one warning', g.errors.length === 1 && g.errors[0].severity === 'warning', j(g.errors));
  check('graph header → reported on line 1, message says ignored',
    g.errors[0].line === 1 && /ignored/.test(g.errors[0].message), j(g.errors));
  check('graph header → the edge still parses (best-effort)', g.edges.length === 1, j(g.edges));
}
{
  const g = parseGraph('flowchart LR\nA --> B');
  check('flowchart header + mermaid arrow → warning only, edge kept',
    g.errors.length === 1 && g.errors[0].severity === 'warning' && g.edges.length === 1, j(g));
}
{
  const g = parseGraph('classDef foo fill:#fff\nA -> B');
  check('classDef → one warning, edge kept',
    g.errors.length === 1 && g.errors[0].severity === 'warning' && /classDef/i.test(g.errors[0].message) && g.edges.length === 1, j(g));
}

// ── genuine breakage → errors ────────────────────────────────────────────────
{
  const g = parseGraph('A ->');
  check('edge missing a side → error',
    g.errors.length === 1 && g.errors[0].severity === 'error' && /malformed edge/.test(g.errors[0].message), j(g.errors));
}
{
  const g = parseGraph('class A');           // no class name
  check('malformed class line → error',
    g.errors.length === 1 && g.errors[0].severity === 'error' && /malformed class/.test(g.errors[0].message), j(g.errors));
}
{
  const g = parseGraph('A -> B\n!!!');
  check('unrecognized junk line → error on line 2',
    g.errors.length === 1 && g.errors[0].severity === 'error' && g.errors[0].line === 2 && /unrecognized/.test(g.errors[0].message), j(g.errors));
  check('unrecognized junk → the good edge still parses', g.edges.length === 1, j(g.edges));
}

// ── line numbers survive blanks and comments ─────────────────────────────────
{
  const g = parseGraph('A -> B\n\n%% a comment\n@nonsense-is-handled-elsewhere\nclass');
  // line 4 `@...` is not a graph concern (annotations are lifted before parse);
  // here it reaches parseGraph verbatim and reads as an unrecognized line, and
  // line 5 `class` is a malformed class line. Blank/comment lines don't error.
  check('blank and comment lines never error',
    !g.errors.some((e) => /comment/.test(e.text) || e.text === ''), j(g.errors));
  check('malformed class reported on its real line (5)',
    g.errors.some((e) => e.line === 5 && /malformed class/.test(e.message)), j(g.errors));
}

// ── native + pasted forms coexist without false positives ────────────────────
{
  const g = parseGraph('A -->|left| B\nA[Alice]:::Person -> C\nclass A,C team');
  check('pipe label, label+sort, and class → no errors',
    g.errors.length === 0 && g.edges.length === 2, j(g));
}

// ── an arrow inside a quoted/bracketed label is not an edge delimiter ─────────
{
  const g = parseGraph('A["Node with --> arrow"] -> B');
  check('arrow inside a quoted label → edge splits at the real arrow',
    g.edges.length === 1 && g.edges[0].source === 'A' && g.edges[0].target === 'B', j(g.edges));
  check('arrow inside a quoted label → label survives, no error',
    g.nodes.get('A') && g.nodes.get('A').label === 'Node with --> arrow' && g.errors.length === 0, j(g));
}
{
  const g = parseGraph('A[x -> y] -> B[p -> q]');
  check('unquoted arrows inside brackets on both sides → one clean edge',
    g.edges.length === 1 && g.edges[0].source === 'A' && g.edges[0].target === 'B' && g.errors.length === 0, j(g));
}

// ── trailing garbage after a node is reported, not silently dropped ───────────
{
  const g = parseGraph('A[Alice]:::Person JUNK');
  check('trailing text after a node → one error',
    g.errors.length === 1 && g.errors[0].severity === 'error' && /unexpected text after node "A"/.test(g.errors[0].message), j(g.errors));
  check('trailing text → the node is still added (best-effort), label kept',
    g.nodes.has('A') && g.nodes.get('A').label === 'Alice' && g.nodes.get('A').type === 'Person', j([...g.nodes]));
}
{
  const g = parseGraph('A -> B[Bob] oops');
  check('trailing text after an edge target → reported on that side',
    g.edges.length === 1 && g.errors.some((e) => /unexpected text after target node "B"/.test(e.message)), j(g));
}
{
  // Regression: valid label/paren/brace node forms must NOT be flagged.
  const g = parseGraph('A[Alice Smith] -> B(Bob)\nC((deep)):::Role\nsolo[Just here]');
  check('valid label/paren/brace forms → no false-positive trailing errors',
    g.errors.length === 0, j(g.errors));
}

// ── names that can never be selected are said so, not passed through ─────────
// A label, sort or class is a selector, so it has to be a name the engine's
// query grammar can read back. The *shape* is checked here; what the grammar
// reserves is the engine's to say, and index.js asks it (see
// test/engine-diagnostics.test.mjs). Nothing below matches a reserved word.
{
  const g = parseGraph('A -> B : left child');
  check('label with a space → error naming the label, edge kept with its text',
    g.errors.length === 1 && g.errors[0].severity === 'error' && /"left child"/.test(g.errors[0].message) &&
    g.edges.length === 1 && g.edges[0].label === 'left child', j(g));
}
{
  const g = parseGraph('A -> B : rel ;');
  check('stray `;` after a label → error (the label would have been "rel ;")',
    g.errors.length === 1 && /"rel ;"/.test(g.errors[0].message), j(g.errors));
}
{
  const g = parseGraph('A -> B : left-child');
  check('hyphenated label → error (`-` is set difference in the query grammar)',
    g.errors.length === 1 && /hyphen/.test(g.errors[0].message), j(g.errors));
}
{
  const g = parseGraph('A -> B : 3');
  check('label starting with a digit → error', g.errors.length === 1, j(g.errors));
}
{
  const g = parseGraph('A -> B : _links\nC -> D : _');
  check('reserved `_`-prefixed labels → two errors, edges kept but unlabeled',
    g.errors.length === 2 && g.errors.every((e) => /reserved/.test(e.message)) &&
    g.edges.length === 2 && g.edges.every((e) => e.label === null), j(g));
}
{
  const g = parseGraph('A:::my-sort -> B\nclass B _hidden');
  check('hyphenated sort → error, sort kept for display',
    g.errors.some((e) => e.line === 1 && /sort "my-sort"/.test(e.message)) && g.nodes.get('A').type === 'my-sort', j(g));
  check('reserved class name → error, class line skipped',
    g.errors.some((e) => e.line === 2 && /class "_hidden" is reserved/.test(e.message)) && g.classesPerNode.size === 0, j(g));
}
{
  const g = parseGraph('A:::_x -> B');
  check('reserved sort → error, sort cleared so it cannot reach the engine',
    g.errors.length === 1 && g.nodes.get('A').type === null, j(g));
}
{
  const g = parseGraph('A -> B : team\nB -> C : team\nclass A team');
  check('a name used as both edge label and class → error on the class line',
    g.errors.length === 1 && g.errors[0].line === 3 && /both an edge label \(line 1\) and a class/.test(g.errors[0].message), j(g.errors));
  check('…and the class is dropped so hiding it by name cannot hide the edges',
    g.classesPerNode.size === 0 && g.edges.length === 2 && g.edges.every((e) => e.label === 'team'), j(g));
}
{
  const g = parseGraph('A:::team -> B\nclass B team');
  check('a name used as both sort and class → error, class dropped, sort kept',
    g.errors.length === 1 && g.errors[0].line === 2 && /both a sort \(line 1\) and a class/.test(g.errors[0].message) &&
    g.classesPerNode.size === 0 && g.nodes.get('A').type === 'team', j(g));
}
{
  const g = parseGraph('A -> B : Person\nC:::Person -> D');
  check('a name used as both edge label and sort → error on the sort\'s line, nothing dropped',
    g.errors.length === 1 && g.errors[0].line === 2 && /both an edge label \(line 1\) and a sort/.test(g.errors[0].message) &&
    g.edges[0].label === 'Person' && g.nodes.get('C').type === 'Person', j(g));
}
{
  const g = parseGraph('A -> B\nclass Z team\nclass A team');
  check('class member no line declares → error on the class line, member dropped, others kept',
    g.errors.length === 1 && g.errors[0].line === 2 && /names "Z"/.test(g.errors[0].message) &&
    !g.classesPerNode.has('Z') && g.classesPerNode.get('A').has('team'), j(g));
}

// ── legal but probably unintended → warnings ─────────────────────────────────
{
  const g = parseGraph('A[Alice] -> B\nA[Bob] -> C');
  check('a node labeled twice, differently → warning on the second, last wins',
    g.errors.length === 1 && g.errors[0].severity === 'warning' && g.errors[0].line === 2 &&
    /labeled "Alice" on line 1/.test(g.errors[0].message) && g.nodes.get('A').label === 'Bob', j(g));
}
{
  const g = parseGraph('A:::Person -> B\nA:::Company -> C\nA:::Company');
  check('a node given two sorts → one warning (a repeat of the same sort is not one)',
    g.errors.length === 1 && g.errors[0].severity === 'warning' && /sort Person on line 1/.test(g.errors[0].message) &&
    g.nodes.get('A').type === 'Company', j(g));
}
{
  const g = parseGraph('A -> B : x\nA -> B : x\nA -> B');
  check('the same edge written twice → warning on the repeat, both kept; a different label is not a repeat',
    g.errors.length === 1 && g.errors[0].severity === 'warning' && g.errors[0].line === 2 &&
    /first on line 1/.test(g.errors[0].message) && g.edges.length === 3, j(g));
}

// ── lines for later diagnostics ──────────────────────────────────────────────
{
  const g = parseGraph('A:::S -> B : x\n\nB -> C : y\nclass A,B team');
  check('edges and nodes carry their line; labels and classes their first line',
    g.edges[0].line === 1 && g.edges[1].line === 3 && g.nodes.get('C').line === 3 &&
    g.nodes.get('A').typeLine === 1 && g.labelLines.get('y') === 3 && g.classLines.get('team') === 4, j(g));
}

// ── `%%` inside a bracket is text, not a comment ─────────────────────────────
{
  const g = parseGraph('A["50%% off"] -> B %% real comment');
  check('%% inside a [label] is kept; the %% at depth 0 still starts a comment',
    g.errors.length === 0 && g.nodes.get('A').label === '50%% off' && g.edges.length === 1, j(g));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
