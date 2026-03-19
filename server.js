require('dotenv').config({ path: require('path').resolve(__dirname, '../docs/.env') });
require('dotenv').config(); // fallback: local .env

const express = require('express');
const path = require('path');
const { createSession, getSession, advanceSession } = require('./session');

const app = express();
app.use(express.json());

// ── /flow — serve flow diagram HTML ──────────────────────────────────────────
app.get('/flow', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user-flow-diagram.html'));
});

// ── /simulator — serve simulator SPA ─────────────────────────────────────────
app.get('/simulator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

// ── Static files (serves public/index.html as / ) ────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Debug: end-to-end session test without Gemini ────────────────────────────
app.get('/api/debug', async (req, res) => {
  const report = {};
  try {
    // 1. Test module loads
    const schema = require('./schema');
    report.schema = 'ok — phases: ' + Object.keys(schema.PHASE_SCHEMA).join(',');

    require('./gemini');
    report.geminiModule = 'loaded';

    const { createSession, advanceSession } = require('./session');
    report.sessionModule = 'loaded';

    // 2. Test session creation
    const session = createSession();
    report.sessionCreated = session.sessionId.slice(0, 8);

    // 3. Test serializeSession
    const state = serializeSession(session);
    report.serializeSession = 'ok — length: ' + state.length;

    // 4. Test restoreSession
    const restored = restoreSession(session.sessionId, state);
    report.restoreSession = restored ? 'ok' : 'FAILED';

    // 5. Test advanceSession with mock (no Gemini)
    const mockGenerate = async () => ({
      extractedFields: { goal: 'test goal' },
      remainingFields: ['domain'],
      fieldsComplete: false,
      question: '테스트 질문입니다.',
      type: 'open',
      header: '테스트',
      options: [],
      collectsTo: 'domain',
      contextMessage: '테스트',
    });
    const result = await advanceSession(session, '테스트 답변', mockGenerate);
    report.advanceSession = result.done ? 'done' : ('ok — type: ' + result.question?.type);

    report.overall = 'ALL OK';
  } catch (err) {
    report.error = err.message;
    report.stack = err.stack?.split('\n').slice(0, 5).join(' | ');
    report.overall = 'FAILED';
  }
  res.json(report);
});

// ── POST /api/session — Create session, return first question ─────────────────
app.post('/api/session', (req, res) => {
  try {
    const session = createSession();
    const firstQuestion = {
      question: '어떤 걸 만들고 싶으세요? 자유롭게 설명해주세요.',
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
      sessionState: serializeSession(session),
    });
  } catch (err) {
    console.error('[POST /api/session]', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ── Serialize / restore session state for stateless Vercel deployments ────────
function serializeSession(session) {
  return JSON.stringify({
    currentPhase: session.currentPhase,
    collected: session.collected,
    history: session.history,
    hardGatesPending: session.hardGatesPending,
    currentHardGate: session.currentHardGate,
  });
}

function restoreSession(sessionId, stateStr) {
  try {
    const state = JSON.parse(stateStr);
    return { sessionId, ...state };
  } catch {
    return null;
  }
}

// ── POST /api/message — Submit answer, get next question ─────────────────────
app.post('/api/message', async (req, res) => {
  const { sessionId, answer, sessionState } = req.body;
  if (!sessionId || answer === undefined) {
    return res.status(400).json({ error: 'Missing sessionId or answer' });
  }

  // Try in-memory first; fall back to client-sent state (survives Vercel cold starts)
  let session = getSession(sessionId);
  if (!session && sessionState) {
    session = restoreSession(sessionId, sessionState);
  }
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
      history: session.history,
      sessionState: serializeSession(session),
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

// Export for Vercel serverless (@vercel/node requires module.exports = app)
module.exports = app;

// Local dev: start server only when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`MEGA Simulator running at http://localhost:${PORT}`));
}
