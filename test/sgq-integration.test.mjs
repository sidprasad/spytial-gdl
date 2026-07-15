// Integration test: drives the REAL spytial-core pipeline (not just the string
// round-trip) to verify that the atom/relation types produced by relationalize.js
// are accepted by JSONDataInstance, that the SGraphQueryEvaluator resolves
// selectors, and (best effort) that LayoutInstance.generateLayout succeeds. The
// point is to confirm an untyped node is reachable via `univ` and correctly
// typed — before/after flipping DEFAULT_TYPE.
//
//   node test/sgq-integration.test.mjs
//
// JSONDataInstance + SGraphQueryEvaluator come from spytial-core's node-friendly
// ./evaluator bundle (no DOM). LayoutInstance/parseLayoutSpec only ship in the
// browser IIFE global bundle, which we load under minimal browser-global stubs.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGraph } from '../src/parse.js';
import { relationalize, DEFAULT_TYPE } from '../src/relationalize.js';
import { extractAnnotations } from '../src/annotations.js';
import { mergeSpecStrings } from '../src/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_DIR = resolve(__dirname, '../../spytial-core/dist');

let pass = 0, fail = 0, skip = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.error(`FAIL    ${name}  ${extra}`); }
}
function note(msg) { skip++; console.log(`  skip  ${msg}`); }

console.log(`DEFAULT_TYPE in relationalize.js = ${JSON.stringify(DEFAULT_TYPE)}\n`);

// This is an integration test against a *sibling* build of spytial-core (loaded
// as globals, the way a host app consumes it). It can only run where that build
// exists; skip cleanly (exit 0) otherwise so `npm test` stays green standalone.
const EVAL_BUNDLE = resolve(CORE_DIR, 'evaluator.mjs');
if (!existsSync(EVAL_BUNDLE)) {
  console.log(`  skip  spytial-core build not found at ${CORE_DIR} — integration test skipped.`);
  console.log(`\n0 passed, 0 failed, 1 skipped`);
  process.exit(0);
}

// --- node-friendly evaluator bundle ------------------------------------------
const evalMod = await import(EVAL_BUNDLE);
const { JSONDataInstance, SGraphQueryEvaluator } = evalMod;
check('evaluator.mjs exposes JSONDataInstance + SGraphQueryEvaluator',
  !!(JSONDataInstance && SGraphQueryEvaluator));

