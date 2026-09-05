// spytial-gdl — render a small graph notation (nodes, edges, inline spatial
// @annotations) through Spytial's standard WebCola CnD renderer.
//
// Pipeline (webcola-cnd-graph owns both layout AND drawing):
//
//   spytial-gdl source
//     → annotations.js    extract inline @orientation(...) → { source, specYaml }
//     → parse.js          { nodes, edges, classesPerNode }
//     → relationalize.js  { atoms, relations, hiddenRelations }
//     → JSONDataInstance + SGraphQueryEvaluator + parseLayoutSpec
//     → LayoutInstance.generateLayout  → { layout, error, selectorErrors }
//     → <webcola-cnd-graph>.renderLayout(layout)
//
// spytial-core is a peer dependency loaded on the page (CDN or bundler) as the
// global `window.spytialcore`; it auto-registers the
// <webcola-cnd-graph> custom element and needs d3 v4 + cola.js present. We do
// NOT import it, so this module loads as a bare ES module in the browser.

import { parseGraph } from './parse.js';
import { registerSpec, clearRegistry, mergeSpecsForClasses, mergeSpecStrings } from './registry.js';
import { relationalize, DEFAULT_RELATION } from './relationalize.js';
import { extractAnnotations } from './annotations.js';
import { serializeToSpytialGdl } from './serialize.js';
import { sourceDiagnostics, engineDiagnostics } from './diagnostics.js';

export { registerSpec, clearRegistry, mergeSpecsForClasses, mergeSpecStrings, extractAnnotations, serializeToSpytialGdl };
export { sourceDiagnostics, engineDiagnostics, attributeLine } from './diagnostics.js';

// Constraint inference — the layout → spec direction. `abduce` reads a hand-made
// arrangement as qualitative predicates, `generalize` names the relation that
// explains them, `cycles` reads the one thing no pair can express, and
// `observeArrangement` wires them all to a live diagram. Every part is optional:
// nothing in the render path calls them, and they add no constraints, move no
// nodes, and touch neither the spec nor spytial-core.
//
// `demonstrate.js` is the way in for an embedder: `mountDemonstration` puts the
// whole show-don't-tell flow under any diagram, and `createDemonstration` is the
// same state machine with no chrome, for a host that draws its own.
export { abduce, predicates, spatialScale, epsilonFor } from './abduce.js';
export { generalize, explainGroup, emitLine, rank } from './generalize.js';
export { proposeCycles, detectCycles, ringOrder, windingOf } from './cycles.js';
export { observeArrangement } from './observe.js';
export { makeSynthesizer, synthesisAvailable } from './synthesize.js';
export {
  mountDemonstration, createDemonstration, IDLE, DEMONSTRATING, OFFERING,
} from './demonstrate.js';

function getSpytialCore() {
  const s = (typeof window !== 'undefined' && window.spytialcore) || globalThis.spytialcore;
  if (!s) {
    throw new Error(
      'spytial-gdl: spytial-core is not loaded. Include ' +
        'spytial-core-complete.global.js (plus d3 v4 and cola.js) on the page.'
    );
  }
  return s;
}

// Create (or reuse) a custom-element graph of the given tag inside `container`.
// If `container` already *is* such an element, it's returned as-is; otherwise an
// existing child of that tag is reused, or a new one is created and appended.
function mountElement(container, tagName, opts) {
  if (!(container instanceof Element)) {
    throw new Error('mountGraph: container must be an Element');
  }
  if (container.tagName && container.tagName.toLowerCase() === tagName) {
    return container;
  }
  let el = container.querySelector(tagName);
  if (!el) {
    el = document.createElement(tagName);
    if (opts.width != null) el.setAttribute('width', String(opts.width));
    if (opts.height != null) el.setAttribute('height', String(opts.height));
    if (opts.theme) el.setAttribute('theme', opts.theme);
    el.setAttribute('aria-label', opts.ariaLabel || 'Spytial constraint diagram');
    container.appendChild(el);
  }
  return el;
}

// Create (or reuse) a read-only <webcola-cnd-graph> element inside `container`.
// Returns the graph element to pass to renderSpytialGdl.
export function mountGraph(container, opts = {}) {
  return mountElement(container, 'webcola-cnd-graph', opts);
}

