const { getAllQuestions, getPhaseQuestions, PHASES } = require('./phases');

// Quick test runner (no test framework dependency)
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}
function assert(condition, msg) { if (!condition) throw new Error(msg); }

test('all phases exist', () => {
  assert(PHASES.research, 'research phase missing');
  assert(PHASES.prd, 'prd phase missing');
  assert(PHASES.data, 'data phase missing');
  assert(PHASES.workflow, 'workflow phase missing');
});

test('each question has required fields', () => {
  getAllQuestions().forEach(q => {
    assert(q.id, `question missing id`);
    assert(q.type, `${q.id} missing type`);
    assert(['initial','card','confirm','open'].includes(q.type), `${q.id} invalid type: ${q.type}`);
    if (q.type === 'card') assert(Array.isArray(q.options) && q.options.length > 0, `${q.id} missing options`);
  });
});

test('hard gates are confirm type', () => {
  getAllQuestions().filter(q => q.hardGate).forEach(q => {
    assert(q.type === 'confirm', `hard gate ${q.id} must be type confirm, got ${q.type}`);
  });
});

test('exactly 4 hard gates', () => {
  const gates = getAllQuestions().filter(q => q.hardGate);
  assert(gates.length === 4, `expected 4 hard gates, got ${gates.length}: ${gates.map(g=>g.id).join(', ')}`);
});

test('hard gate IDs are correct', () => {
  const gateIds = getAllQuestions().filter(q => q.hardGate).map(q => q.id);
  ['R-step3', 'P-B3', 'D-sample', 'W-env'].forEach(id => {
    assert(gateIds.includes(id), `missing hard gate: ${id}`);
  });
});

test('R-initial is first question', () => {
  const q = getPhaseQuestions(0)[0];
  assert(q.id === 'R-initial', `first question should be R-initial, got ${q.id}`);
});

console.log(`\nphases.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
