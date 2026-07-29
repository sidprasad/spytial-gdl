// Platform fixtures: the HTML each documentation pipeline actually produces for
// a ```spytial-gdl fence, and what we must read back out of it.
//
//   node test/platforms.test.mjs
//
// Every fixture below mirrors markup captured from that generator's own
// published docs (or, for the Python/Ruby toolchains, generated locally), with
// the language and content swapped for ours. They are structural facts about
// other people's output, so they belong in a test: if a fixture stops matching
// what a generator emits, that is a real regression in docs/pages/platforms.md,
// not a stylistic choice we can change.
//
// The DOM here is a stub. querySelectorAll's CSS matching is the browser's job
// and is exercised end-to-end by test/platform-fixtures.html; what this file
// pins is the part we wrote: pulling the source text back out of a block whose
// line structure the generator rebuilt out of elements.

import { sourceFromBlock, blockSelector } from '../src/markdown.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.error(`FAIL    ${name}  ${extra}`); }
}
function eq(name, actual, expected) {
  check(name, actual === expected,
    `\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
}

// ── minimal DOM stub ────────────────────────────────────────────────────────
// Only what sourceFromBlock touches: childNodes, nodeType, tagName, nodeValue,
// plus querySelector('code'|'pre') and textContent.
function t(text) { return { nodeType: 3, nodeValue: text }; }
function e(tag, ...children) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children.flat().map((c) => (typeof c === 'string' ? t(c) : c)),
    get textContent() {
      let s = '';
      for (const c of el.childNodes) s += c.nodeType === 3 ? c.nodeValue : c.textContent;
      return s;
    },
    querySelector(sel) {
      for (const c of el.childNodes) {
        if (c.nodeType !== 1) continue;
        if (c.tagName === sel.toUpperCase()) return c;
        const found = c.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
  };
  return el;
}

// The source every fixture carries, and what we expect to read back.
const LINES = [
  'A -> B : left',
  'A -> C : right',
  '',
  '@orientation(selector=_links, directions=[below])',
];
const EXPECTED = LINES.join('\n');

// A block is read correctly when the lines survive. Trailing newlines differ by
// generator (some close the last line, some don't) and are not meaningful.
function readsBack(name, el) {
  const got = sourceFromBlock(el).replace(/\n+$/, '');
  eq(name, got, EXPECTED);
}

// ── 1. plain fenced output ──────────────────────────────────────────────────
// marked, markdown-it, kramdown (Jekyll with highlighter off), Python-Markdown
// `fenced_code`, Eleventy. The shape that already worked.
console.log('\nplain <pre><code class="language-…">');
readsBack('markdown-it / marked / kramdown / Python-Markdown',
  e('code', EXPECTED + '\n'));

// ── 2. Jekyll + Rouge (the GitHub Pages default) ────────────────────────────
// <div class="language-X highlighter-rouge"><div class="highlight">
//   <pre class="highlight"><code>…
console.log('\nJekyll (Rouge)');
readsBack('div.language-X wrapper, real newlines in the code text',
  e('div', e('div', e('pre', e('code', EXPECTED + '\n')))));

// ── 3. MkDocs Material (Pygments, anchored line numbers) ────────────────────
// Each line is a <span id="__span-0-N"> holding an empty anchor and the line's
// tokens; the newline sits inside the span, before it closes.
console.log('\nMkDocs Material (Pygments)');
readsBack('per-line spans with the newline inside, empty line anchors',
  e('div', e('pre', e('span'), e('code',
    LINES.map((line, i) => e('span', e('a'), e('span', line), '\n'))))));

// ── 4. MkDocs superfences custom_fences / Pandoc-style bare class ───────────
console.log('\nMkDocs custom fence');
readsBack('pre.spytial-gdl > code, verbatim', e('pre', e('code', EXPECTED)));

// ── 5. Hugo (Chroma) ────────────────────────────────────────────────────────
// <code class="language-X" data-lang="X"><span class=line><span class=cl>…\n
console.log('\nHugo (Chroma)');
readsBack('nested line/cl spans with the newline inside cl',
  e('code', LINES.map((line) => e('span', e('span', line + '\n')))));

// ── 6. Docusaurus (Prism) ───────────────────────────────────────────────────
// One <div class="token-line"> per line, each ending in <br/>. textContent
// would flatten this to a single line — the silent-corruption case.
console.log('\nDocusaurus (Prism token lines)');
readsBack('div per line, <br> terminated',
  e('pre', e('code', LINES.map((line) => e('div', e('span', line), e('br'))))));

// ── 7. VitePress (Shiki) ────────────────────────────────────────────────────
// The wrapper div also holds the copy button and a language label, neither of
// which is source. Newlines are text nodes between the line spans.
console.log('\nVitePress (Shiki)');
{
  const lineSpans = [];
  LINES.forEach((line, i) => {
    lineSpans.push(e('span', e('span', line)));
    if (i < LINES.length - 1) lineSpans.push(t('\n'));
  });
  readsBack('copy button and lang label excluded, line spans joined',
    e('div',
      e('button', 'Copy Code'),
      e('span', 'spytial-gdl'),
      e('pre', e('code', lineSpans))));
}

// ── 8. Sphinx / MyST ────────────────────────────────────────────────────────
// <div class="highlight-X notranslate"><div class="highlight"><pre>… — no
// <code> element at all, so the text has to come off the <pre>.
console.log('\nSphinx / MyST');
readsBack('no <code> element; read the <pre>',
  e('div', e('div', e('pre', e('span'), EXPECTED + '\n'))));

// ── 9. Astro / Starlight (Expressive Code) ──────────────────────────────────
// <pre data-language="X"><code><div class="ec-line"><div class="code">… — no
// newlines anywhere except inside an empty line's div.
console.log('\nStarlight (Expressive Code)');
readsBack('nested per-line divs, no newline text nodes',
  e('pre', e('code', LINES.map((line) =>
    e('div', e('div', line === '' ? [t('\n')] : [e('span', line)]))))));

// ── 10. Quarto / Pandoc ─────────────────────────────────────────────────────
// <span id="cb1-N"> per line with an empty anchor, newline text nodes between.
console.log('\nQuarto / Pandoc');
{
  const kids = [];
  LINES.forEach((line, i) => {
    kids.push(e('span', e('a'), e('span', line)));
    if (i < LINES.length - 1) kids.push(t('\n'));
  });
  readsBack('id-per-line spans with empty anchors',
    e('div', e('pre', e('code', kids))));
}

// ── 11. A decoder that ran paragraph logic over the block ───────────────────
// Pollen's `decode-paragraphs`, WordPress's wpautop: the block comes back as
// paragraphs and <br>s. Restoring the breaks is what keeps this from parsing as
// one enormous edge label.
console.log('\nparagraph-decoded block (Pollen, WordPress)');
readsBack('<p>/<br> structure restored to newlines',
  e('pre', e('code',
    e('p', e('span', LINES[0]), e('br'), e('span', LINES[1])),
    e('p', e('span', LINES[3])))));

// ── the selector list ───────────────────────────────────────────────────────
// Each platform above is only reachable if its marker is in the selector list.
console.log('\nblockSelector covers each platform marker');
{
  const sel = blockSelector();
  const need = [
    ['pre > code.language-spytial-gdl', 'markdown-it / marked / kramdown'],
    ['pre.language-spytial-gdl',        'pymdownx.highlight'],
    ['pre.spytial-gdl',                 'MkDocs custom fence, Pandoc'],
    ['code.language-spytial-gdl',       'Hugo (Chroma)'],
    ['code.spytial-gdl',                'Quarto bare class on <code>'],
    ['div.spytial-gdl',                 'hand-authored container'],
    ['div.language-spytial-gdl',        'Jekyll, MkDocs Material, Docusaurus, VitePress'],
    ['div.highlight-spytial-gdl',       'Sphinx / MyST'],
    ['[data-language="spytial-gdl"]',   'Astro / Starlight'],
    ['[data-lang="spytial-gdl"]',       'Hugo data-lang'],
  ];
  for (const [needle, who] of need) {
    check(`${needle.padEnd(32)} (${who})`, sel.includes(needle));
  }
  // The editable languages get the same treatment, and stay distinct.
  check('editable languages are covered too',
    sel.includes('div.language-spytial-gdl-editable') &&
    sel.includes('[data-language="spytial-gdl-editable"]'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
