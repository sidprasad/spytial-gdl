// Syntax highlighting for spytial-gdl notation.
//
// Cosmetic, and deliberately independent of parse.js / annotations.js: a person
// types left to right, so a highlighter has to have an opinion about a line that
// is still half-written, which a parser is entitled not to. It therefore
// tolerates anything — an unterminated annotation, a bare id, junk — and the
// worst case is a token coloured as plain text.
//
// ONE COLOUR FOR EVERYTHING THAT CAN BE A SELECTOR. The single thing that is
// hard to see in this language is that `selector=` does not take a new kind of
// name: it takes an edge label, a node sort, or a class — all of which you
// already wrote elsewhere in the source. So `spouse` in `catherine -> edgar :
// spouse`, `Person` in `a:::Person`, and `spouse` in `@align(selector=spouse,
// …)` are all `selector` tokens and all come out the same colour. Seeing the
// same word light up in both places is the explanation the old prose hint was
// trying to give.
//
// Two consumers: the playground paints an overlay behind its textarea, and the
// suggestion rows in demonstrate.js need the selector as an element of its own
// so hovering *it* can highlight the nodes it denotes.

/** Every kind `tokenize` can emit. `text` is whitespace and anything unclaimed. */
export const TOKEN_KINDS = [
  'text', 'comment', 'annotation', 'key', 'selector', 'direction',
  'value', 'node', 'label', 'arrow', 'punct',
];

// Light and dark, since both consumers already track a theme. Selector violet
// and annotation green are the two that carry meaning; the rest is structure,
// kept quiet on purpose so the two stand out.
export const TOKEN_COLORS = {
  light: {
    comment: '#8c95a3', annotation: '#2d8659', key: '#5b6472', selector: '#8b3fb8',
    direction: '#b45309', value: '#0f766e', node: '#1d2230', label: '#8b3fb8',
    arrow: '#8c95a3', punct: '#8c95a3',
  },
  dark: {
    comment: '#6b7382', annotation: '#3fae74', key: '#a7b0bd', selector: '#d0a2ee',
    direction: '#f0a63a', value: '#5eead4', node: '#e8eaee', label: '#d0a2ee',
    arrow: '#6b7382', punct: '#6b7382',
  },
};

// Same set parse.js uses, longest first so `-->` matches before the `->` inside it.
const ARROWS = ['-.->', '==>', '-->', '---', '->'];

const IDENT = /^[A-Za-z_]\w*/;

/** The kwarg whose value is a selector expression. */
const SELECTOR_KEYS = new Set(['selector']);

/** The kwargs whose values name a spatial direction. */
const DIRECTION_KEYS = new Set(['direction', 'directions']);

const ANNOTATION_HEAD = /^(\s*)(%%\s*)?(@[A-Za-z_]\w*)/;

// ── the scanner ─────────────────────────────────────────────────────────────

function pusher(out) {
  return (text, kind) => {
    if (!text) return;
    // Runs of one kind are merged so consumers emit one element per token rather
    // than one per character.
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
}

// Where a value ends: the next `,` `)` or `]` outside quotes and outside any
// nesting it opened itself. A selector is an expression — `~parentOf.parentOf`,
// `Person->Person`, `(a + b).c` — so it cannot be read as an identifier.
function valueEnd(s, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return i;
      depth--;
      continue;
    }
    if (depth === 0 && ch === ',') return i;
  }
  return s.length;
}

// The argument list of an annotation, from just after `@name`. Reads as a
// sequence of `key=value` — but positionally, because a half-typed line has
// neither half of that pair yet and still has to come out looking like itself.
function scanArgs(s, push) {
  let i = 0;
  let expect = 'key';       // 'key' at the top of an argument, 'value' after `=`
  let inList = false;       // inside `[...]`, where commas separate values
  let key = null;           // the key the current value belongs to

  const valueKind = () => {
    if (key && SELECTOR_KEYS.has(key)) return 'selector';
    if (key && DIRECTION_KEYS.has(key)) return 'direction';
    return 'value';
  };

  // One argument's worth of text, from `i` to whatever ends it.
  const takeValue = () => {
    const end = valueEnd(s, i);
    const raw = s.slice(i, end);
    const body = raw.replace(/\s+$/, '');
    push(body, valueKind());
    push(raw.slice(body.length), 'text');
    i = end;
    // A list keeps its key for every element; a bare value has consumed it.
    if (!inList) key = null;
    expect = inList ? 'value' : 'key';
  };

  while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) {
      const ws = s.slice(i).match(/^\s+/)[0];
      push(ws, 'text');
      i += ws.length;
      continue;
    }

    // The three characters that end an argument do so from either position.
    if (ch === ')') { push(ch, 'punct'); i++; expect = 'key'; key = null; continue; }
    if (ch === ']') { push(ch, 'punct'); i++; inList = false; expect = 'key'; continue; }
    if (ch === ',') { push(ch, 'punct'); i++; expect = inList ? 'value' : 'key'; continue; }

    // A VALUE IS AN EXPRESSION, SO ITS BRACKETS ARE ITS OWN. `selector=(a +
    // b).c` and `selector=Person->Person` are single selectors; treating `(` as
    // structure here would cut them in half and hand the demonstration rows a
    // fragment to hover on. Only `[`, which opens a list of values, is structure.
    if (expect === 'value') {
      if (ch === '[') { push(ch, 'punct'); i++; inList = true; continue; }
      takeValue();
      continue;
    }

    if (ch === '(') { push(ch, 'punct'); i++; expect = 'key'; key = null; continue; }
    if (ch === '[') { push(ch, 'punct'); i++; inList = true; expect = 'value'; continue; }
    if (ch === '=') { push(ch, 'punct'); i++; expect = 'value'; continue; }

    // A name followed by `=` is a keyword argument; one followed by `(` opens a
    // nested style block, which is a key in every way that matters here. A name
    // followed by anything else is a positional value.
    const m = s.slice(i).match(IDENT);
    const after = m && s.slice(i + m[0].length).match(/^\s*[=(]/);
    if (after) {
      push(m[0], 'key');
      key = m[0];
      i += m[0].length;
      continue;
    }
    takeValue();
  }
}

