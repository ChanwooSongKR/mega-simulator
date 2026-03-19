# Dynamic Simulator + Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded question list with an AI-driven adaptive engine, and add a landing page with a flow-viewer branch.

**Architecture:** A new `schema.js` defines what fields each phase must collect. `gemini.js` gains `analyzeAndGenerate()` — a single call that extracts info from the user's answer and generates the next best question. `session.js`'s `nextQuestion()` is replaced by `advanceSession()`, a state machine that calls Gemini, enforces hard gates server-side, and advances phases. The frontend gains a landing page and markdown flow-viewer; the simulator UI renders identically because its question-type renderer is already fully generic.

**Tech Stack:** Node.js/Express, `@google/generative-ai` (Gemini 2.0 Flash), `marked@^14.x` (markdown→HTML), vanilla JS frontend, custom mini test runner (`node file.test.js`)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `schema.js` | **Create** | Phase field schemas + hard gate question templates |
| `gemini.js` | **Modify** | Add `analyzeAndGenerate()` |
| `session.js` | **Modify** | Replace `nextQuestion()` with `advanceSession()` |
| `server.js` | **Modify** | New `/flow` route, update `/api/message`, add `/simulator` route |
| `public/index.html` | **Replace** | Landing page (two buttons) |
| `public/simulator.html` | **Create** | Current simulator UI (moved from old index.html) |
| `public/flow.html` | **Create** | Markdown flow-viewer |
| `public/app.js` | **Modify** | Remove `questionId` from submit, phase-based progress, hide `[id]` in header |
| `phases.js` | **Delete** | Replaced by `schema.js` |
| `schema.test.js` | **Create** | Tests for schema + hard gate templates |
| `session.test.js` | **Rewrite** | Tests for `advanceSession` (sync paths via injected mock) |
| `phases.test.js` | **Delete** | No longer relevant |
| `test-e2e.js` | **Modify** | New API shape: `{ sessionId, answer }` |
| `package.json` | **Modify** | Add `marked@^14.x` |

---

## Task 1: Install `marked` and create `schema.js`

**Files:**
- Modify: `package.json`
- Create: `schema.js`
- Create: `schema.test.js`

- [ ] **Step 1.1: Install marked**

```bash
cd mega-simulator
npm install marked@^14
```

Expected: `marked` appears in `package.json` dependencies.

- [ ] **Step 1.2: Write the failing tests for schema.js**

Create `schema.test.js`:

```js
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
```

- [ ] **Step 1.3: Run tests to verify they fail**

```bash
node schema.test.js
```

Expected: FAIL — `Cannot find module './schema'`

- [ ] **Step 1.4: Create `schema.js`**

