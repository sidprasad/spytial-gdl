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

// ── Vocabulary ──────────────────────────────────────────────────────────────
// Everything about *what* core accepts — which annotations exist, which section
// each compiles into, which arguments it takes, and which values are legal — is
// generated from the JSON Schema spytial-core publishes. See
// `scripts/generate-spec-tables.mjs`. Nothing in this file restates it, because
// transcribing it by hand had already gone wrong four ways: `size` and
// `hideAtom` were compiled under `directives`, a placement core warns about;
// `projection` was accepted although no released core has ever parsed it; `icon`
// was treated as current after core deprecated it; and `iconStyle`, the block
// that replaced `icon`, was rejected as unknown. Core reports none of that, so
// none of it was visible from here.
//
// The tables hold only what the schema marks current. A form core has
// deprecated or removed is not in spytial-gdl's language at all: a deprecated
// name is an unknown annotation, a deprecated argument an unknown argument.
// There is no rewrite path and no tombstone, because there is no installed
// base of old diagrams to keep rendering — the vocabulary is whatever the
// vendored schema says today, and nothing else.
//
// What stays hand-written below is everything the schema has no opinion about:
// the scanner and the YAML emitter.
import {
  CONSTRAINT_NAMES,
  DIRECTIVE_NAMES,
  ITEMS,
  STYLE_BLOCKS,
} from './_spec-tables.js';

