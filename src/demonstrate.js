// Show, don't tell — the demonstration mode.
//
// Constraint inference has always had a question it could not answer from the
// geometry: *was that drag a demonstration?* Dragging a node to read the label
// behind it and dragging it to say "children go below their parents" produce the
// same event. observe.js names the problem in its own header and settles for a
// guess — the baseline is captured at first touch, every drag sets a mark.
//
// A mode answers it by asking. You say "I'm about to show you something", which
// is the baseline; you arrange; you say "that's what I meant", which is when the
// inference runs. Nothing is inferred from a drag you did not frame that way,
// because outside the mode nothing is even watched.
//
//   idle ──"✦ Show, don't tell"──▶ demonstrating ──"Explain this ▸"──▶ offering
//     ▲                                  │  ▲                            │
//     └──────────"Cancel"────────────────┘  └────"Keep arranging" ────────┘
//                                           └────  (any drag)     ────────┘
//
// Two exports, deliberately split. `createDemonstration` is the machine and
// touches no DOM, so it runs in a plain Node test. `mountDemonstration` is the
// chrome, and takes only a document and a host element — which is what lets the
// markdown device and the playground mount the same feature instead of growing
// two of them.

import { observeArrangement } from './observe.js';

export const IDLE = 'idle';
export const DEMONSTRATING = 'demonstrating';
export const OFFERING = 'offering';

const NOTHING_MOVED = 'Drag the nodes into the arrangement you want, then explain.';
const NOTHING_GENERALIZES =
  'Nothing here generalizes to a relation yet — try arranging more pairs of the same kind.';

// The machine. `graphEl` is anything that dispatches the renderer's drag events
// and can report `getNodePositions()`; see observe.js.
//
//   opts.onChange — called with status() after every transition
//   opts.infer    — passed through to `propose` (maxDepth, maxSuggestions, …)
export function createDemonstration(graphEl, opts = {}) {
  let state = IDLE;
  let observer = null;
  let proposals = [];
  let note = '';
  let accepted = null;

  const notify = () => {
    if (typeof opts.onChange !== 'function') return;
    try { opts.onChange(handle.status()); }
    catch (_) { /* a listener must not break the mode */ }
  };

  // A drag while an offer is on screen makes that offer stale: each row carries
  // a proposal computed from an arrangement that no longer exists, and accepting
  // one would write an annotation about the drawing as it *was*. So a drag drops
  // the offers and returns to arranging — the demonstration itself survives,
  // because the baseline is still the one declared at `begin`.
  const onObserved = () => {
    if (state === OFFERING) { proposals = []; state = DEMONSTRATING; }
    note = '';
    notify();
  };

  const teardown = () => {
    if (observer) observer.detach();
    observer = null;
    proposals = [];
    note = '';
  };

  const handle = {
    get state() { return state; },
    /** The live observer, or null outside the mode. Exposed for the ledger. */
    get observer() { return observer; },

    status() {
      const s = observer ? observer.summary() : { marked: 0, explained: 0, hasBaseline: false };
      return {
        state,
        marked: s.marked,
        explained: s.explained,
        hasBaseline: s.hasBaseline,
        proposals,
        note,
        accepted,
        canExplain: state !== IDLE && s.marked > 0,
      };
    },

    // Enter the mode. The baseline is captured HERE — declared rather than
    // inferred from whichever drag happened to come first. Observation starts
    // here too: outside the mode a drag is just a drag, and not watching is the
    // only way to mean that.
    begin() {
      if (state !== IDLE) return handle.status();
      observer = observeArrangement(graphEl, { onChange: onObserved });
      observer.captureBaseline(true);
      proposals = []; note = ''; accepted = null;
      state = DEMONSTRATING;
      notify();
      return handle.status();
    },

    // Read the arrangement. Proposals put us in `offering`; none leaves us
    // arranging with something to say about why, since "nothing generalizes" is
    // an invitation to show more rather than a dead end.
    explain(data) {
      if (state === IDLE || !observer) return handle.status();
      const out = observer.propose(data, opts.infer || {});
      proposals = out.proposals || [];
      if (proposals.length > 0) {
        state = OFFERING;
        note = '';
      } else {
        state = DEMONSTRATING;
        note = observer.hasEvidence ? NOTHING_GENERALIZES : NOTHING_MOVED;
      }
      notify();
      return handle.status();
    },

    // Take one. The marks it accounts for are credited before we leave, so the
    // caller can report what the demonstration bought. Applying the line is the
    // caller's job — this module never writes to the source.
    accept(proposal) {
      if (state !== OFFERING) return handle.status();
      const summary = observer.accept(proposal);
      accepted = {
        line: proposal && proposal.line,
        explained: summary.explained,
        marked: summary.marked,
      };
      teardown();
      state = IDLE;
      notify();
      return handle.status();
    },

    /** None of these — back to arranging, demonstration intact. */
    dismiss() {
      if (state !== OFFERING) return handle.status();
      proposals = [];
      state = DEMONSTRATING;
      notify();
      return handle.status();
    },

    /** Leave without taking anything. The demonstration is forgotten. */
    cancel() {
      if (state === IDLE) return handle.status();
      teardown();
      accepted = null;
      state = IDLE;
      notify();
      return handle.status();
    },

    detach() {
      teardown();
      state = IDLE;
    },
  };

  return handle;
}

