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
  session.history.push({ role: 'answer', content: answer, phase: session.currentPhase, timestamp: Date.now() });

  // ── Step 1: Handle hard gate answer ──────────────────────────────────────
  if (session.currentHardGate) {
    const isYes = /yes|승인|proceed|준비됐|ready/i.test(answer);

    if (!isYes) {
      // User wants to revise — stay in current phase, generate corrective question
      session.currentHardGate = null;
      // Keep gateId in hardGatesPending (it's already there)

      const result = await generateFn(session.currentPhase, session.collected, session.history, answer);
      mergeExtractedFields(session.collected, result.extractedFields);
      session.history.push({ role: 'question', phase: session.currentPhase, content: result.question, timestamp: Date.now() });
      return { question: result, done: false };
    }

    // Positive answer — pop this gate from pending
    session.hardGatesPending = session.hardGatesPending.filter(g => g !== session.currentHardGate);
    session.currentHardGate = null;

    // If all gates for this phase are done, advance phase now
    if (session.hardGatesPending.length === 0) {
      session.currentPhase++;

      // Terminal condition
      if (session.currentPhase > 3) {
        return { done: true };
      }

      const nextSchema = getPhaseSchema(session.currentPhase);
      session.hardGatesPending = [...nextSchema.hardGates];

      // Phase short-circuit: no fields to collect, go straight to hard gate
      if (nextSchema.fields.length === 0) {
        const gateId = session.hardGatesPending[0];
        session.currentHardGate = gateId;
        const gateQ = HARD_GATE_QUESTIONS[gateId];
        session.history.push({ role: 'question', phase: session.currentPhase, content: gateQ.question, timestamp: Date.now() });
        return { question: gateQ, done: false };
      }

      // First question of new phase
      const firstResult = await generateFn(session.currentPhase, session.collected, session.history, answer);
      mergeExtractedFields(session.collected, firstResult.extractedFields);
      session.history.push({ role: 'question', phase: session.currentPhase, content: firstResult.question, timestamp: Date.now() });
      return { question: firstResult, done: false };
    }
  }

  // ── Step 2: Call Gemini for extraction + next question ───────────────────
  const result = await generateFn(session.currentPhase, session.collected, session.history, answer);
  mergeExtractedFields(session.collected, result.extractedFields);

  // ── Step 3: Fields complete + hard gate pending → serve gate ─────────────
  if (result.fieldsComplete && session.hardGatesPending.length > 0) {
    const gateId = session.hardGatesPending[0];
    session.currentHardGate = gateId;
    const gateQ = HARD_GATE_QUESTIONS[gateId];
    session.history.push({ role: 'question', phase: session.currentPhase, content: gateQ.question, timestamp: Date.now() });
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
      session.history.push({ role: 'question', phase: session.currentPhase, content: gateQ.question, timestamp: Date.now() });
      return { question: gateQ, done: false };
    }

    // First question of new phase
    const firstResult = await generateFn(session.currentPhase, session.collected, session.history, answer);
    mergeExtractedFields(session.collected, firstResult.extractedFields);
    session.history.push({ role: 'question', phase: session.currentPhase, content: firstResult.question, timestamp: Date.now() });
    return { question: firstResult, done: false };
  }

  // ── Step 5: Return next generated question ───────────────────────────────
  session.history.push({ role: 'question', phase: session.currentPhase, content: result.question, timestamp: Date.now() });
  return { question: result, done: false };
}

module.exports = { createSession, getSession, deleteSession, advanceSession };
