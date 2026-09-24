// GDL's presentation defaults belong at the shared render boundary. Markdown,
// HTML, the playground, and programmatic callers all use the same core controls.
const configured = new WeakSet();
const STYLE_ID = 'spytial-gdl-graph-view';

export async function configureGraphView(graphEl, editable, overrides) {
  // Re-rendering source should preserve subsequent host customization. An
  // explicit viewOptions argument can update the presentation on any render.
  if (configured.has(graphEl) && overrides === undefined) return;
  if (typeof graphEl.setViewOptions !== 'function') {
    throw new Error('GDL rendering requires spytial-core 6.3.0 or newer');
  }
  const options = overrides || {};
  await graphEl.setViewOptions({
    toolbar: 'compact',
    ...options,
    controls: { ...(editable ? { editing: true } : {}), ...options.controls },
  });

  if (graphEl.shadowRoot) {
    let style = graphEl.shadowRoot.getElementById(STYLE_ID);
    if (!style) {
      style = graphEl.ownerDocument.createElement('style');
      style.id = STYLE_ID;
      graphEl.shadowRoot.appendChild(style);
    }
    // An explicit toolbar choice retains core's usual placement. With no
    // override, read-only diagrams show +, − and Fit over the lower-right edge.
    // Editable diagrams keep their compact toolbar and graph editing actions.
    const floating = !editable && !Object.prototype.hasOwnProperty.call(options, 'toolbar');
    style.textContent = floating ? `
      #graph-shell { position: relative; }
      #graph-toolbar[data-presentation="compact"] {
        position: absolute; right: 10px; bottom: 10px; z-index: 2;
        flex-wrap: nowrap; padding: 0; margin: 0; background: transparent;
        border: 0; box-shadow: none; backdrop-filter: none;
      }
      #zoom-controls { gap: 4px; }
    ` : editable ? `
      #graph-toolbar[data-presentation="none"] {
        padding: 4px 8px; margin-bottom: 0; background: transparent;
        border: 0; box-shadow: none; backdrop-filter: none;
      }
      #graph-toolbar[data-presentation="none"] .si-toolbar-group {
        margin-left: 0; padding-left: 0; border-left: 0;
      }
    ` : '';
  }
  configured.add(graphEl);
}
