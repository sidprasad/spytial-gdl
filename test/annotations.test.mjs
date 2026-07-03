// Tests for the inline-annotation parser (annotations.js). Run with `npm test`
// (plain Node, no framework). Covers the single-line forms, multi-line (wrapped)
// annotations, the `%%`-guarded variants, and the error channel — malformed,
// unknown, and unterminated annotations all report a line number.

import { extractAnnotations } from '../src/annotations.js';
import { parseGraph } from '../src/parse.js';
import { serializeToSpytialGdl } from '../src/serialize.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}
const j = (v) => JSON.stringify(v);

// ── single-line (regression: behaviour must be unchanged) ────────────────────
{
  const r = extractAnnotations('A -> B\n@orientation(selector=left, directions=[left])');
  check('single-line: no errors', r.errors.length === 0, j(r.errors));
  check('single-line: compiles to a constraint',
    r.specYaml === 'constraints:\n  - orientation: { selector: left, directions: [left] }\n', j(r.specYaml));
  check('single-line: graph line kept, annotation removed',
    r.source.trim() === 'A -> B', j(r.source));
  check('single-line: source stays line-aligned (annotation → blank placeholder)',
    r.source === 'A -> B\n', j(r.source));
  check('single-line: annotationLines holds the verbatim line',
    r.annotationLines.length === 1 &&
    r.annotationLines[0] === '@orientation(selector=left, directions=[left])', j(r.annotationLines));
}

{
  const r = extractAnnotations("@atomColor(selector=Person, value='#cfe8d8')");
  check('single-line directive compiles under directives:',
    r.specYaml === "directives:\n  - atomColor: { selector: Person, value: '#cfe8d8' }\n", j(r.specYaml));
}

// ── multi-line: same result as the single-line equivalent ────────────────────
{
  const single = extractAnnotations('@orientation(selector=left, directions=[left])');
  const multi = extractAnnotations(
    '@orientation(\n  selector=left,\n  directions=[left]\n)'
  );
  check('multi-line: no errors', multi.errors.length === 0, j(multi.errors));
  check('multi-line: compiles identically to the one-line form',
    multi.specYaml === single.specYaml, `\n one: ${j(single.specYaml)}\n many: ${j(multi.specYaml)}`);
  check('multi-line: annotationLines preserves the wrapped block verbatim',
    multi.annotationLines.length === 1 && multi.annotationLines[0].includes('\n'), j(multi.annotationLines));
  check('multi-line: nothing leaks into the graph source',
    multi.source.trim() === '', j(multi.source));
}

// trailing comma before the close paren
{
  const r = extractAnnotations('@orientation(\n  selector=left,\n  directions=[left],\n)');
  check('multi-line: trailing comma tolerated',
    r.errors.length === 0 &&
    r.specYaml === 'constraints:\n  - orientation: { selector: left, directions: [left] }\n', j(r));
}

// a list value that itself spans lines
{
  const r = extractAnnotations('@orientation(selector=x, directions=[\n  below,\n  left\n])');
  check('multi-line: a list value can wrap',
    r.errors.length === 0 &&
    r.specYaml === 'constraints:\n  - orientation: { selector: x, directions: [below, left] }\n', j(r));
}

// ── %% mermaid-comment guard (degrades in a vanilla Mermaid renderer) ─────────
{
  const bare = extractAnnotations('@group(selector=Person, name=People)');
  const guarded = extractAnnotations('%%@group(selector=Person, name=People)');
  check('guarded single line parses like the bare form',
    guarded.errors.length === 0 && guarded.specYaml === bare.specYaml, j(guarded));
}
{
  const bare = extractAnnotations('@group(selector=Person, name=People)');
  const guarded = extractAnnotations('%%@group(\n%%  selector=Person,\n%%  name=People,\n%%)');
  check('guarded multi-line block parses like the bare form',
    guarded.errors.length === 0 && guarded.specYaml === bare.specYaml,
    `\n bare:    ${j(bare.specYaml)}\n guarded: ${j(guarded.specYaml)}\n errs: ${j(guarded.errors)}`);
}

// ── trailing `;` and inline `%%` comment after the close paren ───────────────
{
  const semi = extractAnnotations('@orientation(selector=left, directions=[left]);');
  check('trailing ; tolerated', semi.errors.length === 0, j(semi.errors));
  const cmt = extractAnnotations('@orientation(selector=left, directions=[left]) %% left child');
  check('trailing %% comment tolerated after )', cmt.errors.length === 0, j(cmt.errors));
}

// ── quoted values keep their commas / parens ─────────────────────────────────
{
  const r = extractAnnotations("@atomColor(selector=Person, value='rgb(1, 2, 3)')");
  check('quoted value keeps its inner commas and parens',
    r.errors.length === 0 && r.specYaml.includes("value: 'rgb(1, 2, 3)'"), j(r.specYaml));
}

// ── a backslash-escaped quote inside a string doesn't break the scanner ───────
{
  const r = extractAnnotations("@atomColor(selector=x, value='it\\'s a test')");
  check('escaped quote inside a string parses without an unterminated error',
    r.errors.length === 0 && /atomColor/.test(r.specYaml), j(r));
}