// Create (or reuse) an editable <structured-input-graph> element inside
// `container`. Returns the element to pass to renderSpytialGdlEditable. The
// custom element is registered by spytial-core's global build (≥ 5.0.0).
export function mountInputGraph(container, opts = {}) {
  return mountElement(container, 'structured-input-graph', opts);
}

// Blank the synthetic `_` name that unlabeled edges carry, so the rendered
// graph doesn't show "_" on every plain `A -> B`.
function blankDefaultLabels(layout) {
  if (!layout || !Array.isArray(layout.edges)) return;
  for (const edge of layout.edges) {
    if (edge.relationName === DEFAULT_RELATION || edge.label === DEFAULT_RELATION) {
      edge.showLabel = false;
      edge.label = '';
    }
  }
}

// Resolve the layout-rules YAML by merging every source of constraints, in order:
//   1. specs registered (via registerSpec) for the classes used in this source,
//      plus an optional `opts.extraSpec`
//   2. inline `@annotation` spec compiled from the diagram source (`annoYaml`)
//   3. an explicit `opts.rules` string (advanced escape hatch)
// Inline annotations are the primary authoring model, but all sources compose;
// the merge is the shared concat used by the class registry. Empty rules are
// fine — Spytial still produces a faithful default diagram.
function resolveRules(parsed, opts, annoYaml) {
  const usedClasses = new Set();
  for (const cs of parsed.classesPerNode.values()) {
    for (const c of cs) usedClasses.add(c);
  }
  const registryYaml = mergeSpecsForClasses(Array.from(usedClasses), opts.extraSpec);
  return mergeSpecStrings([
    registryYaml,
    annoYaml,
    typeof opts.rules === 'string' ? opts.rules : '',
  ]);
}

// Express the selector-only relations as `hideField` directives in authoring
// YAML, so they stay queryable in selectors but are not drawn as duplicate
// edges. parseLayoutSpec folds these into `directives.hiddenFields`, which is
// where both the read-only and editable paths need them. Field names are
// single-quoted so `_links` / hyphenated classes stay valid scalars.
function hideFieldsYaml(hiddenRelations) {
  if (!hiddenRelations || hiddenRelations.length === 0) return '';
  let out = 'directives:\n';
  for (const field of hiddenRelations) {
    out += `  - hideField: { field: '${String(field).replace(/'/g, "''")}' }\n`;
  }
  return out;
}

// ── Headless compilation ─────────────────────────────────────────────────────
// Everything spytial-gdl is responsible for before spytial-core takes over: lift
// the inline @annotations, parse the notation, relationalize it, and merge every
// source of layout rules into one spec string. No DOM and no engine, which is
// what lets test/conformance.test.mjs ask what the emitted spec *entails*
// without rendering anything.
//
// Both render paths below go through this, so the datum and spec that suite
// checks are the ones they actually hand core — a conformance suite built on a
// parallel copy of the pipeline would only ever test the copy.
//
// Returns { ok: true, datum, rules, hiddenRelations, parsed, annotationLines,
// annotationMeta, annotationErrors, parseErrors }, or { ok: false, reason, ... }
// for a source with no nodes. `annotationMeta` is what lets a later engine
// diagnostic be reported on the annotation's line (see diagnostics.js).
export function compileSpytialGdl(source, opts = {}) {
  // Every rule that reaches the engine carries its annotation's text and line
  // (`source`), so a conflict report cites what the author wrote. Pass
  // `provenance: false` to compile the bare rules.
  const {
    source: cleanSource, specYaml: annoYaml, annotationLines, annotationMeta, errors: annotationErrors,
  } = extractAnnotations(source, { provenance: opts.provenance !== false });

  const parsed = parseGraph(cleanSource);
  const parseErrors = parsed.errors || [];
  if (parsed.nodes.size === 0) {
    return {
      ok: false, reason: 'no nodes parsed from source',
      parsed, annotationLines, annotationMeta, annotationErrors, parseErrors,
    };
  }

  const { atoms, relations, hiddenRelations } = relationalize(parsed);
  // The selector-only relations are hidden in the spec text itself rather than
  // by mutating the parsed spec afterwards, so `rules` is the whole spec: there
  // is nothing added downstream that could change what it entails. Both land in
  // `directives.hiddenFields` either way.
  const rules = mergeSpecStrings([
    resolveRules(parsed, opts, annoYaml),
    hideFieldsYaml(hiddenRelations),
  ]);

  return {
    ok: true,
    datum: { atoms, relations },
    rules, hiddenRelations, parsed, annotationLines, annotationMeta, annotationErrors, parseErrors,
  };
}

