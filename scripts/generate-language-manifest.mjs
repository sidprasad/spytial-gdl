import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, loadSchema } from './generate-spec-tables.mjs';
import { DEFAULT_RELATION, ALL_EDGES_RELATION } from '../src/relationalize.js';

const root = new URL('../', import.meta.url);
const output = new URL('spytial-gdl-language.json', root);

export function manifest() {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const tables = build(loadSchema());
  return {
    formatVersion: 1,
    package: pkg.name,
    packageVersion: pkg.version,
    scope: 'Graph authoring forms and annotation vocabulary. This is not a complete parser grammar or a JSON Schema for GDL text.',
    upstream: {
      coreVersion: tables.coreVersion,
      layoutLanguageVersion: tables.languageVersion,
      layoutManifest: 'https://cdn.jsdelivr.net/npm/spytial-core@^6.3.0/docs/spytial-language.json',
      selectorManifest: 'https://cdn.jsdelivr.net/npm/simple-graph-query@3/docs/sgq-language.json',
      note: 'Upstream URLs follow compatible package ranges. The annotation vocabulary below is generated from the vendored schema at coreVersion. Selector support follows the engine loaded by the host.',
    },
    syntax: {
      note: 'These canonical authoring forms are documented here and checked against the parser. They do not enumerate every accepted Mermaid spelling.',
      forms: [
        { name: 'node', syntax: 'id', example: 'capstone' },
        { name: 'label', syntax: 'id[Display label]', example: 'cs1[CS 1]' },
        { name: 'type', syntax: 'id[Display label]:::Type', example: 'cs1[CS 1]:::Course' },
        { name: 'edge', syntax: 'source -> target', example: 'cs1 -> cs2' },
        { name: 'relation', syntax: 'source -> target : relation', example: 'cs1 -> cs2 : prereq' },
        { name: 'class', syntax: 'class id1,id2 ClassName', example: 'cs1\ncs2\nclass cs1,cs2 foundation' },
        { name: 'comment', syntax: '%% comment', example: 'cs1 %% first course' },
      ],
      annotations: {
        syntax: '@name(key=value, key=[value, value])',
        styleBlock: '@name(key=value, blockName(key=value))',
        example: 'cs1 -> cs2 : prereq\n@orientation(selector=prereq, directions=[right])',
        note: 'Selectors can be quoted expressions. See the upstream selector manifest for expression syntax.',
      },
    },
    selectors: {
      allEdges: ALL_EDGES_RELATION,
      unlabeledEdges: DEFAULT_RELATION,
      allNodes: 'univ',
      note: 'Relation names select edges. Types and classes select nodes. Relation, type, and class names share a namespace. Author names cannot start with an underscore; query keywords are checked by the engine.',
    },
    constraints: tables.sections.constraints,
    directives: tables.sections.directives,
    annotations: tables.items,
    styleBlocks: tables.blocks,
  };
}

export function renderManifest() {
  return JSON.stringify(manifest(), null, 2) + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const expected = renderManifest();
  if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== expected) {
      throw new Error('Language manifest is stale. Run npm run manifest.');
    }
    console.log('Language manifest is current.');
  } else {
    writeFileSync(output, expected);
    console.log('Wrote spytial-gdl-language.json');
  }
}