export { CONSTRAINT_NAMES, DIRECTIVE_NAMES };

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Look a user-supplied name up in a generated table. Plain `table[key]` walks
// Object.prototype, so an argument named `constructor` or `toString` resolves to
// a function, passes as a known field, and rides through to the emitted spec —
// exactly the silent pass-through these tables exist to stop.
function lookup(table, key) {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

// ── Validation ──────────────────────────────────────────────────────────────
// core validates almost none of this. An unknown key, a missing required
// argument, and a value outside a closed vocabulary are all kept by the parser
// and then quietly do the wrong thing: the constraint matches nothing, or the
// edge renders unstyled, with no diagnostic anywhere. Authoring time is the only
// place they can surface, so each becomes an `errors` entry with a line number.
//
// Style blocks are authored as nested calls — a `name(...)` argument — mirroring
// the Rust derive attributes:
//
//   @edgeStyle(field=next, lineStyle(color=crimson, pattern=dashed), textStyle(size=small))
//     → edgeStyle: { field: next, lineStyle: { color: crimson, pattern: dashed },
//                    textStyle: { size: small } }
//
// `lineStyle={color: crimson}` was not an option: a bare comprehension selector
// (`{x: Person | x}`) already parses as a bareword value, so a brace map would be
// ambiguous with sources that work today.

// A bareword `true` / `false` parses as a string (parseValue has no way to tell
// it from a selector name), and emits as bare YAML, so core sees a boolean
// either way. Both spellings are therefore legal.
function isBooleanish(v) {
  return typeof v === 'boolean' || v === 'true' || v === 'false';
}

// Settle a value onto the JS type its rule describes, before it is checked or
// emitted. Two conversions, both narrow:
//
//   * A boolean field written as a bareword arrives as the *string* "true",
//     because the argument parser has no types to go on. Make it a real boolean,
//     so emitScalar can keep it bare while quoting every string that merely
//     looks like one (see YAML_RESERVED).
//   * The schema types names, labels and selectors `string` because JSON Schema
//     has no "stringable" type — but core is JS, and a group named 2024 or a tag
//     valued 42 has always worked. Take the convenience spelling and emit it
//     quoted, so what core receives still validates against the schema.
//
// Everything else is left exactly as written. The stringable conversion is for
// an item's own arguments only — block leaves stay strict, so `color=3` is still
// an error rather than the colour "3". The schema types `fillStyle.color` as a
// plain string, so nothing but this distinction keeps that strict.
function coerceValue(rule, value, { stringable = false } = {}) {
  if (rule.type === 'boolean' && (value === 'true' || value === 'false')) {
    return value === 'true';
  }
  if (stringable && rule.type === 'string' &&
      (typeof value === 'number' || typeof value === 'boolean')) {
    return String(value);
  }
  return value;
}

// Check one value against a generated rule. `where` names it for the message.
function checkValue(rule, value, where) {
  switch (rule.type) {
    case 'enum':
      if (!rule.values.includes(value)) {
        throw new Error(`invalid ${where} "${value}"; expected one of ${rule.values.join(', ')}`);
      }
      return;

    case 'enum-list': {
      if (!Array.isArray(value)) {
        throw new Error(`${where} must be a list, e.g. [${rule.values[0]}]`);
      }
      if (rule.minItems && value.length < rule.minItems) {
        throw new Error(`${where} needs at least ${rule.minItems} value(s)`);
      }
      for (const item of value) {
        if (!rule.values.includes(item)) {
          throw new Error(`invalid ${where} "${item}"; expected one of ${rule.values.join(', ')}`);
        }
      }
      // Cross-value rules: opposite directions cancel, and a `directly*` variant
      // restricts what may accompany it. core reports neither — the constraint
      // just comes out wrong.
      for (const listRule of rule.listRules ?? []) {
        if (listRule.kind === 'exclusive' && listRule.values.every((v) => value.includes(v))) {
          throw new Error(`${where}: at most one of ${listRule.values.join(', ')}`);
        }
        if (listRule.kind === 'requires' && value.includes(listRule.when)) {
          const stray = value.find((v) => !listRule.allowed.includes(v));
          if (stray !== undefined) {
            throw new Error(
              `${where}: with ${listRule.when}, the only other value allowed is ` +
              `${listRule.allowed.filter((v) => v !== listRule.when).join(', ')} (got "${stray}")`
            );
          }
        }
      }
      return;
    }

    case 'block':
      if (!isPlainObject(value)) {
        throw new Error(`${where} must be a block, e.g. ${rule.block}(color=gray)`);
      }
      validateBlock(rule.block, value);
      return;

    case 'enum-or-block':
      if (isPlainObject(value)) {
        validateBlock(rule.block, value);
        return;
      }
      if (!rule.values.includes(value)) {
        throw new Error(
          `invalid ${where} "${value}"; expected one of ${rule.values.join(', ')}, ` +
          `or a ${rule.block}(...) block`
        );
      }
      return;

    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`invalid ${where} "${value}"; expected a number`);
      }
      if (rule.type === 'integer' && !Number.isInteger(value)) {
        throw new Error(`invalid ${where} "${value}"; expected a whole number`);
      }
      if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) {
        throw new Error(`invalid ${where} "${value}"; expected a number greater than ${rule.exclusiveMinimum}`);
      }
      if (rule.minimum !== undefined && value < rule.minimum) {
        throw new Error(`invalid ${where} "${value}"; expected at least ${rule.minimum}`);
      }
      if (rule.maximum !== undefined && value > rule.maximum) {
        throw new Error(`invalid ${where} "${value}"; expected at most ${rule.maximum}`);
      }
      return;
    }

    case 'boolean':
      if (!isBooleanish(value)) {
        throw new Error(`invalid ${where} "${value}"; expected true or false`);
      }
      return;

    default:
      if (typeof value !== 'string') {
        throw new Error(`invalid ${where} "${value}"; expected a string`);
      }
      if (rule.minLength && value.length < rule.minLength) {
        throw new Error(`${where} cannot be empty`);
      }
  }
}

// Check one parsed block against STYLE_BLOCKS. Throws (→ an `errors` entry, and
// the annotation is dropped) on an unknown block, an unknown key within a known
// block, or a leaf outside its vocabulary or bounds.
function validateBlock(name, block) {
  const schema = lookup(STYLE_BLOCKS, name);
  if (!schema) {
    throw new Error(
      `unknown style block "${name}(...)"; expected one of ${Object.keys(STYLE_BLOCKS).join(', ')}`
    );
  }
  for (const [key, value] of Object.entries(block)) {
    const rule = lookup(schema.fields, key);
    if (!rule) {
      throw new Error(
        `unknown "${key}" in ${name}(...); expected one of ${Object.keys(schema.fields).join(', ')}`
      );
    }
    block[key] = coerceValue(rule, value);
    checkValue(rule, block[key], `${name}.${key}`);
  }
}

