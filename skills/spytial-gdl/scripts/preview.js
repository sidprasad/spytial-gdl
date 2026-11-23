import { mountGraph, renderSpytialGdl } from 'spytial-gdl';

const status = document.querySelector('#status');
const download = document.querySelector('#download');

async function render() {
  const source = JSON.parse(document.querySelector('#source').textContent);
  const graph = mountGraph(document.querySelector('#diagram'), {
    width: 960, height: 600, theme: 'light',
  });
  let layoutError;
  graph.addEventListener('layout-error', ({ detail }) => { layoutError = detail.message; });
  const result = await renderSpytialGdl(graph, source);
  const error = result.error?.message
    ?? result.diagnostics.find(({ severity }) => severity === 'error')?.message
    ?? layoutError;
  if (error) throw new Error(error);
  if (!result.applied || !graph.getNodePositions().length) {
    throw new Error(result.reason ?? 'The diagram has no visible nodes.');
  }

  await document.fonts.ready;
  download.addEventListener('click', () => graph.takeScreenshot());
  download.hidden = false;
  status.textContent = '';
  status.dataset.state = 'ready';
}

render().catch((error) => {
  status.textContent = error.message;
  status.dataset.state = 'error';
});