```js
// Phase field schemas and hard gate question templates.
// Replaces phases.js — only defines WHAT to collect, not HOW to ask.

const PHASE_SCHEMA = {
  0: {
    name: 'Research',
    fields: ['goal', 'domain', 'io', 'scale', 'constraints', 'priority', 'scope'],
    hardGates: ['researchConfirm'],
  },
  1: {
    name: 'PRD',
    fields: ['approach', 'titleApproval', 'scenariosApproval',
             'requirementsApproval', 'prioritiesApproval', 'nongoalsApproval'],
    hardGates: ['prdConfirm'],
  },
  2: {
    name: 'Data',
    fields: ['dataStrategy', 'datasetChoice', 'synthesisStrategy',
             'synthesisSchema', 'synthesisDistribution'],
    hardGates: ['sampleApproval', 'dataApproval'],
  },
  3: {
    name: 'Workflow',
    fields: [],
    hardGates: ['envConfirm'],
  },
};

// All hard gate field names — Gemini is forbidden from generating these.
const HARD_GATE_FIELD_NAMES = [
  'researchConfirm', 'prdConfirm', 'sampleApproval', 'dataApproval', 'envConfirm',
];

// Server-controlled hard gate question templates.
const HARD_GATE_QUESTIONS = {
  researchConfirm: {
    question: '지금까지 파악된 내용이 맞나요? 확인 후 Research 단계를 마무리합니다.',
    type: 'confirm',
    header: 'Research 확인',
    hardGate: true,
    collectsTo: 'researchConfirm',
    confirmOptions: [
      { label: '맞아요, PRD 단계로', value: 'yes' },
      { label: '일부 수정이 필요해요', value: 'mostly' },
      { label: '다시 설명할게요', value: 'no' },
    ],
  },
  prdConfirm: {
    question: 'PRD 내용을 최종 확인해주세요. 승인하면 Data 단계로 넘어갑니다.',
    type: 'confirm',
    header: 'PRD 최종 확인',
    hardGate: true,
    collectsTo: 'prdConfirm',
    confirmOptions: [
      { label: '승인 — Data 단계로', value: 'yes' },
      { label: '수정이 필요해요', value: 'mostly' },
      { label: '처음부터 다시', value: 'no' },
    ],
  },
  sampleApproval: {
    question: '생성된 5개 샘플 데이터를 검토해주세요. 승인하면 전체 데이터셋을 생성합니다.',
    type: 'confirm',
    header: '샘플 승인',
    hardGate: true,
    collectsTo: 'sampleApproval',
    confirmOptions: [
      { label: '샘플 좋아요 — 전체 생성', value: 'yes' },
      { label: '품질/스타일 조정 필요', value: 'mostly' },
      { label: '방향이 다릅니다', value: 'no' },
    ],
  },
  dataApproval: {
    question: '데이터셋 생성이 완료됐어요. 최종 승인해주세요.',
    type: 'confirm',
    header: '데이터셋 승인',
    hardGate: true,
    collectsTo: 'dataApproval',
    confirmOptions: [
      { label: '승인 — 파일 생성', value: 'yes' },
      { label: '조정이 필요해요', value: 'mostly' },
      { label: '다시 시작', value: 'no' },
    ],
  },
  envConfirm: {
    question: '.env 파일에 API 키를 설정했나요? 확인 후 워크플로우를 실행합니다.',
    type: 'confirm',
    header: '환경 설정',
    hardGate: true,
    collectsTo: 'envConfirm',
    confirmOptions: [
      { label: '준비됐어요 — .env 설정 완료', value: 'yes' },
      { label: '어떤 키가 필요한지 알려주세요', value: 'mostly' },
    ],
  },
};

function getPhaseSchema(phaseId) {
  return PHASE_SCHEMA[phaseId] ?? null;
}

module.exports = { PHASE_SCHEMA, HARD_GATE_FIELD_NAMES, HARD_GATE_QUESTIONS, getPhaseSchema };
```

- [ ] **Step 1.5: Run tests to verify they pass**

