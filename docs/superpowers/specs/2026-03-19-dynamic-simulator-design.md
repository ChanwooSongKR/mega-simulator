# MEGA Simulator — Dynamic Question Engine + Landing Page Split

**Date:** 2026-03-19
**Status:** Approved

---

## Overview

Two changes to the MEGA Simulator:

1. **Landing page split** — The app entry point becomes a choice screen with two paths: "플로우 보기" and "시뮬레이터 사용하기".
2. **Dynamic question engine** — Replace the hardcoded question list with an AI-driven loop that extracts information from each answer, identifies gaps, and generates the next most relevant question dynamically.

---

## 1. Landing Page

### Routes

| Route | Serves |
|-------|--------|
| `GET /` | `public/landing.html` — choice screen |
| `GET /flow` | `public/flow.html` — renders `docs/user-flow.md` as HTML |
| `GET /simulator` | `public/simulator.html` — existing simulator UI |

### Landing page UI

Two large buttons, centered:
- **플로우 보기** → navigates to `/flow`
- **시뮬레이터 사용하기** → navigates to `/simulator`

### Flow viewer (`/flow`)

The server reads the user-flow.md file using a path relative to `__dirname`:
```js
path.join(__dirname, '../docs/user-flow.md')
```
Converts it to HTML (using `marked@^14.x` npm package), and serves it in a styled page. A "← 돌아가기" button returns to `/`. This relative path works both locally and on Vercel.

---

## 2. Dynamic Question Engine

### Core Principle

The system maintains a **per-phase field schema** — a list of what must be collected. After every user answer, a single Gemini call does two things simultaneously:
1. **Extracts** any information the answer provides (fills schema fields)
2. **Generates** the single best next question for the largest remaining gap

Questions are no longer pre-scripted. The number of questions asked in a phase shrinks or grows based on how much information the user voluntarily provides in each answer.

### Phase Schema (`schema.js`)

```js
PHASE_SCHEMA = {
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
}
```

**Hard gates** are listed separately and are always asked — the server enforces this, not Gemini.

### Gemini Function: `analyzeAndGenerate(phase, collected, history, lastAnswer)`

**Input:**
- `phase`: current phase object from PHASE_SCHEMA
- `collected`: all field values gathered so far
- `history`: last 5 Q&A pairs
- `lastAnswer`: the answer just submitted

**Output (JSON):**
```js
{
  extractedFields: { goal: '텍스트 분류 시스템', domain: 'e커머스' },
  // extractedFields merges into collected — only empty fields are overwritten
  // (existing values in collected must never be overwritten by extractedFields)
  remainingFields: ['scale', 'priority'],
  fieldsComplete: false,       // true when all phase fields are filled
  question: '예상 처리 규모는 어느 정도인가요?',
  type: 'card',                // 'card' | 'confirm' | 'open' | 'initial'
  options: [
    { label: '소규모 (1K 미만)', description: '프로토타입/개발 규모' },
    { label: '중규모 (1K~100K)', description: '프로덕션 워크로드', recommended: true },
    { label: '대규모 (100K+)', description: '고처리량 실시간 처리' },
  ],
  collectsTo: 'scale',
  // collectsTo is validated server-side against PHASE_SCHEMA[phase].fields
  // If collectsTo is not in the schema, the server ignores the field assignment
  contextMessage: '목표와 도메인이 확인됐어요. 이제 규모를 파악할게요.',
}
```

**Prompt strategy:**
- Instructs Gemini to scan the full answer for any info matching any remaining field
- Instructs Gemini to generate options that are contextually tailored (e.g., if user mentioned they work in healthcare, options reflect that domain)
- Instructs Gemini that hard gate questions are handled by the server — it must never generate them. The prompt includes the explicit list of gate field names (`researchConfirm`, `prdConfirm`, `sampleApproval`, `dataApproval`, `envConfirm`) that are excluded from generation. If no non-gate fields remain, Gemini must return `fieldsComplete: true` and an empty `question: ""`.
- History is passed as the last 5 Q&A pairs (`history.slice(-10)` sliced at call time, not stored time)

**Fallback:** If Gemini is unavailable or returns invalid JSON, fall back to a simple open-text question asking for the first remaining field.

### Session State (`session.js`)

