// Engine diagnostics: what spytial-gdl reports about a diagram once the engine
// has seen it, checked against the engine that is installed.
//
//   npm run test:diagnostics
//
// Everything in diagnostics.js rests on two kinds of claim about spytial-core:
// that a generateLayout() result carries `warnings` and `selectorErrors` in a
// shape we can read by field, and that asking the evaluator to resolve a bare
// name tells us whether the query grammar accepts it. Neither is stated in the
// schema, so neither can be checked by the generator. Both are asserted here
// against the installed engine, by name, so a release that moves a field or
// changes what a name resolves to fails a build rather than turning a warning
// back into silence.
//
// The name checks are deliberately written as parity, not as a list: for each
// candidate label we ask the evaluator directly what it thinks, then assert
// that spytial-gdl reports exactly the ones the evaluator refused. Which words
// the grammar reserves is the engine's business and moves between releases;
// this suite only requires that we agree with whatever it says today.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  compileSpytialGdl, solveSpytialGdl, extractAnnotations,
  sourceDiagnostics, engineDiagnostics, attributeLine, checkRulesWithEngine, checkNamesWithEngine,
} from '../src/index.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.error(`FAIL    ${name}  ${extra}`); }
}
const j = (v) => JSON.stringify(v, null, 2);

// The engine is a devDependency for exactly this. A suite that skips itself
// when its dependency is missing never runs in CI, which is the failure mode
// it exists to prevent, so a missing install is an error with instructions.
let core;
try {
  core = await import('spytial-core');
} catch (err) {
  console.error('FAIL  spytial-core is not installed, so nothing here can run.');
  console.error('      Run `npm install` first — it is a devDependency for exactly this.');
  console.error(`      (${err.message})`);
  process.exit(1);
}
let installedLanguage;
{
  const resolve_ = createRequire(import.meta.url);
  const schema = JSON.parse(readFileSync(resolve_.resolve('spytial-core/spec.schema.json'), 'utf8'));
  installedLanguage = schema['x-spytial-language-version'];
  console.log(`spytial-core ${schema['x-spytial-core-version']} installed (language ${installedLanguage})\n`);
}

const solve = (gdl, opts = {}) => {
  const compiled = compileSpytialGdl(gdl, opts);
  if (!compiled.ok) throw new Error(`did not compile: ${compiled.reason}`);
  return { compiled, solved: solveSpytialGdl(core, compiled, opts) };
};
const engineOnly = (d) => d.source === 'engine';

// ── the contract: a solve result we can read by field ────────────────────────
// These pin the shape. They name the field that moved, so a core release that
// renames `warnings` or stops attaching `selector` fails here first.
{
  const { solved } = solve('a:::S -> b:::S : next\n@orientation(selector=next, directions=[right])');
  check('generateLayout() returns `warnings` as an array',
    Array.isArray(solved.result.warnings), j(Object.keys(solved.result)));
  check('generateLayout() returns `selectorErrors` as an array',
    Array.isArray(solved.result.selectorErrors), j(Object.keys(solved.result)));
  check('a clean diagram: no engine diagnostics at all (no false positives)',
    solved.diagnostics.filter(engineOnly).length === 0, j(solved.diagnostics));
  check('…and a layout came back', !!solved.layout);
}
{
  const { solved } = solve('a:::S -> b:::S : next\n@orientation(selector=nxt, directions=[right])');
  const w = solved.result.warnings.find((x) => x && x.selector === 'nxt');
  check('a selector that matches nothing: the engine warns, with `selector` set to it',
    !!w, j(solved.result.warnings));
  check('…the warning carries a string `message` and a string `context`',
    !!w && typeof w.message === 'string' && typeof w.context === 'string', j(w));
}
{
  const { solved } = solve('a:::P -> b:::S\n@orientation(selector=P, directions=[below])');
  const e = solved.result.selectorErrors.find((x) => x && x.selector === 'P');
  check('a selector of the wrong arity: the engine records a selectorError with `selector` set to it',
    !!e, j(solved.result.selectorErrors));
  check('…carrying `errorMessage` and `context` as strings',
    !!e && typeof e.errorMessage === 'string' && typeof e.context === 'string', j(e));
}