```bash
node schema.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 1.6: Commit**

```bash
git add schema.js schema.test.js package.json package-lock.json
git commit -m "feat: add schema.js with phase field definitions and hard gate templates"
```

---

## Task 2: Add `analyzeAndGenerate()` to `gemini.js`

**Files:**
- Modify: `gemini.js`

- [ ] **Step 2.1: Add `analyzeAndGenerate` and `getFallbackQuestion` to `gemini.js`**

Add the following to `gemini.js`, after the existing `getFallbackContext` function and before `module.exports`:

```js
// Analyzes the last answer, extracts field values, and generates the next question.
// phaseNum: integer 0-3
// collected: current collected fields object
// history: full history array (will use last 10 entries internally)
// lastAnswer: the most recent user answer string
// Returns the question object, or a fallback if Gemini is unavailable.
async function analyzeAndGenerate(phaseNum, collected, history, lastAnswer) {
  const { getPhaseSchema, HARD_GATE_FIELD_NAMES } = require('./schema');
  const schema = getPhaseSchema(phaseNum);
  if (!schema) return getFallbackQuestion(phaseNum, collected, []);

  const remainingFields = schema.fields.filter(f => !collected[f]);

  const model = getModel();
  if (!model) return getFallbackQuestion(phaseNum, collected, remainingFields);

  const collectedSummary = Object.entries(collected)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n') || '  (없음)';

  const recentHistory = history
    .slice(-10)
    .map(h => `[${h.role}] ${h.content}`)
    .join('\n') || '(없음)';

  const prompt = `당신은 MEGA 파이프라인 시뮬레이터의 질문 생성 엔진입니다.

현재 Phase: ${phaseNum} (${schema.name})
이 Phase에서 수집해야 할 필드: ${schema.fields.join(', ') || '(없음)'}
아직 비어있는 필드: ${remainingFields.join(', ') || '(없음)'}

지금까지 수집된 정보:
${collectedSummary}

최근 대화:
${recentHistory}

마지막 사용자 답변: "${lastAnswer}"

━━━ 작업 ━━━
1. 마지막 답변에서 아직 비어있는 필드에 해당하는 정보를 추출하세요.
   - 이미 값이 있는 필드는 절대 덮어쓰지 마세요.
2. 아직 비어있는 필드가 있으면 가장 중요한 하나에 대한 질문을 생성하세요.
3. 모든 필드가 채워졌으면 fieldsComplete: true를 반환하고 question: ""으로 두세요.

━━━ 절대 금지 ━━━
다음 hard gate 필드에 대한 질문을 생성하지 마세요:
${HARD_GATE_FIELD_NAMES.join(', ')}
이 필드들은 서버가 직접 처리합니다.

━━━ 응답 형식 ━━━
아래 JSON만 반환하세요 (다른 텍스트 없이):
{
  "extractedFields": { "fieldName": "추출된 값" },
  "remainingFields": ["아직 비어있는 필드명"],
  "fieldsComplete": false,
  "question": "다음 질문 텍스트 (fieldsComplete=true면 빈 문자열)",
  "type": "card",
  "header": "짧은 헤더 (2-4글자)",
  "options": [
    { "label": "선택지 레이블", "description": "설명", "recommended": false }
  ],
  "collectsTo": "이 질문이 채우는 필드명",
  "contextMessage": "1-2문장의 한국어 전환 메시지"
}

type이 "open"이면 options는 빈 배열로 두세요.
type은 반드시 "card" 또는 "open" 중 하나입니다.
options는 card일 때 2-4개가 적당합니다.
collectsTo는 반드시 remainingFields 중 하나여야 합니다.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return getFallbackQuestion(phaseNum, collected, remainingFields);

    const parsed = JSON.parse(jsonMatch[0]);

    // Server-side validation: collectsTo must be a known field
    if (parsed.collectsTo && !schema.fields.includes(parsed.collectsTo)) {
      parsed.collectsTo = null;
    }

    return parsed;
  } catch (err) {
    console.warn('[gemini] analyzeAndGenerate failed:', err.message);
    return getFallbackQuestion(phaseNum, collected, remainingFields);
  }
}

function getFallbackQuestion(phaseNum, collected, remainingFields) {
  const { getPhaseSchema } = require('./schema');
  const schema = getPhaseSchema(phaseNum);
  const missing = remainingFields && remainingFields.length > 0
    ? remainingFields
    : (schema ? schema.fields.filter(f => !collected[f]) : []);

  if (missing.length === 0) {
    return { extractedFields: {}, remainingFields: [], fieldsComplete: true, question: '', type: 'open', options: [], collectsTo: null, contextMessage: '정보 수집이 완료됐습니다.' };
  }

  const fieldLabels = {
    goal: '목표', domain: '도메인', io: '입출력 형식', scale: '처리 규모',
    constraints: '기술 제약', priority: '품질 우선순위', scope: 'v1 필수 기능',
    approach: '기술 접근법', dataStrategy: '데이터 전략',
  };
  const next = missing[0];
  return {
    extractedFields: {},
    remainingFields: missing,
    fieldsComplete: false,
    question: `${fieldLabels[next] || next}에 대해 알려주세요.`,
    type: 'open',
    header: fieldLabels[next] || next,
    options: [],
    collectsTo: next,
    contextMessage: 'Gemini를 사용할 수 없어 기본 질문을 표시합니다.',
  };
}
```

Update `module.exports` at the bottom of `gemini.js`:

```js
module.exports = { getContext, detectSkips, analyzeAndGenerate };
```

- [ ] **Step 2.2: Verify the module loads without error**

```bash
node -e "const g = require('./gemini'); console.log(Object.keys(g))"
```

Expected: `[ 'getContext', 'detectSkips', 'analyzeAndGenerate' ]`

- [ ] **Step 2.3: Commit**

```bash
git add gemini.js
git commit -m "feat: add analyzeAndGenerate() to gemini.js"
```

---

## Task 3: Rewrite `session.js` with `advanceSession()`

**Files:**
- Modify: `session.js`
- Rewrite: `session.test.js`

- [ ] **Step 3.1: Write the new failing tests for session.js**

Replace `session.test.js` with:

```js
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
async function makeSession() {
  return createSession();
}

test('advanceSession fills collected from extractedFields (no overwrite)', async () => {
  const s = await makeSession();
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
  const s = await makeSession();
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
  const s = await makeSession();
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
  const s = await makeSession();
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
  const s = await makeSession();
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
```

- [ ] **Step 3.2: Run tests to confirm failure**

```bash
node session.test.js
```

Expected: FAIL — `advanceSession is not a function` (or similar)

- [ ] **Step 3.3: Rewrite `session.js`**

```js
const crypto = require('crypto');
const { getPhaseSchema, HARD_GATE_QUESTIONS } = require('./schema');
const { analyzeAndGenerate } = require('./gemini');

// In-memory store. Resets when server restarts.
const sessions = new Map();

function createSession() {
  const schema = getPhaseSchema(0);
  const sessionId = crypto.randomUUID();
  const session = {
    sessionId,
    currentPhase: 0,
    collected: {},
    history: [],
    hardGatesPending: [...schema.hardGates],
    currentHardGate: null,
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(id) {
  return sessions.get(id) || null;
}

function deleteSession(id) {
  sessions.delete(id);
}

// Merges extracted fields into collected — never overwrites existing values.
function mergeExtractedFields(collected, extracted) {
  Object.entries(extracted || {}).forEach(([k, v]) => {
    if (!collected[k] && v) collected[k] = v;
  });
}

// Main session state machine.
// generateFn is injectable for testing (defaults to real Gemini call).
async function advanceSession(session, answer, generateFn = analyzeAndGenerate) {
  // Store answer in history
  session.history.push({ role: 'answer', content: answer, timestamp: Date.now() });

  // ── Step 1: Handle hard gate answer ──────────────────────────────────────
  if (session.currentHardGate) {
    const isYes = /yes|승인|proceed|준비됐|ready/i.test(answer);

    if (!isYes) {
      // User wants to revise — stay in current phase, generate corrective question
      const gateId = session.currentHardGate;
      session.currentHardGate = null;
      // Keep gateId in hardGatesPending (it's already there)

      const result = await generateFn(session.currentPhase, session.collected, session.history, answer);
      mergeExtractedFields(session.collected, result.extractedFields);
      session.history.push({ role: 'question', content: result.question, timestamp: Date.now() });
      return { question: result, done: false };
    }

    // Positive answer — pop this gate
    session.hardGatesPending = session.hardGatesPending.filter(g => g !== session.currentHardGate);
    session.currentHardGate = null;
  }

  // ── Step 2: Call Gemini for extraction + next question ───────────────────
  const schema = getPhaseSchema(session.currentPhase);
  const result = await generateFn(session.currentPhase, session.collected, session.history, answer);
  mergeExtractedFields(session.collected, result.extractedFields);

  // ── Step 3: Fields complete + hard gate pending → serve gate ─────────────
  if (result.fieldsComplete && session.hardGatesPending.length > 0) {
    const gateId = session.hardGatesPending[0];
    session.currentHardGate = gateId;
    const gateQ = HARD_GATE_QUESTIONS[gateId];
    session.history.push({ role: 'question', content: gateQ.question, timestamp: Date.now() });
    return { question: gateQ, done: false };
  }

  // ── Step 4: Fields complete + no gates pending → advance phase ───────────
  if (result.fieldsComplete && session.hardGatesPending.length === 0) {
    session.currentPhase++;

    // Terminal condition
    if (session.currentPhase > 3) {
      return { done: true };
    }

    const nextSchema = getPhaseSchema(session.currentPhase);
    session.hardGatesPending = [...nextSchema.hardGates];

    // Phase 3 short-circuit: no fields to collect, go straight to hard gate
    if (nextSchema.fields.length === 0) {
      const gateId = session.hardGatesPending[0];
      session.currentHardGate = gateId;
      const gateQ = HARD_GATE_QUESTIONS[gateId];
      session.history.push({ role: 'question', content: gateQ.question, timestamp: Date.now() });
      return { question: gateQ, done: false };
    }

    // First question of new phase
    const firstResult = await generateFn(session.currentPhase, session.collected, session.history, answer);
    mergeExtractedFields(session.collected, firstResult.extractedFields);
    session.history.push({ role: 'question', content: firstResult.question, timestamp: Date.now() });
    return { question: firstResult, done: false };
  }

  // ── Step 5: Return next generated question ───────────────────────────────
  session.history.push({ role: 'question', content: result.question, timestamp: Date.now() });
  return { question: result, done: false };
}

module.exports = { createSession, getSession, deleteSession, advanceSession };
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
node session.test.js
```

Expected: all tests PASS (async tests resolve after ~500ms).

- [ ] **Step 3.5: Commit**

```bash
git add session.js session.test.js
git commit -m "feat: replace nextQuestion with advanceSession state machine"
```

---

## Task 4: Update `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 4.1: Rewrite `server.js`**

Replace the entire file content:

```js
require('dotenv').config({ path: require('path').resolve(__dirname, '../docs/.env') });
require('dotenv').config(); // fallback: local .env

const express = require('express');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const { createSession, getSession, advanceSession } = require('./session');

const app = express();
app.use(express.json());

// ── /flow — render user-flow.md as HTML ──────────────────────────────────────
app.get('/flow', (req, res) => {
  const mdPath = path.join(__dirname, '../docs/user-flow.md');
  try {
    const md = fs.readFileSync(mdPath, 'utf8');
    const html = marked(md);
    res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MEGA User Flow</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    .flow-container { max-width: 860px; margin: 0 auto; padding: 2rem; }
    .back-btn { display: inline-block; margin-bottom: 1.5rem; color: #888; text-decoration: none; font-size: 0.9rem; }
    .back-btn:hover { color: #fff; }
    .flow-container h1,h2,h3 { color: #e2e8f0; }
    .flow-container table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    .flow-container th, .flow-container td { border: 1px solid #334155; padding: 0.5rem 0.75rem; text-align: left; font-size: 0.85rem; }
    .flow-container th { background: #1e293b; color: #94a3b8; }
    .flow-container code { background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85rem; }
    .flow-container pre { background: #1e293b; padding: 1rem; border-radius: 8px; overflow-x: auto; }
    .flow-container blockquote { border-left: 3px solid #334155; margin: 0; padding-left: 1rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="flow-container">
    <a class="back-btn" href="/">← 돌아가기</a>
    ${html}
  </div>
</body>
</html>`);
  } catch (err) {
    res.status(404).send('<p>Flow document not found.</p>');
  }
});

