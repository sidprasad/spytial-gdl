// spytial-graph — render a small graph notation (nodes, edges, inline spatial
// @annotations) through SpyTial's standard WebCola CnD renderer.
//
// Pipeline (webcola-cnd-graph owns both layout AND drawing):
//
//   spytial-graph source
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

export { registerSpec, clearRegistry, mergeSpecsForClasses, mergeSpecStrings, extractAnnotations };

function getSpytialCore() {
  const s =
    (typeof window !== 'undefined' && (window.spytialcore || window.CndCore || window.CnDCore)) ||
    globalThis.spytialcore ||
    globalThis.CndCore;
  if (!s) {
    throw new Error(
      'spytial-graph: spytial-core is not loaded. Include ' +
        'spytial-core-complete.global.js (plus d3 v4 and cola.js) on the page.'
    );
  }
  return s;
}

// Create (or reuse) a <webcola-cnd-graph> element inside `container`. Returns
// the graph element to pass to renderSpytialGraph. If `container` is already a
// <webcola-cnd-graph>, it is returned as-is.
export function mountGraph(container, opts = {}) {
  if (!(container instanceof Element)) {
    throw new Error('mountGraph: container must be an Element');
  }
  if (container.tagName && container.tagName.toLowerCase() === 'webcola-cnd-graph') {
    return container;
  }
  let el = container.querySelector('webcola-cnd-graph');
  if (!el) {
    el = document.createElement('webcola-cnd-graph');
    if (opts.width != null) el.setAttribute('width', String(opts.width));
    if (opts.height != null) el.setAttribute('height', String(opts.height));
    if (opts.theme) el.setAttribute('theme', opts.theme);
    el.setAttribute('aria-label', opts.ariaLabel || 'Spytial constraint diagram');
    container.appendChild(el);
  }
  return el;
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

// Inject `hideField` directives for the selector-only relations so they stay
// queryable in selectors but are not drawn as duplicate edges. We mutate the
// parsed spec's directive list directly (the layout spec's data model), which
// avoids fragile YAML string surgery.
function hideRelations(spec, hiddenRelations) {
  if (!spec || !hiddenRelations || hiddenRelations.length === 0) return;
  if (!spec.directives) spec.directives = {};
  if (!Array.isArray(spec.directives.hiddenFields)) spec.directives.hiddenFields = [];
  const hidden = spec.directives.hiddenFields;
  for (const field of hiddenRelations) {
    if (!hidden.some(h => h && h.field === field)) hidden.push({ field });
  }
}

// Render a spytial-graph `source` onto a <webcola-cnd-graph> element using
// SpyTial's standard constraint-layout pipeline.
//
//   graphEl  — a <webcola-cnd-graph> element (see mountGraph)
//   source   — spytial-graph text (nodes/edges) with inline `@orientation(...)`
//              spatial annotations (see annotations.js)
//   opts     — { rules?: string, extraSpec?: string, validator?: 'qualitative'|'kiwi' }
//
// Returns { applied, layout, error, selectorErrors, annotationErrors, parsed,
//           data, instance, rules, hiddenRelations }.
export async function renderSpytialGraph(graphEl, source, opts = {}) {
  if (!graphEl || typeof graphEl.renderLayout !== 'function') {
    throw new Error(
      'renderSpytialGraph: graphEl must be a <webcola-cnd-graph> element. ' +
        'Use mountGraph(container) to create one.'
    );
  }

  const spytial = getSpytialCore();
  const { JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance } = spytial;
  for (const [name, fn] of Object.entries({ JSONDataInstance, SGraphQueryEvaluator, parseLayoutSpec, LayoutInstance })) {
    if (!fn) throw new Error(`spytial-graph: spytial-core is missing ${name}; need spytial-core ≥ 2.9`);
  }

  // 0. lift inline `@orientation(...)` annotations out of the source before
  //    parsing the graph; they compile to a layout spec, not graph syntax.
  const { source: cleanSource, specYaml: annoYaml, errors: annotationErrors } =
    extractAnnotations(source);

  const parsed = parseGraph(cleanSource);
  if (parsed.nodes.size === 0) {
    return { applied: false, reason: 'no nodes parsed from source', parsed, annotationErrors };
  }

  // 1. graph → relational data instance (+ which relations are selector-only)
  const { atoms, relations, hiddenRelations } = relationalize(parsed);
  const data = { atoms, relations };
  const instance = new JSONDataInstance(data);

  // 2. relational evaluator
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });

  // 3. layout rules (YAML) → parsed spec, then hide the selector-only relations
  const rules = resolveRules(parsed, opts, annoYaml);
  let spec;
  try {
    spec = parseLayoutSpec(rules || '');
  } catch (err) {
    throw new Error(`spytial-graph: layout rules parse error: ${err.message}`);
  }
  hideRelations(spec, hiddenRelations);

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

  return { applied, layout, error, selectorErrors, annotationErrors, parsed, data, instance, rules, hiddenRelations };
}
