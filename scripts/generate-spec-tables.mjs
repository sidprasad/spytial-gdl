#!/usr/bin/env node
// Generate `src/_spec-tables.js` from spytial-core's published spec schema.
//
//   node scripts/generate-spec-tables.mjs
//
// spytial-core publishes `docs/spytial-spec.schema.json`, a JSON Schema for a
// layout spec: every constraint and directive it reads, which section each
// belongs in, which fields it takes, which of those are required, what each
// closed vocabulary accepts, the numeric bounds, the shared style blocks, and
// which forms have been deprecated. The schema is vendored at
// `vendor/spytial-spec.schema.json`, pinned to one spytial-core release.
//
// This turns that into the tables `src/annotations.js` validates against. They
// used to be hand-written, and had drifted four ways by the time this script
// was added: `size` and `hideAtom` were compiled under `directives`, which core
// still accepts but warns about; `projection` was accepted although no released
// core has ever had a parser for it; `icon` was treated as current after core
// deprecated it; and `iconStyle` — the block that replaced `icon` — was
// rejected as unknown. None of those could be noticed from inside this repo,
// because core's parser reports none of them.
//
// The generator refuses to emit output it cannot account for. Every section
// entry, item, field, leaf type, vocabulary, and deprecation has to map onto
// something below; one that does not raises SchemaDrift rather than being
// dropped. That is the point of generating rather than transcribing: when core
// grows or retires a form, the next `./update-spytial-core.sh` stops and names
// it.
//
// Where spytial-gdl deliberately differs from the schema, the difference lives
// in a policy table below with the reason it exists. Everything else is
// mechanical.
//
// `render()` is exported separately from the file write so `test/spec-tables.test.mjs`
// can compare what the schema *would* produce against what is checked in.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_PATH = join(ROOT, 'vendor', 'spytial-spec.schema.json');
export const OUTPUT_PATH = join(ROOT, 'src', '_spec-tables.js');

export class SchemaDrift extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaDrift';
  }
}

// ── Policy: where spytial-gdl differs from the schema ────────────────────────

// Every form the schema marks deprecated, mapped to the current form that
// replaces it. The schema says *that* something is deprecated and names the
// replacement only in prose, so this is the one fact the generator cannot read
// out of it — and a newly deprecated form therefore stops here by name rather
// than compiling on silently. `desugars` records whether annotations.js rewrites
// the form onto its replacement before emission (so the compiled spec is
// current even when the source is not) or merely warns.
const REPLACEMENTS = {
  atomColor: { replacedBy: 'atomStyle', desugars: true },
  edgeColor: { replacedBy: 'edgeStyle', desugars: true },
  // Warned about rather than rewritten. The other two rewrites are pure
  // renames; `icon`'s is not — `showLabels` drove label visibility and icon
  // geometry at once, so carrying it over means choosing an `iconStyle.placement`
  // for each of its two values, and the schema states the split only in prose.
  // core's language manifest documents the exact pairing; adopt it here
  // deliberately, not as a side effect of a version bump.
  icon: { replacedBy: 'atomStyle', desugars: false },
  // Not an annotation of its own: the by-field form is selected by the presence
  // of `field`, so it shares `group`'s yaml key. It stays in the tables as an
  // alternative field set, which is how `@group(field=…, groupOn=0,
  // addToGroup=1)` keeps validating. `replacedBy` names the other form rather
  // than the annotation, since both are spelled `@group`.
  group_byField: { replacedBy: 'group(selector=…)', desugars: false },
  'inferredEdge.color': { replacedBy: 'inferredEdge.lineStyle.color', desugars: true },
  'inferredEdge.style': { replacedBy: 'inferredEdge.lineStyle.pattern', desugars: true },
  'inferredEdge.weight': { replacedBy: 'inferredEdge.lineStyle.weight', desugars: true },
  'inferredEdge.highlight': { replacedBy: 'inferredEdge.lineStyle.highlight', desugars: true },
};

// Items whose yaml value is a bare scalar rather than a mapping (`- flag:
// hideDisconnected`), mapped to the keyword that carries it in the annotation
// syntax. `@flag(flag=…)` would read badly, so spytial-gdl spells it `name` and
// rebuilds the scalar at emission.
const SCALAR_KEYWORDS = {
  flag: 'name',
};