// `A`, `A[Alice]`, `A:::Person`, `A[Alice]:::Person` — an id, an optional
// display label, an optional sort. The sort is a selector, so it is coloured
// like one.
function scanNodeExpr(s, push) {
  let i = 0;

  const ws = s.match(/^\s*/)[0];
  push(ws, 'text');
  i += ws.length;

  const id = s.slice(i).match(/^[\w-]+/);
  if (id) { push(id[0], 'node'); i += id[0].length; }

  while (i < s.length) {
    const rest = s.slice(i);

    const sort = rest.match(/^(:::)([\w-]+)/);
    if (sort) {
      push(sort[1], 'punct');
      push(sort[2], 'selector');
      i += sort[0].length;
      continue;
    }

    const label = rest.match(/^([[({>]+)(.*?)([\])}]+)/);
    if (label) {
      push(label[1], 'punct');
      push(label[2], 'label');
      push(label[3], 'punct');
      i += label[0].length;
      continue;
    }

    const space = rest.match(/^\s+/);
    if (space) { push(space[0], 'text'); i += space[0].length; continue; }

    push(rest[0], 'text');
    i++;
  }
}

// The first arrow at bracket depth 0 and outside quotes, as parse.js finds it.
function findArrow(s) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '(' || ch === '{') { depth++; continue; }
    if (ch === ']' || ch === ')' || ch === '}') { if (depth > 0) depth--; continue; }
    if (depth === 0) {
      for (const tok of ARROWS) if (s.startsWith(tok, i)) return { tok, i };
    }
  }
  return null;
}

// ` : label` on an edge's target side — the colon must follow whitespace and sit
// at depth 0, so `:::Person` and a colon inside a `[label]` are left alone.
function splitLabel(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth--;
    else if (ch === ':' && depth === 0 && /\s/.test(s[i - 1] || '')) {
      return { node: s.slice(0, i), colon: i };
    }
  }
  return { node: s, colon: -1 };
}

function scanGraphLine(s, push) {
  // `class A,B,C tag` — the tag is a selector, same as an edge label.
  const cls = s.match(/^(\s*)(class)(\s+)([\w,\s-]*?)(\s+)([\w-]+)(\s*;?\s*)$/);
  if (cls) {
    push(cls[1], 'text');
    push(cls[2], 'key');
    push(cls[3], 'text');
    for (const part of cls[4].split(/(,)/)) push(part, part === ',' ? 'punct' : 'node');
    push(cls[5], 'text');
    push(cls[6], 'selector');
    push(cls[7], 'text');
    return;
  }

  const arrow = findArrow(s);
  if (!arrow) { scanNodeExpr(s, push); return; }

  scanNodeExpr(s.slice(0, arrow.i), push);
  push(arrow.tok, 'arrow');

  let rest = s.slice(arrow.i + arrow.tok.length);

  // Mermaid's pipe label: `A -->|spouse| B`.
  const piped = rest.match(/^(\s*)\|([^|]*)\|/);
  if (piped) {
    push(piped[1], 'text');
    push('|', 'punct');
    push(piped[2], 'selector');
    push('|', 'punct');
    rest = rest.slice(piped[0].length);
  }

  const { node, colon } = splitLabel(rest);
  scanNodeExpr(node, push);
  if (colon !== -1) {
    push(':', 'punct');
    const tail = rest.slice(colon + 1);
    const lead = tail.match(/^\s*/)[0];
    push(lead, 'text');
    push(tail.slice(lead.length), 'selector');
  }
}

