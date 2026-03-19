// End-to-end smoke test: walks through all questions via HTTP API.
// Run with: node test-e2e.js
// Requires server to be running on port 3000.

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
  console.log('  First question:', session.question?.id);

  if (!session.sessionId) throw new Error('No session ID');
  if (session.question?.id !== 'R-initial') throw new Error(`Expected R-initial, got ${session.question?.id}`);

  const sid = session.sessionId;
  let qId = 'R-initial';
  let stepCount = 0;

  // Walk through all questions
  const ANSWERS = {
    'R-initial': '고객 지원 티켓을 카테고리별로 분류하는 LLM 파이프라인입니다.',
    'R-A1-goal': 'Classify/categorize content',
    'R-A1-domain': 'Text / Natural Language',
    'R-A1-io': 'Text in → Label/Category out',
    'R-A2-scale': 'Small (< 1K items)',
    'R-A2-constraints': 'No strong constraints',
    'R-A2-priority': 'Accuracy first',
    'R-A3-scope': 'Core processing pipeline',
    'R-step3': 'Yes, proceed to research',
    'P-A-approach': 'Approach A: Direct LLM Classification',
    'P-B1-title': 'Yes, looks good',
    'P-B1-scenarios': 'Scenarios look correct',
    'P-B2-requirements': 'Requirements look correct',
    'P-B2-priorities': 'Priorities are correct',
    'P-B2-nongoals': 'Non-goals are correct',
    'P-B3': 'Approved — proceed to Data phase',
    'D-strategy': 'Fully synthetic',
    'D-synthesis-strategy': 'Looks good',
    'D-synthesis-schema': 'Schema looks correct',
    'D-synthesis-distribution': 'Distribution is good',
    'D-sample': 'Samples look great — generate full dataset',
    'D-final': 'Approved — generate files',
    'W-env': 'Ready — .env is configured',
  };

  while (true) {
    const answer = ANSWERS[qId] || 'Yes';
    const res = await post('/api/message', { sessionId: sid, questionId: qId, answer });
    stepCount++;

    if (res.done) {
      console.log(`✓ Step ${stepCount}: ${qId} → DONE`);
      console.log('\n✅ Simulation complete!');
      console.log('Collected keys:', Object.keys(res.collected || {}).join(', '));
      break;
    }

    if (!res.question) {
      console.error('No next question in response:', res);
      process.exit(1);
    }

    console.log(`✓ Step ${stepCount}: ${qId} → ${res.question.id} (phase ${res.phase})`);
    qId = res.question.id;
  }

  console.log(`\nTotal steps: ${stepCount}`);
}

run().catch(err => { console.error('E2E test failed:', err.message); process.exit(1); });