// ── chrome ──────────────────────────────────────────────────────────────────

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = '"SF Mono","JetBrains Mono","Fira Code",ui-monospace,Menlo,Consolas,monospace';

function palette(dark) {
  return dark
    ? { bg: '#16281e', ink: '#bfe6cf', border: '#24422f', accent: '#3fae74', accentInk: '#06140c',
        slot: '#12201a', soft: '#8fbfa4', btnBg: '#1b3226' }
    : { bg: '#f0f9f3', ink: '#1e5637', border: '#cbe8d8', accent: '#2d8659', accentInk: '#ffffff',
        slot: '#f7fcf9', soft: '#4a7a5f', btnBg: '#ffffff' };
}

// Mount the mode under a diagram.
//
//   doc     — the owning document
//   host    — an element to render into; its contents are managed here
//   graphEl — the graph the user will rearrange
//   opts.dark     — match the surrounding theme
//   opts.getData  — () => { atoms, relations } as the graph currently stands
//   opts.onApply  — (line) => Promise; append the accepted annotation
//   opts.infer    — inference options (maxDepth, maxSuggestions, …)
//
// Returns the machine, with `detach()` extended to clear the chrome.
export function mountDemonstration(doc, host, graphEl, opts = {}) {
  const C = palette(!!opts.dark);
  const maxSuggestions = (opts.infer && opts.infer.maxSuggestions) || 5;

  const btn = (label, title, primary) => {
    const b = doc.createElement('button');
    b.type = 'button'; b.textContent = label; if (title) b.title = title;
    b.style.cssText =
      `appearance: none; cursor: pointer; font: ${primary ? '600 ' : ''}11px/1 ${SANS};` +
      ` padding: 4px 10px; white-space: nowrap; border-radius: 6px;` +
      (primary
        ? ` border: 1px solid ${C.accent}; background: ${C.accent}; color: ${C.accentInk};`
        : ` border: 1px solid ${C.border}; background: ${C.btnBg}; color: ${C.ink};`);
    return b;
  };

  const line = (text, css) => {
    const el = doc.createElement('div');
    el.style.cssText = css;
    el.textContent = text;
    return el;
  };

  // What a proposal is worth saying about itself. A suggestion that reaches past
  // what was shown and would actually move something is the one thing worth
  // checking before accepting — pairs the drawing already honours are not, since
  // accepting changes nothing about them. A ring is counted in nodes, because
  // "covers 5" is not what a person sees when they look at one.
  const note = (p) => {
    if (p.kind === 'cyclic') return `${p.members.length}-node ring, ${p.value}`;
    return p.predicts.length
      ? `covers ${p.covered}, would also move ${p.predicts.length}`
      : `covers ${p.covered}`;
  };

  const render = (s) => {
    host.textContent = '';
    host.style.cssText =
      `border-top: 1px solid ${C.border}; border-left: 3px solid ${C.accent};` +
      ` background: ${C.bg}; color: ${C.ink}; padding: 8px 12px;`;

    const bar = doc.createElement('div');
    bar.style.cssText = 'display: flex; align-items: center; gap: 9px; flex-wrap: wrap;';
    host.appendChild(bar);

    const label = doc.createElement('span');
    label.style.cssText = `flex: 1 1 200px; min-width: 0; font: 12px/1.35 ${SANS};`;
    bar.appendChild(label);

    if (s.state === IDLE) {
      const start = btn('✦ Show, don\'t tell', 'Arrange the diagram by hand; I\'ll work out the rules', true);
      start.addEventListener('click', () => machine.begin());
      bar.insertBefore(start, label);
      label.textContent = s.accepted
        ? `Added ${s.accepted.line} — that explains ${s.accepted.explained} of the ${s.accepted.marked} you moved.`
        : 'Arrange the diagram by hand and I\'ll suggest the annotations that explain it.';
      if (s.accepted) label.style.opacity = '.85';
      return;
    }

    // In the mode: say what is being watched, and how much of it there is.
    label.innerHTML = '';
    const head = doc.createElement('strong');
    head.textContent = s.state === OFFERING ? '✦ Here\'s what would explain it' : '✦ Showing';
    head.style.cssText = 'font-weight: 700;';
    label.appendChild(head);
    const tail = doc.createElement('span');
    tail.style.cssText = 'opacity: .8;';
    tail.textContent = s.state === OFFERING
      ? ` — ${s.marked} moved`
      : ` — arrange it how you want it. ${s.marked} moved.`;
    label.appendChild(tail);

    if (s.state === DEMONSTRATING) {
      const go = btn('Explain this ▸', 'Work out the annotations that explain this arrangement', true);
      go.disabled = !s.canExplain;
      if (go.disabled) { go.style.opacity = '.45'; go.style.cursor = 'default'; }
      go.addEventListener('click', () => { if (!go.disabled) machine.explain(dataNow()); });
      bar.appendChild(go);
    } else {
      const back = btn('Keep arranging', 'Dismiss these and go back to the diagram');
      back.addEventListener('click', () => machine.dismiss());
      bar.appendChild(back);
    }

    const stop = btn('Cancel', 'Leave without adding anything');
    stop.addEventListener('click', () => machine.cancel());
    bar.appendChild(stop);

    if (s.note) {
      host.appendChild(line(s.note, `font: 11px/1.4 ${SANS}; opacity: .8; margin-top: 6px;`));
    }

    if (s.state !== OFFERING) return;

    // One arrangement can support a dozen true readings; a list that long is a
    // chore rather than an offer. They arrive ranked, so the tail is the least
    // consistent and least explanatory of the set.
    for (const p of s.proposals.slice(0, maxSuggestions)) {
      const row = doc.createElement('div');
      row.style.cssText =
        `display: flex; align-items: center; gap: 8px; padding: 5px 7px; margin: 4px 0 0;` +
        ` border: 1px solid ${C.border}; border-radius: 6px; background: ${C.slot};`;
      const code = doc.createElement('code');
      code.style.cssText =
        `flex: 1 1 auto; min-width: 0; overflow-x: auto; white-space: pre; font: 11.5px/1.5 ${MONO};`;
      code.textContent = p.line;
      row.appendChild(code);
      const why = doc.createElement('span');
      why.style.cssText = `flex: 0 0 auto; font: 10.5px/1.3 ${SANS}; opacity: .75; white-space: nowrap;`;
      why.textContent = note(p);
      row.appendChild(why);
      const add = btn('Add', 'Append this annotation to the source and re-run');
      add.style.flex = '0 0 auto';
      add.addEventListener('click', async () => {
        // Credit the marks this explains *before* applying: the re-render
        // replaces the arrangement, and what it bought should survive that.
        machine.accept(p);
        if (typeof opts.onApply === 'function') await opts.onApply(p.line);
      });
      row.appendChild(add);
      host.appendChild(row);
    }
  };

  const dataNow = () => {
    try { return typeof opts.getData === 'function' ? opts.getData() : null; }
    catch (_) { return null; }
  };

  const machine = createDemonstration(graphEl, { ...opts, onChange: render });

  // The suggestions band and the mode bar are one region now; the class stays so
  // existing selectors and styling hooks keep finding it.
  host.className = 'spytial-gdl-suggestions';
  host.dataset.spytialProcessed = '1';
  render(machine.status());

  const detach = machine.detach;
  machine.detach = () => { detach(); host.textContent = ''; host.style.display = 'none'; };
  return machine;
}