// The four engine entry points every solve needs, checked by name so a missing
// one is reported as such rather than as a TypeError three calls later.
function engineApi(spytial) {
  const { JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance } = spytial || {};
  for (const [name, fn] of Object.entries({ JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance })) {
    if (!fn) throw new Error(`spytial-gdl: spytial-core is missing ${name}; need spytial-core ≥ 5.0.0`);
  }
  return { JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance };
}

// ── Headless solve ───────────────────────────────────────────────────────────
// Hand a compiled diagram to the engine and collect what it has to say, without
// a DOM. Both render paths go through this, and so does
// test/engine-diagnostics.test.mjs, so what the suite checks is what a page
// reports.
//
//   spytial  — the engine (window.spytialcore, or `import('spytial-core')`)
//   compiled — an `ok` result of compileSpytialGdl
//   opts     — { validator?: 'qualitative' | 'kiwi' }
//
// Returns { instance, evaluator, spec, rules, result, layout, error,
//           selectorErrors, warnings, diagnostics }. `diagnostics` is the
// engine's part only — a spec its parser refused, a selector it could not use,
// one that matched nothing — each on the annotation's line where there is one.
// sourceDiagnostics() holds the parser's and the annotation compiler's.
export function solveSpytialGdl(spytial, compiled, opts = {}) {
  const { JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance } = engineApi(spytial);
  if (!compiled || !compiled.ok) {
    throw new Error('solveSpytialGdl: expected an ok result of compileSpytialGdl');
  }
  const diagnostics = [];

  // 1. datum → relational data instance, and the evaluator over it
  const instance = new JSONDataInstance(compiled.datum);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });

  // 2. layout rules → parsed spec. The engine's parser throws on a spec it
  //    refuses, and every rule goes with it; say so, and solve under only the
  //    hideField directives so the graph is still drawn once, with the reason
  //    beside it, rather than not at all.
  let rules = compiled.rules;
  let spec;
  try {
    spec = parseLayoutSpec(rules || '');
  } catch (err) {
    diagnostics.push({
      severity: 'error', source: 'engine', code: 'rules-rejected',
      message: 'the engine rejected the layout rules, so the diagram is drawn without them: ' +
        (err && err.message ? err.message : String(err)),
    });
    rules = hideFieldsYaml(compiled.hiddenRelations);
    spec = parseLayoutSpec(rules || '');
  }

  // 3. solve (qualitative validator → IIS clash reporting / counterfactual)
  const li = new LayoutInstance(spec, evaluator, 0, true, undefined, opts.validator || 'qualitative');
  const result = li.generateLayout(instance);

  // 4. what the solve had to say
  diagnostics.push(...engineDiagnostics(result, compiled.annotationMeta));

  return {
    instance, evaluator, spec, rules, result,
    layout: result.layout,
    error: result.error || null,
    selectorErrors: Array.isArray(result.selectorErrors) ? result.selectorErrors : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    diagnostics,
  };
}

