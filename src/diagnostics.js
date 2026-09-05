// Diagnostics — what the engine says about a diagram, normalized to one shape
// and pinned to the author's lines.
//
// Two rules keep this robust to a spytial-core release. Nothing here models
// the engine: which names its query grammar reads, which selectors have the
// right shape, which rules parse — all of that is answered by the installed
// engine during the solve, and only reported here. And what it reports is
// read by field (`severity`, `code`, `selector`, `context`), with the message
// shown verbatim and never matched. A field a future release drops degrades
// to a diagnostic without it, never to a throw.
//
// Every diagnostic is { severity: 'error' | 'warning', message, line?, source }
// plus whatever the engine attached. `source` is 'annotation', 'parse' or
// 'engine'. test/engine-diagnostics.test.mjs runs this against the installed
// engine, so a release that changes the shape of a warning fails there, by name.

// The parser's and the annotation compiler's own error channels, in the shared
// shape. Annotation errors carry no severity (they are all errors); parse
// errors do.
export function sourceDiagnostics(annotationErrors, parseErrors) {
  const out = [];
  for (const e of annotationErrors || []) {
    if (!e) continue;
    out.push({ severity: e.severity === 'warning' ? 'warning' : 'error',
      message: e.message, line: e.line, text: e.text, source: 'annotation' });
  }
  for (const e of parseErrors || []) {
    if (!e) continue;
    out.push({ severity: e.severity === 'warning' ? 'warning' : 'error',
      message: e.message, line: e.line, text: e.text, source: 'parse' });
  }
  return out;
}

// The annotation line an engine diagnostic about `selector` came from, or
// undefined. `meta` is extractAnnotations' annotationMeta. Matching is on the
// selector text, the one field the engine echoes exactly as we sent it; when
// two annotations share a selector, `context` (e.g. "orientation selector")
// picks the one it names.
export function attributeLine(meta, selector, context) {
  if (selector == null || !Array.isArray(meta)) return undefined;
  const s = String(selector);
  let cands = meta.filter((m) => Array.isArray(m.selectors) && m.selectors.includes(s));
  if (cands.length > 1 && typeof context === 'string') {
    const narrowed = cands.filter((m) => m.name && context.includes(m.name));
    if (narrowed.length > 0) cands = narrowed;
  }
  return cands.length > 0 ? cands[0].line : undefined;
}

// A generateLayout() result's advisories, normalized. `warnings` are things
// the engine noticed and went on without (a selector that matched nothing);
// `selectorErrors` are selectors it could not use at all, whose rule it then
// skipped. A missing array means the engine had nothing to say.
export function engineDiagnostics(result, meta = []) {
  const out = [];
  for (const w of (result && Array.isArray(result.warnings)) ? result.warnings : []) {
    if (!w) continue;
    out.push({
      severity: w.severity === 'error' ? 'error' : 'warning',
      message: w.message != null ? String(w.message) : JSON.stringify(w),
      line: attributeLine(meta, w.selector, w.context),
      source: 'engine', code: w.code, selector: w.selector, context: w.context,
    });
  }
  for (const e of (result && Array.isArray(result.selectorErrors)) ? result.selectorErrors : []) {
    if (!e) continue;
    const detail = e.errorMessage != null ? String(e.errorMessage) : JSON.stringify(e);
    out.push({
      severity: 'error',
      message: e.context ? `${e.context}: ${detail}` : detail,
      line: attributeLine(meta, e.selector, e.context),
      source: 'engine', code: 'selector-error', selector: e.selector, context: e.context,
    });
  }
  return out;
}