// ── provenance: the engine cites the annotation as written ───────────────────
// compileSpytialGdl stamps every rule with `source: { text, location }`. From
// language 2026-08-25 (spytial-core 5.4.0) the engine carries that into its
// warnings and conflict reports as `label`, so the author sees their own line.
// Older cores parse and ignore the block; the stamp itself is checked either way.
{
  const gdl = 'a:::S -> b:::S : next\n@orientation(selector=nxt, directions=[right])';
  const { compiled, solved } = solve(gdl);
  check('the compiled rule carries its annotation text and line',
    /source: \{ text: '@orientation\(selector=nxt, directions=\[right\]\)', location: 'line 2' \}/.test(compiled.rules),
    compiled.rules);
  check('…and the engine still solves it (older cores ignore the block, newer ones read it)',
    !!solved.layout && solved.diagnostics.filter((d) => d.code === 'rule-rejected').length === 0, j(solved.diagnostics));
  if (installedLanguage >= '2026-08-25') {
    const w = solved.result.warnings.find((x) => x && x.selector === 'nxt');
    check('the engine echoes the annotation text and line back on its warning (`label`)',
      !!w && typeof w.label === 'string' && w.label.includes('@orientation(selector=nxt') && w.label.includes('line 2'),
      j(w));
  } else {
    console.log(`  skip  engine language ${installedLanguage} predates \`source\`; the echo check needs 2026-08-25`);
  }
}

// ── what spytial-gdl makes of it ─────────────────────────────────────────────
{
  const { solved } = solve('a:::S -> b:::S : next\n@orientation(selector=nxt, directions=[right])');
  const d = solved.diagnostics.filter(engineOnly);
  check('matched-nothing → one warning, on the annotation\'s line',
    d.length === 1 && d[0].severity === 'warning' && d[0].line === 2 && d[0].selector === 'nxt', j(d));
  check('…whose message is the engine\'s own, verbatim',
    d.length === 1 && solved.result.warnings.some((w) => w.message === d[0].message), j(d));
}
{
  const gdl = [
    'a:::P -> b:::S : rel',
    '@orientation(selector=P, directions=[below])',      // unary where binary is needed
    '@atomStyle(selector=rel, borderStyle(color=red))',   // binary where unary is needed
    '@align(selector=S, direction=horizontal)',           // unary where binary is needed
  ].join('\n');
  const { solved } = solve(gdl);
  const d = solved.diagnostics.filter(engineOnly);
  const lines = d.map((x) => x.line).sort();
  check('three arity mismatches → three errors, each on its own annotation line',
    d.length === 3 && d.every((x) => x.severity === 'error') && j(lines) === j([2, 3, 4]), j(d));
  check('…and the engine still produced a layout under the rules it could use',
    !!solved.layout, j(solved.result.error));
}

// ── a rule the engine refuses is named and left out, not fatal ───────────────
{
  // Handed in through opts.rules so the annotation compiler cannot catch it
  // first: this has to reach the engine's own parser.
  const { solved } = solve('a:::S -> b:::S : next\n@orientation(selector=next, directions=[right])',
    { rules: 'constraints:\n  - group: { selector: S }\n' });
  const d = solved.diagnostics.filter((x) => x.code === 'rule-rejected');
  check('a rule core\'s parser throws on → one rule-rejected diagnostic',
    d.length === 1 && d[0].severity === 'error', j(solved.diagnostics));
  check('…with no line, since it did not come from an annotation', d.length === 1 && d[0].line === undefined, j(d));
  check('…the surviving spec still holds the orientation and not the group',
    /orientation/.test(solved.rules) && !/group/.test(solved.rules), solved.rules);
  check('…and a layout came back', !!solved.layout);
}
{
  // The attribution itself, with a stand-in parser so it does not depend on
  // which forms the installed release happens to refuse.
  const { annotationMeta } = extractAnnotations(
    'a -> b\n@orientation(selector=_links, directions=[below])\n@group(selector=x, name=bad)');
  const rules = 'constraints:\n  - orientation: { selector: _links, directions: [below] }\n' +
    '  - group: { selector: x, name: bad }\ndirectives:\n  - hideField: { field: bad }\n';
  const parse = (spec) => { if (/bad/.test(spec)) throw new Error('nope'); };
  const r = checkRulesWithEngine(parse, rules, annotationMeta);
  check('a refused rule from an annotation is reported on that annotation\'s line',
    r.diagnostics.some((d) => d.line === 3 && /@group/.test(d.message) && /nope/.test(d.message)), j(r.diagnostics));
  check('a refused rule from elsewhere is reported without a line',
    r.diagnostics.some((d) => d.line === undefined && /a layout rule/.test(d.message)), j(r.diagnostics));
  check('the survivors are rebuilt as a spec with both sections',
    /orientation/.test(r.rules) && !/group/.test(r.rules) && /directives:\n  \[\]/.test(r.rules), r.rules);
}

