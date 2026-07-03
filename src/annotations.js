// Inline spatial annotations — the `@orientation(...)` decorator syntax.
//
// Spatial operations (orientation, alignment, cyclic, grouping, colors, …) used
// to live in a *separate* YAML "rules" spec. This module lets you write them
// inline in the diagram source instead, mirroring the Python decorator DSL
// (see spytial-py/spytial/annotations.py). A single block of text then fully
// describes both the graph and how it should be laid out:
//
//   flowchart TD
//     A -->|left| B
//     A -->|right| C
//     class A,B,C tree
//
//   @orientation(selector=_links, directions=[below])
//   @orientation(selector=left,  directions=[left])
//   @orientation(selector=right, directions=[right])
//
// `extractAnnotations(rawSource)` lifts the annotation lines out of the source
// (so parse.js never sees them) and compiles them into the same compact
// authoring-YAML the rest of the codebase already consumes — one-line flow-map
// list items under `constraints:` / `directives:`, which round-trip cleanly
// through registry.js's extractBlocks merge.
//
// Two accepted line forms:
//   @name(args)        — bare decorator (primary)
//   %%@name(args)      — mermaid-comment-guarded, so the block still degrades
//   %% @name(args)       gracefully if pasted into a vanilla Mermaid renderer.

// Vocabulary, mirroring Python's CONSTRAINT_TYPES / DIRECTIVE_TYPES. Only the
// name→category split matters here: compilation is generic (every annotation
// becomes `{ <name>: { ...kwargs } }`), so all of them are supported with no
// per-annotation code.
export const CONSTRAINT_NAMES = new Set([
  'orientation', 'cyclic', 'align', 'group',
]);

export const DIRECTIVE_NAMES = new Set([
  'atomColor', 'size', 'icon', 'edgeColor', 'attribute',
  'hideField', 'hideAtom', 'inferredEdge', 'tag', 'flag', 'projection',
]);

// An annotation is `@name( args )`, optionally behind a mermaid-comment `%%`
// guard so the block still degrades gracefully in a vanilla Mermaid renderer.
// The args may span multiple lines — extractAnnotations keeps consuming lines
// until the `(` opened after `@name` is balanced, so all of these are legal:
//
//     @orientation(selector=left, directions=[left])   -- one line
//
//     @orientation(                                    -- wrapped
//       selector=left,
//       directions=[left],
//     )
//
//     %%@group(                                        -- wrapped + %%-guarded
//     %%  selector=Person,
//     %%  name='People',
//     %%)
//
// A cheap pre-check so we don't scan every ordinary diagram line.
const LOOKS_LIKE_ANNOTATION = /^\s*(?:%%\s*)?@/;
// The opening of an annotation: `@name(`. The `(` may be the last thing on the
// line, with the args following on subsequent lines.
const ANNOTATION_OPEN = /^\s*(?:%%\s*)?@([A-Za-z_]\w*)\s*\(/;
// A per-line `%%` guard, stripped from each line before the args are parsed so a
// fully guarded block parses the same as a bare one.
const GUARD = /^\s*%%\s?/;

// Index of the `)` matching the `(` at index `open` in `s`, tracking quotes and
// nested () [] {} so a paren inside a string or list can't close it early.
// Returns -1 if the paren never closes (block continues later, or is truncated).
function findClose(s, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }   // a backslash-escaped char can't close the string
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Split a complete annotation block (already `%%`-guard-stripped) into its name
// and raw arg string: `@orientation(selector=left)` → { name, args: 'selector=left' }.
// Returns null unless it's a well-formed `@name( … )` with nothing but an
// optional `;` and trailing `%%` comment after the closing paren.
function splitAnnotation(text) {
  const open = text.match(ANNOTATION_OPEN);
  if (!open) return null;
  const parenIdx = open[0].length - 1;            // position of the `(`
  const close = findClose(text, parenIdx);
  if (close === -1) return null;
  if (!/^\s*;?\s*(?:%%.*)?$/.test(text.slice(close + 1))) return null;
  return { name: open[1], args: text.slice(parenIdx + 1, close) };
}

// Split a comma-separated argument list at the TOP level only — commas inside
// [...], {...}, (...), or quotes are preserved. Returns trimmed pieces.
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      buf += ch;
      if (ch === '\\' && i + 1 < s.length) { buf += s[++i]; continue; }   // keep an escaped char verbatim
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '[' || ch === '{' || ch === '(') { depth++; buf += ch; continue; }
    if (ch === ']' || ch === '}' || ch === ')') { depth--; buf += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim() !== '') parts.push(buf.trim());
  return parts;
}