// ── /simulator — serve simulator SPA ─────────────────────────────────────────
app.get('/simulator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

// ── Static files (serves landing.html as / via index.html) ───────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── POST /api/session — Create session, return first question ─────────────────
app.post('/api/session', (req, res) => {
  try {
    const session = createSession();
    const firstQuestion = {
      question: '만들고 싶은 LLM 파이프라인을 자유롭게 설명해주세요.',
      type: 'initial',
      header: '시작',
      hardGate: false,
      collectsTo: 'initialRequest',
      options: [],
      contextMessage: '안녕하세요! MEGA 시뮬레이터입니다.',
    };
    res.json({
      sessionId: session.sessionId,
      question: firstQuestion,
      phase: session.currentPhase,
      collected: session.collected,
    });
  } catch (err) {
    console.error('[POST /api/session]', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ── POST /api/message — Submit answer, get next question ─────────────────────
app.post('/api/message', async (req, res) => {
  const { sessionId, answer } = req.body;
  if (!sessionId || answer === undefined) {
    return res.status(400).json({ error: 'Missing sessionId or answer' });
  }

  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Store initial answer in collected immediately
  if (!session.collected.initialRequest && session.history.length === 0) {
    session.collected.initialRequest = answer;
  }

  try {
    const result = await advanceSession(session, answer);

    if (result.done) {
      return res.json({
        sessionId,
        done: true,
        collected: session.collected,
        phase: session.currentPhase,
      });
    }

    res.json({
      sessionId,
      question: result.question,
      phase: session.currentPhase,
      collected: session.collected,
      done: false,
    });
  } catch (err) {
    console.error('[POST /api/message]', err);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

// ── GET /api/session/:id — Retrieve session state ────────────────────────────
app.get('/api/session/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    sessionId: session.sessionId,
    currentPhase: session.currentPhase,
    collected: session.collected,
    hardGatesPending: session.hardGatesPending,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEGA Simulator running at http://localhost:${PORT}`));
```

- [ ] **Step 4.2: Verify server starts**

```bash
node server.js
```

Expected: `MEGA Simulator running at http://localhost:3000`

Stop with Ctrl+C.

- [ ] **Step 4.3: Commit**

```bash
git add server.js
git commit -m "feat: update server.js — dynamic API, /flow route, /simulator route"
```

---

## Task 5: Create landing page and rename simulator HTML

**Files:**
- Create: `public/simulator.html` (from old `public/index.html`)
- Replace: `public/index.html` (landing page)
- Modify: `public/app.js` (remove `questionId`, phase-based progress, fix header)

- [ ] **Step 5.1: Copy current `index.html` to `simulator.html`**

Read `public/index.html`, save content as `public/simulator.html`. The only change needed: update the script `src` reference if needed (it already points to `app.js` which is static — no change).

Actually, copy file:

```bash
cp public/index.html public/simulator.html
```

- [ ] **Step 5.2: Create new `public/index.html` (landing page)**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MEGA Simulator</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    .landing {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 2rem;
    }
    .landing-title {
      font-size: 2rem;
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: -0.02em;
    }
    .landing-subtitle {
      color: #64748b;
      font-size: 0.95rem;
      margin-top: -1.5rem;
    }
    .landing-buttons {
      display: flex;
      gap: 1.25rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .landing-btn {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.35rem;
      padding: 1.25rem 1.75rem;
      border-radius: 12px;
      border: 1px solid #1e293b;
      background: #0f172a;
      cursor: pointer;
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
      min-width: 220px;
    }
    .landing-btn:hover {
      border-color: #3b82f6;
      background: #1e293b;
    }
    .landing-btn-label {
      font-size: 1.05rem;
      font-weight: 600;
      color: #e2e8f0;
    }
    .landing-btn-desc {
      font-size: 0.8rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="landing">
    <div class="landing-title">MEGA Simulator</div>
    <div class="landing-subtitle">LLM 파이프라인 설계 시뮬레이터</div>
    <div class="landing-buttons">
      <a class="landing-btn" href="/flow">
        <span class="landing-btn-label">플로우 보기</span>
        <span class="landing-btn-desc">단계별 질문 흐름 및 수집 정보 확인</span>
      </a>
      <a class="landing-btn" href="/simulator">
        <span class="landing-btn-label">시뮬레이터 사용하기</span>
        <span class="landing-btn-desc">AI와 대화하며 파이프라인 설계</span>
      </a>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 5.3: Update `public/app.js`** — three changes:

**Change 1** — Remove `questionId` from `submitAnswer()`. Find and replace:

```js
// OLD (lines 37-43 of app.js):
async function submitAnswer(answer) {
  if (!sessionId || !currentQuestion) return;
  const qId = currentQuestion.id;
  setContext('처리 중...', true);
  document.getElementById('question-card').style.display = 'none';

  try {
    const data = await api('POST', '/api/message', {
      sessionId,
      questionId: qId,
      answer,
    });
```

```js
// NEW:
async function submitAnswer(answer) {
  if (!sessionId) return;
  setContext('처리 중...', true);
  document.getElementById('question-card').style.display = 'none';

  try {
    const data = await api('POST', '/api/message', {
      sessionId,
      answer,
    });
```

**Change 2** — Remove `[q.id]` from the question header. Find and replace in `renderQuestion`:

```js
// OLD:
document.getElementById('question-header').textContent = `[${q.id}] ${q.header || ''}`;
```

```js
// NEW:
document.getElementById('question-header').textContent = q.header || '';
```

**Change 3** — Replace fixed progress bar with phase-based. Find and replace:

```js
// OLD:
const TOTAL_QUESTIONS = 22;
// ...
function updateProgress() {
  const pct = Math.min((answeredCount / TOTAL_QUESTIONS) * 100, 100);
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = `${answeredCount} / ${TOTAL_QUESTIONS} 완료`;
}
```

```js
// NEW (remove TOTAL_QUESTIONS const, update updateProgress):
function updateProgress(phase) {
  const pct = Math.min(((phase || 0) / 4) * 100, 100);
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  const phaseNames = ['Research', 'PRD', 'Data', 'Workflow'];
  document.getElementById('progress-label').textContent =
    phase !== undefined ? `Phase ${phase} — ${phaseNames[phase] || '완료'}` : 'Phase 0';
}
```

Also update the call site in `applyResponse`:

```js
// OLD:
updateProgress();

// NEW:
updateProgress(data.phase);
```

- [ ] **Step 5.4: Verify app loads in browser**

```bash
node server.js
```

Open `http://localhost:3000` — should show landing page with two buttons.
Click "시뮬레이터 사용하기" — should open simulator.
Click browser back → landing → "플로우 보기" → should show formatted markdown.

Stop server.

- [ ] **Step 5.5: Commit**

```bash
git add public/index.html public/simulator.html public/app.js
git commit -m "feat: landing page, simulator.html, phase-based progress, remove questionId from client"
```

---

## Task 6: Update `test-e2e.js` for new API shape

**Files:**
- Modify: `test-e2e.js`

- [ ] **Step 6.1: Rewrite `test-e2e.js`**

The new API sends `{ sessionId, answer }` (no `questionId`). Questions no longer have stable IDs. The e2e test answers with a generic "yes" and walks until done.

```js
// End-to-end smoke test: walks through the dynamic session via HTTP API.
// Run with: node test-e2e.js
// Requires server running on port 3000.

const BASE = 'http://localhost:3000';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function run() {
  console.log('Starting E2E smoke test...\n');

  // Create session
  const session = await post('/api/session', {});
  console.log('✓ Session created:', session.sessionId?.slice(0, 8) + '...');
  console.log('  First question type:', session.question?.type);
  if (!session.sessionId) throw new Error('No session ID');
  if (session.question?.type !== 'initial') throw new Error(`Expected initial question, got ${session.question?.type}`);

  const sid = session.sessionId;
  let stepCount = 0;
  const MAX_STEPS = 40; // safety ceiling

  // First answer: describe a pipeline (rich answer to trigger skip logic)
  let res = await post('/api/message', {
    sessionId: sid,
    answer: '고객 지원 티켓을 카테고리별로 분류하는 시스템입니다. Text→Label 분류, 소규모(1K 미만), 정확도 우선, 기술 제약 없음.',
  });
  stepCount++;
  console.log(`✓ Step ${stepCount}: initial → phase ${res.phase}, done=${res.done}, next type=${res.question?.type}`);

  // Walk through remaining questions
  while (!res.done && stepCount < MAX_STEPS) {
    const q = res.question;
    // Pick first option for card, 'yes' for confirm, open text otherwise
    let answer = 'yes';
    if (q.type === 'card' && q.options?.length > 0) {
      answer = q.options[0].label;
    } else if (q.type === 'open') {
      answer = '문제 없어요';
    }

    res = await post('/api/message', { sessionId: sid, answer });
    stepCount++;
    console.log(`✓ Step ${stepCount}: phase ${res.phase}, done=${res.done}, next=${res.question?.header || 'done'}`);
  }

  if (!res.done) throw new Error(`Not done after ${MAX_STEPS} steps — possible infinite loop`);

  console.log('\n✅ Simulation complete!');
  console.log('Total steps:', stepCount);
  console.log('Collected keys:', Object.keys(res.collected || {}).join(', '));
}

run().catch(err => { console.error('E2E test failed:', err.message); process.exit(1); });
```

- [ ] **Step 6.2: Run e2e test (requires server running)**

Terminal 1:
```bash
node server.js
```

Terminal 2:
```bash
node test-e2e.js
```

Expected: walks through the session and prints `✅ Simulation complete!`

- [ ] **Step 6.3: Commit**

```bash
git add test-e2e.js
git commit -m "test: update e2e test for dynamic API (no questionId)"
```

---

## Task 7: Delete `phases.js` and `phases.test.js`

**Files:**
- Delete: `phases.js`
- Delete: `phases.test.js`

- [ ] **Step 7.1: Verify nothing imports phases.js**

```bash
grep -r "require.*phases" --include="*.js" .
```

Expected: no results (server.js and session.js were already updated).

- [ ] **Step 7.2: Delete the files**

```bash
rm phases.js phases.test.js
```

- [ ] **Step 7.3: Verify server still starts**

```bash
node server.js
```

Expected: starts without error. Stop with Ctrl+C.

- [ ] **Step 7.4: Run all unit tests**

```bash
node schema.test.js && node session.test.js
```

Expected: all tests PASS.

- [ ] **Step 7.5: Commit**

```bash
git add -A
git commit -m "chore: remove phases.js and phases.test.js (replaced by schema.js)"
```

---

## Task 8: Final smoke test

- [ ] **Step 8.1: Start server and run full e2e**

```bash
node server.js &
sleep 2
node test-e2e.js
```

Expected: `✅ Simulation complete!`

- [ ] **Step 8.2: Manual browser check**

1. `http://localhost:3000` → landing page with two buttons ✓
2. Click "플로우 보기" → formatted markdown ✓, back button works ✓
3. Click "시뮬레이터 사용하기" → simulator ✓
4. Type a rich description → questions adapt dynamically ✓
5. Answer one hard gate with "mostly" → stays in same phase ✓

- [ ] **Step 8.3: Final commit**

```bash
git add -A
git commit -m "feat: dynamic simulator complete — landing, flow viewer, AI-driven questions"
```
