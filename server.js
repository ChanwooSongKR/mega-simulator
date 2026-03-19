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
