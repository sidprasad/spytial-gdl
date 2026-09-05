// The generated spec tables are in sync with the vendored schema, and the
// hand-written parts of annotations.js still agree with them. Run with
// `npm test` (plain Node, no framework).
//
// `src/_spec-tables.js` is checked in rather than built on demand, so this is
// what stops it going stale: re-vendoring a schema without regenerating, or
// hand-editing the generated file, fails here rather than in a diagram someone
// renders three releases later.

import { readFileSync } from 'node:fs';
import { render, loadSchema, SCHEMA_PATH, OUTPUT_PATH } from '../scripts/generate-spec-tables.mjs';
import * as tables from '../src/_spec-tables.js';
import { extractAnnotations } from '../src/annotations.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}  ${extra}`); }
}
const j = (v) => JSON.stringify(v);

// ── the checked-in tables are what the schema produces ───────────────────────
{
  const onDisk = readFileSync(OUTPUT_PATH, 'utf8');
  const fresh = render();
  check('src/_spec-tables.js matches the vendored schema',
    onDisk === fresh,
    'stale or hand-edited — run `node scripts/generate-spec-tables.mjs`');
}

// ── the vendored schema is one this package claims to support ────────────────
{
  const schema = loadSchema(SCHEMA_PATH);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const range = pkg.peerDependencies['spytial-core'];
  const major = (v) => String(v).split('.')[0];
  check('the vendored schema comes from the peer-dependency major',
    major(schema['x-spytial-core-version']) === major(range.replace(/^[\^~>=]+/, '')),
    `schema is core ${schema['x-spytial-core-version']}, peer range is ${range}`);
  check('the generated tables record the schema they came from',
    tables.CORE_VERSION === schema['x-spytial-core-version'] &&
    tables.LANGUAGE_VERSION === schema['x-spytial-language-version'],
    j({ tables: tables.CORE_VERSION, schema: schema['x-spytial-core-version'] }));
}

// ── nothing the schema deprecates is in the language ─────────────────────────
// spytial-gdl's vocabulary is what the vendored schema marks current, and only
// that. Walk the schema for everything it marks `deprecated` — a whole form, a
// field on a form, a placement in a section, a literal spelling of a value — and
// assert none of it reached the tables. There is no rewrite, no warning, and no
// tombstone to keep in step; a deprecated spelling is simply unknown.
{
  const schema = loadSchema(SCHEMA_PATH);
  const leaked = [];
  for (const [name, def] of Object.entries(schema.$defs)) {
    if (!def.deprecated) continue;
    const key = Object.keys((def.properties ?? {}))[0] ?? name;
    if (tables.ITEMS[key] || tables.CONSTRAINT_NAMES.has(key) || tables.DIRECTIVE_NAMES.has(key)) {
      leaked.push(`form ${name}`);
    }
  }
  for (const [name, def] of Object.entries(schema.$defs)) {
    const key = Object.keys((def.properties ?? {}))[0];
    const inner = key && def.properties[key];
    const item = key && tables.ITEMS[key];
    if (!inner || !inner.properties || !item) continue;
    for (const [field, node] of Object.entries(inner.properties)) {
      if (!node.deprecated) continue;
      if (item.alternatives.some((alt) => Object.hasOwn(alt.fields, field))) leaked.push(`field ${key}.${field}`);
    }
  }
  for (const section of ['constraints', 'directives']) {
    for (const branch of schema.properties[section].items.oneOf) {
      if (!branch.deprecated) continue;
      const name = branch.$ref.slice('#/$defs/'.length);
      const key = Object.keys(schema.$defs[name].properties ?? {})[0] ?? name;
      const names = section === 'constraints' ? tables.CONSTRAINT_NAMES : tables.DIRECTIVE_NAMES;
      if (names.has(key)) leaked.push(`placement ${key}@${section}`);
    }
  }
  check('no deprecated form, field, or placement from the schema is in the tables',
    leaked.length === 0, j(leaked));
  check('the schema actually marks something deprecated (else this proves nothing)',
    Object.values(schema.$defs).some((d) => d.deprecated) ||
    ['constraints', 'directives'].some((s) => schema.properties[s].items.oneOf.some((b) => b.deprecated)));
  check('the tables export no deprecation bookkeeping',
    !('DEPRECATED_ITEMS' in tables) && !('DEPRECATED_PLACEMENTS' in tables), j(Object.keys(tables)));
  // The one literal the schema still carries: `addEdge: true`, deprecated in
  // favour of the direction words. It must be refused, not read as one of them.
  const literal = extractAnnotations('@group(selector=g, name=G, addEdge=true)');
  check('a deprecated literal spelling is an invalid value, not a synonym',
    literal.errors.length === 1 && literal.specYaml === '', j(literal));
}

{
  // Each block a table names as a leaf's type has to exist, so a `$ref` that
  // moves upstream cannot leave a rule pointing at nothing.
  const referenced = new Set();
  const walk = (fields) => {
    for (const rule of Object.values(fields)) {
      if (rule.block) referenced.add(rule.block);
    }
  };
  for (const block of Object.values(tables.STYLE_BLOCKS)) walk(block.fields);
  for (const item of Object.values(tables.ITEMS)) {
    for (const alt of item.alternatives) walk(alt.fields);
  }
  const missing = [...referenced].filter((b) => !tables.STYLE_BLOCKS[b]);
  check('every block a rule refers to is defined', missing.length === 0, j(missing));
}

