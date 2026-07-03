// spytial-gdl docs shell — a tiny client-side, zero-build site that renders
// Markdown pages with LIVE spytial-gdl diagrams (the docs dogfood the tool).
//
// It generalizes examples/md-viewer.html: marked turns each page into HTML, then
// renderSpytialGdls lights up every ```spytial-gdl block, exactly the way a
// reader's own page would. Pages live in pages/<slug>.md; the nav is nav.json.
//
// Routing is hash-based (#/<slug> and #/<slug>/<heading-id>) so the whole site is
// one static index.html — deep links, back/forward, and GitHub Pages subpaths all
// work with no server rewrites.

import { renderSpytialGdls } from '../src/markdown.js';

const PAGES = 'pages/';
const REPO_PAGES = 'https://github.com/sidprasad/spytial-gdl/blob/main/docs/pages/';

const els = {
  doc: document.getElementById('doc'),
  sidenav: document.getElementById('sidenav'),
  toc: document.getElementById('toc'),
  prevnext: document.getElementById('prevnext'),
  status: document.getElementById('status'),
  editLink: document.getElementById('edit-link'),
  search: document.getElementById('search-input'),
  searchResults: document.getElementById('search-results'),
  navToggle: document.getElementById('nav-toggle'),
  themeToggle: document.getElementById('theme-toggle'),
  scrim: document.getElementById('scrim'),
};

let nav = [];        // raw nav.json
let flat = [];       // [{ title, slug }] in reading order (pages only)
let currentSlug = null;
let mermaidMod = null;
let searchIndex = null;   // built lazily on first search focus

// ── Theme ─────────────────────────────────────────────────────────────────
const THEME_KEY = 'spytial-docs-theme';
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved || (prefersDark ? 'dark' : 'light'));
  els.themeToggle.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    if (currentSlug) renderPage(currentSlug, true);  // re-theme the live diagrams
  });
}
function setTheme(t) { document.body.dataset.theme = t; }
const themeOpt = () => (document.body.dataset.theme === 'dark' ? 'dark' : 'light');

// ── Nav ─────────────────────────────────────────────────────────────────--
async function loadNav() {
  nav = await fetch('nav.json').then((r) => r.json());
  flat = [];
  for (const entry of nav) {
    if (entry.pages) for (const p of entry.pages) flat.push(p);
    else flat.push(entry);
  }
  renderSidebar();
}

function renderSidebar() {
  els.sidenav.innerHTML = '';
  for (const entry of nav) {
    const group = document.createElement('div');
    group.className = 'group';
    if (entry.section) {
      const t = document.createElement('p');
      t.className = 'group-title';
      t.textContent = entry.section;
      group.appendChild(t);
    }
    const ul = document.createElement('ul');
    const pages = entry.pages || [entry];
    for (const p of pages) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#/${p.slug}`;
      a.textContent = p.title;
      a.dataset.slug = p.slug;
      li.appendChild(a);
      ul.appendChild(li);
    }
    group.appendChild(ul);
    els.sidenav.appendChild(group);
  }
}

function markActiveNav(slug) {
  els.sidenav.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.dataset.slug === slug);
  });
}

// ── Slugger (stable heading ids) ────────────────────────────────────────---
function makeSlugger() {
  const seen = new Map();
  return (text) => {
    let base = String(text).toLowerCase().trim()
      .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-') || 'section';
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

// ── Routing ───────────────────────────────────────────────────────────────
function parseHash() {
  const m = location.hash.match(/^#\/([^/]*)\/?(.*)$/);
  if (!m) return { slug: '', heading: '' };
  return { slug: decodeURIComponent(m[1] || ''), heading: m[2] || '' };
}

async function route() {
  let { slug, heading } = parseHash();
  if (!slug) {
    location.replace(`#/${flat[0] ? flat[0].slug : 'introduction'}`);
    return; // hashchange re-fires route()
  }
  closeNav();
  if (slug !== currentSlug) {
    await renderPage(slug);
  }
  if (heading) scrollToHeading(heading);
  else window.scrollTo({ top: 0 });   // sticky topbar sits in flow at scroll 0
}

function scrollToHeading(id) {
  // scroll-margin-top (in CSS) keeps the heading clear of the sticky topbar.
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ block: 'start' });
}

// ── Page render ─────────────────────────────────────────────────────────--
async function renderPage(slug, isRerender = false) {
  let md;
  try {
    md = await fetch(`${PAGES}${slug}.md`).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.text();
    });
  } catch (err) {
    els.doc.innerHTML =
      `<h1>Page not found</h1><p class="loading">No page <code>${slug}</code> — ${err.message}.</p>`;
    els.toc.innerHTML = '';
    els.prevnext.innerHTML = '';
    return;
  }

  els.doc.innerHTML = marked.parse(md);
  currentSlug = slug;

  enhanceHeadings(slug);
  rewriteLinks();
  enhanceCodeBlocks();
  enhanceCallouts();
  buildToc();
  buildPrevNext(slug);
  markActiveNav(slug);

  // page title + edit link
  const h1 = els.doc.querySelector('h1');
  document.title = h1 ? `${h1.textContent} · spytial-gdl` : 'spytial-gdl · docs';
  els.editLink.href = `${REPO_PAGES}${slug}.md`;

  // live diagrams (mermaid for contrast, then spytial-gdl proper)
  await renderMermaid();
  els.status.textContent = 'rendering diagrams…';
  try {
    const results = await renderSpytialGdls(els.doc, { theme: themeOpt(), height: 320 });
    const live = results.filter((r) => !r.error).length;
    els.status.textContent = live ? `${live} live diagram${live === 1 ? '' : 's'}` : '';
  } catch (err) {
    els.status.textContent = `diagram engine failed: ${err.message}`;
    console.error('[docs] renderSpytialGdls failed:', err);
  }

  if (!isRerender) observeToc();
}

