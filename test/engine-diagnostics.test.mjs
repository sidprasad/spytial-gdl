// Engine diagnostics: what spytial-gdl reports about a diagram once the engine
// has seen it, checked against the engine that is installed.
//
//   npm run test:diagnostics
//
// diagnostics.js rests on one claim about spytial-core: that a generateLayout()
// result carries `warnings` and `selectorErrors` in a shape readable by field.
// The schema says nothing about it, so the generator cannot check it. It is
// asserted here against the installed engine, by field name, so a release that
// moves a field fails a build rather than turning a warning back into silence.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  compileSpytialGdl, solveSpytialGdl, extractAnnotations,
  sourceDiagnostics, engineDiagnostics, attributeLine,
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
{
  // A word the query grammar reserves, used as a label and then named by an
  // annotation. There is no list of such words here; the engine refuses it.
  const { solved } = solve('a:::S -> b:::S : no\n@orientation(selector=no, directions=[right])');
  const d = solved.diagnostics.filter(engineOnly);
  check('a reserved word as a selector → an error from the engine, on the annotation\'s line',
    d.length >= 1 && d.every((x) => x.severity === 'error' && x.line === 2), j(d));
}

// ── a spec the engine refuses is reported, and the graph still drawn ─────────
{
  // Handed in through opts.rules so the annotation compiler cannot catch it
  // first: this has to reach the engine's own parser.
  const { solved } = solve('a:::S -> b:::S : next\n@orientation(selector=next, directions=[right])',
    { rules: 'constraints:\n  - group: { selector: S }\n' });
  const d = solved.diagnostics.filter((x) => x.code === 'rules-rejected');
  check('a spec core\'s parser throws on → one rules-rejected error carrying core\'s message',
    d.length === 1 && d[0].severity === 'error' && /name/i.test(d[0].message), j(solved.diagnostics));
  check('…the diagram is solved under the hidden-field directives only',
    !/orientation|group/.test(solved.rules) && /hideField/.test(solved.rules), solved.rules);
  check('…and a layout came back', !!solved.layout);
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
    !!solved.layout && solved.diagnostics.filter((d) => d.code === 'rules-rejected').length === 0, j(solved.diagnostics));
  if (installedLanguage >= '2026-08-25') {
    const w = solved.result.warnings.find((x) => x && x.selector === 'nxt');
    check('the engine echoes the annotation text and line back on its warning (`label`)',
      !!w && typeof w.label === 'string' && w.label.includes('@orientation(selector=nxt') && w.label.includes('line 2'),
      j(w));
  } else {
    console.log(`  skip  engine language ${installedLanguage} predates \`source\`; the echo check needs 2026-08-25`);
  }
}

// ── shape tolerance: a result missing a channel yields nothing, not a throw ──
{
  check('engineDiagnostics({}) → []', engineDiagnostics({}).length === 0);
  check('engineDiagnostics with null channels → []',
    engineDiagnostics({ warnings: null, selectorErrors: undefined }).length === 0);
  const d = engineDiagnostics({ warnings: [{ message: 'just text' }], selectorErrors: [{ errorMessage: 'bad' }] });
  check('a warning with only a message → a warning with no line; a selector error → an error',
    d.length === 2 && d[0].severity === 'warning' && d[0].line === undefined && d[0].message === 'just text' &&
    d[1].severity === 'error' && d[1].message === 'bad', j(d));
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