// Deprecated literal spellings of a field's value, and what each one means now.
// The schema marks the branch deprecated and states the equivalence only in
// prose, so — as with REPLACEMENTS — this is the fact the generator cannot read
// out of it, and a new one stops here by name. Keyed by "<item>.<field>".
const LEGACY_LITERALS = {
  // `addEdge: true` was the original way to ask for a connector, before the
  // direction became expressible.
  'group.addEdge': { true: 'togroup' },
};

// Vocabularies annotations.js refers to by name (the legacy desugar has to
// normalize against the same list core does). Generating them from the schema
// rather than restating them is what keeps the legacy path and the current path
// agreeing about what a valid pattern is. Keyed by where the vocabulary lives:
// "<block>.<field>" for a shared block, "item:<item>.<field>" for an item field.
const NAMED_VOCABULARIES = {
  LINE_PATTERNS: 'lineStyle.pattern',
  TEXT_SIZES: 'textStyle.size',
  ICON_PLACEMENTS: 'iconStyle.placement',
  FLAG_NAMES: 'item:flag.flag',
  ORIENTATION_DIRECTIONS: 'item:orientation.directions',
};

// Leaf types the generator knows how to turn into a validation rule. An
// unfamiliar one is an error, so a new kind of field cannot slip through
// unvalidated.
const KNOWN_LEAF_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array']);

const SECTIONS = ['constraints', 'directives'];

// ── Reading the schema ───────────────────────────────────────────────────────

export function loadSchema(path = SCHEMA_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function refName(node, where) {
  const ref = node.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) {
    throw new SchemaDrift(`${where}: expected a #/$defs/ reference, got ${JSON.stringify(node)}`);
  }
  return ref.slice('#/$defs/'.length);
}

// Which section each item def calls home, and which placements the schema
// tolerates but has deprecated. `size` and `hideAtom` appear under both:
// constraints is home, directives is the deprecated placement core still reads
// behind a warning. Emitting the deprecated one is exactly the mistake this
// resolves.
function readSections(schema) {
  const home = new Map();       // def name -> section
  const deprecated = new Map(); // def name -> section it is tolerated in

  for (const section of SECTIONS) {
    const prop = schema.properties?.[section];
    if (!prop) throw new SchemaDrift(`the schema has no \`${section}\` section.`);
    const branches = prop.items?.oneOf;
    if (!Array.isArray(branches)) {
      throw new SchemaDrift(`${section}.items is not a oneOf list; the generator reads placements from it.`);
    }
    for (const branch of branches) {
      const name = refName(branch, `${section}[]`);
      if (branch.deprecated) {
        if (deprecated.has(name)) {
          throw new SchemaDrift(`${name} is deprecated in more than one section.`);
        }
        deprecated.set(name, section);
      } else {
        if (home.has(name)) {
          throw new SchemaDrift(
            `${name} is listed as current in both sections; spytial-gdl compiles each form into exactly one.`
          );
        }
        home.set(name, section);
      }
    }
  }

  for (const name of deprecated.keys()) {
    if (!home.has(name)) {
      throw new SchemaDrift(
        `${name} appears only as a deprecated placement, with no current section to compile it into.`
      );
    }
  }
  return { home, deprecated };
}