// True if `s` contains an `=` at the top level (not inside quotes/brackets).
function hasTopLevelEquals(s) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '{' || ch === '(') { depth++; continue; }
    if (ch === ']' || ch === '}' || ch === ')') { depth--; continue; }
    if (ch === '=' && depth === 0) return true;
  }
  return false;
}

function stripQuotes(s) {
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1);
  }
  return null;
}

// Parse one argument value into a JS value:
//   [a, b]      → ['a', 'b']         (list; elements parsed recursively)
//   'text'      → 'text'             (quoted string, quotes removed)
//   3 / 3.5     → 3 / 3.5            (number)
//   below       → 'below'            (bareword string)
function parseValue(raw) {
  const s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner).map(parseValue);
  }
  const unq = stripQuotes(s);
  if (unq !== null) return unq;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

// Parse `key=value, key2=[a, b], …` into an object. Throws on a malformed pair.
function parseArgs(argStr) {
  const kwargs = {};
  const trimmed = argStr.trim();
  if (trimmed === '') return kwargs;
  for (const piece of splitTopLevel(trimmed)) {
    const eq = piece.indexOf('=');
    if (eq === -1) {
      throw new Error(`expected key=value, got "${piece}"`);
    }
    const key = piece.slice(0, eq).trim();
    const val = piece.slice(eq + 1).trim();
    if (!/^[A-Za-z_]\w*$/.test(key)) {
      throw new Error(`invalid argument name "${key}"`);
    }
    // A top-level `=` inside the value (outside quotes/brackets) means the args
    // weren't comma-separated, e.g. `selector=_links directions=[below]`.
    if (hasTopLevelEquals(val)) {
      throw new Error(`missing comma before "${key}" arguments`);
    }
    kwargs[key] = parseValue(val);
  }
  return kwargs;
}

