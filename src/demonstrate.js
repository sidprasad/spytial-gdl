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
import { ALL_EDGES_RELATION } from './relationalize.js';
import { tokenizeLine, TOKEN_COLORS } from './highlight.js';

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

// ── what a suggestion is about ──────────────────────────────────────────────

// The nodes a proposal makes a claim about, as pairs and as a flat id list.
// Pure, and here rather than in the chrome, because "which nodes does this line
// talk about" is a fact about the proposal and not about how it is drawn.
//
// All three pair sets belong in it. `coveredPairs` is what you demonstrated and
// `consistentPairs` is what the drawing already honoured — but `predicts`, the
// pairs accepting the line would *move*, is the set most worth looking at and
// the only one you have no other way to find. Leaving it out would light up
// nothing new for the suggestion whose note reads "would also move 2", which is
// precisely the one you wanted to look at twice.
//
// A ring contributes `members` as well. Its `coveredPairs` are the consecutive
// pairs and do reach every member, but the members are what the proposal is
// about, and saying so is better than relying on that.
export function relatedNodes(proposal) {
  const pairs = [];
  const ids = new Set();

  const take = (list) => {
    for (const pair of list || []) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [a, b] = pair;
      if (a == null || b == null) continue;
      pairs.push([a, b]);
      ids.add(a);
      ids.add(b);
    }
  };

  if (proposal) {
    take(proposal.coveredPairs);
    take(proposal.consistentPairs);
    take(proposal.predicts);
    for (const id of proposal.members || []) if (id != null) ids.add(id);
  }

  return { pairs, ids: [...ids] };
}

// ── chrome ──────────────────────────────────────────────────────────────────

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = '"SF Mono","JetBrains Mono","Fira Code",ui-monospace,Menlo,Consolas,monospace';

// The band's own colours. `over` lets an embedder that has a house palette pass
// some or all of them in (see mountDemonstration's opts.palette) rather than
// living with a tint that doesn't match the page around it.
function palette(dark, over) {
  const base = dark
    ? { bg: '#16281e', ink: '#bfe6cf', border: '#24422f', accent: '#3fae74', accentInk: '#06140c',
        slot: '#12201a', soft: '#8fbfa4', btnBg: '#1b3226' }
    : { bg: '#f0f9f3', ink: '#1e5637', border: '#cbe8d8', accent: '#2d8659', accentInk: '#ffffff',
        slot: '#f7fcf9', soft: '#4a7a5f', btnBg: '#ffffff' };
  return over ? { ...base, ...over } : base;
}

