// The sequence envelope is deliberately separate from the graph grammar.
// Each state compiles as an ordinary, complete GDL graph. Ranges are blanked
// rather than removed so graph/annotation diagnostics retain document lines.
import { maskBlockComments } from './comments.js';

export const SEQUENCE_POLICIES = Object.freeze([
  'stability', 'ignore_history', 'change_emphasis', 'random_positioning',
]);

export function isGdlSequence(source) {
  const { lines } = maskBlockComments(source);
  const first = lines.map(line => line.replace(/%%.*$/, '').trim()).find(Boolean);
  return first === 'gdl-sequence';
}

function keepRanges(source, ranges) {
  // Offsets below are UTF-16 offsets, as are slice and the graph parser.
  const out = source.split('').map(ch => ch === '\n' || ch === '\r' ? ch : ' ');
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) out[i] = source[i];
  }
  return out.join('');
}

export function parseGdlSequence(value) {
  const source = String(value ?? '');
  const masked = maskBlockComments(source);
  // Keep offsets, including CRLF and Unicode, identical to the original.
  const visible = source.split(/(\r?\n)/).map((part, index) => index % 2
    ? part : (masked.lines[index / 2] || part.replace(/./g, ' '))).join('');
  const errors = masked.errors.map(error => ({ ...error, source: 'sequence', code: 'sequence-comment' }));
  const lineAt = offset => source.slice(0, offset).split('\n').length;
  const fail = (offset, message, code = 'sequence-syntax') => errors.push({
    severity: 'error', source: 'sequence', code, line: lineAt(offset), message,
  });
  const shared = [], states = [], ids = new Set();
  let policy = 'stability', sawPolicy = false, pos = 0;

  const skip = () => {
    while (pos < visible.length) {
      if (/\s/.test(visible[pos])) { pos++; continue; }
      if (visible.startsWith('%%', pos)) {
        const end = visible.indexOf('\n', pos);
        pos = end === -1 ? visible.length : end + 1;
        continue;
      }
      break;
    }
  };

  // Balanced delimiters, quoted strings and comments all occur inside GDL:
  // diamond labels, [labels with }], nested style calls and SGQ comprehensions.
  const closing = (start, outer) => {
    const stack = [outer];
    const closes = { ')': '(', ']': '[', '}': '{' };
    let quote = null;
    for (let i = start + 1; i < visible.length; i++) {
      const ch = visible[i];
      if (quote) {
        if (ch === '\\') { i++; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if ((ch === '"' || ch === "'") && !/[\w]/.test(visible[i - 1])) { quote = ch; continue; }
      if (visible.startsWith('%%', i) && stack.length === 1) {
        const end = visible.indexOf('\n', i);
        if (end === -1) break;
        i = end; continue;
      }
      if (stack.length === 1 && (i === start + 1 || visible[i - 1] === '\n')) {
        const rest = visible.slice(i);
        if (/^[ \t]*state(?:\s+[A-Za-z_][\w-]*)?\s*\{/.test(rest)) {
          fail(i, 'states cannot be nested');
        }
        if (/^[ \t]*policy\s*:/.test(rest)) fail(i, 'policy is global; put it before the first state');
      }
      // Square brackets are labels/lists; braces and parentheses within them
      // are text unless they match a nested square bracket.
      if (stack.at(-1) === '[' && ch !== '[' && ch !== ']') continue;
      if (ch === '(' || ch === '[' || ch === '{') { stack.push(ch); continue; }
      if (closes[ch] === stack.at(-1)) {
        stack.pop();
        if (!stack.length) return i;
      }
    }
    return -1;
  };

  skip();
  if (/^gdl-sequence(?=\s|$)/.test(visible.slice(pos))) {
    pos += 'gdl-sequence'.length;
    skip();
  }
  while (pos < visible.length) {
    const rest = visible.slice(pos);
    const head = rest.match(/^state(?:\s+([A-Za-z_][\w-]*))?\s*\{/);
    if (head) {
      const start = pos, open = pos + head[0].lastIndexOf('{');
      const end = closing(open, '{');
      if (end === -1) { fail(start, 'unclosed state: expected "}"'); break; }
      const id = head[1] || null;
      if (id && ids.has(id)) fail(start, `duplicate state id "${id}"`, 'duplicate-state-id');
      if (id) ids.add(id);
      states.push({ id, index: states.length, line: lineAt(start), body: source.slice(open + 1, end), range: [open + 1, end] });
      pos = end + 1;
    } else if (/^policy\s*:/.test(rest)) {
      const end = visible.indexOf('\n', pos);
      const text = visible.slice(pos, end === -1 ? visible.length : end).replace(/%%.*$/, '').trim();
      const match = text.match(/^policy\s*:\s*([a-z_]+)\s*$/);
      if (states.length) fail(pos, 'policy is global; put it before the first state');
      else if (sawPolicy) fail(pos, 'declare policy only once');
      else if (!match || !SEQUENCE_POLICIES.includes(match[1])) {
        fail(pos, `unknown sequence policy; expected ${SEQUENCE_POLICIES.join(', ')}`, 'sequence-policy');
      } else policy = match[1];
      sawPolicy = true;
      pos = end === -1 ? visible.length : end + 1;
    } else if (rest[0] === '@') {
      const match = rest.match(/^@[A-Za-z_]\w*\s*\(/);
      if (!match) { fail(pos, 'expected an annotation call'); break; }
      const end = closing(pos + match[0].lastIndexOf('('), '(');
      if (end === -1) { fail(pos, 'unclosed shared annotation'); break; }
      if (states.length) fail(pos, 'shared rules must come before the first state; put local rules inside its block');
      else shared.push([pos, end + 1]);
      pos = end + 1;
    } else {
      fail(pos, 'expected state <optional-id> { ... }; graphs belong inside state blocks');
      break;
    }
    skip();
  }
  if (!states.length) fail(0, 'a sequence needs at least one state', 'sequence-empty');
  const sharedSource = keepRanges(source, shared);
  for (const state of states) {
    state.source = keepRanges(source, [...shared, state.range]);
    delete state.range;
  }
  return { ok: errors.length === 0, policy, states, sharedSource, errors, source };
}