// ── flag is special-cased to a scalar payload ────────────────────────────────
{
  const r = extractAnnotations('@flag(name=hideDisconnected)');
  check('flag compiles to a scalar directive',
    r.specYaml === 'directives:\n  - flag: hideDisconnected\n', j(r.specYaml));
}

// ── graph lines and annotations interleave cleanly ───────────────────────────
{
  const src = [
    'A -> B : left',
    'A -> C : right',
    '',
    '@orientation(',
    '  selector=left,',
    '  directions=[left]',
    ')',
    'B -> D',
    '@orientation(selector=right, directions=[right])',
  ].join('\n');
  const r = extractAnnotations(src);
  const g = parseGraph(r.source);
  check('interleaved: both annotations compiled', r.errors.length === 0 &&
    (r.specYaml.match(/orientation:/g) || []).length === 2, j(r));
  check('interleaved: all three edges survive in the graph',
    g.edges.length === 3, `edges=${g.edges.length}`);
  check('interleaved: no @ leaked into the graph source', !r.source.includes('@'), j(r.source));
}

// ── error channel ────────────────────────────────────────────────────────────
{
  const r = extractAnnotations('A -> B\n@nonsense(selector=x)');
  check('unknown annotation → one error on the right line',
    r.errors.length === 1 && r.errors[0].line === 2 && /unknown annotation "@nonsense"/.test(r.errors[0].message), j(r.errors));
  check('unknown annotation → not compiled', r.specYaml === '', j(r.specYaml));
}
{
  const r = extractAnnotations('@orientation(selector left)');   // missing `=`
  check('malformed args (no =) → error', r.errors.length === 1 && /key=value/.test(r.errors[0].message), j(r.errors));
}
{
  const r = extractAnnotations('@orientation(selector=x directions=[left])'); // missing comma
  check('malformed args (missing comma) → error',
    r.errors.length === 1 && /missing comma/.test(r.errors[0].message), j(r.errors));
}
{
  const r = extractAnnotations('@orientation');       // no parens at all
  check('@name with no parens → malformed error',
    r.errors.length === 1 && /expected @name\(\.\.\.\)/.test(r.errors[0].message), j(r.errors));
}
{
  // Unterminated: the open paren never closes. It must be reported (not silently
  // dropped), and the swallowed lines must NOT reach the graph parser as garbage.
  const r = extractAnnotations('A -> B\n@orientation(\n  selector=left\nB -> C');
  check('unterminated annotation → error at its start line',
    r.errors.length === 1 && r.errors[0].line === 2 && /unterminated/.test(r.errors[0].message), j(r.errors));
  check('unterminated annotation → its argument text does not leak into the graph',
    !r.source.includes('selector=left'), j(r.source));
  check('unterminated annotation → the valid graph line before it survives',
    r.source.split('\n')[0] === 'A -> B', j(r.source));
}

// ── line alignment: removing annotations must not shift graph line numbers ────
{
  // `!!!` is line 3 of the original. The annotation on line 2 is lifted out, but
  // the graph parser must still see `!!!` as line 3 (blank placeholder), so the
  // two error lists index the same source the author is looking at.
  const src = 'A -> B\n@orientation(selector=left, directions=[left])\n!!!';
  const { source } = extractAnnotations(src);
  const g = parseGraph(source);
  check('alignment: bad graph line keeps its original number (3)',
    g.errors.length === 1 && g.errors[0].line === 3, j(g.errors));
}
{
  // Same, but with a multi-line annotation: 4 consumed lines → the graph line
  // after it must be numbered as though those lines were still present.
  const src = 'A -> B\n@orientation(\n  selector=left,\n  directions=[left]\n)\nclass';
  const g = parseGraph(extractAnnotations(src).source);
  check('alignment: line after a wrapped annotation keeps its number (6)',
    g.errors.some(e => e.line === 6 && /malformed class/.test(e.message)), j(g.errors));
}

// ── round-trip: a multi-line annotation survives serialize ───────────────────
{
  const src = 'A -> B : left\n\n@orientation(\n  selector=left,\n  directions=[left]\n)';
  const { source, annotationLines } = extractAnnotations(src);
  const g = parseGraph(source);
  const atoms = [...g.nodes.values()].map(n => ({ id: n.id, type: n.type || '', label: n.label || n.id }));
  const relations = [{ id: 'r', name: 'left', types: ['Node', 'Node'],
    tuples: g.edges.map(e => ({ atoms: [e.source, e.target], types: ['', ''] })) }];
  const out = serializeToSpytialGdl({ atoms, relations }, { annotations: annotationLines });
  check('round-trip: the wrapped annotation is re-appended verbatim',
    out.includes('@orientation(\n  selector=left,\n  directions=[left]\n)'), `\n${out}`);
  check('round-trip: re-extracting gives the same compiled spec',
    extractAnnotations(out).specYaml === extractAnnotations(src).specYaml, `\n${out}`);
}

// ── empty / whitespace input ─────────────────────────────────────────────────
{
  const r = extractAnnotations('');
  check('empty input → nothing to do',
    r.errors.length === 0 && r.specYaml === '' && r.annotationLines.length === 0, j(r));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
