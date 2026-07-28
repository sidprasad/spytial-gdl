// Syntax highlighting (highlight.js).
//
// Cosmetic code, but two things about it are not: the `selector` kind is what
// the demonstration rows hang their hover on, so mis-tokenizing a selector
// highlights the wrong nodes; and a highlighter runs on half-typed lines, so
// every malformed input here must come back as tokens rather than a throw.

import { tokenize, tokenizeLine, toHtml, TOKEN_COLORS } from '../src/highlight.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}

/** The text of every token of one kind on a line. */
const of = (tokens, kind) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
const line = (src) => tokenizeLine(src).tokens;
const shape = (tokens) => tokens.map((t) => `${t.kind}(${t.text})`).join(' ');

// ── everything that can be a selector is one ────────────────────────────────
//
// The point of the colouring: `selector=spouse` does not introduce a new kind of
// name, it reuses the edge label you already wrote. Both have to tokenize the
// same way or the claim the colour makes is false.

check('an edge label is a selector', of(line('c -> e : spouse'), 'selector').join() === 'spouse');
check('a node sort is a selector', of(line('a:::Person -> b'), 'selector').join() === 'Person');
check('a class tag is a selector', of(line('class A,B,C tree'), 'selector').join() === 'tree');
check('a mermaid pipe label is a selector', of(line('A -->|left| B'), 'selector').join() === 'left');
check('and so is the value of selector=',
  of(line('@align(selector=spouse, direction=horizontal)'), 'selector').join() === 'spouse');

// ── selectors are expressions, not identifiers ──────────────────────────────
//
// Reading the value with an identifier pattern would cut `Person->Person` at the
// arrow and hand the rows half a selector to hover on.

for (const expr of ['~parentOf.parentOf', 'Person->Person', '^parentOf', '_links', '(a + b).c']) {
  const tokens = line(`@orientation(selector=${expr}, directions=[below])`);
  check(`selector=${expr} survives whole`, of(tokens, 'selector').join() === expr, shape(tokens));
}

// ── the rest of an annotation ───────────────────────────────────────────────

{
  const tokens = line('@orientation(selector=left, directions=[below, left])');
  check('the annotation name is its own token', of(tokens, 'annotation').join() === '@orientation');
  check('directions are directions, not values',
    of(tokens, 'direction').join() === 'below,left', shape(tokens));
  check('and `left` as a direction is not confused with `left` as a selector',
    of(tokens, 'selector').join() === 'left', shape(tokens));
}

{
  const tokens = line('@edgeStyle(field=next, lineStyle(color=crimson, pattern=dashed))');
  check('a nested style block reads as keys and values',
    of(tokens, 'key').join() === 'field,lineStyle,color,pattern', shape(tokens));
  check('and none of it is mistaken for a selector', of(tokens, 'selector').length === 0, shape(tokens));
}

// ── comments ────────────────────────────────────────────────────────────────

check('%% comments out the rest of a graph line',
  of(line('x -> y %% note'), 'comment').join() === '%% note');
check('a comment after a closed annotation is a comment, not an argument',
  of(line('@align(selector=spouse, direction=horizontal) %% why'), 'comment').join() === '%% why',
  shape(line('@align(selector=spouse, direction=horizontal) %% why')));
check('a %%-guarded annotation is still an annotation',
  of(line('%%@align(selector=spouse, direction=horizontal)'), 'annotation').join() === '@align');

// ── an annotation that wraps ────────────────────────────────────────────────
//
// A line in the middle of an argument list is not a graph line, however much
// `selector=team, name=x)` may look like one.

{
  const lines = tokenize('@group(\n  selector=team, name=x)\n A -> B');
  check('a wrapped annotation keeps reading as one',
    of(lines[1], 'selector').join() === 'team', shape(lines[1]));
  check('and the line after it closes is a graph line again',
    of(lines[2], 'node').join() === 'A,B', shape(lines[2]));
}

// ── half-typed input ────────────────────────────────────────────────────────
//
// The highlighter runs on every keystroke, so it never gets a finished source.

for (const partial of ['@', '@orient', '@align(', '@align(selector=', 'a ->', ':::', '[', '%%', '']) {
  let ok = true;
  try { tokenizeLine(partial); } catch (_) { ok = false; }
  check(`half-typed ${JSON.stringify(partial)} tokenizes rather than throws`, ok);
}

check('and nothing is lost — the tokens rebuild the line', (() => {
  const src = 'a:::Person[Alice] --> b : spouse %% hi';
  return line(src).map((t) => t.text).join('') === src;
})());

// ── html ────────────────────────────────────────────────────────────────────

{
  const html = toHtml('A -> B : spouse');
  check('html wraps each token in a class', /<span class="tok-selector">spouse<\/span>/.test(html), html);
  check('and escapes what would otherwise be markup',
    toHtml('A -> B').includes('-&gt;') && !toHtml('A -> B').includes('->'), toHtml('A -> B'));
}

check('both themes define a colour for every kind used', (() => {
  const kinds = new Set();
  for (const tokens of tokenize('a:::P[x] -> b : r %% c\n@align(selector=s, direction=horizontal)')) {
    for (const t of tokens) if (t.kind !== 'text') kinds.add(t.kind);
  }
  return [...kinds].every((k) => TOKEN_COLORS.light[k] && TOKEN_COLORS.dark[k]);
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