{
  // Sections are disjoint: an annotation compiles into exactly one bucket, and
  // `emitEntry` has no way to express "both".
  const both = [...tables.CONSTRAINT_NAMES].filter((n) => tables.DIRECTIVE_NAMES.has(n));
  check('no annotation is in both sections', both.length === 0, j(both));

  // `size` and `hideAtom` are the live case for placements: core reads either
  // section but warns about `directives`, so compiling them there renders
  // correctly and complains in the console forever. The deprecated placement is
  // skipped by the generator (asserted above); this pins where they land.
  check('size and hideAtom compile under constraints',
    tables.CONSTRAINT_NAMES.has('size') && tables.CONSTRAINT_NAMES.has('hideAtom') &&
    !tables.DIRECTIVE_NAMES.has('size') && !tables.DIRECTIVE_NAMES.has('hideAtom'));
}

// ── the tables are actually the ones the compiler consults ───────────────────
// A cheap end-to-end check that importing them changed behaviour, so a future
// refactor cannot quietly go back to a hand-written vocabulary.
{
  const home = extractAnnotations('@size(selector=A, width=10, height=10)');
  check('a size annotation compiles under constraints',
    home.specYaml.startsWith('constraints:'), j(home.specYaml));

  const block = extractAnnotations("@atomStyle(selector=A, iconStyle(path='x.svg', placement=badge))");
  check('a block added upstream is accepted without touching annotations.js',
    block.errors.length === 0 && block.specYaml.includes('iconStyle'), j(block));

  const bad = extractAnnotations('@flag(name=important)');
  check('a value outside a generated vocabulary is an error',
    bad.errors.length === 1 && /hideDisconnected/.test(bad.errors[0].message), j(bad.errors));
}

// ── requirements the schema states only in prose ─────────────────────────────
// The schema's `required` is not the whole story: core throws on a group with no
// name, and says so in `name`'s description rather than in `required`. That is
// carried by CONDITIONAL_REQUIRED in the generator, and dropping the policy has
// to fail here rather than quietly restoring a spec core cannot parse.
{
  const selectorForm = tables.ITEMS.group.alternatives.find((a) => a.fields.name);
  check('the group selector form carries the prose-only name requirement',
    j(selectorForm?.requiredUnless) === j({ name: { field: 'hold', equals: 'never' } }),
    j(selectorForm?.requiredUnless));

  const unnamed = extractAnnotations('@group(selector=team)');
  check('...and an unnamed group is refused rather than emitted',
    unnamed.errors.length === 1 && unnamed.specYaml === '', j(unnamed));
}

// ── the documented argument reference matches the one the compiler uses ──────
// The docs table had drifted too — it listed `size` and `hideAtom` as
// directives, listed `projection`, and was missing `iconStyle` and `showLabel`
// on atomStyle. Reading it was how someone would have written an annotation
// that quietly does nothing, so it is held to the tables as well.
{
  const DOC = new URL('../docs/pages/annotations.md', import.meta.url);
  const text = readFileSync(DOC, 'utf8');
  const rows = new Map();
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length !== 5 || !['constraint', 'directive'].includes(cells[2])) continue;
    const name = cells[1].replace(/`/g, '');
    // Each comma-separated piece leads with the argument in backticks; anything
    // after it is prose about that argument, not another one.
    const args = cells[3].split(',')
      .map((piece) => piece.match(/`([^`]+)`/)?.[1])
      .filter(Boolean)
      .map((arg) => arg.replace(/\(…\)/, ''));
    rows.set(name, {
      kind: cells[2],
      optional: new Set(args.filter((a) => a.endsWith('?')).map((a) => a.slice(0, -1))),
      required: new Set(args.filter((a) => !a.endsWith('?'))),
    });
  }
  check('the docs argument table was found and parsed', rows.size > 0, `${rows.size} rows`);

  for (const [name, item] of Object.entries(tables.ITEMS)) {
    const row = rows.get(name);
    if (!row) { check(`docs: @${name} has a row`, false); continue; }

    const form = item.alternatives[0];
    const fields = Object.keys(form.fields);
    const documented = [...row.required, ...row.optional].sort();
    check(`docs: @${name} lists the arguments core reads`,
      j(documented) === j(fields.sort()), j({ documented, tables: fields.sort() }));
    // A `requiredUnless` field counts as required in the table: you have to
    // write it. The narrow case that excuses it is prose below, where it can say
    // what the exception is — a bare `?` would read as "leave it out freely",
    // which is how `@group(selector=…)` came to compile into a spec core throws
    // on in the first place.
    const mustWrite = [...form.required, ...Object.keys(form.requiredUnless ?? {})].sort();
    check(`docs: @${name} marks the right ones required`,
      j([...row.required].sort()) === j(mustWrite),
      j({ documented: [...row.required].sort(), tables: mustWrite }));
    check(`docs: @${name} is in the right section`,
      row.kind === (tables.CONSTRAINT_NAMES.has(name) ? 'constraint' : 'directive'), row.kind);
  }

  const extra = [...rows.keys()].filter((n) => !tables.ITEMS[n]);
  check('the docs table lists nothing core no longer reads', extra.length === 0, j(extra));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