// ── names, in parity with the evaluator ──────────────────────────────────────
// For each candidate label, ask the evaluator directly whether a relation so
// named can be read back as itself; then assert spytial-gdl reports it iff not.
{
  const { JSONDataInstance, SGraphQueryEvaluator } = core;
  const evaluatorSays = (name) => {
    const inst = new JSONDataInstance({
      atoms: [{ id: 'a', type: 'S', label: 'a' }, { id: 'b', type: 'S', label: 'b' }],
      relations: [{ id: 'r', name, types: ['S', 'S'], tuples: [{ atoms: ['a', 'b'], types: ['S', 'S'] }] }],
    });
    const ev = new SGraphQueryEvaluator();
    ev.initialize({ sourceData: inst });
    try {
      const r = ev.evaluate(name);
      if (r.isError()) return 'refused';
      if (r.maxArity() !== 2) return 'other';
      const pairs = r.selectedTwoples().map((p) => p.join(' '));
      return pairs.length === 1 && pairs[0] === 'a b' ? 'ok' : 'other';
    } catch (_) { return 'refused'; }
  };
  const candidates = ['next', 'yes', 'no', 'then', 'else', 'in', 'some', 'univ', 'iden', 'none', 'Int', 'child_of', 'S'];
  const verdicts = {};
  let agree = true;
  for (const name of candidates) {
    const expected = evaluatorSays(name);
    const { solved } = solve(`a:::S -> b:::S : ${name}`);
    // Only what was said about *this label*: `S` doubles as the sort here, and
    // the sort being shadowed by the label is a separate, correct finding.
    const flagged = solved.diagnostics.filter((d) =>
      (d.code === 'unselectable-name' || d.code === 'name-shadowed') && d.kind === 'edge label' && d.name === name);
    verdicts[name] = { evaluator: expected, reported: flagged.map((d) => d.code) };
    const ok = expected === 'ok' ? flagged.length === 0 : (flagged.length === 1 && flagged[0].line === 1);
    if (!ok) agree = false;
  }
  check('every label is reported iff the evaluator cannot read it back as itself', agree, j(verdicts));
  const refused = candidates.filter((n) => verdicts[n].evaluator !== 'ok');
  console.log(`        this engine refuses or reinterprets: ${refused.join(', ') || '(none)'}`);
  check('the parity check actually exercised a refusal (else it proves nothing)', refused.length > 0);
}
{
  // The same for a class and a sort: one clean, one the grammar will not read
  // as a plain name. The parser lets these through (their shape is fine), so
  // the engine check is the only thing standing between them and silence.
  const { solved: clean } = solve('a:::Person -> b:::Person\nclass a,b vip\n@group(selector=vip, name=V)');
  check('a clean class and sort → no name diagnostics', clean.diagnostics.filter(engineOnly).length === 0, j(clean.diagnostics));
  // A class of *some* nodes named `univ`: the name resolves to every node, which
  // is not the class. (A class of every node so named would be indistinguishable
  // from what it resolves to, and is not reported — correctly.)
  const { solved: cls } = solve('a:::S -> b:::S\nb -> c:::S\nclass a univ');
  const d1 = cls.diagnostics.filter((d) => d.code === 'name-shadowed' || d.code === 'unselectable-name');
  check('a class named `univ` → reported on the class line, as a class, by name',
    d1.length === 1 && d1[0].line === 3 && d1[0].kind === 'class' && d1[0].name === 'univ', j(cls.diagnostics));
  const { solved: srt } = solve('a:::univ -> b:::S');
  const d2 = srt.diagnostics.filter((d) => d.code === 'name-shadowed' || d.code === 'unselectable-name');
  check('a sort named `univ` on one node → reported on that node\'s line, as a sort',
    d2.length === 1 && d2[0].line === 1 && d2[0].kind === 'sort' && d2[0].name === 'univ', j(srt.diagnostics));
  // The label/sort collision the parser reports, seen from the engine's side:
  // the label wins, so it is the sort that comes back as the wrong thing.
  const { solved: both } = solve('a:::S -> b:::S : S');
  const d3 = both.diagnostics.filter((d) => d.code === 'name-shadowed');
  check('a name that is both label and sort → the engine check names the shadowed one (the sort)',
    d3.length === 1 && d3[0].kind === 'sort' && d3[0].name === 'S' &&
    both.diagnostics.some((d) => d.source === 'parse' && /both an edge label/.test(d.message)) === false /* parse errors live in sourceDiagnostics, not here */,
    j(both.diagnostics));
}
{
  // An evaluator without evaluate() cannot answer; that is said, not skipped.
  const d = checkNamesWithEngine({}, compileSpytialGdl('a -> b : x').parsed);
  check('no evaluate() on the evaluator → one warning saying names went unchecked',
    d.length === 1 && d[0].severity === 'warning' && d[0].code === 'name-check-unavailable', j(d));
}