```js
session = {
  sessionId,
  currentPhase: 0,         // 0–3
  collected: {},            // field: value map
  history: [],              // [{ role: 'question'|'answer', content, timestamp }]
  hardGatesPending: ['researchConfirm'],  // gates not yet asked for current phase
  hardGatesAsked: [],
}
```

`nextQuestion()` is removed. Replaced by `advanceSession(session, answer)`:

```
1. Store answer in history and determine context:
   a. If last question was a hard gate (currentHardGate is set):
        - If answer is 'yes' → pop gate from hardGatesPending, clear currentHardGate
        - If answer is 'mostly' or 'no' → keep gate in hardGatesPending, call
          analyzeAndGenerate to generate a corrective question, return it
          (do NOT advance phase; stay in current phase for revision)
   b. Else → proceed to step 2

2. Call analyzeAndGenerate → merge extractedFields into collected
   (only fill empty fields; never overwrite existing values)

3. If fieldsComplete AND hardGatesPending is not empty:
     → set currentHardGate to first item in hardGatesPending
     → serve the hard gate question (server-controlled template, not Gemini-generated)

4. Else if fieldsComplete AND hardGatesPending is empty:
     → phase++
     → if phase > 3: return { done: true } (terminal condition)
     → load PHASE_SCHEMA[phase] → set hardGatesPending = schema.hardGates
     → if schema.fields is empty (Phase 3 case): skip Gemini, go directly to step 3
     → else: call analyzeAndGenerate for first question of new phase

5. Else:
     → return Gemini-generated next question
```

**API contract change:** `questionId` is removed from `POST /api/message`. The request body becomes `{ sessionId, answer }`. The server uses `session.currentHardGate` or the last `collectsTo` returned by Gemini to know what was answered. The client (`app.js`) no longer needs to send `questionId`. The `currentQuestion.id` reference in `app.js` is removed.

### Server Changes (`server.js`)

- Add `GET /flow` route — reads via `path.join(__dirname, '../docs/user-flow.md')`, converts with `marked`, serves HTML
- `POST /api/session` — returns first question (the initial open-text "뭘 만들고 싶으세요?")
- `POST /api/message` — calls `advanceSession()`, returns next question or `{ done: true }`

### Frontend Changes

| File | Change |
|------|--------|
| `public/landing.html` | New — two-button choice screen |
| `public/flow.html` | New — markdown viewer with back button |
| `public/simulator.html` | Renamed from `index.html` — no functional changes to UI |
| `public/app.js` | **Modify** — remove `questionId` from submit, phase-based progress bar |
| `public/index.html` | Replaced by `landing.html` |

The existing simulator UI (card options, confirm buttons, open input, left panel) requires **no changes** — it already handles all question types generically via `type` field.

**Progress bar (`app.js` — minimal change required):** The hardcoded `TOTAL_QUESTIONS = 22` is replaced with phase-based progress: `phase / 4 * 100%`. The label changes from `X / 22 완료` to `Phase X / 4`. This is the only change needed in `app.js`. The `questionId` send in `submitAnswer()` is also removed (see API contract change above).

---

## 3. Files Changed/Created

| File | Action |
|------|--------|
| `schema.js` | **Create** — phase field schema |
| `gemini.js` | **Modify** — add `analyzeAndGenerate()`, keep `getContext()` for fallback |
| `session.js` | **Modify** — replace `nextQuestion()` with `advanceSession()` |
| `server.js` | **Modify** — add `/flow` route, update session/message handlers |
| `phases.js` | **Delete** — replaced by `schema.js` |
| `public/landing.html` | **Create** |
| `public/flow.html` | **Create** |
| `public/simulator.html` | **Create** (rename from `index.html`) |
| `public/index.html` | **Replace** with redirect to `/` landing |
| `package.json` | **Modify** — add `marked@^14.x` dependency |

---

## 4. What Does NOT Change

- The card / confirm / open / initial UI render modes in `app.js`
- The left panel collected-info display
- The progress bar (though it now estimates dynamically based on phase, not fixed count)
- The completion screen
- The Gemini model (`gemini-2.0-flash`)
- The in-memory session store
- Hard gate behavior (user must explicitly approve before advancing)

---

## 5. Out of Scope

- Persistent sessions (database)
- ADAPT / RESUME modes from user-flow.md (Phase 4, 5, ADAPT mode)
- Multi-language support beyond Korean
- Authentication