// Where an annotation's arguments close, counting from `depth` already-open
// parens: the index just past the `)` that brings the depth back to 0, or -1 if
// this fragment does not close it. Anything after that index is not part of the
// annotation — in practice a trailing `%%` comment.
function annotationEnd(text, depth) {
  let d = depth;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') d++;
    else if (ch === ')') { d--; if (d <= 0) return i + 1; }
  }
  return -1;
}

// How far a fragment opens or closes parentheses, ignoring quoted text.
function parenDelta(text) {
  let d = 0;
  let quote = null;
  for (const ch of text) {
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') d++;
    else if (ch === ')') d--;
  }
  return d;
}

// ── the API ─────────────────────────────────────────────────────────────────

/**
 * Tokenize one line.
 *
 *   line — the text, without its newline
 *   open — unclosed parentheses carried in from the lines before it, 0 at the
 *          start of a source
 *
 * Returns { tokens, open } — pass `open` to the next call. An annotation's
 * arguments may wrap over several lines, and a line in the middle of one is not
 * a graph line however much it may look like one.
 */
export function tokenizeLine(line, open = 0) {
  const s = String(line == null ? '' : line);
  const tokens = [];
  const push = pusher(tokens);
  const depth = Math.max(0, Number(open) || 0);

  // The arguments, plus whatever follows once they close. A `%%` after the
  // closing paren is a comment on the annotation, not one of its values.
  const args = (body, from) => {
    const end = annotationEnd(body, from);
    if (end === -1) {
      scanArgs(body, push);
      return { tokens, open: Math.max(0, from + parenDelta(body)) };
    }
    scanArgs(body.slice(0, end), push);
    const tail = body.slice(end);
    const hash = tail.indexOf('%%');
    if (hash === -1) push(tail, 'text');
    else { push(tail.slice(0, hash), 'text'); push(tail.slice(hash), 'comment'); }
    return { tokens, open: 0 };
  };

  if (depth > 0) return args(s, depth);

  const head = s.match(ANNOTATION_HEAD);
  if (head) {
    push(head[1], 'text');
    push(head[2] || '', 'comment');
    push(head[3], 'annotation');
    return args(s.slice(head[0].length), 0);
  }

  // A `%%` that is not guarding an annotation comments out the rest of the line.
  const hash = s.indexOf('%%');
  if (hash !== -1) {
    scanGraphLine(s.slice(0, hash), push);
    push(s.slice(hash), 'comment');
    return { tokens, open: 0 };
  }

  scanGraphLine(s, push);
  return { tokens, open: 0 };
}

/** Tokenize a whole source, one token list per line. */
export function tokenize(source) {
  let open = 0;
  return String(source == null ? '' : source).split(/\r?\n/).map((line) => {
    const out = tokenizeLine(line, open);
    open = out.open;
    return out.tokens;
  });
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>]/g, (c) => ESCAPES[c]);
}

/**
 * A source as HTML, one `<span class="{prefix}{kind}">` per token. Text tokens
 * are emitted bare — most of a source is text, and a span per run of spaces is
 * a lot of nodes for no colour.
 */
export function toHtml(source, prefix = 'tok-') {
  return tokenize(source)
    .map((tokens) => tokens
      .map((t) => (t.kind === 'text'
        ? escapeHtml(t.text)
        : `<span class="${prefix}${t.kind}">${escapeHtml(t.text)}</span>`))
      .join(''))
    .join('\n');
}

/**
 * Paint `source` into `el` as coloured spans.
 *
 * Colours go inline rather than through a class and a stylesheet, because a
 * markdown page can carry a light block and a dark one at the same time and a
 * single global rule cannot serve both. `toHtml` is the faster path where the
 * whole page shares one theme — the playground repaints on every keystroke.
 */
export function paintInto(doc, el, source, dark) {
  const ink = TOKEN_COLORS[dark ? 'dark' : 'light'];
  el.textContent = '';
  tokenize(source).forEach((tokens, i) => {
    if (i > 0) el.appendChild(doc.createTextNode('\n'));
    for (const t of tokens) {
      const color = ink[t.kind];
      if (!color) { el.appendChild(doc.createTextNode(t.text)); continue; }
      const span = doc.createElement('span');
      span.style.color = color;
      span.textContent = t.text;
      el.appendChild(span);
    }
  });
  // A `<pre>` swallows a trailing newline, which would leave the last line of a
  // ghost layer half a line above the caret sitting under it.
  el.appendChild(doc.createTextNode('\n'));
}

/** The `.{prefix}{kind} { color }` rules for one theme. */
export function toCss(dark, prefix = 'tok-') {
  const colors = TOKEN_COLORS[dark ? 'dark' : 'light'];
  return Object.entries(colors)
    .map(([kind, color]) => `.${prefix}${kind} { color: ${color}; }`)
    .join('\n');
}
