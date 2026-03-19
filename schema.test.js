const { PHASE_SCHEMA, HARD_GATE_FIELD_NAMES, HARD_GATE_QUESTIONS, getPhaseSchema } = require('./schema');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

test('PHASE_SCHEMA has exactly 4 phases (0–3)', () => {
  assert(Object.keys(PHASE_SCHEMA).length === 4, 'expected 4 phases');
  [0,1,2,3].forEach(i => assert(PHASE_SCHEMA[i], `missing phase ${i}`));
});

test('each phase has name, fields[], hardGates[]', () => {
  Object.values(PHASE_SCHEMA).forEach(p => {
    assert(typeof p.name === 'string', 'missing name');
    assert(Array.isArray(p.fields), 'fields must be array');
    assert(Array.isArray(p.hardGates), 'hardGates must be array');
  });
});

test('phase 3 has empty fields (workflow only has hard gate)', () => {
  assert(PHASE_SCHEMA[3].fields.length === 0, 'phase 3 fields should be empty');
});

test('HARD_GATE_FIELD_NAMES lists all 5 gate field names', () => {
  const expected = ['researchConfirm','prdConfirm','sampleApproval','dataApproval','envConfirm'];
  expected.forEach(n => assert(HARD_GATE_FIELD_NAMES.includes(n), `missing gate: ${n}`));
  assert(HARD_GATE_FIELD_NAMES.length === 5, `expected 5 gates, got ${HARD_GATE_FIELD_NAMES.length}`);
});

test('HARD_GATE_QUESTIONS has an entry for each gate name', () => {
  HARD_GATE_FIELD_NAMES.forEach(name => {
    const q = HARD_GATE_QUESTIONS[name];
    assert(q, `missing hard gate question: ${name}`);
    assert(q.type === 'confirm', `${name} must be type confirm`);
    assert(Array.isArray(q.confirmOptions) && q.confirmOptions.length >= 2, `${name} needs confirmOptions`);
    assert(q.collectsTo === name, `${name} collectsTo must match key`);
  });
});

test('getPhaseSchema returns correct schema by phase number', () => {
  assert(getPhaseSchema(0).name === 'Research', 'wrong name for phase 0');
  assert(getPhaseSchema(3).name === 'Workflow', 'wrong name for phase 3');
  assert(getPhaseSchema(99) === null, 'should return null for unknown phase');
});

console.log(`\nschema.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