// ── YAML emission ───────────────────────────────────────────────────────────
// Emit values back as compact flow-style YAML. Strings that contain
// YAML-significant characters are single-quoted (with '' escaping) so selectors
// like '{x: Person | x}' and names like 'left subtree' survive the round-trip.
const YAML_NEEDS_QUOTE = /[\s:{}\[\],&*#?|<>=!%@`'"]/;

function emitScalar(v) {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  if (s === '' || YAML_NEEDS_QUOTE.test(s)) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

function emitValue(v) {
  if (Array.isArray(v)) return `[${v.map(emitValue).join(', ')}]`;
  return emitScalar(v);
}

// Compile a single annotation to a YAML list-item body, e.g.
//   orientation: { selector: _links, directions: [below] }
// `flag` is special-cased to a scalar payload (`flag: hideDisconnected`),
// matching the Python serializer.
function emitEntry(name, kwargs) {
  if (name === 'flag') {
    const flagName = kwargs.name != null ? kwargs.name : Object.values(kwargs)[0];
    return `flag: ${emitScalar(flagName != null ? flagName : '')}`;
  }
  const pairs = Object.entries(kwargs).map(([k, v]) => `${k}: ${emitValue(v)}`);
  return `${name}: { ${pairs.join(', ')} }`;
}

// Extract inline annotations from `rawSource`.
//
// Returns { source, specYaml, annotationLines, errors }:
//   source          — the input with annotation lines removed (feed to parseGraph)
//   specYaml        — authoring YAML for the compiled constraints/directives, or
//                     '' if none. Shape:
//                     `constraints:\n  - <entry>\n directives:\n  - <entry>`
//   annotationLines — the raw `@...` blocks that compiled successfully, verbatim
//                     and in source order (one entry per annotation; a multi-line
//                     annotation keeps its newlines). The serializer re-appends
//                     these to round-trip the notation: editing the graph's *data*
//                     never touches the layout directives, and specYaml is a lossy
//                     compiled form, so we keep the originals.
//   errors          — [{ line, text, message }] for malformed / unknown / unterminated
//                     annotations. `line` is the 1-based line the annotation starts on.
export function extractAnnotations(rawSource) {
  const lines = String(rawSource ?? '').split(/\r?\n/);
  const kept = [];
  const constraints = [];
  const directives = [];
  const annotationLines = [];
  const errors = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Ordinary diagram line — hand it to the graph parser untouched.
    if (!LOOKS_LIKE_ANNOTATION.test(line)) {
      kept.push(line);
      i++;
      continue;
    }

    // Starts like an annotation but has no `@name(` opener, so it can't be
    // well-formed. Report it and drop just this line (don't swallow the rest of
    // the source hunting for a `)` that may never come). A blank placeholder
    // keeps the graph parser's line numbers aligned with the original source.
    if (!ANNOTATION_OPEN.test(line)) {
      errors.push({ line: i + 1, text: line.trim(), message: 'malformed annotation: expected @name(...)' });
      kept.push('');
      i++;
      continue;
    }

    // Accumulate lines until the annotation's `(` closes — the args may wrap over
    // several lines. `block` holds the verbatim lines (for round-tripping);
    // `stripped` drops each line's `%%` guard so a guarded block parses the same
    // as a bare one. We re-scan `stripped` after each line: cheap, blocks are short.
    const startLine = i;
    const block = [];
    let stripped = '';
    let close = -1;
    while (i < lines.length) {
      block.push(lines[i]);
      stripped += (stripped ? '\n' : '') + lines[i].replace(GUARD, '');
      i++;
      const open = stripped.match(ANNOTATION_OPEN);
      close = open ? findClose(stripped, open[0].length - 1) : -1;
      if (close !== -1) break;
    }

    // Replace every consumed line with a blank so `source` stays line-for-line
    // aligned with the original — parse errors then report the line the author
    // actually sees, not one shifted by the removed annotation.
    for (let b = 0; b < block.length; b++) kept.push('');

    const verbatim = block.join('\n');
    const at = startLine + 1;

    if (close === -1) {
      errors.push({ line: at, text: lines[startLine].trim(), message: 'unterminated annotation: missing ")"' });
      continue;   // consumed lines are dropped, so they can't confuse the graph parser
    }

    const split = splitAnnotation(stripped);
    if (!split) {
      errors.push({ line: at, text: verbatim.trim(), message: 'malformed annotation' });
      continue;
    }

    const { name, args } = split;
    const isConstraint = CONSTRAINT_NAMES.has(name);
    const isDirective = DIRECTIVE_NAMES.has(name);
    if (!isConstraint && !isDirective) {
      errors.push({ line: at, text: verbatim.trim(), message: `unknown annotation "@${name}"` });
      continue;
    }

    let kwargs;
    try {
      kwargs = parseArgs(args);
    } catch (err) {
      errors.push({ line: at, text: verbatim.trim(), message: err.message });
      continue;
    }

    let entry;
    try {
      entry = emitEntry(name, kwargs);
    } catch (err) {
      errors.push({ line: at, text: verbatim.trim(), message: err.message });
      continue;
    }

    (isConstraint ? constraints : directives).push(entry);
    annotationLines.push(verbatim);
  }

  const source = kept.join('\n');

  let specYaml = '';
  if (constraints.length > 0 || directives.length > 0) {
    let out = '';
    if (constraints.length > 0) {
      out += 'constraints:\n';
      for (const c of constraints) out += `  - ${c}\n`;
    }
    if (directives.length > 0) {
      out += 'directives:\n';
      for (const d of directives) out += `  - ${d}\n`;
    }
    specYaml = out;
  }

  return { source, specYaml, annotationLines, errors };
}
