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
  const r = extractAnnotations("@atomStyle(selector=Person, borderStyle(color='#cfe8d8'))");
  check('single-line directive compiles under directives:',
    r.specYaml === "directives:\n  - atomStyle: { selector: Person, borderStyle: { color: '#cfe8d8' } }\n", j(r.specYaml));
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
// Also a regression on block parsing: `value='rgb(1, 2, 3)'` has an `=` before
// its `(`, so it must stay a scalar and never be read as a nested block.
{
  const r = extractAnnotations("@atomStyle(selector=Person, fillStyle(color='rgb(1, 2, 3)'))");
  check('quoted value keeps its inner commas and parens',
    r.errors.length === 0 && r.specYaml.includes("color: 'rgb(1, 2, 3)'"), j(r.specYaml));
}
{
  const r = extractAnnotations("@size(selector=Person, value='rgb(1, 2, 3)')");
  check('a parenthesised value is a scalar, not a block',
    r.errors.length === 0 && r.specYaml === "directives:\n  - size: { selector: Person, value: 'rgb(1, 2, 3)' }\n", j(r));
}

// ── a backslash-escaped quote inside a string doesn't break the scanner ───────
{
  const r = extractAnnotations("@atomStyle(selector=x, borderStyle(color='it\\'s a test'))");
  check('escaped quote inside a string parses without an unterminated error',
    r.errors.length === 0 && /atomStyle/.test(r.specYaml), j(r));
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

// ── mismatched bracket types are rejected, not silently accepted ─────────────
{
  const r = extractAnnotations('@orientation(selector=[left}, directions=[left])');
  check('mismatched brackets → reported as an error',
    r.errors.length === 1 && r.errors[0].line === 1, j(r.errors));
  check('mismatched brackets → not compiled to a bogus selector',
    r.specYaml === '' && !r.specYaml.includes('[left}'), j(r.specYaml));
}
{
  // Regression: correctly matched (and quoted) brackets still parse cleanly.
  const r = extractAnnotations("@group(selector='{p: Person | some p.x}', name=[a, [b, c]])");
  check('type-matched + quoted brackets still parse',
    r.errors.length === 0 && /group/.test(r.specYaml), j(r));
}

// ── style blocks (spytial-core 3.x) ──────────────────────────────────────────
// Blocks are nested calls: `lineStyle(color=…)` as an argument.
const body = (src) => extractAnnotations(src).specYaml.trim().split('\n')[1].trim().replace(/^- /, '');

{
  const r = extractAnnotations(
    '@edgeStyle(field=next, lineStyle(color=crimson, pattern=dashed, weight=2), textStyle(size=small, color=gray), showLabel=true)'
  );
  check('edgeStyle: blocks nest, scalars stay flat',
    r.errors.length === 0 && r.specYaml ===
    'directives:\n  - edgeStyle: { field: next, lineStyle: { color: crimson, pattern: dashed, weight: 2 },' +
    ' textStyle: { size: small, color: gray }, showLabel: true }\n', j(r));
}
{
  const r = extractAnnotations(
    "@atomStyle(selector=Person, borderStyle(color=steelblue, width=2), fillStyle(color='#eef6ff'), textStyle(size=large))"
  );
  check('atomStyle: border / fill / text are separate blocks',
    r.errors.length === 0 && r.specYaml ===
    "directives:\n  - atomStyle: { selector: Person, borderStyle: { color: steelblue, width: 2 }," +
    " fillStyle: { color: '#eef6ff' }, textStyle: { size: large } }\n", j(r));
}
{
  check('inferredEdge takes the shared lineStyle block',
    body("@inferredEdge(name=parent, selector='~children', lineStyle(color=gray, pattern=dotted))") ===
    'inferredEdge: { name: parent, selector: ~children, lineStyle: { color: gray, pattern: dotted } }');
  check('attribute takes the shared textStyle block',
    body('@attribute(field=weight, textStyle(size=small))') ===
    'attribute: { field: weight, textStyle: { size: small } }');
  check('tag takes the shared textStyle block',
    body('@tag(toTag=Node, name=id, textStyle(size=small, color=gray))') ===
    'tag: { toTag: Node, name: id, textStyle: { size: small, color: gray } }');
}
{
  // Depth 2: addEdge is a block that itself contains blocks.
  check('group: addEdge block nests lineStyle, alongside the group label textStyle',
    body('@group(selector=team, name=Team, addEdge(points=togroup, lineStyle(pattern=dashed)), textStyle(color=navy))') ===
    'group: { selector: team, name: Team, addEdge: { points: togroup, lineStyle: { pattern: dashed } }, textStyle: { color: navy } }');
  check('group: the bare string addEdge still works',
    body('@group(selector=team, name=Team, addEdge=togroup)') ===
    'group: { selector: team, name: Team, addEdge: togroup }');
}

// Blocks compose with everything the scanner already did: wrapping, the %% guard,
// trailing commas, and a trailing comment all track paren depth.
{
  const one = extractAnnotations('@edgeStyle(field=next, lineStyle(color=crimson, pattern=dashed))');
  const forms = {
    wrapped: '@edgeStyle(\n  field=next,\n  lineStyle(color=crimson, pattern=dashed)\n)',
    'wrapped + trailing comma': '@edgeStyle(\n  field=next,\n  lineStyle(color=crimson, pattern=dashed),\n)',
    guarded: '%%@edgeStyle(\n%%  field=next,\n%%  lineStyle(color=crimson, pattern=dashed),\n%%)',
    'trailing ; and comment': '@edgeStyle(field=next, lineStyle(color=crimson, pattern=dashed)); %% the spine',
  };
  for (const [label, src] of Object.entries(forms)) {
    const r = extractAnnotations(src);
    check(`blocks compose with: ${label}`,
      r.errors.length === 0 && r.specYaml === one.specYaml, j(r));
  }
}

// ── legacy desugar (core 2.x forms still compile, onto the 3.x blocks) ───────
{
  check('atomColor → atomStyle, value → borderStyle.color (outline-preserving)',
    body("@atomColor(selector=Person, value='#cfe8d8')") ===
    "atomStyle: { selector: Person, borderStyle: { color: '#cfe8d8' } }");
  check('edgeColor → edgeStyle, value/style → lineStyle.color/pattern',
    body("@edgeColor(field=f, value=red, style=dashed)") ===
    'edgeStyle: { field: f, lineStyle: { color: red, pattern: dashed } }');
  check("edgeColor's style is normalized like core's normalizeEdgeStyle (trim + lowercase)",
    body("@edgeColor(field=f, value=red, style=' Dashed ')") ===
    'edgeStyle: { field: f, lineStyle: { color: red, pattern: dashed } }');
  check('edgeColor carries selector / filter / showLabel / hidden across',
    body("@edgeColor(field=f, selector=S, filter=T, value=red, showLabel=true, hidden=false)") ===
    'edgeStyle: { field: f, selector: S, filter: T, lineStyle: { color: red }, showLabel: true, hidden: false }');
  check('inferredEdge inline color/style → lineStyle',
    body("@inferredEdge(name=p, selector='~c', color=gray, style=dotted)") ===
    'inferredEdge: { name: p, selector: ~c, lineStyle: { color: gray, pattern: dotted } }');
}
{
  // A legacy annotation and its modern equivalent must compile identically —
  // that's what makes the desugar a rewrite rather than a second code path.
  check('legacy and modern forms compile to byte-identical YAML',
    extractAnnotations("@atomColor(selector=P, value='#fff')").specYaml ===
    extractAnnotations("@atomStyle(selector=P, borderStyle(color='#fff'))").specYaml);
}
{
  // Lenient on purpose: a 2.x-era spec must keep rendering, so an invalid legacy
  // style drops that one leaf rather than failing the annotation. (core does the
  // same, silently.) The new block form is strict — see below.
  const r = extractAnnotations('@edgeColor(field=f, value=red, style=wavy)');
  check('an invalid legacy style drops the leaf and still compiles',
    r.errors.length === 0 && body('@edgeColor(field=f, value=red, style=wavy)') ===
    'edgeStyle: { field: f, lineStyle: { color: red } }', j(r));
  const w = extractAnnotations('@edgeColor(field=f, value=red, weight=0)');
  check('a non-positive legacy weight drops the leaf and still compiles',
    w.errors.length === 0 && body('@edgeColor(field=f, value=red, weight=0)') ===
    'edgeStyle: { field: f, lineStyle: { color: red } }', j(w));
}
{
  // A quoted legacy weight was numeric by the time 2.x core saw it (the string
  // 2 emits as bare YAML), so it must survive the desugar as a number.
  check('a quoted legacy weight coerces to a number, not a drop',
    body("@edgeColor(field=f, value=red, weight='2')") ===
    'edgeStyle: { field: f, lineStyle: { color: red, weight: 2 } }');
  check('inferredEdge: a quoted weight coerces too',
    body("@inferredEdge(name=p, selector=s, weight='2.5')") ===
    'inferredEdge: { name: p, selector: s, lineStyle: { weight: 2.5 } }');
  check('a non-numeric quoted weight still drops the leaf',
    body("@edgeColor(field=f, value=red, weight='abc')") ===
    'edgeStyle: { field: f, lineStyle: { color: red } }');
}
{
  // atomStyle reads an absent selector as *every atom*, so a selectorless
  // atomColor must not desugar into a whole-graph repaint. core drops it; we say why.
  const r = extractAnnotations("@atomColor(value='#fff')");
  check('a selectorless atomColor is an error, not a whole-graph repaint',
    r.errors.length === 1 && /atomColor requires a selector/.test(r.errors[0].message), j(r.errors));
  check('a selectorless atomColor compiles nothing', r.specYaml === '', j(r.specYaml));
}
{
  const r = extractAnnotations("@inferredEdge(name=p, selector=s, color=gray, lineStyle(color=red))");
  check('inferredEdge: inline style + a lineStyle block is a conflict',
    r.errors.length === 1 && /conflicts with the lineStyle block/.test(r.errors[0].message), j(r.errors));
}

// ── strict validation of the block vocabulary ────────────────────────────────
// core's parsers silently drop an invalid leaf, so a typo would render unstyled
// with no diagnostic anywhere. Each of these must be one error, compiling nothing.
{
  const bad = {
    'bad line pattern': '@edgeStyle(field=f, lineStyle(pattern=dashd))',
    'bad text size': '@atomStyle(selector=S, textStyle(size=huge))',
    'bad addEdge points': '@group(selector=g, name=G, addEdge(points=both))',
    'zero weight': '@edgeStyle(field=f, lineStyle(weight=0))',
    'negative border width': '@atomStyle(selector=S, borderStyle(width=-1))',
    'unknown key in a block': '@edgeStyle(field=f, lineStyle(bogus=1))',
    'unknown block': '@edgeStyle(field=f, bogusBlock(x=1))',
    'non-string color': '@atomStyle(selector=S, fillStyle(color=3))',
  };
  for (const [label, src] of Object.entries(bad)) {
    const r = extractAnnotations(src);
    check(`strict: ${label} → one error, nothing compiled`,
      r.errors.length === 1 && r.specYaml === '', j(r));
  }
}
{
  // The error has to name the line, like every other annotation error.
  const r = extractAnnotations('A -> B\n@edgeStyle(field=f, lineStyle(pattern=dashd))');
  check('a block error reports the line it is on',
    r.errors.length === 1 && r.errors[0].line === 2 &&
    /invalid lineStyle.pattern "dashd"/.test(r.errors[0].message), j(r.errors));
}

// ── round-trip: blocks and legacy forms survive serialize verbatim ───────────
{
  // specYaml is a lossy compiled form, so the *source* is what round-trips —
  // including a legacy annotation, which stays legacy in the text it hands back.
  const src = "A -> B\n\n@edgeStyle(\n  field=_,\n  lineStyle(color=crimson, pattern=dashed)\n)\n@atomColor(selector=x, value='#fff')";
  const { source, annotationLines } = extractAnnotations(src);
  const g = parseGraph(source);
  const atoms = [...g.nodes.values()].map(n => ({ id: n.id, type: n.type || '', label: n.label || n.id }));
  const relations = [{ id: 'r', name: '_', types: ['Node', 'Node'],
    tuples: g.edges.map(e => ({ atoms: [e.source, e.target], types: ['', ''] })) }];
  const out = serializeToSpytialGdl({ atoms, relations }, { annotations: annotationLines });
  check('round-trip: a wrapped block annotation is re-appended verbatim',
    out.includes('@edgeStyle(\n  field=_,\n  lineStyle(color=crimson, pattern=dashed)\n)'), `\n${out}`);
  check('round-trip: a legacy annotation is handed back as written, not rewritten',
    out.includes("@atomColor(selector=x, value='#fff')"), `\n${out}`);
  check('round-trip: re-extracting gives the same compiled spec',
    extractAnnotations(out).specYaml === extractAnnotations(src).specYaml, `\n${out}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
