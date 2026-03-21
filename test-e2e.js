// End-to-end smoke test: walks through the dynamic session via HTTP API.
// Run with: node test-e2e.js
// Requires server running on port 3000.

const BASE = 'http://localhost:8888';

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
