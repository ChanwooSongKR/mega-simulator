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
    .flow-container h1, .flow-container h2, .flow-container h3 { color: #e2e8f0; }
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

// ── Static files (serves public/index.html as / ) ────────────────────────────
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