// Give every h2/h3 a stable id and a click-to-link anchor.
function enhanceHeadings(slug) {
  const slugger = makeSlugger();
  els.doc.querySelectorAll('h2, h3').forEach((h) => {
    if (!h.id) h.id = slugger(h.textContent);
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = `#/${slug}/${h.id}`;
    a.textContent = '#';
    a.setAttribute('aria-label', `Link to “${h.textContent}”`);
    h.appendChild(a);
  });
}

// Rewrite in-content links: *.md → hash routes; bare slugs → hash routes.
// Leaves external links, in-page #ids, and existing #/ routes alone.
function rewriteLinks() {
  els.doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:|#)/.test(href)) return;
    const mdMatch = href.match(/^(?:\.\/)?([\w-]+)\.md(#.*)?$/);
    if (mdMatch) {
      a.setAttribute('href', `#/${mdMatch[1]}${mdMatch[2] ? `/${mdMatch[2].slice(1)}` : ''}`);
      return;
    }
    // A relative path that escapes docs/ (e.g. ../playground/) stays as-is.
  });
}

// Add a copy button to non-spytial code blocks (spytial ones become diagrams).
function enhanceCodeBlocks() {
  els.doc.querySelectorAll('pre > code').forEach((code) => {
    const cls = code.className || '';
    if (/language-spytial/.test(cls)) return;        // becomes a live diagram
    const pre = code.parentElement;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      } catch (_) {}
    });
    pre.appendChild(btn);
  });
}

// Promote `> **Note** …` / `> **Warning** …` blockquotes to styled callouts.
function enhanceCallouts() {
  els.doc.querySelectorAll('blockquote').forEach((bq) => {
    const lead = bq.querySelector('strong');
    if (!lead) return;
    const kind = lead.textContent.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (kind === 'note' || kind === 'tip') bq.classList.add('callout', 'callout-note');
    else if (kind === 'warning' || kind === 'caution') bq.classList.add('callout', 'callout-warn');
  });
}

// ── On-page TOC ───────────────────────────────────────────────────────────
function buildToc() {
  const heads = [...els.doc.querySelectorAll('h2, h3')];
  if (heads.length < 2) { els.toc.innerHTML = ''; return; }
  let html = '<p class="toc-title">On this page</p><ul>';
  for (const h of heads) {
    const text = h.textContent.replace(/#$/, '').trim();
    html += `<li class="${h.tagName.toLowerCase()}"><a href="#/${currentSlug}/${h.id}" data-id="${h.id}">${text}</a></li>`;
  }
  els.toc.innerHTML = html + '</ul>';
}

let tocObserver = null;
function observeToc() {
  if (tocObserver) tocObserver.disconnect();
  const heads = [...els.doc.querySelectorAll('h2, h3')];
  if (!heads.length) return;
  const links = new Map([...els.toc.querySelectorAll('a')].map((a) => [a.dataset.id, a]));
  tocObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('active'));
      const a = links.get(e.target.id);
      if (a) a.classList.add('active');
    }
  }, { rootMargin: '-64px 0px -70% 0px', threshold: 0 });
  heads.forEach((h) => tocObserver.observe(h));
}

