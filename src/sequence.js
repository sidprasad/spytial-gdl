import { parseGdlSequence } from './sequence-parser.js';
import { compileSpytialGdl, renderCompiledSpytialGdl, mountGraph } from './index.js';
import { mergeSpecStrings } from './registry.js';
import { sourceDiagnostics } from './diagnostics.js';

function uniqueDiagnostics(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = JSON.stringify([item.line, item.source, item.code, item.message]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// Known names remain valid when their extension is empty in another snapshot.
// No atoms/edges are inherited. A spelling absent from the whole collection
// still reaches core as an unknown selector and is diagnosed normally.
function shareVocabulary(states) {
  const vocabulary = new Map([
    ['_', { id: 'rel_unlabeled', name: '_', types: ['', ''], tuples: [] }],
    ['_links', { id: 'rel_all_edges', name: '_links', types: ['', ''], tuples: [] }],
  ]);
  for (const state of states) {
    if (!state.compiled.ok) continue;
    for (const relation of state.compiled.datum.relations) {
      vocabulary.set(relation.name, { ...relation, tuples: [] });
    }
    for (const atom of state.compiled.datum.atoms) {
      if (atom.type && !vocabulary.has(atom.type)) vocabulary.set(atom.type, {
        id: `seq_type_${atom.type}`, name: atom.type, types: [''], tuples: [],
      });
    }
  }
  for (const { compiled } of states) {
    if (!compiled.ok) continue;
    const present = new Set(compiled.datum.relations.map(relation => relation.name));
    for (const atom of compiled.datum.atoms) if (atom.type) present.add(atom.type);
    const hidden = new Set(compiled.hiddenRelations);
    hidden.add('_links');
    for (const [name, relation] of vocabulary) {
      if (present.has(name)) continue;
      compiled.datum.relations.push({ ...relation, types: [...relation.types], tuples: [] });
      // Empty type/class predicates are selector-only, just like GDL classes.
      if (relation.types.length === 1) hidden.add(name);
    }
    compiled.hiddenRelations = [...hidden];
    compiled.rules = mergeSpecStrings([compiled.rules,
      'directives:\n' + [...hidden].map(field => `  - hideField: { field: '${field.replace(/'/g, "''")}' }`).join('\n') + '\n']);
  }
}

export function compileGdlSequence(source, opts = {}) {
  const parsed = parseGdlSequence(source);
  const states = parsed.states.map(state => ({
    ...state, compiled: compileSpytialGdl(state.source, { ...opts, allowEmpty: true }),
  }));
  shareVocabulary(states);
  const diagnostics = uniqueDiagnostics([
    ...parsed.errors,
    ...states.flatMap(({ compiled }) => sourceDiagnostics(compiled.annotationErrors, compiled.parseErrors)),
  ]);
  return { ...parsed, states, diagnostics, ok: parsed.ok && states.every(state => state.compiled.ok) };
}

function capture(pane) {
  if (!pane?.result?.instance) return null;
  const live = pane.graph.getLayoutState?.() || { positions: [] };
  return {
    instance: pane.result.instance,
    state: {
      positions: (live.positions || []).map(position => ({ ...position })),
      ...(live.transform ? { transform: { ...live.transform } } : {}),
    },
  };
}

// Core 6.x's registered stability object has process-wide brief-recall memory.
// A GDL transition is explicitly scoped to its departing pane: filter out
// recalled hints that were not in that snapshot. This avoids cross-embed and
// sibling-pane leakage while leaving policy transforms and solving in core.
// There is intentionally no per-state saved arrangement or absent-node recall.
function departingPolicy(core, name) {
  if (typeof core?.getSequencePolicy !== 'function') {
    throw new Error('GDL sequences require spytial-core with getSequencePolicy');
  }
  const policy = core.getSequencePolicy(name);
  if (policy?.name !== name) throw new Error(`spytial-core does not provide the ${name} sequence policy`);
  if (name !== 'stability') return policy;
  return {
    name,
    apply(context) {
      const result = policy.apply(context);
      if (!result.effectivePriorState) return result;
      const ids = new Set(context.priorState.positions.map(position => position.id));
      return { ...result, effectivePriorState: {
        ...result.effectivePriorState,
        positions: result.effectivePriorState.positions.filter(position => ids.has(position.id)),
      } };
    },
  };
}

function conflictText(error) {
  if (!error) return '';
  const messages = error.errorMessages;
  return [error.message || 'These rules cannot all hold.',
    ...(Array.isArray(messages) ? messages.map(item => typeof item === 'string' ? item : item.message || item.source || '') : []),
  ].filter(Boolean).join('\n');
}

// Mount immediately; await handle.ready for the first render. Navigation is
// serialized, and source geometry is captured at execution time, after any
// intervening drag. Retained panes are never detached or rendered again.
export function mountGdlSequence(container, source, opts = {}) {
  if (!container?.ownerDocument) throw new Error('mountGdlSequence: container must be an Element');
  const doc = container.ownerDocument, win = doc.defaultView;
  const compiled = compileGdlSequence(source, opts);
  const core = win?.spytialcore || globalThis.spytialcore;
  const policyName = compiled.policy;
  let view = opts.view === 'pair' && compiled.states.length > 1 ? 'pair' : 'single';
  let panes = [], active = null, start = 0, disposed = false, busy = false;
  let runtimeDiagnostics = [];
  let queue = Promise.resolve();
  const abort = new AbortController();
  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const root = el('section', 'spytial-gdl-sequence');
  root.dataset.spytialProcessed = '1';
  root.setAttribute('aria-label', opts.ariaLabel || 'Graph sequence');
  root.style.cssText = 'display:flex;flex-direction:column;min-width:0;height:100%;color:var(--seq-ink);background:var(--seq-bg);font:13px/1.4 system-ui,sans-serif;';
  const style = el('style');
  style.textContent = `
    .spytial-gdl-sequence { --seq-bg:#fff;--seq-ink:#202733;--seq-border:#e2e5ea;--seq-soft:#526172;--seq-accent:#22734b;--seq-hover:#edf2ef; }
    .spytial-gdl-sequence[data-theme="dark"] { --seq-bg:#181b21;--seq-ink:#e8eaee;--seq-border:#333c48;--seq-soft:#b1bbc8;--seq-accent:#73ce9a;--seq-hover:#29392f; }
    .spytial-gdl-sequence .sequence-controls { display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:3px 7px;border-bottom:1px solid var(--seq-border);color:var(--seq-soft);font-size:11px; }
    .spytial-gdl-sequence button { font:inherit;color:inherit;background:transparent;border:0;border-radius:4px;padding:4px 7px; }
    .spytial-gdl-sequence button { cursor:pointer; }
    .spytial-gdl-sequence button:disabled { opacity:.3;cursor:default; }
    .spytial-gdl-sequence .sequence-controls button { display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;padding:0; }
    .spytial-gdl-sequence .sequence-controls button:hover:not(:disabled) { background:var(--seq-hover);color:var(--seq-ink); }
    .spytial-gdl-sequence :focus-visible { outline:2px solid var(--seq-accent);outline-offset:2px; }
    .spytial-gdl-sequence .sequence-timeline { display:flex;align-items:center;flex:1 1 100px;min-width:64px; }
    .spytial-gdl-sequence .sequence-timeline input { appearance:none;-webkit-appearance:none;width:100%;height:28px;margin:0;background:transparent;cursor:pointer; }
    .spytial-gdl-sequence .sequence-timeline input::-webkit-slider-runnable-track { height:2px;background:var(--seq-border);border-radius:1px; }
    .spytial-gdl-sequence .sequence-timeline input::-webkit-slider-thumb { appearance:none;-webkit-appearance:none;width:8px;height:8px;margin-top:-3px;border:0;border-radius:50%;background:var(--seq-accent); }
    .spytial-gdl-sequence .sequence-timeline input::-moz-range-track { height:2px;background:var(--seq-border);border:0; }
    .spytial-gdl-sequence .sequence-timeline input::-moz-range-thumb { width:8px;height:8px;border:0;border-radius:50%;background:var(--seq-accent); }
    .spytial-gdl-sequence .sequence-position { font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 6px; }
    .spytial-gdl-sequence .sequence-view-toggle { display:flex;gap:2px;border-inline-start:1px solid var(--seq-border);padding-inline-start:6px; }
    .spytial-gdl-sequence .sequence-view-toggle button[aria-pressed="true"] { color:var(--seq-accent);background:var(--seq-hover); }
    .spytial-gdl-sequence .sequence-stage { display:flex;flex:1;min-height:0;min-width:0;overflow:hidden; }
    .spytial-gdl-sequence .sequence-pane { display:flex;flex-direction:column;flex:1 1 0;min-width:0;min-height:0;position:relative; }
    .spytial-gdl-sequence .sequence-state { border-radius:0;text-align:start;color:var(--seq-soft);padding:3px 8px;min-height:24px;font-size:11px; }
    .spytial-gdl-sequence .sequence-state::before { content:'';display:inline-block;width:4px;height:4px;border-radius:50%;margin-right:5px;vertical-align:middle;background:var(--seq-accent);opacity:0; }
    .spytial-gdl-sequence .sequence-state[aria-pressed="true"] { color:var(--seq-accent);font-weight:500; }
    .spytial-gdl-sequence .sequence-state[aria-pressed="true"]::before { opacity:1; }
    .spytial-gdl-sequence .sequence-graph { flex:1;min-height:0;position:relative; }
    .spytial-gdl-sequence webcola-cnd-graph { display:block;width:100%;height:100%; }
    .spytial-gdl-sequence .sequence-empty { position:absolute;inset:45% 0 auto;text-align:center;pointer-events:none;color:var(--seq-soft); }
    .spytial-gdl-sequence .sequence-reader { max-height:45%;overflow:auto;border-top:1px solid var(--seq-border); }
    .spytial-gdl-sequence .sequence-reader[hidden] { display:none; }
    .spytial-gdl-sequence summary { cursor:pointer;padding:4px 8px;font-size:11px;color:var(--seq-soft); }
    .spytial-gdl-sequence .sequence-diagnostics { flex:0 0 auto;max-height:100px;overflow:auto;color:var(--seq-ink); }
    .spytial-gdl-sequence .sequence-diagnostics:not(:empty) { padding:5px 9px;border-top:1px solid var(--seq-border); }
    .spytial-gdl-sequence .sequence-diagnostics p { margin:3px 0;white-space:pre-wrap; }
    .spytial-gdl-sequence .sequence-help-menu { position:relative; }
    .spytial-gdl-sequence .sequence-help-menu > summary { display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;list-style:none;border-radius:4px; }
    .spytial-gdl-sequence .sequence-help-menu > summary::-webkit-details-marker { display:none; }
    .spytial-gdl-sequence .sequence-help-menu > summary:hover { background:var(--seq-hover); }
    .spytial-gdl-sequence .sequence-help { position:absolute;right:0;top:100%;z-index:5;width:240px;max-width:70vw;box-sizing:border-box;margin:4px 0 0;padding:10px 12px;border:1px solid var(--seq-border);border-radius:6px;background:var(--seq-bg);color:var(--seq-ink);font-size:12px;line-height:1.5;box-shadow:0 3px 12px #0001; }
  `;
  const controls = el('div', 'sequence-controls');
  const button = (label, aria) => {
    const node = el('button', '', label); node.type = 'button';
    node.setAttribute('aria-label', aria || label); node.title = aria || label; return node;
  };
  const previous = button('←', 'Previous state'), next = button('→', 'Next state');
  const timeline = el('label', 'sequence-timeline');
  const slider = el('input'); slider.type = 'range'; slider.min = '0'; slider.step = '1';
  slider.setAttribute('aria-label', 'State position'); timeline.append(slider);
  const label = el('span', 'sequence-position'); label.setAttribute('aria-live', 'polite'); label.setAttribute('aria-atomic', 'true');
  const viewToggle = el('div', 'sequence-view-toggle');
  viewToggle.setAttribute('role', 'group'); viewToggle.setAttribute('aria-label', 'Sequence view');
  const viewButton = (title, columns) => {
    const node = button('', title);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 18 14'); svg.setAttribute('width', '18'); svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    for (let i = 0; i < columns; i++) {
      const rect = doc.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', String(2 + i * 8)); rect.setAttribute('y', '2');
      rect.setAttribute('width', columns === 1 ? '14' : '6'); rect.setAttribute('height', '10'); rect.setAttribute('rx', '1');
      svg.append(rect);
    }
    node.append(svg); return node;
  };
  const singleView = viewButton('One state', 1), pairView = viewButton('Two states', 2);
  viewToggle.append(singleView, pairView);
  const helpMenu = el('details', 'sequence-help-menu');
  const helpToggle = el('summary');
  const helpIcon = el('span', '', '?'); helpIcon.setAttribute('aria-hidden', 'true');
  helpToggle.append(helpIcon);
  helpToggle.setAttribute('aria-label', 'How sequence navigation works'); helpToggle.title = 'How sequence navigation works';
  controls.append(previous, next, timeline, label, viewToggle, helpMenu);
  const stage = el('div', 'sequence-stage');
  const help = el('p', 'sequence-help');
  helpMenu.append(helpToggle, help);
  helpMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { helpMenu.open = false; helpToggle.focus(); }
  });
  const diagnosticsEl = el('div', 'sequence-diagnostics'); diagnosticsEl.setAttribute('role', 'status');
  root.append(style, controls, stage, diagnosticsEl);
  container.append(root);

  const stateLabel = index => {
    const state = compiled.states[index];
    return `State ${index + 1}${state?.id ? ` · ${state.id}` : ''}`;
  };
  function snapshot() {
    const diagnostics = uniqueDiagnostics([...compiled.diagnostics, ...runtimeDiagnostics,
      ...panes.flatMap(pane => pane.result?.diagnostics || [])]);
    return {
      applied: compiled.ok && panes.length > 0 && panes.every(pane => pane.result?.applied),
      view, index: start, activeIndex: active?.index ?? start, policy: policyName,
      count: compiled.states.length, busy, diagnostics,
      states: panes.map(pane => ({ index: pane.index, id: compiled.states[pane.index].id, graph: pane.graph, result: pane.result })),
    };
  }
  function reflect() {
    if (disposed) return;
    const count = compiled.states.length, pair = view === 'pair';
    slider.max = String(Math.max(0, count - (pair ? 2 : 1))); slider.value = String(start);
    label.textContent = count ? (pair ? `${start + 1}–${start + 2} / ${count}` : `${start + 1} / ${count}`) : 'No states';
    slider.setAttribute('aria-valuetext', pair ? `${stateLabel(start)} and ${stateLabel(start + 1)}` : stateLabel(start));
    previous.disabled = busy || !compiled.ok || start === 0;
    next.disabled = busy || !compiled.ok || start >= count - (pair ? 2 : 1);
    slider.disabled = busy || !compiled.ok || count <= (pair ? 2 : 1);
    singleView.setAttribute('aria-pressed', String(!pair)); pairView.setAttribute('aria-pressed', String(pair));
    singleView.disabled = busy || !compiled.ok;
    pairView.disabled = busy || !compiled.ok || count < 2;
    root.setAttribute('aria-busy', String(busy));
    help.textContent = pair
      ? 'Drag either pane independently. Next uses the right arrangement; Previous uses the left. Select a state header to keep it in one-state view.'
      : 'Drag to arrange. Moving in either direction uses the arrangement you leave.';
    for (const pane of panes) pane.heading.setAttribute('aria-pressed', String(pane === active));
    const value = snapshot();
    diagnosticsEl.replaceChildren();
    for (const diagnostic of value.diagnostics) {
      diagnosticsEl.append(el('p', '', `${diagnostic.line ? `Line ${diagnostic.line}: ` : ''}${diagnostic.message}`));
    }
    for (const pane of panes) if (pane.result?.error) {
      diagnosticsEl.append(el('p', '', `${stateLabel(pane.index)}: ${conflictText(pane.result.error)}`));
    }
  }
  function notify() { if (!disposed) opts.onChange?.(snapshot()); }
  function disposePane(pane) {
    pane.cancelFit?.();
    pane.reader?.dispose(); pane.graph.clear?.(); pane.element.remove();
  }
  // Fit a resized pane, or reveal nodes outside a carried camera, using core's
  // public viewport APIs. This never changes coordinates or re-solves a graph.
  // Cancel the pending fit if the user starts interacting before it settles.
  function fitAfterRender(pane, force) {
    pane.cancelFit?.();
    let cancelled = false;
    const clipped = () => {
      const bounds = pane.graph.getNodeBounds?.() || [];
      const transform = pane.graph.getLayoutState?.().transform;
      const viewport = pane.graph.getBoundingClientRect();
      if (!viewport.width || !viewport.height) return false;
      if (transform && bounds.length) return bounds.some(node =>
        (node.x - node.width / 2) * transform.k + transform.x < 0
        || (node.x + node.width / 2) * transform.k + transform.x > viewport.width
        || (node.y - node.height / 2) * transform.k + transform.y < 0
        || (node.y + node.height / 2) * transform.k + transform.y > viewport.height);
      // Core 6.5's browser bundle predates getNodeBounds. Read the drawn
      // rectangles for this viewport check; no layout state is changed here.
      return Array.from(pane.graph.shadowRoot?.querySelectorAll('g.node, g.error-node') || []).some(node => {
        const box = Array.from(node.children).find(child => child.localName === 'rect')?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 && (
          box.x < viewport.left || box.x + box.width > viewport.right
          || box.y < viewport.top || box.y + box.height > viewport.bottom);
      });
    };
    const fit = () => {
      if (!cancelled && !disposed && (force || clipped())) pane.graph.resetViewToFitContent?.();
    };
    const cancel = () => {
      cancelled = true;
      pane.graph.removeEventListener('layout-complete', complete);
      pane.element.removeEventListener('pointerdown', cancel, true);
      pane.element.removeEventListener('wheel', cancel, true);
    };
    const complete = () => { fit(); cancel(); };
    pane.graph.addEventListener('layout-complete', complete, { once: true });
    pane.element.addEventListener('pointerdown', cancel, true);
    pane.element.addEventListener('wheel', cancel, true);
    pane.cancelFit = cancel;
    return fit;
  }
  function makePane(index) {
    const element = el('section', 'sequence-pane');
    const heading = button(stateLabel(index)); heading.className = 'sequence-state';
    const graphHost = el('div', 'sequence-graph');
    element.append(heading, graphHost);
    // Insert only the NEW pane in source order. Never move a retained custom
    // element: disconnecting it would tear down core's live drag handlers.
    // DOM, keyboard and visual order consequently agree in either direction.
    element.dataset.stateIndex = String(index);
    const following = [...stage.children].find(child => Number(child.dataset.stateIndex) > index);
    stage.insertBefore(element, following || null);
    const graph = mountGraph(graphHost, { theme: opts.theme, ariaLabel: stateLabel(index) });
    const pane = { index, element, heading, graph, result: null, graphHost };
    if (opts.reader !== false) {
      const details = el('details', 'sequence-reader'), summary = el('summary', '', 'Explore this state');
      // A host's graph reader is optional. Reveal the disclosure only when
      // the render pipeline returns a reader handle for this state.
      details.hidden = true; pane.readerDetails = details;
      pane.readerSlot = el('div'); details.append(summary, pane.readerSlot); element.append(details);
    }
    const selectPane = () => { if (!disposed && !busy) { active = pane; reflect(); notify(); } };
    heading.addEventListener('click', selectPane);
    element.addEventListener('pointerdown', selectPane, true);
    element.addEventListener('focusin', selectPane);
    return pane;
  }
  async function draw(pane, index, from) {
    pane.index = index;
    pane.element.dataset.stateIndex = String(index);
    pane.heading.textContent = stateLabel(index);
    pane.graph.setAttribute('aria-label', stateLabel(index));
    const reducedMotion = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const transition = from ? {
      policy: departingPolicy(core, policyName), prevInstance: from.instance,
      priorPositions: from.state, ...(reducedMotion ? { transitionMode: 'replace' } : {}),
    } : undefined;
    pane.result = null;
    try {
      pane.result = await renderCompiledSpytialGdl(pane.graph, compiled.states[index].compiled, {
        ...opts, signal: abort.signal, reader: pane.readerSlot, sequenceTransition: transition,
      });
      if (pane.result.reader) pane.reader = pane.result.reader;
      if (pane.readerDetails) pane.readerDetails.hidden = !pane.result.reader;
    } catch (error) {
      pane.reader?.dispose(); pane.reader = null; pane.graph.clear?.();
      throw error;
    }
    if (disposed) { disposePane(pane); return; }
    pane.graphHost.querySelector('.sequence-empty')?.remove();
    if (compiled.states[index].compiled.datum?.atoms.length === 0) pane.graphHost.append(el('span', 'sequence-empty', 'Empty state'));
  }
  async function change(index, nextView = view) {
    if (disposed || !compiled.ok) return snapshot();
    const pair = nextView === 'pair' && compiled.states.length > 1;
    const nextStart = Math.max(0, Math.min(Math.trunc(index), compiled.states.length - (pair ? 2 : 1)));
    const indices = pair ? [nextStart, nextStart + 1] : [nextStart];
    if (panes.length && nextView === view && nextStart === start) return snapshot();
    const modeChange = nextView !== view;
    const boundary = modeChange ? (active || panes[0])
      : nextStart < start ? panes[0] : panes.at(-1);
    const from = capture(boundary);
    const old = panes;
    // In single view reuse the element, allowing core to morph the old graph.
    const reuseSingle = !pair && view === 'single' && old.length === 1;
    const incoming = indices.map(i => (reuseSingle ? old[0] : old.find(pane => pane.index === i)) || makePane(i));
    for (const pane of old) if (!incoming.includes(pane)) disposePane(pane);
    panes = incoming;
    view = pair ? 'pair' : 'single'; start = nextStart;
    if (!panes.includes(active)) active = panes[0];
    for (let i = 0; i < panes.length; i++) {
      panes[i].element.style.borderInlineStart = i ? '1px solid var(--seq-border)' : '0';
    }
    // Give the new pane its final size before core reads viewport bounds.
    reflect();
    const forceFit = modeChange || (!old.length && pair);
    const fits = panes.flatMap((pane, i) => forceFit || !pane.result || pane.index !== indices[i]
      ? [fitAfterRender(pane, forceFit)] : []);
    for (let i = 0; i < panes.length; i++) {
      if (!panes[i].result || panes[i].index !== indices[i]) {
        await draw(panes[i], indices[i], from || (i ? capture(panes[0]) : null));
      }
      if (disposed) return snapshot();
    }
    fits.forEach(fit => fit());
    reflect(); return snapshot();
  }
  function enqueue(operation) {
    const result = queue.then(async () => {
      if (disposed) return snapshot();
      busy = true; runtimeDiagnostics = []; reflect();
      try { await operation(); }
      finally { busy = false; reflect(); }
      notify(); return snapshot();
    });
    queue = result.catch(() => {});
    return result;
  }
  function report(error) {
    if (disposed) return;
    runtimeDiagnostics = [{ severity: 'error', source: 'sequence', code: 'sequence-render', message: error.message || String(error) }];
    reflect(); notify();
    opts.onError?.(error);
  }
  const targetIndex = target => {
    const index = typeof target === 'string' ? compiled.states.findIndex(state => state.id === target) : target;
    if (!Number.isInteger(index) || index < 0 || index >= compiled.states.length) throw new Error(`unknown state: ${target}`);
    return index;
  };
  const handle = {
    element: root, compiled,
    get state() { return snapshot(); },
    goTo: target => enqueue(() => change(targetIndex(target))),
    next: () => enqueue(() => change(start + 1)),
    previous: () => enqueue(() => change(start - 1)),
    setView: value => enqueue(() => {
      if (value !== 'single' && value !== 'pair') throw new Error('view must be single or pair');
      if (value === view) return snapshot();
      return change(active?.index ?? start, value);
    }),
    setTheme(value) {
      opts = { ...opts, theme: value }; root.dataset.theme = value;
      for (const pane of panes) pane.graph.setAttribute('theme', value);
    },
    dispose() {
      if (disposed) return;
      disposed = true; abort.abort();
      for (const pane of panes) disposePane(pane);
      root.remove();
    },
  };
  root.dataset.theme = opts.theme || 'light';
  previous.addEventListener('click', () => handle.previous().catch(report));
  next.addEventListener('click', () => handle.next().catch(report));
  slider.addEventListener('change', () => handle.goTo(Number(slider.value)).catch(report));
  singleView.addEventListener('click', () => handle.setView('single').catch(report));
  pairView.addEventListener('click', () => handle.setView('pair').catch(report));
  reflect();
  handle.ready = enqueue(() => change(Number.isInteger(opts.index) ? opts.index : 0));
  // ready remains rejectable to API callers; also show a useful UI message.
  handle.ready.catch(report);
  return handle;
}