// A validation rule for one field, from its subschema. Every branch here is a
// shape annotations.js knows how to check; anything else raises.
function ruleFor(node, where, blocks) {
  if (node.$ref) {
    const block = refName(node, where);
    if (!blocks.has(block)) {
      throw new SchemaDrift(`${where} refers to ${block}, which is not a style block.`);
    }
    return { type: 'block', block };
  }

  // A field that is either a bare enum value or a block carrying the same value
  // under a key (`group.addEdge`). The inline object becomes a block named after
  // the field, which is how it is written in the annotation syntax: `addEdge(…)`.
  if (node.oneOf) {
    const scalar = node.oneOf.find((b) => b.enum);
    const object = node.oneOf.find((b) => b.type === 'object');
    const literals = node.oneOf.filter((b) => b.const !== undefined);
    if (!scalar || !object || scalar.enum.length === 0 ||
        node.oneOf.length !== 2 + literals.length) {
      throw new SchemaDrift(`${where} is a oneOf the generator does not recognize.`);
    }
    const rule = { type: 'enum-or-block', values: [...scalar.enum], block: where.split('.').pop() };
    if (literals.length > 0) {
      const policy = LEGACY_LITERALS[where] ?? {};
      rule.legacyValues = {};
      for (const branch of literals) {
        const meaning = policy[String(branch.const)];
        if (meaning === undefined) {
          throw new SchemaDrift(
            `${where} accepts the literal ${JSON.stringify(branch.const)} and spytial-gdl has no ` +
            `policy for what it means. Add it to LEGACY_LITERALS.`
          );
        }
        if (!rule.values.includes(meaning)) {
          throw new SchemaDrift(`${where}: ${JSON.stringify(branch.const)} maps onto ${meaning}, which is not one of its values.`);
        }
        rule.legacyValues[String(branch.const)] = meaning;
      }
    }
    return rule;
  }

  if (node.enum) {
    if (node.type !== 'string') {
      throw new SchemaDrift(`${where} is an enum of ${node.type}; only string vocabularies are handled.`);
    }
    return { type: 'enum', values: [...node.enum] };
  }

  if (!KNOWN_LEAF_TYPES.has(node.type)) {
    throw new SchemaDrift(
      `${where} has unfamiliar type ${JSON.stringify(node.type)}. Teach the generator about it ` +
      `(KNOWN_LEAF_TYPES) before regenerating.`
    );
  }

  if (node.type === 'array') {
    const items = node.items;
    if (!items?.enum) {
      throw new SchemaDrift(`${where} is a list of something other than a vocabulary.`);
    }
    const rule = { type: 'enum-list', values: [...items.enum] };
    if (node.minItems) rule.minItems = node.minItems;
    const listRules = readListRules(node.allOf, where);
    if (listRules.length > 0) rule.listRules = listRules;
    return rule;
  }

  if (node.type === 'number' || node.type === 'integer') {
    const rule = { type: node.type };
    for (const bound of ['exclusiveMinimum', 'minimum', 'maximum']) {
      if (node[bound] !== undefined) rule[bound] = node[bound];
    }
    return rule;
  }

  if (node.type === 'boolean') return { type: 'boolean' };

  const rule = { type: 'string' };
  if (node.minLength) rule.minLength = node.minLength;
  // A `pattern` is carried through rather than dropped: `inferredEdge.draw` is
  // an endpoint expression (`a -> b`), and a value that fails it draws nothing.
  if (node.pattern) rule.pattern = node.pattern;
  return rule;
}

// Cross-value rules on a list field. `orientation.directions` is the only one
// today: opposite directions cancel, and a `directly*` variant restricts what
// may accompany it. Core reports neither — the constraint simply comes out
// wrong — so they are worth carrying.
function readListRules(allOf, where) {
  if (!allOf) return [];
  const rules = [];
  for (const entry of allOf) {
    const exclusive = entry.not?.allOf;
    if (exclusive) {
      const values = exclusive.map((c) => c.contains?.const);
      if (values.some((v) => typeof v !== 'string')) {
        throw new SchemaDrift(`${where}: unrecognized mutual-exclusion rule.`);
      }
      rules.push({ kind: 'exclusive', values });
      continue;
    }
    const when = entry.if?.contains?.const;
    const allowed = entry.then?.items?.enum;
    if (typeof when === 'string' && Array.isArray(allowed)) {
      rules.push({ kind: 'requires', when, allowed: [...allowed] });
      continue;
    }
    throw new SchemaDrift(`${where}: unrecognized list rule ${JSON.stringify(entry)}.`);
  }
  return rules;
}

// The shared style blocks: every $def not used as an item. They are written as
// nested calls in the annotation syntax — `lineStyle(color=crimson)` — and
// reused across items, so one table covers all of them.
function readBlocks(schema, itemDefs) {
  const names = Object.keys(schema.$defs).filter((name) => !itemDefs.has(name));
  const blocks = {};
  for (const name of names) {
    const def = schema.$defs[name];
    if (def.type !== 'object' || def.additionalProperties !== false) {
      throw new SchemaDrift(`block ${name} is not a closed object; unknown-key checking would be wrong.`);
    }
    blocks[name] = { fields: {} };
    if (def.required?.length) blocks[name].required = [...def.required];
  }

  const known = new Set(names);
  for (const name of names) {
    for (const [field, node] of Object.entries(schema.$defs[name].properties)) {
      blocks[name].fields[field] = ruleFor(node, `${name}.${field}`, known);
    }
  }
  return blocks;
}

