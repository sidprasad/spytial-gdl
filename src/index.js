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
// global `window.spytialcore` (legacy alias `CndCore`); it auto-registers the
// <webcola-cnd-graph> custom element and needs d3 v4 + cola.js present. We do
// NOT import it, so this module loads as a bare ES module in the browser.

import { parseGraph } from './parse.js';
import { registerSpec, clearRegistry, mergeSpecsForClasses, mergeSpecStrings } from './registry.js';
import { relationalize, DEFAULT_RELATION } from './relationalize.js';
import { extractAnnotations } from './annotations.js';
import { serializeToSpytialGdl } from './serialize.js';

export { registerSpec, clearRegistry, mergeSpecsForClasses, mergeSpecStrings, extractAnnotations, serializeToSpytialGdl };

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
  const s =
    (typeof window !== 'undefined' && (window.spytialcore || window.CndCore || window.CnDCore)) ||
    globalThis.spytialcore ||
    globalThis.CndCore;
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
// custom element is registered by spytial-core's global build (≥ 4.1.0).
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
// annotationErrors, parseErrors }, or { ok: false, reason, ... } for a source
// with no nodes.
export function compileSpytialGdl(source, opts = {}) {
  const { source: cleanSource, specYaml: annoYaml, annotationLines, errors: annotationErrors } =
    extractAnnotations(source);

  const parsed = parseGraph(cleanSource);
  const parseErrors = parsed.errors || [];
  if (parsed.nodes.size === 0) {
    return {
      ok: false, reason: 'no nodes parsed from source',
      parsed, annotationLines, annotationErrors, parseErrors,
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
    rules, hiddenRelations, parsed, annotationLines, annotationErrors, parseErrors,
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
// Returns { applied, layout, error, selectorErrors, annotationErrors, parsed,
//           data, instance, rules, hiddenRelations }.
export async function renderSpytialGdl(graphEl, source, opts = {}) {
  if (!graphEl || typeof graphEl.renderLayout !== 'function') {
    throw new Error(
      'renderSpytialGdl: graphEl must be a <webcola-cnd-graph> element. ' +
        'Use mountGraph(container) to create one.'
    );
  }

  const spytial = getSpytialCore();
  const { JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance } = spytial;
  for (const [name, fn] of Object.entries({ JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance })) {
    if (!fn) throw new Error(`spytial-gdl: spytial-core is missing ${name}; need spytial-core ≥ 4.1.0`);
  }

  // 0. annotations → spec, notation → graph, graph → datum. Everything up to
  //    here is engine-independent and shared with the editable path.
  const compiled = compileSpytialGdl(source, opts);
  const { parsed, annotationErrors, parseErrors } = compiled;
  if (!compiled.ok) {
    return { applied: false, reason: compiled.reason, parsed, annotationErrors, parseErrors };
  }
  const { datum: data, rules, hiddenRelations } = compiled;

  // 1. datum → relational data instance
  const instance = new JSONDataInstance(data);

  // 2. relational evaluator
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });

  // 3. layout rules (YAML) → parsed spec. The hideField directives for the
  //    selector-only relations are already in `rules`.
  let spec;
  try {
    spec = parseLayoutSpec(rules || '');
  } catch (err) {
    throw new Error(`spytial-gdl: layout rules parse error: ${err.message}`);
  }

  // 4. solve (qualitative validator → IIS clash reporting / counterfactual)
  const li = new LayoutInstance(spec, evaluator, 0, true, undefined, opts.validator || 'qualitative');
  const result = li.generateLayout(instance);
  const layout = result.layout;
  const selectorErrors = result.selectorErrors || [];
  const error = result.error || null;

  // 5. reflect unsat state on the element (drives the renderer's conflict styling)
  if (selectorErrors.length > 0 || error) graphEl.setAttribute('unsat', '');
  else graphEl.removeAttribute('unsat');

  // 6. render. On a constraint clash, `layout` is the best-feasible
  //    counterfactual — still worth drawing. Selector errors mean the spec
  //    itself is malformed, so we skip drawing a degenerate layout.
  let applied = false;
  if (layout && selectorErrors.length === 0) {
    blankDefaultLabels(layout);
    if (typeof graphEl.clear === 'function') graphEl.clear();
    await graphEl.renderLayout(layout);
    applied = true;
  }

  return { applied, layout, error, selectorErrors, annotationErrors, parseErrors, parsed, data, instance, rules, hiddenRelations };
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
//   { applied, element, dataInstance, parsed, annotationErrors, hiddenRelations,
//     rules, getSource(), getValue(), onChange(cb) → unsubscribe }
// or { applied:false, reason, ... } if the source has no nodes.
export async function renderSpytialGdlEditable(container, source, opts = {}) {
  const spytial = getSpytialCore();
  const { JSONDataInstance } = spytial;
  if (!JSONDataInstance) {
    throw new Error('spytial-gdl: spytial-core is missing JSONDataInstance; need spytial-core ≥ 4.1.0');
  }

  const el =
    container && container.tagName && container.tagName.toLowerCase() === 'structured-input-graph'
      ? container
      : mountInputGraph(container, opts);
  if (typeof el.setDataInstance !== 'function' || typeof el.setCnDSpec !== 'function') {
    throw new Error(
      'renderSpytialGdlEditable: <structured-input-graph> is not registered. ' +
        'Load spytial-core ≥ 4.1.0 (its global build registers the element).'
    );
  }

  // 0. same compilation as the read-only path. `annotationLines` comes back too,
  //    so getSource() can re-append the annotations verbatim on the round-trip
  //    (the compiled specYaml is a lossy form).
  const compiled = compileSpytialGdl(source, opts);
  const { parsed, annotationLines, annotationErrors, parseErrors } = compiled;
  if (!compiled.ok) {
    return { applied: false, reason: compiled.reason, element: el, parsed, annotationErrors, parseErrors };
  }
  const { datum, rules, hiddenRelations } = compiled;

  // 1. datum → input-capable data instance (the editor mutates it in place)
  const instance = new JSONDataInstance(datum);

  // 2. hand off data + spec; the element owns layout + live constraint enforcement
  el.setDataInstance(instance);
  await el.setCnDSpec(rules);

  return buildEditableHandle(el, instance, annotationLines, {
    parsed,
    annotationErrors,
    parseErrors,
    hiddenRelations,
    rules,
  });
}