/** A selector the renderer could plausibly know as a drawn relation. */
const BARE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Show the part of the diagram a suggestion is talking about.
//
// A line like `@orientation(selector=parent, directions=[below])` names a
// relation, not a picture, and which boxes on screen it would move is exactly
// what the text cannot say. Pointing at the selector asks the renderer to show
// them — which is also what turns "covers 3, would also move 2" from two numbers
// into something you can look at before you accept it.
//
// spytial-core owns the highlight: `highlightNodes`, `highlightNodePairs` and
// `clearNodeHighlights` for nodes, `highlightRelation` for edges. Ids it does
// not have it ignores, so "the ones that are on the graph" needs no filtering
// here. Every call is guarded — an older core, or a graph mid-teardown, means no
// highlight, never a throw out of a mouseenter handler.
function makeHighlighter(graphEl) {
  let lit = false;
  let relations = [];

  const call = (name, ...args) => {
    try {
      if (graphEl && typeof graphEl[name] === 'function') return graphEl[name](...args);
    } catch (_) { /* nothing drawn, or nothing left to draw on */ }
    return undefined;
  };

  // Edges are an extra cue where one exists, not the signal. Only a bare
  // relation name reaches them: `_links` means every drawn relation, a name the
  // renderer knows means itself, and the rest — products (`Person->Person`),
  // synthesized expressions (`~parentOf.parentOf`) — denote pairs that no drawn
  // edge stands for. The nodes carry the meaning in all of those cases, which is
  // why they and not this are what the highlight is built on.
  const edgesFor = (selector) => {
    const name = String(selector == null ? '' : selector);
    if (!BARE_NAME.test(name)) return [];
    const all = call('getAllRelations') || [];
    if (name === ALL_EDGES_RELATION) return [...all];
    return all.includes(name) ? [name] : [];
  };

  // Only ever undo our own highlight. `clearNodeHighlights` is indiscriminate —
  // it clears whatever the page had lit for its own reasons — so it is called
  // only after we put something up.
  const clear = () => {
    if (!lit) return;
    lit = false;
    call('clearNodeHighlights');
    for (const name of relations) call('clearHighlightRelation', name);
    relations = [];
  };

  const show = (proposal) => {
    clear();
    if (!proposal) return;
    const { pairs, ids } = relatedNodes(proposal);
    lit = true;
    // Blue-then-red is a claim about order, so it goes only to the one kind that
    // has one: `@orientation(selector=parent, directions=[below])` marks the
    // parents blue and the children red, which is the annotation read off the
    // screen. An alignment's pairs are unordered and every member of a ring is
    // both endpoint of something, so those take the single neutral highlight
    // rather than a direction they do not have.
    if (proposal.kind === 'orientation') call('highlightNodePairs', pairs);
    else call('highlightNodes', ids);
    relations = edgesFor(proposal.selector);
    for (const name of relations) call('highlightRelation', name);
  };

  return { show, clear };
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
//   opts.palette  — partial colour override: bg, ink, border, accent, accentInk,
//                   slot, soft, btnBg. Anything omitted keeps the default.
//
// Returns the machine, with `detach()` extended to clear the chrome.
export function mountDemonstration(doc, host, graphEl, opts = {}) {
  const C = palette(!!opts.dark, opts.palette);
  // The suggestions are source, so they are coloured like source — the same
  // violet marks the selector here and in the editor the user will paste it into.
  const ink = TOKEN_COLORS[opts.dark ? 'dark' : 'light'];
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
    // Rebuilding the rows removes the one under the cursor without a mouseleave,
    // so whatever it lit would stay lit over a diagram it no longer describes.
    highlighter.clear();
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
      ? ` — ${s.marked} moved. Point at a selector to see what it names.`
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
      // THE HOVER IS ON THE SELECTOR, NOT THE ROW. The selector is the only part
      // of the line that names anything on screen — `@orientation(selector=…,
      // directions=[below])` says which way, and `below` has no nodes to point
      // at. Hanging the highlight on the whole row would make the diagram flash
      // whenever the cursor crossed the list on its way to a button.
      for (const token of tokenizeLine(p.line).tokens) {
        const span = doc.createElement('span');
        span.textContent = token.text;
        const color = ink[token.kind];
        if (color) span.style.color = color;
        if (token.kind === 'selector') {
          span.style.textDecoration = 'underline dotted';
          span.style.textUnderlineOffset = '2px';
          span.style.cursor = 'help';
          span.title = 'The nodes this names';
          // Focus does the same, so reading the list with a keyboard is not the
          // poorer path. A span needs a tab stop of its own to get there.
          span.tabIndex = 0;
          span.addEventListener('mouseenter', () => highlighter.show(p));
          span.addEventListener('mouseleave', () => highlighter.clear());
          span.addEventListener('focus', () => highlighter.show(p));
          span.addEventListener('blur', () => highlighter.clear());
        }
        code.appendChild(span);
      }
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

  const highlighter = makeHighlighter(graphEl);

  const machine = createDemonstration(graphEl, { ...opts, onChange: render });

  // The suggestions band and the mode bar are one region now; the class stays so
  // existing selectors and styling hooks keep finding it.
  host.className = 'spytial-gdl-suggestions';
  host.dataset.spytialProcessed = '1';
  render(machine.status());

  const detach = machine.detach;
  machine.detach = () => {
    highlighter.clear();
    detach();
    host.textContent = '';
    host.style.display = 'none';
  };
  return machine;
}