// An inline object form of a field (`group.addEdge`'s block spelling) is a block
// too, just one the schema never named. Register it under the field's own name,
// which is how it is written.
function readInlineBlocks(schema, itemDefs, blocks) {
  const known = new Set(Object.keys(blocks));
  for (const name of itemDefs) {
    const inner = innerOf(schema.$defs[name], name);
    if (inner.type !== 'object') continue;
    for (const [field, node] of Object.entries(inner.properties ?? {})) {
      const object = node.oneOf?.find((b) => b.type === 'object');
      if (!object) continue;
      if (object.additionalProperties !== false) {
        throw new SchemaDrift(`${name}.${field}'s block form is not a closed object.`);
      }
      const fields = {};
      for (const [sub, subNode] of Object.entries(object.properties)) {
        fields[sub] = ruleFor(subNode, `${field}.${sub}`, known);
      }
      const existing = blocks[field];
      if (existing && JSON.stringify(existing.fields) !== JSON.stringify(fields)) {
        throw new SchemaDrift(
          `${name}.${field}'s inline block disagrees with the ${field} block already defined.`
        );
      }
      blocks[field] = { fields };
    }
  }
  return blocks;
}

// The item's own body: `$defs.orientation.properties.orientation`.
function innerOf(def, name) {
  const keys = Object.keys(def.properties ?? {});
  if (keys.length !== 1) {
    throw new SchemaDrift(`${name} wraps ${keys.length} keys; an item is a single-key mapping.`);
  }
  if (def.additionalProperties !== false) {
    throw new SchemaDrift(`${name} is not a closed object.`);
  }
  return def.properties[keys[0]];
}

function yamlKeyOf(def, name) {
  return Object.keys(def.properties ?? {})[0] ?? name;
}

// One item's field table. Items sharing a yaml key (`group` and its deprecated
// by-field form) become alternative field sets: the first whose required fields
// are all present is the one the annotation is checked against.
function readItem(schema, name, blocks) {
  const def = schema.$defs[name];
  const inner = innerOf(def, name);
  const yamlKey = yamlKeyOf(def, name);

  if (inner.type !== 'object') {
    // A scalar item: the yaml value is the value itself, not a mapping.
    const keyword = SCALAR_KEYWORDS[yamlKey];
    if (!keyword) {
      throw new SchemaDrift(
        `${name} carries a bare ${inner.type} rather than a mapping, and no keyword is declared for ` +
        `it. Add one to SCALAR_KEYWORDS.`
      );
    }
    return {
      yamlKey,
      scalarKeyword: keyword,
      required: [keyword],
      fields: { [keyword]: ruleFor(inner, `${name}.${yamlKey}`, new Set(Object.keys(blocks))) },
    };
  }

  if (inner.additionalProperties !== false) {
    throw new SchemaDrift(`${name}'s body is not a closed object; unknown-key checking would be wrong.`);
  }

  const known = new Set(Object.keys(blocks));
  const fields = {};
  const deprecatedFields = [];
  for (const [field, node] of Object.entries(inner.properties)) {
    fields[field] = ruleFor(node, `${name}.${field}`, known);
    if (node.deprecated) deprecatedFields.push(field);
  }

  const entry = { yamlKey, required: [...(inner.required ?? [])], fields };
  if (deprecatedFields.length > 0) {
    entry.deprecatedFields = {};
    for (const field of deprecatedFields) {
      const policy = REPLACEMENTS[`${yamlKey}.${field}`];
      if (!policy) {
        throw new SchemaDrift(
          `${yamlKey}.${field} is deprecated upstream and spytial-gdl has no policy for it. ` +
          `Add it to REPLACEMENTS, and teach desugarLegacy the rewrite if it desugars.`
        );
      }
      entry.deprecatedFields[field] = policy;
    }
  }
  return entry;
}

// ── Assembling ───────────────────────────────────────────────────────────────

