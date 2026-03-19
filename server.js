require('dotenv').config({ path: require('path').resolve(__dirname, '../docs/.env') });
require('dotenv').config(); // fallback: local .env

const express = require('express');
const path = require('path');
const { createSession, getSession, submitAnswer, nextQuestion } = require('./session');
const { getContext, detectSkips } = require('./gemini');
const { getQuestion } = require('./phases');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// POST /api/session — Create new session, return first question + context
app.post('/api/session', async (req, res) => {
  try {
    const session = createSession();
    const firstQuestion = getQuestion('R-initial');
    const context = await getContext('R-initial', {});
    res.json({
      sessionId: session.sessionId,
      question: firstQuestion,
      context,
      phase: session.currentPhase,
      collected: session.collected,
    });
  } catch (err) {
    console.error('[POST /api/session]', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/message — Submit answer, get next question
app.post('/api/message', async (req, res) => {
  const { sessionId, questionId, answer } = req.body;
  if (!sessionId || !questionId || answer === undefined) {
    return res.status(400).json({ error: 'Missing sessionId, questionId, or answer' });
  }

  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Save answer
  submitAnswer(session, questionId, answer);

  // After initial request: detect skips (runs once)
  if (questionId === 'R-initial') {
    const skipResult = await detectSkips(answer);
    session.skipGroups = skipResult.skip;
  }

  // Get next question
  const next = nextQuestion(session, questionId);

  if (!next) {
    // Simulation complete
    return res.json({
      sessionId,
      done: true,
      collected: session.collected,
      phase: session.currentPhase,
    });
  }

  session.currentQuestionId = next.id;
  session.currentPhase = next.phase;

  // Get contextual intro message for the next question
  const context = await getContext(next.id, session.collected);

  res.json({
    sessionId,
    question: next,
    context,
    phase: next.phase,
    collected: session.collected,
    done: false,
  });
});

// GET /api/session/:id — Retrieve session state
app.get('/api/session/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    sessionId: session.sessionId,
    currentPhase: session.currentPhase,
    currentQuestionId: session.currentQuestionId,
    collected: session.collected,
    skipGroups: session.skipGroups,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEGA Simulator running at http://localhost:${PORT}`));
