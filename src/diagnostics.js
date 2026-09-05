// Diagnostics — everything spytial-gdl learns about a diagram beyond what its
// own parser can tell, normalized to one shape and pinned to the author's lines.
//
// Two rules keep this robust to a spytial-core release:
//
//   1. Ask the engine, don't model it. Whether a name is one the query grammar
//      can read, which spellings it reserves, which of two things a name
//      resolves to, whether a rule parses — each is answered by calling the
//      installed engine on the actual datum and spec. Nothing here holds a list
//      of reserved words or a copy of the parser's rules, because a list
//      describes the release it was written against.
//
//   2. Read structure, never prose. An engine warning is read by its
//      `severity`, `code`, `selector` and `context` fields; its `message` is
//      shown to the author verbatim and is never matched against. A field that
//      is missing degrades to a diagnostic without it, never to a throw.
//
// Every diagnostic is { severity: 'error' | 'warning', message, line?, source },
// plus whatever the engine attached (`code`, `selector`, `context`). `source`
// is 'annotation', 'parse' or 'engine'. test/engine-diagnostics.test.mjs runs
// this against the installed engine, so a release that changes the shape of a
// warning or what a name resolves to fails there, by name.

import { splitSpecEntries, specFromEntries } from './registry.js';

// ── the shared shape ─────────────────────────────────────────────────────────

// Normalize the parser's and the annotation compiler's own error channels.
// Annotation errors carry no severity (they are all errors); parse errors do.
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

// ── back to the line ─────────────────────────────────────────────────────────

// The annotation line an engine diagnostic about `selector` came from, or
// undefined. `meta` is extractAnnotations' annotationMeta. Matching is on the
// selector text, which is the one field the engine echoes exactly as we sent
// it; `context` (e.g. "orientation selector") narrows a tie between two
// annotations that share a selector, when it names one of them.
export function attributeLine(meta, selector, context) {
  if (selector == null || !Array.isArray(meta)) return undefined;
  const s = String(selector);
  let cands = meta.filter((m) => Array.isArray(m.selectors) && m.selectors.includes(s));
  if (cands.length > 1 && typeof context === 'string') {
    const narrowed = cands.filter((m) => m.emitted && context.includes(m.emitted));
    if (narrowed.length > 0) cands = narrowed;
  }
  return cands.length > 0 ? cands[0].line : undefined;
}

// ── what the layout engine said ──────────────────────────────────────────────

// Normalize a generateLayout() result's advisories. `warnings` are things the
// engine noticed and went on without (a selector that matched nothing, a
// deprecated form); `selectorErrors` are selectors it could not use at all,
// whose constraint or directive it then skipped. Both are read by field; a
// missing array means the engine had nothing to say, or predates the channel,
// and yields nothing rather than an exception.
export function engineDiagnostics(result, meta = []) {
  const out = [];
  const warnings = result && Array.isArray(result.warnings) ? result.warnings : [];
  for (const w of warnings) {
    if (!w) continue;
    const severity = w.severity === 'error' ? 'error' : 'warning';
    const message = typeof w === 'string' ? w
      : w.message != null ? String(w.message) : JSON.stringify(w);
    out.push({
      severity, message, source: 'engine',
      line: attributeLine(meta, w.selector, w.context),
      code: w.code, selector: w.selector, context: w.context,
    });
  }
  const errs = result && Array.isArray(result.selectorErrors) ? result.selectorErrors : [];
  for (const e of errs) {
    if (!e) continue;
    const detail = typeof e === 'string' ? e
      : e.errorMessage != null ? String(e.errorMessage)
      : e.message != null ? String(e.message) : JSON.stringify(e);
    const parts = [];
    if (e.context) parts.push(String(e.context));
    if (e.selector != null && !detail.includes(String(e.selector))) parts.push(`selector "${e.selector}"`);
    parts.push(detail);
    out.push({
      severity: 'error', message: parts.join(': '), source: 'engine',
      line: attributeLine(meta, e.selector, e.context),
      code: 'selector-error', selector: e.selector, context: e.context,
    });
  }
  return out;
}

// ── rules the engine refuses ─────────────────────────────────────────────────

// Ask the engine's spec parser about each rule on its own. A rule it refuses
// is reported — with its annotation's line, when it came from one — and left
// out, so the rest of the spec still applies; without this the engine throws on
// the whole spec and every other rule in the diagram goes with it. The
// annotation compiler already knows some of these cases from the schema; this
// is the backstop that needs no schema, for whatever the installed release
// rejects. Returns { rules, diagnostics }.
export function checkRulesWithEngine(parseLayoutSpec, rules, meta = []) {
  const diagnostics = [];
  if (typeof parseLayoutSpec !== 'function' || !rules || !String(rules).trim()) {
    return { rules: rules || '', diagnostics };
  }
  const entries = splitSpecEntries(rules);
  const kept = { constraints: [], directives: [] };
  for (const section of ['constraints', 'directives']) {
    for (const entry of entries[section] || []) {
      try {
        parseLayoutSpec(specFromEntries({ [section]: [entry] }));
        kept[section].push(entry);
      } catch (err) {
        const m = meta.find((x) => x && x.section === section && x.entry === entry);
        const what = m ? `@${m.name}` : 'a layout rule';
        const why = err && err.message ? err.message : String(err);
        diagnostics.push({
          severity: 'error', source: 'engine', code: 'rule-rejected',
          line: m ? m.line : undefined, rule: entry,
          message: `${what} was rejected by the engine and left out: ${why}`,
        });
      }
    }
  }
  return { rules: specFromEntries(kept), diagnostics };
}

// ── names the engine cannot read back ────────────────────────────────────────

