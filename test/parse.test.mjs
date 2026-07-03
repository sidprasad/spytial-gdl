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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