// Render a spytial-gdl `source` onto a <webcola-cnd-graph> element using
// Spytial's standard constraint-layout pipeline.
//
//   graphEl  — a <webcola-cnd-graph> element (see mountGraph)
//   source   — spytial-gdl text (nodes/edges) with inline `@orientation(...)`
//              spatial annotations (see annotations.js)
//   opts     — { rules?: string, extraSpec?: string, validator?: 'qualitative'|'kiwi' }
//
// Returns { applied, layout, error, selectorErrors, warnings, diagnostics,
//           annotationErrors, parseErrors, parsed, data, instance, rules,
//           hiddenRelations }. `diagnostics` is every problem in one list, with
// line numbers where there are any: the parser's, the annotation compiler's,
// and the engine's (see diagnostics.js).
export async function renderSpytialGdl(graphEl, source, opts = {}) {
  if (!graphEl || typeof graphEl.renderLayout !== 'function') {
    throw new Error(
      'renderSpytialGdl: graphEl must be a <webcola-cnd-graph> element. ' +
        'Use mountGraph(container) to create one.'
    );
  }

  const spytial = getSpytialCore();
  engineApi(spytial);

  // 0. annotations → spec, notation → graph, graph → datum. Everything up to
  //    here is engine-independent and shared with the editable path.
  const compiled = compileSpytialGdl(source, opts);
  const { parsed, annotationErrors, parseErrors } = compiled;
  const own = sourceDiagnostics(annotationErrors, parseErrors);
  if (!compiled.ok) {
    return { applied: false, reason: compiled.reason, parsed, annotationErrors, parseErrors, diagnostics: own };
  }
  const { datum: data, hiddenRelations } = compiled;

  // 1. solve headlessly, collecting what the engine says on the way
  const solved = solveSpytialGdl(spytial, compiled, opts);
  const { instance, rules, layout, error, selectorErrors, warnings } = solved;
  const diagnostics = [...own, ...solved.diagnostics];

  // 2. reflect a constraint clash on the element (drives the renderer's
  //    conflict styling). A selector error is not a clash: the engine skipped
  //    that one rule and solved the rest, and it is reported in `diagnostics`.
  if (error) graphEl.setAttribute('unsat', '');
  else graphEl.removeAttribute('unsat');

  // 3. render whatever layout came back. On a clash it is the best-feasible
  //    counterfactual; with a selector error it is the layout under every
  //    other rule. Both are worth drawing, and both are explained beside it.
  let applied = false;
  if (layout) {
    blankDefaultLabels(layout);
    if (typeof graphEl.clear === 'function') graphEl.clear();
    await graphEl.renderLayout(layout);
    applied = true;
  }

  return {
    applied, layout, error, selectorErrors, warnings, diagnostics,
    annotationErrors, parseErrors, parsed, data, instance, rules, hiddenRelations,
  };
}

// ── Editable rendering ───────────────────────────────────────────────────────
// The same graph, but rendered onto spytial-core's <structured-input-graph>
// editor instead of the read-only <webcola-cnd-graph>. You can add / delete
// nodes, drag to connect edges, rename relations — constraints re-solve live —
// and at any time *re-get the notation* via the handle's getSource(). That
// round-trip (text → visual → edit → text) is the point.

// The live instance the editor is currently backed by. clearAllItems() swaps in
// a fresh instance, so always ask the element rather than caching it.
function liveInstance(el, fallback) {
  try {
    return (typeof el.getDataInstance === 'function' && el.getDataInstance()) || fallback;
  } catch (_) {
    return fallback;
  }
}