// Pick the field set an annotation is written against. Two forms may share one
// name, and which one applies is decided by the fields present, exactly as core
// decides it. (Today every item has one form; the machinery stays because the
// schema allows more.)
function selectForm(item, kwargs) {
  const match = item.alternatives.find((alt) => alt.required.every((f) => kwargs[f] !== undefined));
  if (match) return match;
  // Nothing is complete — the annotation is half-written. Fall back to whichever
  // form explains the most of what *was* written, so the message names the form
  // the author was reaching for. Falling back to alternatives[0] instead reports
  // `@group(field=f)` as a missing `selector`, which sends them the wrong way.
  let best = item.alternatives[0];
  let bestScore = -1;
  for (const alt of item.alternatives) {
    const score = Object.keys(kwargs).filter((k) => Object.hasOwn(alt.fields, k)).length;
    if (score > bestScore) {
      best = alt;
      bestScore = score;
    }
  }
  return best;
}

// Check an annotation's arguments against the generated table for its name, and
// settle each value onto the type its rule describes (coerceValue), so what is
// emitted is what core expects. Messages name the argument the author typed.
function validateItem(name, kwargs) {
  const item = lookup(ITEMS, name);
  if (!item) return;                       // unreachable: the caller checked the name

  const form = selectForm(item, kwargs);
  const known = new Set(item.alternatives.flatMap((alt) => Object.keys(alt.fields)));

  for (const key of Object.keys(kwargs)) {
    const rule = lookup(form.fields, key);
    if (!rule) {
      // A real argument, but from the form the rest of the annotation didn't
      // select. core's oneOf rejects the mix; say that, rather than calling a
      // documented argument unknown while listing it as expected.
      const others = Object.keys(kwargs).filter((k) => k !== key && Object.hasOwn(form.fields, k));
      if (known.has(key) && others.length > 0) {
        throw new Error(
          `@${name}(...): "${key}" cannot be combined with ` +
          `${others.map((k) => `"${k}"`).join(', ')} — they belong to different forms`
        );
      }
      throw new Error(`unknown "${key}" in @${name}(...); expected one of ${[...known].join(', ')}`);
    }
    kwargs[key] = coerceValue(rule, kwargs[key], { stringable: true });
    checkValue(rule, kwargs[key], `${name}.${key}`);
  }

  const missing = form.required.filter((f) => kwargs[f] === undefined);
  if (missing.length > 0) {
    throw new Error(`@${name}(...) requires ${missing.join(', ')}`);
  }

  // Fields core's parser rejects the absence of even though the schema types
  // them optional. Reported apart from `required` because the message has to
  // name the escape hatch, and because the cost of getting it wrong is not the
  // usual one: core throws out of parseLayoutSpec rather than dropping the one
  // constraint, so without this the whole diagram's spec fails on an annotation
  // that looked complete.
  for (const [field, guard] of Object.entries(form.requiredUnless ?? {})) {
    if (kwargs[field] !== undefined) continue;
    if (String(kwargs[guard.field]) === guard.equals) continue;
    throw new Error(
      `@${name}(...) requires ${field} unless ${guard.field}=${guard.equals}; ` +
      `core rejects the entire spec without it`
    );
  }
}

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
// Typographic quotes, which only ever reach an annotation by way of a
// smart-punctuation filter that rewrote the block on the way in.
const SMART_QUOTE = /[‘’“”]/;

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

// Are all () [] {} in `s` balanced AND type-matched (quotes/escapes respected)?
// findClose uses one shared depth counter to locate the boundary, which accepts a
// mismatched pair like `[left}`; this catches that so the annotation is reported
// malformed instead of silently yielding a bogus value.
const CLOSER = { '(': ')', '[': ']', '{': '}' };
function bracketsMatched(s) {
  const stack = [];
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { stack.push(CLOSER[ch]); continue; }
    if (ch === ')' || ch === ']' || ch === '}') { if (stack.pop() !== ch) return false; }
  }
  return stack.length === 0 && quote === null;
}

