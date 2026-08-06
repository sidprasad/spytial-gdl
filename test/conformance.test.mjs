// Conformance: does the spec spytial-gdl emits mean what the notation said?
//
//   npm run test:conformance
//
// Every other test here checks a string — the YAML we compile, the tokens we
// scan, the notation we round-trip. None of them can tell you whether the spec
// that YAML parses into actually *entails* the arrangement the author asked
// for. A spec can be well-formed, validate against the schema, and still say
// less than it looks like it says; the diagram then comes out plausible and
// wrong, and nothing fails.
//
// spytial-core's conformance harness answers the entailment question directly.
// `must.rightOf(a)` is not "b landed right of a in the layout I got" but "every
// layout this spec permits puts b right of a" — a fact about the spec, so it is
// stable across renderers and machines, and needs no browser. See
// https://sidprasad.github.io/spytial-core/#/testing-integrations
//
// The cases live in test/conformance/cases.mjs and are written as notation.
// They go through compileSpytialGdl, the same call both render paths make, so
// what passes here is what a diagram on a page would be given.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CASES } from './conformance/cases.mjs';
import { compileSpytialGdl } from '../src/index.js';
import { LANGUAGE_VERSION, CORE_VERSION } from '../src/_spec-tables.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.error(`FAIL    ${name}  ${extra}`); }
}
const j = (v) => JSON.stringify(v, null, 2);

// Unlike test/sgq-integration.test.mjs, which reads a sibling checkout and skips
// where there is none, this resolves spytial-core from node_modules — it is a
// devDependency. A conformance suite that skips itself when its dependency is
// missing is a suite that quietly never runs in CI, which is the failure mode
// this is here to prevent, so a missing install is an error with instructions.
let conformance;
try {
  conformance = await import('spytial-core/conformance');
} catch (err) {
  console.error('FAIL  spytial-core is not installed, so nothing here can run.');
  console.error('      Run `npm install` first — it is a devDependency for exactly this.');
  console.error(`      (${err.message})`);
  process.exit(1);
}
const { runCases, checkDatum, CONFORMANCE_FORMAT_VERSION } = conformance;

// Always say what this ran against. The queries below are answered by whichever
// core is installed, not by the vendored schema, so the version is part of
// reading the result.
//
// Resolved rather than reached for at ../node_modules: under npm workspaces, or
// any install that hoists, spytial-core sits above this package and a hardcoded
// path throws ENOENT — after the import above already succeeded, so the "run
// npm install" message would never be the thing you saw.
//
// Read from the schema core exports rather than from its package.json, which is
// not in its `exports` map and so cannot be resolved at all. The schema is the
// better source anyway: it states both versions itself, and it is the same
// document vendor/ holds, so the two sides of the comparison below are the same
// field read from the same kind of file.
const resolve_ = createRequire(import.meta.url);
const installedSchema = JSON.parse(
  readFileSync(resolve_.resolve('spytial-core/spec.schema.json'), 'utf8'));
const installed = installedSchema['x-spytial-core-version'];
const installedLanguage = installedSchema['x-spytial-language-version'];
console.log(`spytial-core ${installed} installed (language ${installedLanguage});`);
console.log(`vendor/ holds ${CORE_VERSION} (language ${LANGUAGE_VERSION})\n`);

// Core versions differing is ordinary — the range floats, and a patch can land
// between the last `npm run update-core` and this run. The *language* differing
// is not: it means the generated tables describe a spec language the installed
// engine no longer speaks, so every entailment below is being checked against
// something other than what we compile for.
check('the installed engine speaks the language the tables were generated from',
  installedLanguage === LANGUAGE_VERSION,
  `installed ${installedLanguage} vs tables ${LANGUAGE_VERSION} — run \`npm run update-core\``);

// The harness stamps its result with a format version and tells you to refuse
// one you do not recognize rather than reading fields that may have moved.
const KNOWN_FORMAT = 1;

// Cases are indented to read as prose in the case file; the notation is
// line-oriented, so give the parser flush-left text.
function dedent(text) {
  const lines = text.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length)
  );
  return lines.map((l) => l.slice(indent)).join('\n');
}

// ── build every case from its notation ───────────────────────────────────────
// A case whose annotations failed to compile would run against a spec missing
// the very constraint it is asserting about, and could then only fail in a way
// that points at the wrong thing. Catch that here instead.

const built = [];
for (const c of CASES) {
  const compiled = compileSpytialGdl(dedent(c.gdl));
  if (!compiled.ok) {
    check(`${c.name}: compiles`, false, compiled.reason);
    continue;
  }
  const problems = [...compiled.annotationErrors, ...compiled.parseErrors];
  if (problems.length > 0) {
    check(`${c.name}: compiles`, false, j(problems));
    continue;
  }
  // No case sets skipDatumCheck. Every one is typed, so the datum check runs on
  // all of them and gets to earn its keep; the untyped divergence is pinned at
  // the bottom of this file instead of being switched off here.
  built.push({
    name: c.name,
    datum: compiled.datum,
    spec: compiled.rules,
    assertions: c.assertions,
  });
}
check(`all ${CASES.length} cases compiled`, built.length === CASES.length);

// ── ask what those specs entail ──────────────────────────────────────────────

const run = runCases(built);

