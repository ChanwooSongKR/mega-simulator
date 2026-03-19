const { createSession, getSession, submitAnswer, nextQuestion } = require('./session');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

test('createSession returns session with R-initial as first question', () => {
  const s = createSession();
  assert(s.sessionId, 'no sessionId');
  assert(s.currentPhase === 0, 'phase should be 0');
  assert(s.currentQuestionId === 'R-initial', `expected R-initial, got ${s.currentQuestionId}`);
});

test('getSession retrieves by ID', () => {
  const s = createSession();
  const found = getSession(s.sessionId);
  assert(found, 'session not found');
  assert(found.sessionId === s.sessionId, 'ID mismatch');
});

test('getSession returns null for unknown ID', () => {
  const result = getSession('nonexistent-id');
  assert(result === null, 'should return null');
});

test('nextQuestion after R-initial with no skips returns R-A1-goal', () => {
  const s = createSession();
  s.skipGroups = [];
  const next = nextQuestion(s, 'R-initial');
  assert(next, 'no next question');
  assert(next.id === 'R-A1-goal', `expected R-A1-goal, got ${next.id}`);
});

test('nextQuestion skips A1 group when A1 in skipGroups', () => {
  const s = createSession();
  s.skipGroups = ['A1'];
  const next = nextQuestion(s, 'R-initial');
  assert(next.id === 'R-A2-scale', `expected R-A2-scale, got ${next.id}`);
});

test('nextQuestion skips A1+A2 groups', () => {
  const s = createSession();
  s.skipGroups = ['A1', 'A2'];
  const next = nextQuestion(s, 'R-initial');
  assert(next.id === 'R-A3-scope', `expected R-A3-scope, got ${next.id}`);
});

test('nextQuestion skips A1+A2+A3 groups (jumps to confirm)', () => {
  const s = createSession();
  s.skipGroups = ['A1', 'A2', 'A3'];
  const next = nextQuestion(s, 'R-initial');
  assert(next.id === 'R-step3', `expected R-step3, got ${next.id}`);
});

test('nextQuestion advances within group (A1: goal→domain→io)', () => {
  const s = createSession();
  s.skipGroups = [];
  const domain = nextQuestion(s, 'R-A1-goal');
  assert(domain.id === 'R-A1-domain', `expected R-A1-domain, got ${domain.id}`);
  const io = nextQuestion(s, 'R-A1-domain');
  assert(io.id === 'R-A1-io', `expected R-A1-io, got ${io.id}`);
});

test('nextQuestion at end returns null (completion)', () => {
  const s = createSession();
  const result = nextQuestion(s, 'W-env');
  assert(result === null, 'should be null after last question');
});

test('submitAnswer stores in collected and history', () => {
  const s = createSession();
  submitAnswer(s, 'R-initial', 'text classification pipeline');
  assert(s.collected.initialRequest === 'text classification pipeline', 'collected not updated');
  assert(s.history[0].questionId === 'R-initial', 'history not updated');
});

test('D-dataset skipped when dataStrategy is Fully synthetic', () => {
  const s = createSession();
  s.collected.dataStrategy = 'Fully synthetic';
  const next = nextQuestion(s, 'D-strategy');
  assert(next.id === 'D-synthesis-strategy', `expected D-synthesis-strategy, got ${next.id}`);
});

console.log(`\nsession.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