// Split a complete annotation block (already `%%`-guard-stripped) into its name
// and raw arg string: `@orientation(selector=left)` → { name, args: 'selector=left' }.
// Returns null unless it's a well-formed `@name( … )` with type-matched brackets
// and nothing but an optional `;` and trailing `%%` comment after the closing paren.
function splitAnnotation(text) {
  const open = text.match(ANNOTATION_OPEN);
  if (!open) return null;
  const parenIdx = open[0].length - 1;            // position of the `(`
  const close = findClose(text, parenIdx);
  if (close === -1) return null;
  if (!/^\s*;?\s*(?:%%.*)?$/.test(text.slice(close + 1))) return null;
  const args = text.slice(parenIdx + 1, close);
  if (!bracketsMatched(args)) return null;
  return { name: open[1], args };
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

// The opening of a nested style block: `lineStyle(`. Deliberately requires the
// `(` to follow the name directly, so a *value* that merely contains parens
// (`value='rgb(1, 2, 3)'` — an `=` comes first) can't be mistaken for one.
const BLOCK_OPEN = /^([A-Za-z_]\w*)\s*\(/;

// Parse an argument that is a nested style block — `lineStyle(color=crimson)` —
// into { name, block }. Returns null if `piece` isn't shaped like one, leaving it
// to the ordinary key=value path. Blocks nest (addEdge(lineStyle(…))) via the
// mutual recursion with parseArgs, which validates each block as it's built.
function parseBlock(piece) {
  const open = piece.match(BLOCK_OPEN);
  if (!open) return null;
  const parenIdx = open[0].length - 1;
  // The `(` must close on the piece's very last character. Anything trailing
  // (`lineStyle(color=red) junk`) is malformed rather than a block, so fall
  // through and let the key=value path report it.
  if (findClose(piece, parenIdx) !== piece.length - 1) return null;
  const name = open[1];
  const block = parseArgs(piece.slice(parenIdx + 1, piece.length - 1));
  validateBlock(name, block);
  return { name, block };
}

// Parse `key=value, key2=[a, b], block(k=v), …` into an object. Throws on a
// malformed pair or an invalid style block.
function parseArgs(argStr) {
  // Null-prototype so a literal `__proto__=x` lands as an ordinary own property
  // and gets reported as an unknown argument. On a normal object it would hit
  // the prototype setter instead: the key vanishes and nothing says why.
  const kwargs = Object.create(null);
  const trimmed = argStr.trim();
  if (trimmed === '') return kwargs;
  for (const piece of splitTopLevel(trimmed)) {
    // A nested style block carries its name with it, so it's checked before the
    // key=value split (which would otherwise read `lineStyle(color` as the key).
    const nested = parseBlock(piece);
    if (nested) {
      kwargs[nested.name] = nested.block;
      continue;
    }
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

// A string YAML would read back as some other type has to be quoted, or what
// core receives is not what was written: `name=2024` emitted bare returns the
// number 2024, and `name=null` returns nothing at all — which core then rejects
// as a group with no name, failing the entire spec rather than that one
// constraint. Booleans, null and `~` are the reserved words; the numeric form
// covers exponents, hex and octal, `.inf` and `.nan` alongside plain digits.
//
// Real booleans still emit bare, because they arrive here as JS booleans —
// coerceValue settles a boolean-typed field before emission, which is what lets
// a merely boolean-*looking* string be quoted without touching them.
const YAML_LOOKS_NUMERIC = /^[-+]?(\d[\d_]*(\.[\d_]*)?([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?|0[xXoObB][\dA-Fa-f_]+|\.(inf|Inf|INF|nan|NaN|NAN))$/;
const YAML_RESERVED = /^(~|null|Null|NULL|true|True|TRUE|false|False|FALSE)$/;

function emitScalar(v) {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  if (s === '' || YAML_NEEDS_QUOTE.test(s) || YAML_LOOKS_NUMERIC.test(s) || YAML_RESERVED.test(s)) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

// A mapping as compact flow-style YAML: `{ color: crimson, weight: 2 }`. Used for
// an annotation's own kwargs and, recursively, for each nested style block.
function emitMap(obj) {
  const pairs = Object.entries(obj).map(([k, v]) => `${k}: ${emitValue(v)}`);
  return pairs.length > 0 ? `{ ${pairs.join(', ')} }` : '{}';
}

function emitValue(v) {
  if (Array.isArray(v)) return `[${v.map(emitValue).join(', ')}]`;
  if (isPlainObject(v)) return emitMap(v);
  return emitScalar(v);
}

// Compile a single annotation to a YAML list-item body, e.g.
//   orientation: { selector: _links, directions: [below] }
//   edgeStyle: { field: next, lineStyle: { color: crimson, pattern: dashed } }
// `flag` is special-cased to a scalar payload (`flag: hideDisconnected`),
// matching the Python serializer.
function emitEntry(name, kwargs) {
  if (name === 'flag') {
    const flagName = kwargs.name != null ? kwargs.name : Object.values(kwargs)[0];
    return `flag: ${emitScalar(flagName != null ? flagName : '')}`;
  }
  return `${name}: ${emitMap(kwargs)}`;
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
//   annotationMeta  — one record per compiled annotation, parallel to
//                     annotationLines: { line, name, section, entry,
//                     selectors, text }. `entry` is the exact list item that went
//                     into specYaml and `selectors` the selector/field strings it
//                     carries, which is how diagnostics.js maps what the engine
//                     later says about a rule or a selector back to this line.
//   errors          — [{ line, text, message }] for malformed / unknown / unterminated
//                     annotations. `line` is the 1-based line the annotation starts on.
//
// opts.provenance — stamp each compiled rule with a `source` block holding the
//                   annotation's verbatim text and line, which spytial-core 5.4+
//                   cites in its conflict reports and warnings. Off here by
//                   default so the compiled YAML is the bare rule; compileSpytialGdl
//                   turns it on for everything that reaches the engine.
export function extractAnnotations(rawSource, opts = {}) {
  const lines = String(rawSource ?? '').split(/\r?\n/);
  const kept = [];
  const constraints = [];
  const directives = [];
  const annotationLines = [];
  const annotationMeta = [];
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
      validateItem(name, kwargs);
      // Provenance. spytial-core (5.4+) accepts a `source` block on every rule
      // and cites its `text` and `location` in conflict reports and warnings in
      // place of its own rendering of the rule — so the UNSAT panel quotes the
      // annotation as the author wrote it, on the line they wrote it. Older
      // cores parse and ignore the block. A wrapped annotation is folded onto
      // one line, since a YAML flow scalar would fold it anyway.
      const stamped = opts.provenance
        ? { ...kwargs, source: { text: verbatim.trim().replace(/\s*\n\s*/g, ' '), location: `line ${at}` } }
        : kwargs;
      entry = emitEntry(name, stamped);
    } catch (err) {
      errors.push({ line: at, text: verbatim.trim(), message: err.message });
      continue;
    }

    // A smart-quotes filter upstream (Pollen's decoder, a CMS typography pass)
    // turns name='Team A' into name=’Team A’. That still parses — the curly
    // quotes just end up inside the value — so nothing else would ever say so.
    if (SMART_QUOTE.test(verbatim)) {
      errors.push({ line: at, text: verbatim.trim(),
        message: 'curly quotes in the arguments: a smart-punctuation filter has rewritten ' +
          "this block, and they are now part of the value rather than quoting it" });
    }

    (isConstraint ? constraints : directives).push(entry);
    annotationLines.push(verbatim);
    annotationMeta.push({
      line: at,
      name,
      section: isConstraint ? 'constraints' : 'directives',
      entry,
      selectors: selectorStrings(kwargs),
      text: verbatim.trim(),
    });
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

  return { source, specYaml, annotationLines, annotationMeta, errors };
}

// The selector-like strings an annotation carries, for matching an engine
// diagnostic back to it. `selector` is the selector proper; `field` names a
// relation, which the engine reports under the same `selector` key when it
// cannot resolve it. Both are read as written, so a comprehension selector
// matches only its own exact text.
function selectorStrings(kwargs) {
  const out = [];
  for (const key of ['selector', 'field']) {
    const v = kwargs && kwargs[key];
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
  }
  return out;
}