// ── shape tolerance: a result missing a channel yields nothing, not a throw ──
{
  check('engineDiagnostics({}) → []', engineDiagnostics({}).length === 0);
  check('engineDiagnostics with null channels → []',
    engineDiagnostics({ warnings: null, selectorErrors: undefined }).length === 0);
  const d = engineDiagnostics({ warnings: [{ message: 'just text' }], selectorErrors: ['bare string'] });
  check('a warning with only a message → a warning with no line; a bare-string selector error → an error',
    d.length === 2 && d[0].severity === 'warning' && d[0].line === undefined && d[0].message === 'just text' &&
    d[1].severity === 'error' && /bare string/.test(d[1].message), j(d));
}

// ── attribution: engine → line ───────────────────────────────────────────────
{
  const { annotationMeta } = extractAnnotations(
    'a -> b : x\n@orientation(selector=x, directions=[below])\n@group(selector=x, name=G)\n@edgeStyle(field=x, lineStyle(color=red))');
  check('a selector shared by two annotations: context picks the right one',
    attributeLine(annotationMeta, 'x', 'group selector') === 3 &&
    attributeLine(annotationMeta, 'x', 'orientation selector') === 2, j(annotationMeta));
  check('…with no usable context, the first wins', attributeLine(annotationMeta, 'x') === 2);
  check('a `field` is matched too', attributeLine(annotationMeta, 'x', 'edgeStyle field') === 4);
  check('an unknown selector → no line', attributeLine(annotationMeta, 'zzz') === undefined);
  check('annotationMeta records section and the exact emitted entry',
    annotationMeta[0].section === 'constraints' && annotationMeta[2].section === 'directives' &&
    annotationMeta[0].entry === 'orientation: { selector: x, directions: [below] }', j(annotationMeta));
}

// ── the parser's and compiler's channels, normalized ─────────────────────────
{
  const d = sourceDiagnostics(
    [{ line: 2, text: '@x()', message: 'unknown annotation' }],
    [{ line: 1, text: 'graph TD', severity: 'warning', message: 'ignored' }, { line: 3, severity: 'error', message: 'bad' }]);
  check('annotation errors are errors; parse severities are kept; sources are named',
    d.length === 3 && d[0].severity === 'error' && d[0].source === 'annotation' &&
    d[1].severity === 'warning' && d[1].source === 'parse' && d[2].severity === 'error', j(d));
}

console.log(`\n${pass} passed, ${fail} failed`);
// exitCode rather than exit(): exit() can truncate stdout when it is a pipe,
// which is how the summary line goes missing under `npm test | grep`.
process.exitCode = fail ? 1 : 0;