function build(schema) {
  const { home, deprecated } = readSections(schema);
  const itemDefs = new Set(home.keys());

  for (const name of itemDefs) {
    if (!schema.$defs[name]) throw new SchemaDrift(`${name} is placed in a section but has no definition.`);
  }

  const blocks = readInlineBlocks(schema, itemDefs, readBlocks(schema, itemDefs));

  const sections = { constraints: [], directives: [] };
  const items = {};
  const deprecatedItems = {};

  for (const [name, section] of home) {
    const entry = readItem(schema, name, blocks);
    const isDeprecated = Boolean(schema.$defs[name].deprecated);
    if (isDeprecated) {
      const policy = REPLACEMENTS[name];
      if (!policy) {
        throw new SchemaDrift(
          `${name} is deprecated upstream and spytial-gdl has no policy for it. Add it to ` +
          `REPLACEMENTS, and teach desugarLegacy the rewrite if it desugars.`
        );
      }
      // The by-field group is not an annotation of its own — it shares `group`'s
      // key, and is selected by which fields are written. Its deprecation
      // therefore belongs to the alternative rather than to the name.
      if (name !== entry.yamlKey) entry.deprecated = policy;
      else deprecatedItems[entry.yamlKey] = policy;
    }

    if (items[entry.yamlKey]) {
      items[entry.yamlKey].alternatives.push(entry);
    } else {
      items[entry.yamlKey] = { section, alternatives: [entry] };
      sections[section].push(entry.yamlKey);
    }
    if (items[entry.yamlKey].section !== section) {
      throw new SchemaDrift(`${entry.yamlKey} is split across sections by its alternative forms.`);
    }
  }

  // A form the schema tolerates in the other section. Nothing here compiles it
  // there — this is recorded so the fact stays visible in the generated file
  // rather than living only in this comment.
  const deprecatedPlacements = {};
  for (const [name, section] of deprecated) {
    deprecatedPlacements[yamlKeyOf(schema.$defs[name], name)] = { tolerated: section, home: home.get(name) };
  }

  const vocabularies = {};
  for (const [constant, source] of Object.entries(NAMED_VOCABULARIES)) {
    const rule = source.startsWith('item:')
      ? lookupItemField(items, source.slice('item:'.length))
      : lookupBlockField(blocks, source);
    if (!rule || (rule.type !== 'enum' && rule.type !== 'enum-list')) {
      throw new SchemaDrift(
        `${constant} is generated from ${source}, which is no longer a vocabulary. Update ` +
        `NAMED_VOCABULARIES, and whatever in annotations.js reads the constant.`
      );
    }
    vocabularies[constant] = rule.values;
  }

  return {
    languageVersion: schema['x-spytial-language-version'],
    coreVersion: schema['x-spytial-core-version'],
    sections,
    items,
    blocks,
    deprecatedItems,
    deprecatedPlacements,
    vocabularies,
  };
}

function lookupBlockField(blocks, source) {
  const [block, field] = source.split('.');
  return blocks[block]?.fields?.[field];
}

function lookupItemField(items, source) {
  const [item, field] = source.split('.');
  for (const alt of items[item]?.alternatives ?? []) {
    const key = alt.scalarKeyword && field === alt.yamlKey ? alt.scalarKeyword : field;
    if (alt.fields[key]) return alt.fields[key];
  }
  return undefined;
}

// ── Emitting ─────────────────────────────────────────────────────────────────

