# Changelog

Notable changes to spytial-gdl, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow SemVer
as far as a 0.x can: a minor bump is new surface or a breaking change, a patch
is a fix.

## [0.6.0] — 2026-09-06

spytial-gdl has no installed base yet, so this release drops every legacy
spelling and alias rather than carrying them.

### Breaking

- **Requires spytial-core 5.** The peer range and every CDN tag move from `4`
  to `5` (5.4.0 at release). The 5.0 major removed React surfaces spytial-gdl
  never mounted; every entailment in the conformance suite is identical from
  4.4.2 through 5.4.0.
- **The vocabulary is exactly what core's schema marks current.** `@atomColor`,
  `@edgeColor`, `@icon`, `@projection`, an inline `color` on `@inferredEdge`, the
  by-field `@group(field=…)` form, and `addEdge=true` are unknown annotations or
  invalid values now. Nothing is rewritten or warned about.
- **The `spytial-graph` and `spytial-graph-editable` fences are gone.** Use
  `spytial-gdl` / `spytial-gdl-editable`, or `spytial` / `spytial-editable`.
- **`window.CndCore` is no longer read.** The engine is `window.spytialcore`.
- **`@group` needs a `name`.** An unnamed group compiled cleanly and made core's
  parser throw, which took every other annotation in the diagram with it. It is
  a compile error with a line number now.
- **The npm package ships `src/`, the README and the guide.** The site page,
  playground and examples stay in the repository.

### Added

- **Diagnostics.** Every render and solve result carries a `diagnostics` list,
  and a rendered block shows it in a band under the diagram. From the notation:
  an edge label, sort or class that can never be a selector (`left child`,
  `left-child`, `3`); a name starting with `_`, reserved for `_` and `_links`;
  a name used as both a label and a class, or a sort and a class (the class is
  dropped, since hiding its relation by name hid the edges too); a class line
  naming a node no line declares; and, as warnings, a node labeled or sorted
  twice and a repeated edge. From the engine, read by field and never modeled:
  a selector that matched nothing, a selector of the wrong arity or a word the
  query grammar reserves, a spec core's parser refuses (reported, and the
  diagram drawn under no rules), and an engine that failed to load (a notice
  above each block).
- **`solveSpytialGdl(spytial, compiled)`**, the headless solve both render paths
  share. It runs in plain Node with an imported core.
- **`compileSpytialGdl(source)`**, source to `{ datum, rules }` with no DOM and
  no engine. Each rule is stamped with `source: { text, location }`, which
  spytial-core 5.4 cites in conflict reports and warnings, so an UNSAT panel
  names the annotation as written and its line.
- **A conformance suite** on spytial-core's harness
  (`test/conformance/cases.mjs`). Every constraint has a case asserting what the
  compiled spec entails, not just what the YAML says.

### Fixed

- A read-only block with a selector error draws the layout under the remaining
  rules instead of a blank frame, and sets `unsat` only on a real conflict.
- Line numbers in a hand-authored `<div>` block were one off from the file.
- `%%` inside a `[label]` is text, not a comment.

### Internal

- spytial-core is a devDependency at the same range as the peer dependency, and
  `npm test` needs `npm install`. There is deliberately no lockfile: CI resolves
  the newest core on the peer major, so a core release that changes an
  entailment fails a build here rather than someone's diagram.
- `npm run update-core` re-vendors the schema, regenerates
  `src/_spec-tables.js`, and lists what the schema marks deprecated, which the
  generator skips.

## [0.5.0] — 2026-08-05

- The annotation vocabulary is generated from spytial-core's published spec
  schema (`scripts/generate-spec-tables.mjs` → `src/_spec-tables.js`) rather
  than transcribed by hand. That closed four drifts the engine never reported:
  `size` and `hideAtom` compiling into the section core warns about,
  `projection` accepted though no released core parsed it, `icon` treated as
  current after deprecation, and `iconStyle` rejected as unknown.
- Annotation arguments are validated against what core reads. A misspelled key
  or an out-of-vocabulary value is an error with a line number instead of a rule
  that silently stops applying.

## [0.4.0] — 2026-07-28

- Blocks are detected wherever the generator put the language, so Jekyll,
  MkDocs Material, VitePress, Sphinx, Starlight and Docusaurus render. Six
  pipelines previously did not, and Docusaurus drew a silently wrong diagram
  rather than none.
- `autoRender` keeps watching for blocks added after the first pass, which
  SPA-routed doc sites need.

## [0.3.1] — 2026-07-28

- Hovering a selector in a suggestion highlights the nodes it names, through
  spytial-core's own highlight API: blue to red for an ordering, neutral for an
  alignment or a ring.
- The notation is syntax-highlighted in the editor, the source panel and the
  suggestion rows (`src/highlight.js`), with one colour for everything that can
  be a selector.
- The playground header says spytial-gdl. `spytial-graph` stayed as a fence
  alias, removed in 0.6.0.

## [0.3.0] — 2026-07-27

- Constraint inference: arrange a diagram by hand and the tool proposes the
  `@annotation` lines that produce that arrangement, including `@cyclic`.
  Available in editable Markdown blocks and in the playground.

## [0.2.0] — 2026-07-27

- Requires spytial-core ^4.0.0; CDN tags float on `@4`.
- Playground share links are compressed, and directive arguments are documented.

[0.6.0]: https://github.com/sidprasad/spytial-gdl/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/sidprasad/spytial-gdl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/sidprasad/spytial-gdl/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/sidprasad/spytial-gdl/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/sidprasad/spytial-gdl/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sidprasad/spytial-gdl/compare/v0.1.1...v0.2.0
