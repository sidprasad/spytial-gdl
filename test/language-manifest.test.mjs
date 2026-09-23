import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { manifest, renderManifest } from '../scripts/generate-language-manifest.mjs';
import { compileSpytialGdl, extractAnnotations } from '../src/index.js';
import { ITEMS, STYLE_BLOCKS } from '../src/_spec-tables.js';

const m = manifest();
assert.equal(readFileSync(new URL('../spytial-gdl-language.json', import.meta.url), 'utf8'), renderManifest(),
  'Manifest is stale; run npm run manifest');
assert.deepEqual(m.annotations, ITEMS, 'Public annotations must match runtime validation');
assert.deepEqual(m.styleBlocks, STYLE_BLOCKS, 'Public style blocks must match runtime validation');

for (const form of [...m.syntax.forms, m.syntax.annotations]) {
  const result = compileSpytialGdl(form.example);
  assert.equal(result.ok, true, form.example);
  assert.deepEqual(result.parseErrors, [], form.example);
  assert.deepEqual(result.annotationErrors, [], form.example);
}

assert.equal(m.styleBlocks.textStyle.fields.label, undefined);
assert.equal(extractAnnotations("@edgeStyle(field=prereq, textStyle(label='requires'))").errors.length, 1);
assert.equal(m.annotations.projection, undefined);
console.log('Manifest matches the compiler and all authoring examples compile.');
