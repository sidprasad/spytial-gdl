// Markdown integration — render ```spytial-graph fenced blocks the way people
// render ```mermaid, entirely client-side.
//
// This is framework-agnostic: it scans *already-rendered* HTML for the code
// blocks a markdown renderer (marked, markdown-it, MkDocs, Docusaurus, GitHub
// pipelines, …) produces for a fenced block tagged `spytial-graph`, and swaps
// each one for a live <webcola-cnd-graph>. So a doc author writes:
//
//     ```spytial-graph
//     flowchart TD
//       A -->|left| B
//       A -->|right| C
//       class A,B,C tree
//
//     @orientation(selector=tree_edge, directions=[below])
//     @orientation(selector=left,  directions=[left])
//     @orientation(selector=right, directions=[right])
//     ```
//
// …and gets a live, draggable constraint diagram.
//
// Usage on a page (mirrors mermaid's `mermaid.initialize({ startOnLoad: true })`):
//
//     import { initStartOnLoad } from '.../src/markdown.js';
//     initStartOnLoad();
//
// or, to render a specific subtree after you inject HTML yourself:
//
//     import { renderSpytialGraphs } from '.../src/markdown.js';
//     await renderSpytialGraphs(myContainer);

import { mountGraph, renderMermaid } from './index.js';

// Languages that mark a SpyTial graph block. `spytial-graph` is canonical;
// `spytial` is accepted as an alias.
const LANGS = ['spytial-graph', 'spytial'];

// CSS selectors covering how common markdown renderers tag a fenced block:
//   marked / markdown-it / Prism / highlight.js → <pre><code class="language-spytial-graph">
//   some pipelines emit the class on the <pre>   → <pre class="language-spytial-graph">
//   hand-authored containers                     → <div class="spytial-graph">
function blockSelector() {
  const sels = [];
  for (const lang of LANGS) {
    sels.push(`pre > code.language-${lang}`);
    sels.push(`code.language-${lang}`);
    sels.push(`pre.language-${lang}`);
    sels.push(`pre.${lang}`);
    sels.push(`div.${lang}`);
  }
  return sels.join(', ');
}

// The element we replace in the DOM: for a <code> inside a <pre>, replace the
// whole <pre>; otherwise replace the matched element itself.
function hostFor(el) {
  if (el.tagName === 'CODE' && el.parentElement && el.parentElement.tagName === 'PRE') {
    return el.parentElement;
  }
  return el;
}

function collectBlocks(root) {
  const found = new Map(); // host element → source text (dedup by host)
  for (const el of root.querySelectorAll(blockSelector())) {
    const host = hostFor(el);
    if (host.dataset && host.dataset.spytialProcessed) continue;
    if (found.has(host)) continue;
    // textContent is entity-decoded, so `-->` and `>` come through verbatim.
    found.set(host, el.textContent);
  }
  return found;
}

// Is the spytial-core engine (+ the custom element) ready on the page?
function engineReady() {
  const core =
    (typeof window !== 'undefined' && (window.spytialcore || window.CndCore || window.CnDCore)) ||
    (typeof globalThis !== 'undefined' && (globalThis.spytialcore || globalThis.CndCore));
  return !!(
    core &&
    core.JSONDataInstance &&
    core.LayoutInstance &&
    core.parseLayoutSpec &&
    core.SGraphQueryEvaluator &&
    typeof customElements !== 'undefined' &&
    customElements.get('webcola-cnd-graph')
  );
}

// Wait (poll) for the engine to finish loading. spytial-core exposes its global
// asynchronously, so a page may call us before it's ready.
export function whenEngineReady(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (engineReady()) return resolve();
    const start = Date.now();
    (function poll() {
      if (engineReady()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('spytial-core engine did not load (check the CDN scripts)'));
      }
      setTimeout(poll, 50);
    })();
  });
}

function makeContainer(doc, opts) {
  const wrap = doc.createElement('div');
  wrap.className = 'spytial-graph-rendered';
  wrap.dataset.spytialProcessed = '1';
  const h = opts.height != null ? opts.height : 360;
  wrap.style.cssText =
    `position: relative; width: 100%; height: ${typeof h === 'number' ? h + 'px' : h};` +
    ' border: 1px solid #e2e5ea; border-radius: 8px; overflow: hidden; margin: 12px 0; background: #fff;';
  return wrap;
}

function renderError(doc, host, message) {
  const pre = doc.createElement('pre');
  pre.className = 'spytial-graph-error';
  pre.dataset.spytialProcessed = '1';
  pre.style.cssText =
    'color: #b00020; background: #fff3f3; border: 1px solid #f3c2c2; border-radius: 8px;' +
    ' padding: 10px 12px; margin: 12px 0; white-space: pre-wrap; font-size: 13px;';
  pre.textContent = 'spytial-graph error: ' + message;
  host.replaceWith(pre);
}

// Render every spytial-graph block under `root` (default: the whole document).
// Returns an array of per-block results: { host, applied?, error?, result? }.
//
//   opts.height   — diagram height (number px or CSS string). Default 360.
//                   A block can override with a data-height attribute.
//   opts.theme    — 'light' | 'dark' passed to mountGraph.
//   opts.waitForEngine — wait for spytial-core to load first (default true).
export async function renderSpytialGraphs(root = document, opts = {}) {
  const doc = root.ownerDocument || (root.nodeType === 9 ? root : document);
  if (opts.waitForEngine !== false) {
    await whenEngineReady(opts.timeoutMs);
  }

  const blocks = collectBlocks(root);
  const results = [];

  for (const [host, source] of blocks) {
    // Per-block height override via `data-height` on the host or its <code>.
    const dataH = host.getAttribute && host.getAttribute('data-height');
    const wrap = makeContainer(doc, dataH ? { ...opts, height: dataH } : opts);
    host.replaceWith(wrap);

    try {
      const graphEl = mountGraph(wrap, { theme: opts.theme });
      const result = await renderMermaid(graphEl, source);
      // Re-fit the view once the layout has been drawn.
      try { graphEl.resetViewToFitContent && graphEl.resetViewToFitContent(); } catch (_) {}
      setTimeout(() => {
        try { graphEl.resetViewToFitContent && graphEl.resetViewToFitContent(); } catch (_) {}
      }, 400);
      results.push({ host: wrap, applied: result.applied, result });
    } catch (err) {
      renderError(doc, wrap, err && err.message ? err.message : String(err));
      results.push({ host: wrap, error: err });
    }
  }

  return results;
}

// Render once the DOM is ready (and the engine has loaded). The one-liner a
// page adds to turn on auto-rendering, à la mermaid's startOnLoad.
export function initStartOnLoad(opts = {}) {
  const run = () => {
    renderSpytialGraphs(document, opts).catch((err) => {
      // Surface load failures on the console rather than failing silently.
      console.error('[spytial-graph] auto-render failed:', err);
    });
  };
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