// ── Prev / next ───────────────────────────────────────────────────────────
function buildPrevNext(slug) {
  const i = flat.findIndex((p) => p.slug === slug);
  if (i === -1) { els.prevnext.innerHTML = ''; return; }
  const prev = flat[i - 1];
  const next = flat[i + 1];
  let html = '';
  html += prev
    ? `<a class="prev" href="#/${prev.slug}"><span class="pn-dir">← Previous</span><span class="pn-title">${prev.title}</span></a>`
    : '<span style="flex:1"></span>';
  html += next
    ? `<a class="next" href="#/${next.slug}"><span class="pn-dir">Next →</span><span class="pn-title">${next.title}</span></a>`
    : '<span style="flex:1"></span>';
  els.prevnext.innerHTML = html;
}

// ── Mermaid (loaded only when a page uses it, for the flowchart contrast) ──
async function renderMermaid() {
  const nodes = [...els.doc.querySelectorAll('pre > code.language-mermaid')];
  if (!nodes.length) return;
  if (!mermaidMod) {
    mermaidMod = (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;
    mermaidMod.initialize({ startOnLoad: false, theme: themeOpt() === 'dark' ? 'dark' : 'default' });
  }
  const hosts = nodes.map((code) => {
    const host = document.createElement('div');
    host.className = 'mermaid';
    host.textContent = code.textContent;
    code.parentElement.replaceWith(host);
    return host;
  });
  try {
    await mermaidMod.run({ nodes: hosts });
  } catch (err) {
    hosts.forEach((h) => { h.classList.add('mermaid-error'); h.textContent = `Mermaid failed:\n${err.message || err}`; });
  }
}

// ── Search (title + heading index, built lazily on first focus) ───────────
async function buildSearchIndex() {
  if (searchIndex) return;
  searchIndex = [];
  const pages = await Promise.all(flat.map(async (p) => {
    try { return { p, md: await fetch(`${PAGES}${p.slug}.md`).then((r) => r.text()) }; }
    catch { return { p, md: '' }; }
  }));
  const slugger = () => makeSlugger();
  for (const { p, md } of pages) {
    searchIndex.push({ title: p.title, slug: p.slug, hid: '', kind: 'Page' });
    const s = slugger();
    for (const line of md.split('\n')) {
      const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
      if (m) searchIndex.push({ title: m[2].replace(/`/g, ''), slug: p.slug, hid: s(m[2]), kind: p.title });
    }
  }
}

function runSearch(q) {
  const query = q.trim().toLowerCase();
  if (!query) { els.searchResults.hidden = true; return; }
  const hits = (searchIndex || [])
    .map((e) => ({ e, score: e.title.toLowerCase().indexOf(query) }))
    .filter((x) => x.score !== -1)
    .sort((a, b) => a.score - b.score || a.e.title.length - b.e.title.length)
    .slice(0, 12);
  if (!hits.length) {
    els.searchResults.innerHTML = '<p class="empty">No matches.</p>';
  } else {
    els.searchResults.innerHTML = hits.map(({ e }) =>
      `<a href="#/${e.slug}${e.hid ? `/${e.hid}` : ''}">${e.title}<small>${e.kind}</small></a>`
    ).join('');
  }
  els.searchResults.hidden = false;
}

function initSearch() {
  els.search.addEventListener('focus', buildSearchIndex, { once: true });
  els.search.addEventListener('input', (e) => runSearch(e.target.value));
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { els.search.value = ''; els.searchResults.hidden = true; els.search.blur(); }
    if (e.key === 'Enter') { const a = els.searchResults.querySelector('a'); if (a) location.hash = a.getAttribute('href').slice(1); }
  });
  els.searchResults.addEventListener('click', () => { els.searchResults.hidden = true; els.search.value = ''; });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) els.searchResults.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.search && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); els.search.focus();
    }
  });
}

// ── Mobile nav ────────────────────────────────────────────────────────────
function openNav() { document.body.classList.add('nav-open'); els.scrim.hidden = false; els.navToggle.setAttribute('aria-expanded', 'true'); }
function closeNav() { document.body.classList.remove('nav-open'); els.scrim.hidden = true; els.navToggle.setAttribute('aria-expanded', 'false'); }
function initNavToggle() {
  els.navToggle.addEventListener('click', () => (document.body.classList.contains('nav-open') ? closeNav() : openNav()));
  els.scrim.addEventListener('click', closeNav);
}

// ── Boot ──────────────────────────────────────────────────────────────────
(async function boot() {
  initTheme();
  initNavToggle();
  initSearch();
  if (typeof marked === 'undefined') {
    els.doc.innerHTML = '<h1>Could not load</h1><p>The Markdown renderer failed to load (offline?).</p>';
    return;
  }
  marked.setOptions({ gfm: true });
  await loadNav();
  window.addEventListener('hashchange', route);
  await route();
})();