// --- browser global bundle (for LayoutInstance) under stubs ------------------
function loadBrowserCore() {
  const stub = () => ({
    style: {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, addEventListener() {}, attachShadow() { return stub(); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    setProperty() {}, removeProperty() {}, classList: { add() {}, remove() {} },
  });
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: stub, createElementNS: stub,
    head: stub(), body: stub(), addEventListener() {},
  };
  globalThis.HTMLElement = class {};
  globalThis.customElements = { define() {}, get() { return undefined; } };
  globalThis.navigator = { userAgent: 'node' };
  const src = readFileSync(resolve(CORE_DIR, 'browser/spytial-core-complete.global.js'), 'utf8');
  (0, eval)(src);
  return globalThis.spytialcore;
}
let browserCore = null;
try { browserCore = loadBrowserCore(); }
catch (e) { note(`browser bundle not loadable under stubs (${e.message}) — LayoutInstance checks skipped`); }

// --- helpers -----------------------------------------------------------------
function instanceFor(source) {
  const { atoms, relations, hiddenRelations } = relationalize(parseGraph(source));
  return { atoms, relations, hiddenRelations, instance: new JSONDataInstance({ atoms, relations }) };
}
function newEvaluator(instance) {
  const ev = new SGraphQueryEvaluator();
  ev.initialize({ sourceData: instance });
  return ev;
}
// Pull atom ids out of whatever shape evaluate() returns (probe at runtime).
function idsOf(res) {
  const r = res && (res.value ?? res.result ?? res.tuples ?? res.atoms ?? res);
  const flat = [];
  const push = (x) => { if (x == null) return; flat.push(x && x.id != null ? x.id : (x.atom != null ? x.atom : x)); };
  if (Array.isArray(r)) {
    for (const el of r) {
      if (Array.isArray(el)) el.forEach(push);
      else if (el && Array.isArray(el.atoms)) el.atoms.forEach(push);
      else push(el);
    }
  }
  return flat.map(x => (typeof x === 'object' && x && x.id != null ? x.id : x)).filter(x => x != null);
}

// =============================================================================
// Case A — types are accepted; untyped vs typed atoms resolve correctly.
// =============================================================================
console.log('Case A: JSONDataInstance typing');
{
  const src = `A -> B\nB -> C:::Widget`;
  const { atoms, instance } = instanceFor(src);
  console.log('   atom types: ' + atoms.map(a => `${a.id}:${JSON.stringify(a.type)}`).join(', '));

  let aType, aErr = null, cType, cErr = null;
  try { aType = instance.getAtomType('A'); } catch (e) { aErr = e; }
  try { cType = instance.getAtomType('C'); } catch (e) { cErr = e; }
  check('A: getAtomType(untyped "A") does not throw', aErr === null, aErr && aErr.message);
  console.log('      getAtomType("A") = ' + JSON.stringify(aType && { id: aType.id, types: aType.types }));
  check('A: getAtomType(typed "C") is "Widget"', !!cType && cType.id === 'Widget',
    cErr ? cErr.message : JSON.stringify(cType && cType.id));
}

// =============================================================================
// Case B — SGQ evaluator: univ captures untyped atoms; named type is precise.
// =============================================================================
console.log('\nCase B: SGraphQueryEvaluator selectors');
{
  const src = `A -> B\nC:::Widget -> A`;
  const { instance } = instanceFor(src);
  const ev = newEvaluator(instance);

  let univRes, univErr = null;
  try { univRes = ev.evaluate('univ'); } catch (e) { univErr = e; }
  check('B: evaluate("univ") does not throw', univErr === null, univErr && univErr.message);
  if (!univErr) {
    const ids = new Set(idsOf(univRes));
    console.log('      univ → ' + JSON.stringify([...ids]));
    check('B: univ includes untyped A and B, and typed C',
      ids.has('A') && ids.has('B') && ids.has('C'), JSON.stringify([...ids]));
  }

  let wRes, wErr = null;
  try { wRes = ev.evaluate('Widget'); } catch (e) { wErr = e; }
  check('B: evaluate("Widget") does not throw', wErr === null, wErr && wErr.message);
  if (!wErr) {
    const ids = new Set(idsOf(wRes));
    console.log('      Widget → ' + JSON.stringify([...ids]));
    check('B: Widget resolves to exactly {C}', ids.has('C') && !ids.has('A') && !ids.has('B'),
      JSON.stringify([...ids]));
  }
}

// =============================================================================
// Case C — full LayoutInstance path (index.js steps 1-4), if browser core loaded.
// =============================================================================
console.log('\nCase C: full LayoutInstance.generateLayout');
if (!browserCore) {
  note('C: browser core unavailable — skipped');
} else {
  const { parseLayoutSpec, LayoutInstance, JSONDataInstance: BJSON, SGraphQueryEvaluator: BEval } = browserCore;
  check('C: browser core has parseLayoutSpec + LayoutInstance', !!(parseLayoutSpec && LayoutInstance));

  function runLayout(source, rulesYaml = '') {
    const { atoms, relations } = relationalize(parseGraph(source));
    const instance = new BJSON({ atoms, relations });
    const evaluator = new BEval();
    evaluator.initialize({ sourceData: instance });
    const spec = parseLayoutSpec(rulesYaml || '');
    const li = new LayoutInstance(spec, evaluator, 0, true, undefined, 'qualitative');
    return li.generateLayout(instance);
  }

  // C1: bare graph, no spec.
  let r1, e1 = null;
  try { r1 = runLayout(`A -> B\nB -> C:::Widget`); } catch (e) { e1 = e; }
  check('C1: generateLayout(no spec) does not throw', e1 === null, e1 && (e1.stack || e1.message));
  if (!e1) check('C1: produced a layout with no selectorErrors',
    !!r1.layout && (r1.selectorErrors || []).length === 0,
    JSON.stringify({ err: r1.error, sel: r1.selectorErrors }));

  // C2: a spec whose selector is `univ` — must resolve against untyped atoms.
  let r2, e2 = null;
  const univSpec = `directives:\n  - atomStyle: { selector: univ, borderStyle: { color: "#eeeeee" } }`;
  try { r2 = runLayout(`A -> B\nC:::Widget -> A`, univSpec); } catch (e) { e2 = e; }
  check('C2: generateLayout(univ selector) does not throw', e2 === null, e2 && (e2.stack || e2.message));
  if (!e2) check('C2: univ-selector spec applied with no selectorErrors',
    (r2.selectorErrors || []).length === 0,
    JSON.stringify({ err: r2.error, sel: r2.selectorErrors }));

  // ===========================================================================
  // Case D — style directives resolve the way the docs claim (core 3.x).
  // The whole client pipeline: @annotations → compiled spec → resolved layout.
  // ===========================================================================
  console.log('\nCase D: style directives resolve as documented');

  // The whole client pipeline, exactly as index.js runs it: lift the inline
  // annotations, relationalize, and hide the selector-only relations. That last
  // step matters here — without it `_links` is drawn as a duplicate of every
  // edge, and these assertions would be measuring a graph no user ever sees.
  function runAnnotated(src) {
    const { source, specYaml } = extractAnnotations(src);
    const { atoms, relations, hiddenRelations } = relationalize(parseGraph(source));
    const instance = new BJSON({ atoms, relations });
    const evaluator = new BEval();
    evaluator.initialize({ sourceData: instance });
    const hideYaml = hiddenRelations.length
      ? 'directives:\n' + hiddenRelations.map((f) => `  - hideField: { field: '${f}' }\n`).join('')
      : '';
    const spec = parseLayoutSpec(mergeSpecStrings([specYaml || '', hideYaml]));
    const li = new LayoutInstance(spec, evaluator, 0, true, undefined, 'qualitative');
    return li.generateLayout(instance);
  }
  const firstNode = (r) => ((r.layout && r.layout.nodes) || [])[0];
  const edgeColors = (r) => ((r.layout && r.layout.edges) || []).map((e) => e.color);

  const GRAPH = 'alice:::Person -> bob:::Person';

  // D1: the legacy → block rewrite is look-preserving. This is the claim the
  // docs/examples migration rests on, so assert it against the real resolver
  // rather than trusting the mapping. atomColor drives the *outline* (`color`),
  // which is why it desugars to borderStyle and not fillStyle.
  const legacy = firstNode(runAnnotated(`${GRAPH}\n@atomColor(selector=Person, value='#cfe8d8')`));
  const modern = firstNode(runAnnotated(`${GRAPH}\n@atomStyle(selector=Person, borderStyle(color='#cfe8d8'))`));
  check('D1: legacy atomColor and atomStyle+borderStyle resolve identically',
    !!legacy && !!modern && legacy.color === modern.color &&
    legacy.colorSource === modern.colorSource && legacy.fillColor === modern.fillColor,
    JSON.stringify({ legacy: legacy && { color: legacy.color, fill: legacy.fillColor },
      modern: modern && { color: modern.color, fill: modern.fillColor } }));
  check("D1: atomColor's value lands on the outline, from the directive",
    !!legacy && legacy.color === '#cfe8d8' && legacy.colorSource === 'directive',
    JSON.stringify(legacy && { color: legacy.color, colorSource: legacy.colorSource }));

  // D2: fillStyle is a genuinely different knob — it paints the interior and
  // leaves the outline to the default palette. (Rewriting atomColor onto it would
  // have restyled every diagram, which is why the migration uses borderStyle.)
  const filled = firstNode(runAnnotated(`${GRAPH}\n@atomStyle(selector=Person, fillStyle(color='#cfe8d8'))`));
  check('D2: fillStyle paints the interior, not the outline',
    !!filled && filled.fillColor === '#cfe8d8' && filled.color !== '#cfe8d8',
    JSON.stringify(filled && { color: filled.color, fill: filled.fillColor }));

  // D3: edgeStyle matches on `field` — the relation name. Unlabeled edges are
  // all `_`. A `selector` does NOT choose edges (it only narrows source atoms),
  // and `_links` is selector-only + hidden, so neither styles anything.
  check('D3: edgeStyle(field=_) colours the unlabeled edges',
    edgeColors(runAnnotated(`${GRAPH}\n@edgeStyle(field=_, lineStyle(color='#2d8659'))`))
      .every((c) => c === '#2d8659'));
  check('D3: edgeStyle with only a selector colours nothing',
    edgeColors(runAnnotated(`${GRAPH}\n@edgeStyle(selector=_links, lineStyle(color='#2d8659'))`))
      .every((c) => c !== '#2d8659'));
  check('D3: edgeStyle(field=_links) colours nothing (it is hidden from drawing)',
    edgeColors(runAnnotated(`${GRAPH}\n@edgeStyle(field=_links, lineStyle(color='#2d8659'))`))
      .every((c) => c !== '#2d8659'));

  // D4: a labeled edge is styled by its label, and lineStyle.pattern carries.
  const labeled = runAnnotated('a -> b : next\n@edgeStyle(field=next, lineStyle(color=crimson, pattern=dashed))');
  const nextEdge = ((labeled.layout && labeled.layout.edges) || []).find((e) => e.relationName === 'next');
  check('D4: edgeStyle(field=<label>) styles that relation, pattern included',
    !!nextEdge && nextEdge.color === 'crimson' && /dash/i.test(JSON.stringify(nextEdge)),
    JSON.stringify(nextEdge && { color: nextEdge.color, relationName: nextEdge.relationName }));

  // D5: the payoff of rewriting legacy forms at compile time instead of passing
  // them through — core warns on every legacy directive it parses, so a spec we
  // compiled correctly is one it has nothing to say about. This is what keeps a
  // 2.x-era diagram from filling its host page's console with deprecations.
  const legacySource = [
    'alice:::Person -> bob:::Person',
    "@atomColor(selector=Person, value='#cfe8d8')",
    '@edgeColor(field=_, value=red, style=dashed)',
    "@inferredEdge(name=p, selector='~_', color=gray, style=dotted)",
  ].join('\n');
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => warnings.push(a.map(String).join(' '));
  try { runAnnotated(legacySource); } finally { console.warn = realWarn; }
  check('D5: an all-legacy source compiles to a spec core raises no deprecation on',
    !warnings.some((w) => /\[spytial\]/.test(w)), JSON.stringify(warnings));
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
