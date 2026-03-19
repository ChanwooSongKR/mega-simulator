const { createSession, getSession, advanceSession } = require('./session');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => { console.log(`  ✓ ${name}`); passed++; })
                   .catch(e => { console.error(`  ✗ ${name}: ${e.message}`); failed++; });
    }
    console.log(`  ✓ ${name}`); passed++;
  } catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// Synchronous tests
test('createSession initializes correct shape', () => {
  const s = createSession();
  assert(s.sessionId, 'no sessionId');
  assert(s.currentPhase === 0, 'phase should be 0');
  assert(Array.isArray(s.hardGatesPending), 'hardGatesPending should be array');
  assert(s.hardGatesPending.includes('researchConfirm'), 'should have researchConfirm pending');
  assert(s.currentHardGate === null, 'currentHardGate should start null');
  assert(typeof s.collected === 'object', 'collected should be object');
  assert(Array.isArray(s.history), 'history should be array');
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

// Async tests using mock generateFn
test('advanceSession fills collected from extractedFields (no overwrite)', async () => {
  const s = createSession();
  s.collected.goal = 'existing-value';

  const mockGenerate = async () => ({
    extractedFields: { goal: 'SHOULD NOT OVERWRITE', domain: 'e커머스' },
    remainingFields: ['io', 'scale'],
    fieldsComplete: false,
    question: '입출력 형식은?',
    type: 'open',
    header: 'I/O',
    options: [],
    collectsTo: 'io',
    contextMessage: '...',
  });

  const result = await advanceSession(s, '분류 시스템입니다', mockGenerate);
  assert(s.collected.goal === 'existing-value', 'existing value was overwritten');
  assert(s.collected.domain === 'e커머스', 'new field not extracted');
  assert(!result.done, 'should not be done');
});

test('advanceSession serves hard gate when fieldsComplete', async () => {
  const s = createSession();
  // Simulate all fields filled
  const mockGenerate = async () => ({
    extractedFields: {},
    remainingFields: [],
    fieldsComplete: true,
    question: '',
    type: 'open',
    options: [],
    collectsTo: null,
    contextMessage: '',
  });

  const result = await advanceSession(s, '모든 정보 다 있어요', mockGenerate);
  assert(!result.done, 'should not be done — hard gate pending');
  assert(result.question.type === 'confirm', 'hard gate should be confirm type');
  assert(result.question.collectsTo === 'researchConfirm', 'should serve researchConfirm');
  assert(s.currentHardGate === 'researchConfirm', 'currentHardGate not set');
});

test('advanceSession advances phase after hard gate yes', async () => {
  const s = createSession();
  s.hardGatesPending = ['researchConfirm'];
  s.currentHardGate = 'researchConfirm';

  const mockGenerate = async () => ({
    extractedFields: {},
    remainingFields: ['approach'],
    fieldsComplete: false,
    question: '기술 접근법은?',
    type: 'card',
    header: '접근법',
    options: [{ label: 'A', description: '직접 분류' }],
    collectsTo: 'approach',
    contextMessage: 'PRD 단계 시작',
  });

  const result = await advanceSession(s, 'Yes, proceed', mockGenerate);
  assert(s.currentPhase === 1, `expected phase 1, got ${s.currentPhase}`);
  assert(s.hardGatesPending.includes('prdConfirm'), 'should have prdConfirm pending');
  assert(!result.done, 'should not be done');
});

test('advanceSession stays in phase on hard gate no/mostly', async () => {
  const s = createSession();
  s.hardGatesPending = ['researchConfirm'];
  s.currentHardGate = 'researchConfirm';

  let mockCalled = false;
  const mockGenerate = async () => {
    mockCalled = true;
    return {
      extractedFields: {},
      remainingFields: ['goal'],
      fieldsComplete: false,
      question: '목표를 다시 설명해주세요.',
      type: 'open',
      header: '목표',
      options: [],
      collectsTo: 'goal',
      contextMessage: '다시 알려주세요.',
    };
  };

  const result = await advanceSession(s, 'mostly: 스케일을 수정하고 싶어요', mockGenerate);
  assert(s.currentPhase === 0, 'should stay in phase 0');
  assert(mockCalled, 'should call generateFn for corrective question');
  assert(!result.done, 'should not be done');
});

test('advanceSession returns done after phase 3 hard gate yes', async () => {
  const s = createSession();
  s.currentPhase = 3;
  s.hardGatesPending = ['envConfirm'];
  s.currentHardGate = 'envConfirm';

  const result = await advanceSession(s, 'Yes, ready', async () => ({ fieldsComplete: true, extractedFields: {}, remainingFields: [], question: '', type: 'open', options: [], collectsTo: null, contextMessage: '' }));
  assert(result.done === true, 'should be done after phase 3 gate');
});

setTimeout(() => {
  console.log(`\nsession.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 500);