check(`the harness reports a format version this test understands (${KNOWN_FORMAT})`,
  run.formatVersion === KNOWN_FORMAT,
  `got ${run.formatVersion}; CONFORMANCE_FORMAT_VERSION=${CONFORMANCE_FORMAT_VERSION}. ` +
  'Read the RunResult shape before trusting anything below.');

for (const c of run.cases) {
  // A datum or spec error stops the case before any assertion runs, so it has
  // to be reported on its own — otherwise a case that never ran looks like a
  // case with nothing to say.
  if (c.errors.length > 0) {
    check(`${c.name}: datum and spec are usable`, false, j(c.errors));
    continue;
  }
  for (const w of c.warnings) {
    // Not failures, but the engine's advisories are usually the only sign of a
    // selector that resolved to nothing — which constrains nothing, silently.
    console.log(`  note  ${c.name}: ${w.code} — ${w.message}`);
  }
  for (const a of c.assertions) {
    const why = a.because ? ` (${a.because})` : '';
    check(`${c.name}: ${a.query}${why}`, a.ok, a.message ? `\n    ${a.message}` : j(a));
  }
}

check('every case reached its assertions',
  run.cases.length === built.length && run.cases.every((c) => c.errors.length === 0));

// `hidden()`, `sized()` and `cyclic()` arrived in spytial-core 4.4.2, later than
// the 4.1.0 floor spytial-gdl needs to *render*. Both ranges are carets so a
// fresh install is well past that, but a stale node_modules is not — and it
// fails as a dozen "Unrecognized spatial query" lines that say nothing about the
// cause. Diagnose it once, here, rather than leaving that to be worked out.
{
  const unrecognized = run.cases.flatMap((c) =>
    c.assertions.filter((a) => !a.ok && /Unrecognized spatial query/.test(a.message ?? ''))
      .map((a) => a.query));
  if (unrecognized.length > 0) {
    check(`spytial-core ${installed} answers every query this suite asks`, false,
      `it does not recognize ${[...new Set(unrecognized)].join(', ')} — these need a newer ` +
      '4.x than what is installed. Delete node_modules and package-lock.json, then npm install.');
  }
}

// ── the premise CONDITIONAL_REQUIRED rests on ────────────────────────────────
// annotations.js refuses `@group(selector=…)` with no name because core throws
// on it. That fact is stated nowhere the generator can read — not in the
// schema's `required`, only in prose — so the policy is a claim about the
// engine, asserted here against the engine.
//
// Without this, core relaxing the rule would leave spytial-gdl rejecting a form
// core accepts, forever, with every test still green. The schema anchoring in
// generate-spec-tables.mjs cannot cover it: the schema never stated the rule,
// so there is nothing there to move.

{
  const datum = {
    atoms: [{ id: 'a', type: 'N', label: 'a' }, { id: 'b', type: 'N', label: 'b' }],
    relations: [{ id: 'g', name: 'g', types: ['N', 'N'], tuples: [{ atoms: ['a', 'b'], types: ['N', 'N'] }] }],
  };
  const groupSpec = (body) => `constraints:\n  - group: { ${body} }\n`;
  const errorsFor = (body) =>
    runCases([{ name: body, datum, spec: groupSpec(body), assertions: [{ query: 'nodes()', nonEmpty: true }] }])
      .cases[0].errors;

  const unnamed = errorsFor('selector: g');
  check('core still refuses a group with no name — the reason @group requires one',
    unnamed.some((e) => /must have a name/i.test(e.message)), j(unnamed));

  const negated = errorsFor('selector: g, hold: never');
  check('...and still exempts a negated group, the one case that excuses it',
    !negated.some((e) => /must have a name/i.test(e.message)), j(negated));

  const named = errorsFor('selector: g, name: G');
  check('...while a named group parses cleanly', named.length === 0, j(named));
}

// ── a known disagreement about untyped atoms ─────────────────────────────────
// A plain `A` relationalizes to the empty type, deliberately: nothing but `univ`
// selects it, so a bare node is not caught by a `selector: <Name>` written for
// something else (relationalize.js, and test/sgq-integration.test.mjs).
//
// core's datum check calls that an error — its reasoning being that an atom
// without a type cannot be selected, which is not quite true here, since `univ`
// still reaches it. The two are not going to agree by accident, so the
// disagreement is asserted rather than skipped: if core relaxes the rule, or
// spytial-gdl starts naming a type, this fails and someone decides on purpose.

{
  const untyped = compileSpytialGdl('A -> B\n@orientation(selector=_links, directions=[right])');
  const diagnostics = checkDatum(untyped.datum);
  const codes = diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
  check('an untyped node still trips core\'s datum check',
    codes.length === untyped.datum.atoms.length && codes.every((c) => c === 'datum/atom-missing-type'),
    j(diagnostics));

  // The layout half is unaffected: the engine reaches these atoms perfectly
  // well, which is why the typed cases above are the ones that assert entailment
  // and this one only pins the divergence.
  const typed = compileSpytialGdl('A:::Node -> B:::Node\n@orientation(selector=_links, directions=[right])');
  check('the same notation with sorts passes cleanly',
    checkDatum(typed.datum).filter((d) => d.severity === 'error').length === 0,
    j(checkDatum(typed.datum)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
