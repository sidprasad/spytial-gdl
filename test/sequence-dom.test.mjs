import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import * as core from 'spytial-core';
import { mountGdlSequence } from '../src/index.js';
import { renderSpytialGdls } from '../src/markdown.js';

const dom = new JSDOM('<!doctype html><html lang="en"><title>Sequences</title><body><main><div id="host"></div></main></body></html>', { runScripts: 'outside-only' });
const win = dom.window, doc = win.document;
const originals = new Map(['window', 'document', 'Element', 'customElements', 'spytialcore'].map(key => [key, globalThis[key]]));
Object.assign(globalThis, { window: win, document: doc, Element: win.Element, customElements: win.customElements, spytialcore: core });
win.spytialcore = core;
const clone = value => JSON.parse(JSON.stringify(value));
const renders = [];
let gate = null;
class Graph extends win.HTMLElement {
  constructor() { super(); this.live = { positions: [], transform: { k: 1, x: 0, y: 0 } }; this.disconnects = 0; }
  async setViewOptions() {}
  disconnectedCallback() { this.disconnects++; }
  clear() { this.live = { positions: [], transform: { k: 1, x: 0, y: 0 } }; }
  getLayoutState() { return this.live; }
  resetViewToFitContent() { this.fits = (this.fits || 0) + 1; }
  async renderLayout(layout, options) {
    if (gate) await gate;
    const seed = options?.policy?.apply({
      priorState: options.priorPositions, prevInstance: options.prevInstance, currInstance: options.currInstance,
      spec: core.parseLayoutSpec(''),
    }).effectivePriorState;
    renders.push({ graph: this, options, seed: seed && clone(seed) });
    this.live = {
      positions: layout.nodes.map((node, i) => ({ id: node.id, x: 100 + i * 100, y: 100,
        ...seed?.positions.find(position => position.id === node.id) })),
      transform: seed?.transform ? { ...seed.transform } : { k: 1, x: 0, y: 0 },
    };
  }
  drag(id, x, y) {
    Object.assign(this.live.positions.find(position => position.id === id), { x, y });
    this.dispatchEvent(new win.CustomEvent('node-drag-end'));
  }
}
win.customElements.define('webcola-cnd-graph', Graph);
const source = `gdl-sequence
policy: stability
state s10 { a -> b }
state { a -> b\nb -> c }
state s2 { a -> c }
state fourth { a -> d }
state { a -> e }
`;
const at = (state, id) => state.positions.find(position => position.id === id);
const host = doc.getElementById('host');
let handle;
try {
  handle = mountGdlSequence(host, source, { reader: false });
  assert.equal((await handle.ready).busy, false, 'awaited snapshots report the committed view');
  assert.equal(handle.state.applied, true);
  assert.equal(host.querySelector('.sequence-controls select'), null, 'policy belongs to the source, not the viewer controls');
  assert.equal(handle.setPolicy, undefined, 'a mounted sequence has no policy override');
  const first = handle.state.states[0].graph;
  first.drag('a', 345, 456); first.live.transform = { k: 1.7, x: 11, y: 22 };
  await handle.next();
  assert.equal(handle.state.states[0].graph, first, 'single view reuses core for morphing');
  assert.deepEqual(at(renders.at(-1).seed, 'a'), { id: 'a', x: 345, y: 456 });
  first.drag('a', 555, 666);
  await handle.previous();
  assert.deepEqual(at(renders.at(-1).seed, 'a'), { id: 'a', x: 555, y: 666 }, 'back uses the live departing arrangement');
  assert.deepEqual(renders.at(-1).seed.transform, { k: 1.7, x: 11, y: 22 });
  assert.equal(first.disconnects, 0);

  host.querySelector('[aria-label="Two states"]').click();
  await handle.setView('pair');
  assert.equal(host.querySelector('[aria-label="Two states"]').getAttribute('aria-pressed'), 'true');
  assert.equal(host.querySelector('[aria-label="One state"]').getAttribute('aria-pressed'), 'false');
  let [left, right] = handle.state.states;
  assert.equal(left.graph, first);
  assert.equal(right.index, 1);
  assert.equal(left.graph.fits, 1, 'mode changes fit the resized retained pane without re-solving it');
  left.graph.drag('a', 101, 102); right.graph.drag('a', 701, 702);
  assert.equal(at(left.graph.live, 'a').x, 101, 'paired drags are independent');
  const oldRight = right.graph, beforeNext = renders.length;
  await handle.next();
  assert.equal(renders.length, beforeNext + 1, 'overlap is not solved again');
  [left, right] = handle.state.states;
  assert.equal(left.graph, oldRight, 'right becomes left without disconnecting it');
  assert.equal(oldRight.disconnects, 0);
  assert.deepEqual(at(renders.at(-1).seed, 'a'), { id: 'a', x: 701, y: 702 });
  left.graph.drag('a', 801, 802); right.graph.drag('a', 901, 902);
  await handle.previous();
  [left, right] = handle.state.states;
  assert.equal(right.graph, oldRight, 'previous retains the old left as the right pane');
  assert.equal(oldRight.disconnects, 0);
  assert.deepEqual(at(renders.at(-1).seed, 'a'), { id: 'a', x: 801, y: 802 }, 'previous uses old left, irrespective of right drag');
  assert.deepEqual([...host.querySelector('.sequence-stage').children].map(pane => Number(pane.dataset.stateIndex)), [0, 1],
    'DOM and visual order agree after backward navigation without moving the retained graph');

  right.graph.drag('a', 1101, 1102);
  const jump = renders.length;
  await handle.goTo('fourth');
  assert.deepEqual(handle.state.states.map(state => state.index), [3, 4]);
  assert.equal(renders.length, jump + 2);
  assert.deepEqual(renders[jump].seed, renders[jump + 1].seed, 'a pair jump shares one frozen departure snapshot');
  assert.equal(at(renders[jump].seed, 'a').x, 1101);
  [left, right] = handle.state.states;
  left.graph.drag('a', 1201, 1202); right.graph.drag('a', 1301, 1302);
  await handle.goTo(0);
  assert.equal(at(renders.at(-1).seed, 'a').x, 1201, 'earlier jumps use the outgoing left boundary');
  assert.equal(at(renders.at(-2).seed, 'a').x, 1201);

  [left, right] = handle.state.states;
  right.graph.dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
  const selected = right.graph;
  await handle.setView('single');
  assert.equal(handle.state.index, 1, 'single view keeps the selected pane');
  assert.equal(handle.state.states[0].graph, selected);
  assert.equal(selected.disconnects, 0);
  await handle.goTo(4);
  const last = handle.state.states[0].graph;
  await handle.setView('pair');
  assert.deepEqual(handle.state.states.map(state => state.index), [3, 4], 'pair mode includes the selected endpoint');
  assert.equal(handle.state.states[1].graph, last);
  const modeRenders = renders.length;
  await handle.setView('pair');
  assert.equal(renders.length, modeRenders, 'setting the same view is a no-op');

  for (const policy of ['ignore_history', 'change_emphasis', 'random_positioning']) {
    const policyHost = doc.createElement('div'); doc.querySelector('main').append(policyHost);
    const viewer = mountGdlSequence(policyHost, source.replace('policy: stability', `policy: ${policy}`), { reader: false });
    try {
      await viewer.ready;
      viewer.state.states[0].graph.drag('a', 651, 652);
      await viewer.next();
      assert.equal(viewer.state.policy, policy);
      assert.equal(renders.at(-1).options.policy.name, policy, 'the source selects the core policy');
      if (policy === 'ignore_history') assert.equal(renders.at(-1).seed, undefined, 'fresh policy suppresses implicit core continuity');
      if (policy === 'change_emphasis') assert.deepEqual(at(renders.at(-1).seed, 'a'), { id: 'a', x: 651, y: 652 });
      if (policy === 'random_positioning') assert.equal(renders.at(-1).seed.positions.length, 3);
    } finally { viewer.dispose(); policyHost.remove(); }
  }
  await handle.setView('single'); await handle.goTo(0);
  // An unrelated policy invocation cannot insert remembered coordinates into
  // a new node of this embed, even when its id happens to match.
  core.stability.apply({ priorState: { positions: [{ id: 'c', x: 99999, y: 99999 }] }, currInstance: new core.JSONDataInstance({ atoms: [{ id: 'c', type: '' }], relations: [] }) });
  await handle.next();
  assert.equal(renders.at(-1).seed.positions.some(position => position.id === 'c'), false);

  // Both UI routes (range and buttons) use the same controller.
  const slider = host.querySelector('input[type=range]');
  slider.value = '3'; slider.dispatchEvent(new win.Event('change'));
  await handle.next(); // serialized after the UI jump
  assert.equal(handle.state.index, 4);
  assert.equal(host.querySelector('[aria-label="Next state"]').disabled, true);
  await handle.previous();
  assert.equal(host.querySelector('.sequence-position').textContent, '4 / 5');
  handle.setTheme('dark'); assert.equal(handle.element.dataset.theme, 'dark');
  const helpMenu = host.querySelector('.sequence-help-menu');
  helpMenu.querySelector('summary').click();
  assert.equal(helpMenu.open, true);
  assert.match(helpMenu.textContent, /arrangement you leave/);
  helpMenu.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(helpMenu.open, false);
  assert.equal(handle.state.states[0].graph.getAttribute('theme'), 'dark');
  const clippedGraph = handle.state.states[0].graph;
  clippedGraph.getNodeBounds = () => [{ id: 'a', x: 2000, y: 100, width: 100, height: 60 }];
  clippedGraph.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, right: 800, top: 0, bottom: 600 });
  const beforeFit = clippedGraph.fits || 0;
  await handle.previous();
  assert.equal(clippedGraph.fits, beforeFit + 1, 'clipped entering nodes are revealed by fitting the camera');
  delete clippedGraph.getNodeBounds;
  const shadow = clippedGraph.attachShadow({ mode: 'open' });
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const svgNode = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  svgNode.classList.add('node'); svgNode.__data__ = { id: 'a' };
  const rectangle = doc.createElementNS(svgNode.namespaceURI, 'rect');
  rectangle.getBoundingClientRect = () => ({ x: 1000, y: 100, width: 100, height: 60 });
  svgNode.append(rectangle); svg.append(svgNode); shadow.append(svg);
  await handle.previous();
  assert.equal(clippedGraph.fits, beforeFit + 2, 'older core bundles use drawn bounds to reveal clipped nodes');

  win.eval(axe.source);
  const audit = await win.axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
  assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations.map(item => `${item.id}: ${item.help}`)));
  handle.dispose(); handle.dispose(); assert.equal(host.children.length, 0);

  // Markdown marker variations, no header required inside the fence, source
  // disclosure and no automatic refit that would discard a carried camera.
  host.innerHTML = '<pre><code class="language-gdl-sequence">state before { a }\nstate { a -&gt; b }</code></pre>';
  const blocks = await renderSpytialGdls(host, { injectEngine: false, reader: false });
  assert.equal(blocks.length, 1); assert.equal(blocks[0].sequence, true); assert.equal(blocks[0].applied, true);
  assert.ok(host.querySelector('.sequence-controls .spytial-gdl-source-toggle'));
  assert.equal((await renderSpytialGdls(host, { injectEngine: false })).length, 0, 'embeds are not rendered twice');
  blocks[0].handle.dispose(); host.replaceChildren();
  host.innerHTML = '<pre data-language="gdl-sequence">state { a }\nstate { b }</pre>';
  const dataBlock = await renderSpytialGdls(host, { injectEngine: false, reader: false });
  assert.equal(dataBlock[0].sequence, true); dataBlock[0].handle.dispose(); host.replaceChildren();

  handle = mountGdlSequence(host, 'state {}', { reader: false, view: 'pair' });
  await handle.ready; assert.equal(handle.state.view, 'single');
  assert.match(host.textContent, /Empty state/);
  handle.dispose();
  handle = mountGdlSequence(host, 'state same {}\nstate same {}', { reader: false });
  await handle.ready; assert.equal(handle.state.applied, false);
  assert.match(host.textContent, /duplicate state id/);
  handle.dispose();

  // Disposal while core awaits translation cannot remount readers or emit a
  // late change into a new source application.
  let release;
  gate = new Promise(resolve => { release = resolve; });
  let changes = 0;
  handle = mountGdlSequence(host, source, { onChange: () => changes++ });
  await new Promise(resolve => setTimeout(resolve, 0));
  handle.dispose(); release(); await handle.ready; gate = null;
  assert.equal(changes, 0); assert.equal(host.children.length, 0);
  console.log('Sequence DOM: bidirectional live carry, independent pairs, retained elements, boundary jumps, modes, policies, isolation, accessible controls, Markdown and disposal passed.');
} finally {
  handle?.dispose();
  for (const [key, value] of originals) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  win.close();
}