// Build the handle returned by renderSpytialGdlEditable.
function buildEditableHandle(el, initialInstance, annotationLines, meta) {
  const getValue = () => {
    const inst = liveInstance(el, initialInstance);
    return inst && typeof inst.reify === 'function' ? inst.reify() : { atoms: [], relations: [] };
  };
  // The headline: re-get spytial-gdl notation for the current (edited) graph,
  // with the original spatial @annotations re-appended verbatim.
  const getSource = () => serializeToSpytialGdl(getValue(), { annotations: annotationLines });

  // Subscribe to edits. Every mutation — toolbar, drag-to-connect, delete,
  // keyboard — flows through the data instance, which emits these four events;
  // that's a more reliable signal than the element's constraint events (which
  // only fire on error-state transitions). Coalesce a burst of synchronous
  // mutations (e.g. an edge rename = remove + add) into one callback.
  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    const DATA_EVENTS = ['atomAdded', 'atomRemoved', 'relationTupleAdded', 'relationTupleRemoved'];
    let bound = null;
    let scheduled = false;
    const fire = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        let error = null;
        try { error = el.getCurrentConstraintError ? el.getCurrentConstraintError() : null; } catch (_) {}
        cb({ source: getSource(), value: getValue(), error });
      });
    };
    const unbind = () => {
      if (bound && typeof bound.removeEventListener === 'function') {
        for (const ev of DATA_EVENTS) bound.removeEventListener(ev, fire);
      }
      bound = null;
    };
    const bind = (inst) => {
      if (!inst || inst === bound || typeof inst.addEventListener !== 'function') return;
      unbind();
      for (const ev of DATA_EVENTS) inst.addEventListener(ev, fire);
      bound = inst;
    };
    // "Clear all" replaces the instance — rebind to the new one and report it.
    const onCleared = () => { bind(liveInstance(el, null)); fire(); };
    el.addEventListener('all-items-cleared', onCleared);
    bind(liveInstance(el, initialInstance));
    return () => { unbind(); el.removeEventListener('all-items-cleared', onCleared); };
  }

  return {
    applied: true,
    element: el,
    dataInstance: initialInstance,
    parsed: meta.parsed,
    annotationErrors: meta.annotationErrors,
    parseErrors: meta.parseErrors,
    diagnostics: meta.diagnostics,
    hiddenRelations: meta.hiddenRelations,
    rules: meta.rules,
    getValue,
    getSource,
    onChange,
  };
}

// Render a spytial-gdl `source` onto an editable <structured-input-graph>.
//
//   container — an Element to mount into, or a <structured-input-graph> itself
//   source    — spytial-gdl text with inline @annotations (same as renderSpytialGdl)
//   opts      — { rules?, extraSpec?, width?, height?, theme?, ariaLabel? }
//
// Returns a handle:
//   { applied, element, dataInstance, parsed, annotationErrors, parseErrors,
//     diagnostics, hiddenRelations, rules, getSource(), getValue(),
//     onChange(cb) → unsubscribe }
// or { applied:false, reason, ... } if the source has no nodes. `diagnostics`
// is the same list renderSpytialGdl returns, for the text that was applied.
export async function renderSpytialGdlEditable(container, source, opts = {}) {
  const spytial = getSpytialCore();
  const { JSONDataInstance } = engineApi(spytial);

  const el =
    container && container.tagName && container.tagName.toLowerCase() === 'structured-input-graph'
      ? container
      : mountInputGraph(container, opts);
  if (typeof el.setDataInstance !== 'function' || typeof el.setCnDSpec !== 'function') {
    throw new Error(
      'renderSpytialGdlEditable: <structured-input-graph> is not registered. ' +
        'Load spytial-core ≥ 5.0.0 (its global build registers the element).'
    );
  }

  // 0. same compilation as the read-only path. `annotationLines` comes back too,
  //    so getSource() can re-append the annotations verbatim on the round-trip
  //    (the compiled specYaml is a lossy form).
  const compiled = compileSpytialGdl(source, opts);
  const { parsed, annotationLines, annotationErrors, parseErrors } = compiled;
  const own = sourceDiagnostics(annotationErrors, parseErrors);
  if (!compiled.ok) {
    return { applied: false, reason: compiled.reason, element: el, parsed, annotationErrors, parseErrors, diagnostics: own };
  }
  const { datum, hiddenRelations } = compiled;

  // 1. a headless solve first, for what the engine has to say. The editor
  //    element solves too, but it reports only a constraint clash: a spec its
  //    parser refuses is logged to the console and the graph is drawn under no
  //    rules at all, and a selector it cannot use is dropped without a word.
  //    Solving here, through the same public calls the read-only path uses,
  //    surfaces both.
  const solved = solveSpytialGdl(spytial, compiled, opts);
  const rules = solved.rules;
  const diagnostics = [...own, ...solved.diagnostics];

  // 2. datum → input-capable data instance (the editor mutates it in place)
  const instance = new JSONDataInstance(datum);

  // 3. hand off data + spec; the element owns layout + live constraint enforcement
  el.setDataInstance(instance);
  await el.setCnDSpec(rules);

  return buildEditableHandle(el, instance, annotationLines, {
    parsed,
    annotationErrors,
    parseErrors,
    diagnostics,
    hiddenRelations,
    rules,
  });
}
