import assert from 'node:assert/strict';
import { renderSpytialGdl } from '../src/index.js';

const previousCore = globalThis.spytialcore;
globalThis.spytialcore = await import('spytial-core');

try {
  const priorState = {
    positions: [{ id: 'A', x: 120, y: 80 }, { id: 'B', x: 310, y: 80 }],
    transform: { k: 1.4, x: 20, y: 35 },
  };
  let cleared = 0;
  const renders = [];
  const graph = {
    async setViewOptions() {},
    clear() { cleared++; },
    removeAttribute() {},
    getLayoutState() { return priorState; },
    async renderLayout(layout, options) { renders.push({ layout, options }); },
  };

  await renderSpytialGdl(graph, 'A -> B');
  assert.equal(cleared, 1, 'ordinary rendering clears the old diagram');
  assert.equal(renders[0].options, undefined, 'ordinary rendering starts fresh');

  await renderSpytialGdl(graph, 'A -> B\n@orientation(selector=_links, directions=[right])',
    { preservePositions: true });
  assert.equal(cleared, 1, 'continuity keeps the displayed graph until renderLayout reads it');
  assert.deepEqual(renders[1].options, { priorPositions: priorState },
    'core receives the displayed positions and viewport');

  await renderSpytialGdl(graph, 'flowchart TD\nsubgraph cluster\nA --> B\nend',
    { preservePositions: true });
  assert.equal(cleared, 2, 'rejected source still clears the old diagram');

  console.log('Render continuity: 4 passed, 0 failed');
} finally {
  if (previousCore === undefined) delete globalThis.spytialcore;
  else globalThis.spytialcore = previousCore;
}