function describeArity(n) {
  if (n === 0) return 'nothing';
  if (n === 1) return 'a set of nodes';
  if (n === 2) return 'a set of edges';
  return `${n}-tuples`;
}

function uniq(list) {
  return Array.from(new Set(list));
}

function sameSet(a, b) {
  const A = uniq(a), B = uniq(b);
  return A.length === B.length && A.every((x) => B.includes(x));
}

// Ask the evaluator to resolve every name the notation declared — each edge
// label, sort and class — and confirm it comes back as the thing declared.
//
// This is where a spelling the query grammar reserves is caught, by the grammar
// that reserves it: `no`, `in`, `some` and the rest are words the evaluator
// refuses to read as a name, and the set of them is the evaluator's. It is also
// where a name that resolves to *something else* is caught — a class spelled
// like a sort comes back as the wrong set — without knowing which one the
// engine prefers. Nothing here knows what is reserved or who wins a tie; it
// only knows what the notation said and asks whether the engine agrees.
//
// `parsed` is parseGraph's result. Returns diagnostics, each on the line the
// name was first written.
export function checkNamesWithEngine(evaluator, parsed) {
  const out = [];
  if (!evaluator || typeof evaluator.evaluate !== 'function') {
    out.push({ severity: 'warning', source: 'engine', code: 'name-check-unavailable',
      message: 'names could not be checked against the engine: its evaluator has no evaluate()' });
    return out;
  }
  if (!parsed || !parsed.nodes) return out;

  // `kind` and `name` say which declaration a diagnostic is about, so a caller
  // can tell "the sort S is shadowed" from "the label S is fine" without
  // reading the message.
  let kind = null;
  let name = null;
  const report = (line, code, message) =>
    out.push({ severity: 'error', source: 'engine', code, line, message, kind, name });

  // Resolve one bare name. Returns { error } when the grammar refused it,
  // otherwise { arity, atoms(), pairs() } read lazily so a shape the result
  // cannot give is reported rather than thrown.
  const resolve = (name) => {
    const r = evaluator.evaluate(name);
    if (!r) return { error: 'the evaluator returned nothing' };
    if (typeof r.isError === 'function' && r.isError()) {
      const msg = (r.error && r.error.message) || r.errorMessage || '';
      return { error: msg ? String(msg) : 'the query grammar could not read it as a name' };
    }
    return {
      arity: typeof r.maxArity === 'function' ? r.maxArity() : NaN,
      atoms: () => (typeof r.selectedAtoms === 'function' ? r.selectedAtoms() : []),
      pairs: () => (typeof r.selectedTwoples === 'function' ? r.selectedTwoples() : []),
    };
  };

  // Names the parser already reported as unselectable (a space, a hyphen) are
  // kept for display; the engine would refuse them again, to no one's benefit.
  const alreadyReported = parsed.badNames instanceof Set ? parsed.badNames : new Set();

  // A name declared as `what` should come back as `expected` (a set of ids or
  // of "a b" pair keys) at `arity`. One message per way it can fail.
  const checkName = (theName, what, line, arity, expected) => {
    if (alreadyReported.has(theName)) return;
    kind = what;
    name = theName;
    let res;
    try { res = resolve(name); }
    catch (err) {
      report(line, 'name-check-failed',
        `${what} "${name}" could not be checked against the engine: ${err && err.message ? err.message : err}`);
      return;
    }
    if (res.error) {
      report(line, 'unselectable-name',
        `${what} "${name}" is not a name the engine's query grammar accepts (${res.error}); ` +
        'no annotation can select it. Rename it');
      return;
    }
    if (res.arity !== arity) {
      report(line, 'name-shadowed',
        `${what} "${name}" resolves in the engine to ${describeArity(res.arity)}, not to ` +
        `${describeArity(arity)}; the name means something else there. Rename it`);
      return;
    }
    let got;
    try {
      got = arity === 2
        ? res.pairs().map((p) => `${p[0]} ${p[1]}`)
        : res.atoms().map(String);
    } catch (err) {
      report(line, 'name-check-failed',
        `${what} "${name}" could not be read back from the engine: ${err && err.message ? err.message : err}`);
      return;
    }
    if (!sameSet(got, expected)) {
      report(line, 'name-shadowed',
        `${what} "${name}" selects ${uniq(got).length} in the engine but the notation declares ` +
        `${uniq(expected).length}; another name is shadowing it. Rename one of them`);
    }
  };

  // Edge labels → the pairs carrying that label.
  const byLabel = new Map();
  for (const e of parsed.edges || []) {
    if (e.label == null) continue;
    if (!byLabel.has(e.label)) byLabel.set(e.label, []);
    byLabel.get(e.label).push(`${e.source} ${e.target}`);
  }
  for (const [label, pairs] of byLabel) {
    const line = parsed.labelLines && parsed.labelLines.get(label);
    checkName(label, 'edge label', line, 2, pairs);
  }

  // Classes → their members.
  const byClass = new Map();
  for (const [id, cs] of parsed.classesPerNode || []) {
    for (const c of cs) {
      if (!byClass.has(c)) byClass.set(c, []);
      byClass.get(c).push(id);
    }
  }
  for (const [cls, members] of byClass) {
    const line = parsed.classLines && parsed.classLines.get(cls);
    checkName(cls, 'class', line, 1, members);
  }

  // Sorts → the nodes of that type.
  const bySort = new Map();
  const sortLines = new Map();
  for (const n of parsed.nodes.values()) {
    if (n.type == null || n.type === '') continue;
    if (!bySort.has(n.type)) { bySort.set(n.type, []); sortLines.set(n.type, n.typeLine ?? n.line); }
    bySort.get(n.type).push(n.id);
  }
  for (const [sort, ids] of bySort) {
    checkName(sort, 'sort', sortLines.get(sort), 1, ids);
  }

  return out;
}
