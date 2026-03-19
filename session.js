const crypto = require('crypto');
const { getQuestion, getAllQuestions } = require('./phases');

// In-memory store. Resets when server restarts.
const sessions = new Map();

function createSession() {
  const sessionId = crypto.randomUUID();
  const session = {
    sessionId,
    currentPhase: 0,
    currentQuestionId: 'R-initial',
    collected: {},
    skipGroups: [],  // set by Gemini after R-initial
    history: [],
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

function submitAnswer(session, questionId, answer) {
  const q = getQuestion(questionId);
  if (q && q.collectsTo) {
    session.collected[q.collectsTo] = answer;
  }
  session.history.push({ questionId, answer, timestamp: Date.now() });
}

// Returns the next Question object, or null if the simulation is complete.
function nextQuestion(session, currentId) {
  const all = getAllQuestions();
  const idx = all.findIndex(q => q.id === currentId);
  if (idx === -1) return null;

  for (let i = idx + 1; i < all.length; i++) {
    const q = all[i];

    // Skip entire group if skipGroups contains it
    if (q.group && session.skipGroups.includes(q.group)) continue;

    // Skip D-dataset if strategy is Fully synthetic
    if (q.id === 'D-dataset' && session.collected.dataStrategy === 'Fully synthetic') continue;

    // Skip D-synthesis group if user selected an existing dataset with no gaps
    // (datasetChoice doesn't include 'None' or 'Adjust')
    if (q.group === 'synthesis') {
      const dc = session.collected.datasetChoice;
      if (dc && !dc.includes('None') && !dc.includes('Adjust') && session.collected.dataStrategy !== 'Fully synthetic') {
        // User picked an existing dataset with sufficient coverage → skip synthesis
        continue;
      }
    }

    return q;
  }
  return null; // simulation complete
}

module.exports = { createSession, getSession, deleteSession, submitAnswer, nextQuestion };