// A deterministic JS literal, so the drift test can compare bytes.
function lit(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = value.every((v) => typeof v !== 'object' || v === null);
    if (flat) return `[${value.map((v) => lit(v)).join(', ')}]`;
    return `[\n${value.map((v) => `${inner}${lit(v, indent + 2)},`).join('\n')}\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const body = entries.map(([k, v]) => `${inner}${key(k)}: ${lit(v, indent + 2)},`).join('\n');
    return `{\n${body}\n${pad}}`;
  }
  return JSON.stringify(value);
}

function key(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

export function render(schema = loadSchema()) {
  const t = build(schema);
  const out = [];

  out.push(
    '// Field tables and value vocabularies for the spytial layout-spec language.',
    '//',
    '// GENERATED FILE — DO NOT EDIT BY HAND.',
    '//',
    '//   Source:   vendor/spytial-spec.schema.json',
    `//   Language: ${t.languageVersion} (spytial-core ${t.coreVersion})`,
    '//   Regenerate with: node scripts/generate-spec-tables.mjs',
    '//',
    '// Everything here is derived from the JSON Schema spytial-core publishes, so a',
    '// form, field, section, or vocabulary that changes upstream changes here as a',
    '// diff in review rather than as a spec that quietly stops matching. Deliberate',
    '// differences from the schema are declared in the generator\'s policy tables,',
    '// each with its reason.',
    '',
    '// The schema this was generated from. LANGUAGE_VERSION only moves when the spec',
    '// language itself changes, so an unchanged value across a spytial-core bump',
    '// means nothing here needed revisiting.',
    `export const LANGUAGE_VERSION = ${JSON.stringify(t.languageVersion)};`,
    `export const CORE_VERSION = ${JSON.stringify(t.coreVersion)};`,
    '',
    '',
    '// ── Vocabularies ────────────────────────────────────────────────────────────',
    '//',
    '// These are TypeScript union types in core, erased at runtime and re-checked by',
    '// nothing downstream. An unrecognized value is kept by the parser and then does',
    '// the wrong thing silently — an out-of-vocab pattern renders solid, an unknown',
    '// flag name does nothing at all. Authoring time is the only place they surface.',
    ''
  );

  for (const [constant, values] of Object.entries(t.vocabularies)) {
    out.push(`export const ${constant} = ${lit(values)};`);
  }

  out.push(
    '',
    '',
    '// ── Sections ────────────────────────────────────────────────────────────────',
    '//',
    '// Which bucket each annotation compiles into. Getting this wrong is not a',
    '// no-op: core reads `size` and `hideAtom` from either section, but warns on the',
    '// directives placement, so a spec built from the wrong table renders correctly',
    '// and complains in the console forever.',
    '',
    `export const CONSTRAINT_NAMES = new Set(${lit(t.sections.constraints)});`,
    '',
    `export const DIRECTIVE_NAMES = new Set(${lit(t.sections.directives)});`,
    '',
    '// Placements core still accepts behind a deprecation warning. spytial-gdl never',
    '// emits one; this records that the tolerance exists.',
    `export const DEPRECATED_PLACEMENTS = ${lit(t.deprecatedPlacements)};`,
    '',
    '',
    '// ── Style blocks ────────────────────────────────────────────────────────────',
    '//',
    '// Written as nested calls — `lineStyle(color=crimson)` — and shared across',
    '// items, so one table covers every use. Keyed by block name, then by leaf.',
    '// spytial-gdl validates the leaves because core does not: an invalid pattern or',
    '// size is dropped silently there, and the edge just renders unstyled.',
    '',
    `export const STYLE_BLOCKS = ${lit(t.blocks)};`,
    '',
    '',
    '// ── Items ───────────────────────────────────────────────────────────────────',
    '//',
    '// Every annotation, by name: which section it belongs to and which fields it',
    '// takes. `alternatives` is a list because two forms may share one name — the',
    '// current `group` and its deprecated by-field spelling — and the one an',
    '// annotation is checked against is the first whose required fields are present.',
    '// `scalarKeyword` marks an item whose yaml value is a bare scalar rather than a',
    '// mapping (`- flag: hideDisconnected`), naming the keyword that carries it.',
    '',
    `export const ITEMS = ${lit(t.items)};`,
    '',
    '',
    '// ── Deprecations ────────────────────────────────────────────────────────────',
    '//',
    '// A deprecated form keeps parsing and keeps its meaning until a spytial-core',
    '// major. `desugars` marks the ones annotations.js rewrites onto their',
    '// replacement before emission, so the compiled spec uses the current spelling',
    '// even when the source does not.',
    '',
    `export const DEPRECATED_ITEMS = ${lit(t.deprecatedItems)};`,
    ''
  );

  return out.join('\n');
}

function main() {
  const schema = loadSchema();
  const rendered = render(schema);
  writeFileSync(OUTPUT_PATH, rendered, 'utf8');
  const items = Object.keys(build(schema).items).length;
  console.log(
    `Wrote src/_spec-tables.js (spec language ${schema['x-spytial-language-version']}, ` +
    `spytial-core ${schema['x-spytial-core-version']}, ${items} items).`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
