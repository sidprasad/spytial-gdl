import { parseGraph } from '../src/parse.js';

// Derive the comparison from the actual hero, before autoRender replaces it.
// Only notation and type declarations change, never graph structure or labels.
export function mermaidSource(source) {
  const graph = parseGraph(source);
  const nodes = [...graph.nodes].map(([id, node]) => `  ${id}["${node.label}"]`);
  const edges = graph.edges.map(edge => `  ${edge.source} -->|${edge.label}| ${edge.target}`);
  return ['flowchart TB', ...nodes, ...edges].join('\n');
}

export function setupComparison(doc, loadMermaid = () => import('https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.esm.min.mjs')) {
  const source = doc.getElementById('board-graph');
  const details = doc.getElementById('mermaid-comparison');
  if (!source || !details) return;
  const code = mermaidSource(source.textContent);
  doc.getElementById('mermaid-source').textContent = code;
  const preview = doc.getElementById('mermaid-preview');
  const status = doc.getElementById('mermaid-status');
  let pending = false;
  let rendered = false;
  details.addEventListener('toggle', async () => {
    if (!details.open || pending || rendered) return;
    pending = true;
    status.textContent = 'Loading Mermaid…';
    try {
      const { default: mermaid } = await loadMermaid();
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      const { svg } = await mermaid.render('mermaid-board', code);
      preview.innerHTML = svg;
      rendered = true;
      status.textContent = '';
    } catch {
      status.textContent = 'Mermaid could not load. You can still read the source below. Close and reopen to retry.';
    } finally {
      pending = false;
    }
  });
}

if (typeof document !== 'undefined') setupComparison(document);
