import assert from 'node:assert/strict';
import * as core from 'spytial-core';
import { parseGdlSequence, compileGdlSequence, compileSpytialGdl, solveSpytialGdl, isGdlSequence, SEQUENCE_POLICIES } from '../src/index.js';

const source = `gdl-sequence
policy: stability
@orientation(selector=next, directions=[right])

state s10 {
  a[A] -> b[B] : next
}
state {
  a[A] -> c[C] : next
  @align(selector=next, direction=horizontal)
}
state s2 {}
`;
const sequence = compileGdlSequence(source);
assert.equal(sequence.ok, true);
assert.deepEqual(sequence.states.map(state => state.id), ['s10', null, 's2'], 'block order is independent of ids');
assert.deepEqual(sequence.diagnostics, []);
assert.equal(sequence.policy, 'stability');
assert.deepEqual(sequence.states.map(state => state.compiled.datum.atoms.map(atom => atom.id)), [['a', 'b'], ['a', 'c'], []],
  'states are complete snapshots, including an empty snapshot');
assert.equal(sequence.states[1].compiled.annotationMeta[0].line, 3, 'shared rules retain original lines');
assert.equal(sequence.states[1].compiled.annotationMeta[1].line, 10, 'local rules retain original lines');
for (const state of sequence.states) {
  const solved = solveSpytialGdl(core, state.compiled);
  assert.ok(solved.layout);
  assert.equal(solved.error, null);
  assert.deepEqual(solved.diagnostics, []);
}
assert.equal(compileSpytialGdl('').ok, false, 'static empty-graph behavior remains unchanged');
for (const policy of SEQUENCE_POLICIES) {
  assert.equal(parseGdlSequence(`policy: ${policy}\nstate { a }`).policy, policy);
  assert.equal(core.getSequencePolicy(policy).name, policy, 'policy names really exist in core');
}
assert.equal(parseGdlSequence('state {}').policy, 'stability');
assert.equal(isGdlSequence('%% comment\n%%{\nignore me\n}%%\ngdl-sequence\nstate {}'), true);
assert.equal(isGdlSequence('state -> other'), false, 'ordinary graph ids do not trigger playground sequence mode');

const braces = parseGdlSequence(`%%{
state imaginary {
}%%
@align(selector={x: univ | x}, direction=horizontal)
state named {
  a["label } and { braces"] -> b{Decision}
  c[unquoted } bracket] -> d[Bob's label]
  @atomStyle(selector=univ, textStyle(color='red'))
  @align(
    selector={x: univ | x},
    direction=horizontal
  )
  %% } state fake {
  %%{
  } state hidden {
  }%%
}
state {}
`);
assert.equal(braces.ok, true, JSON.stringify(braces.errors));
assert.equal(braces.states.length, 2);
assert.match(braces.states[0].body, /selector=\{x: univ \| x\}/);
const percentLabels = compileGdlSequence('state { a{50%% off} -> b[100%%]\n c(25%%) }\nstate {}');
assert.equal(percentLabels.ok, true);
assert.equal(percentLabels.diagnostics.every(item => item.severity === 'warning'), true);
assert.deepEqual(percentLabels.states[0].compiled.datum.atoms.map(atom => atom.label), ['50%% off', '100%%', '25%%']);

const windows = compileGdlSequence('gdl-sequence\r\n%% 😀\r\nstate α { a }');
assert.equal(windows.ok, false, 'state ids use the same portable identifier spelling as selectors');
const unicode = compileGdlSequence('gdl-sequence\r\n%% 😀\r\nstate first { a[😀] }\r\nstate {\r\n@bogus()\r\na\r\n}');
assert.equal(unicode.ok, true);
assert.equal(unicode.diagnostics[0].line, 5, 'CRLF and astral labels do not shift diagnostics');
assert.equal(unicode.states[0].compiled.datum.atoms[0].label, '😀');

for (const [invalid, message] of [
  ['state same {}\nstate same {}', /duplicate state id/],
  ['state {\na\n', /unclosed state/],
  ['state outer {\n state inner { a }\n}', /cannot be nested/],
  ['policy: stable\nstate {}', /unknown sequence policy/],
  ['policy: stability\npolicy: stability\nstate {}', /only once/],
  ['state {}\npolicy: ignore_history', /policy is global/],
  ['state {\n policy: ignore_history\n}', /policy is global/],
  ['state { policy: ignore_history }', /policy is global/],
  ['a -> b\nstate {}', /graphs belong inside/],
  ['state two words { a }', /expected state/],
  ['state {}\n@align(selector=univ, direction=horizontal)', /shared rules must come before/],
  ['@align(selector=univ, direction=horizontal)', /at least one state/],
  ['state {}\n%%{', /unterminated block comment/],
]) {
  const parsed = parseGdlSequence(invalid);
  assert.equal(parsed.ok, false, invalid);
  assert.ok(parsed.errors.some(error => message.test(error.message)), `${invalid}: ${JSON.stringify(parsed.errors)}`);
}

const conflict = compileGdlSequence(`@orientation(selector=r, directions=[right])
state {
 a -> b : r
 @orientation(selector=r, directions=[left])
}
state { a -> b : r }`);
assert.ok(solveSpytialGdl(core, conflict.states[0].compiled).error, 'local rules accumulate with shared rules');
assert.equal(solveSpytialGdl(core, conflict.states[1].compiled).error, null, 'local rules stay in their own state');

const absent = compileGdlSequence(`@atomStyle(selector=Person, textStyle(color=blue))
@orientation(selector=r, directions=[right])
@atomStyle(selector=team, borderStyle(color=red))
state { a:::Person -> b:::Person : r
 class a,b team
}
state { c }
state {}`);
assert.equal(absent.ok, true);
assert.deepEqual(absent.diagnostics, []);
for (const state of absent.states) {
  const solved = solveSpytialGdl(core, state.compiled);
  assert.equal(solved.selectorErrors.length, 0, JSON.stringify(solved.diagnostics));
  assert.equal(solved.error, null);
}
const typo = compileGdlSequence('@align(selector=typo, direction=horizontal)\nstate { a }');
assert.ok(solveSpytialGdl(core, typo.states[0].compiled).diagnostics.some(item => item.code === 'unresolved-name'),
  'genuinely unknown names still report diagnostics');
console.log('Sequences: optional ids, order, snapshots, shared/local rules, source lines, nested syntax, empty vocabulary and core solves passed.');
