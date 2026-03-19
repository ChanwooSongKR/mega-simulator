// ── State ────────────────────────────────────────────────────────────────────
let sessionId = null;
let sessionHistory = []; // all Q&A entries with phase tags
let sessionState = null; // full session state for Vercel cold-start recovery

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  setContext('안녕하세요! MEGA 시뮬레이터입니다. 시작하는 중...', true);
  try {
    const data = await api('POST', '/api/session');
    sessionId = data.sessionId;
    applyResponse(data);
  } catch (e) {
    setContext('서버에 연결할 수 없습니다. 새로고침 해주세요.', false);
  }
}

// ── API helper ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Submit answer ─────────────────────────────────────────────────────────────
async function submitAnswer(answer) {
  if (!sessionId) return;
  setContext('처리 중...', true);
  document.getElementById('question-card').style.display = 'none';

  try {
    const data = await api('POST', '/api/message', {
      sessionId,
      answer,
      sessionState,
    });
    applyResponse(data);
  } catch (e) {
    const msg = `오류: ${e.message}`;
    setContext(msg, false);
    document.getElementById('context-bubble').style.borderColor = '#ef4444';
    document.getElementById('question-card').style.display = '';
    console.error('[submitAnswer]', e);
  }
}

// ── Apply server response ─────────────────────────────────────────────────────
function applyResponse(data) {
  if (data.history) sessionHistory = data.history;
  if (data.sessionState) sessionState = data.sessionState;
  updateLeftPanel(data.phase ?? 0, data.collected ?? {});

  if (data.done) {
    showCompletion(data.collected);
    return;
  }

  setContext(data.context || '', false);
  renderQuestion(data.question);
  updateProgress(data.phase);
}

// ── Render question ──────────────────────────────────────────────────────────
function renderQuestion(q) {
  const card = document.getElementById('question-card');
  card.style.display = '';

  document.getElementById('question-header').textContent = q.header || '';
  document.getElementById('question-text').textContent = q.question;

  const badge = document.getElementById('hard-gate-badge');
  badge.style.display = q.hardGate ? '' : 'none';

  const container = document.getElementById('options-container');
  container.innerHTML = '';

  if (q.type === 'initial') renderInitial(container);
  else if (q.type === 'card') renderCard(container, q);
  else if (q.type === 'confirm') renderConfirm(container, q);
  else if (q.type === 'open') renderOpen(container);
}

// ── Mode: initial ─────────────────────────────────────────────────────────────
function renderInitial(container) {
  container.innerHTML = `
    <div class="open-input-wrap">
      <input id="initial-input" type="text" placeholder="만들고 싶은 것을 설명해주세요..." autofocus />
      <button type="button" class="send-btn" id="initial-send" onclick="handleInitialSend()">시작 →</button>
    </div>`;
  const input = document.getElementById('initial-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleInitialSend(); });
}

function handleInitialSend() {
  const val = document.getElementById('initial-input').value.trim();
  if (val) submitAnswer(val);
}

// ── Mode: card ────────────────────────────────────────────────────────────────
function renderCard(container, q) {
  const isMulti = q.multiSelect;
  let selectedValues = [];

  // Option cards
  q.options.forEach(opt => {
    const div = document.createElement('div');
    div.className = 'option-card';
    div.innerHTML = `
      <div class="option-label">
        <span>${opt.label}</span>
        ${opt.recommended ? '<span class="rec">(Recommended)</span>' : ''}
      </div>
      ${opt.description ? `<div class="option-description">${opt.description}</div>` : ''}`;

    div.addEventListener('click', () => {
      if (isMulti) {
        div.classList.toggle('multi-selected');
        const label = opt.label;
        if (selectedValues.includes(label)) {
          selectedValues = selectedValues.filter(v => v !== label);
        } else {
          selectedValues.push(label);
        }
      } else {
        container.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
        // Single select: submit immediately
        submitAnswer(opt.label);
      }
    });

    container.appendChild(div);
  });

  // Other card
  const otherDiv = document.createElement('div');
  otherDiv.className = 'option-card other-card';
  otherDiv.innerHTML = `
    <div class="option-label"><span>✏</span><span>Other — 직접 입력...</span></div>
    <div class="other-expand" id="other-expand">
      <input id="other-input" type="text" placeholder="직접 입력..." />
      <div style="display:flex;justify-content:flex-end;">
        <button type="button" class="send-btn" onclick="handleOtherSend()">전송</button>
      </div>
    </div>`;
  otherDiv.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    const expand = document.getElementById('other-expand');
    expand.classList.toggle('visible');
    if (expand.classList.contains('visible')) document.getElementById('other-input').focus();
  });
  container.appendChild(otherDiv);

  // Multi-select confirm button
  if (isMulti) {
    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'multiselect-confirm';
    confirmDiv.innerHTML = `<button type="button" class="send-btn" onclick="handleMultiSend()">선택 완료</button>`;
    container.appendChild(confirmDiv);
  }
}

function handleOtherSend() {
  const val = document.getElementById('other-input').value.trim();
  if (val) submitAnswer(val);
}

function handleMultiSend() {
  const selected = Array.from(document.querySelectorAll('.multi-selected'))
    .map(el => el.querySelector('.option-label span:first-child').textContent);
  if (selected.length > 0) submitAnswer(selected.join(', '));
}

// ── Mode: confirm ─────────────────────────────────────────────────────────────
function renderConfirm(container, q) {
  const opts = q.confirmOptions || [
    { label: '맞아요, 진행해주세요', value: 'yes' },
    { label: '거의 맞는데... (수정 사항 입력)', value: 'mostly' },
    { label: '아니요, 다시 설명할게요', value: 'no' },
  ];

  const div = document.createElement('div');
  div.className = 'confirm-options';

  opts.forEach(opt => {
    const btn = document.createElement('div');
    btn.className = 'confirm-opt';
    btn.textContent = opt.label;

    if (opt.value === 'mostly') {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.confirm-opt').forEach(c => c.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('mostly-expand').classList.add('visible');
        document.getElementById('mostly-input').focus();
      });
    } else {
      btn.addEventListener('click', () => submitAnswer(opt.label));
    }

    div.appendChild(btn);
  });

  // Mostly expand
  const expand = document.createElement('div');
  expand.id = 'mostly-expand';
  expand.className = 'mostly-expand';
  expand.innerHTML = `
    <div class="expand-label">어떤 부분이 다른가요?</div>
    <input id="mostly-input" type="text" placeholder="수정 사항을 입력해주세요..." />
    <div style="display:flex;justify-content:flex-end;margin-top:8px;">
      <button type="button" class="send-btn" onclick="handleMostlySend()">전송</button>
    </div>`;
  expand.querySelector('input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleMostlySend();
  });

  container.appendChild(div);
  container.appendChild(expand);
}

function handleMostlySend() {
  const val = document.getElementById('mostly-input').value.trim();
  if (val) submitAnswer('mostly: ' + val);
}

// ── Mode: open ────────────────────────────────────────────────────────────────
function renderOpen(container) {
  container.innerHTML = `
    <div class="open-input-wrap">
      <input id="open-input" type="text" placeholder="입력해주세요..." autofocus />
      <button type="button" class="send-btn" onclick="handleOpenSend()">전송</button>
    </div>`;
  const input = document.getElementById('open-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleOpenSend(); });
}

function handleOpenSend() {
  const val = document.getElementById('open-input').value.trim();
  if (val) submitAnswer(val);
}

// ── Left panel update ─────────────────────────────────────────────────────────
const COLLECTED_LABELS = {
  initialRequest: '요청',
  goal: 'Goal',
  domain: 'Domain',
  io: 'I/O',
  scale: 'Scale',
  constraints: 'Constraints',
  priority: 'Priority',
  scope: 'Scope',
  approach: 'Approach',
  titleApproval: 'Title',
  scenariosApproval: 'Scenarios',
  requirementsApproval: 'Must-haves',
  prioritiesApproval: 'Priorities',
  nongoalsApproval: 'Non-Goals',
  dataStrategy: 'Data 전략',
  datasetChoice: 'Dataset',
  sampleApproval: 'Samples',
};

function updateLeftPanel(phase, collected) {
  // Update phase list
  document.querySelectorAll('.phase-item').forEach(el => {
    const p = parseInt(el.dataset.phase);
    el.className = 'phase-item';
    if (p < phase) {
      el.classList.add('done');
      el.style.cursor = 'pointer';
      el.onclick = () => openHistoryModal(p);
    } else {
      el.style.cursor = '';
      el.onclick = null;
      if (p === phase) el.classList.add('active');
    }
  });

  // Update header
  const phaseNames = ['Phase 0 — Research', 'Phase 1 — PRD', 'Phase 2 — Data', 'Phase 3 — Workflow'];
  document.getElementById('header-phase').textContent = phaseNames[phase] || '';

  // Update collected
  const list = document.getElementById('collected-list');
  list.innerHTML = '';
  Object.entries(COLLECTED_LABELS).forEach(([key, label]) => {
    const val = collected[key];
    const row = document.createElement('div');
    row.className = 'collected-row';
    const shortVal = val ? (val.length > 15 ? val.slice(0, 13) + '…' : val) : '-';
    row.innerHTML = `<span class="collected-key">${label}</span><span class="collected-val${val ? '' : ' empty'}">${shortVal}</span>`;
    list.appendChild(row);
  });
}

// ── Progress ──────────────────────────────────────────────────────────────────
function updateProgress(phase) {
  const pct = Math.min(((phase || 0) / 4) * 100, 100);
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  const phaseNames = ['Research', 'PRD', 'Data', 'Workflow'];
  document.getElementById('progress-label').textContent =
    phase !== undefined ? `Phase ${phase} — ${phaseNames[phase] || '완료'}` : 'Phase 0';
}

// ── Context bubble ────────────────────────────────────────────────────────────
function setContext(text, loading) {
  const bubble = document.getElementById('context-bubble');
  const textEl = document.getElementById('context-text');
  bubble.className = loading ? 'loading' : '';
  textEl.textContent = text || '';
}

// ── Completion screen ─────────────────────────────────────────────────────────
function showCompletion(collected) {
  document.getElementById('question-card').style.display = 'none';
  setContext('🎉 시뮬레이션 완료! 아래에서 수집된 모든 정보를 확인하세요.', false);

  const screen = document.getElementById('completion-screen');
  screen.classList.add('visible');

  const phases = [
    { name: 'Phase 0 — Research', keys: ['initialRequest','goal','domain','io','scale','constraints','priority','scope','researchConfirm'] },
    { name: 'Phase 1 — PRD', keys: ['approach','titleApproval','scenariosApproval','requirementsApproval','prioritiesApproval','nongoalsApproval','prdConfirm'] },
    { name: 'Phase 2 — Data', keys: ['dataStrategy','datasetChoice','synthesisStrategy','synthesisSchema','synthesisDistribution','sampleApproval','dataApproval'] },
    { name: 'Phase 3 — Workflow', keys: ['envConfirm'] },
  ];

  const content = document.getElementById('completion-content');
  content.innerHTML = phases.map(ph => `
    <div class="completion-phase-block">
      <div class="completion-phase-title">${ph.name}</div>
      ${ph.keys.map(k => {
        const v = collected[k];
        if (!v) return '';
        return `<div class="completion-row">
          <span class="completion-key">${COLLECTED_LABELS[k] || k}</span>
          <span class="completion-val">${v}</span>
        </div>`;
      }).join('')}
    </div>`).join('');
}

async function restartSession() {
  sessionHistory = [];
  sessionState = null;
  document.getElementById('completion-screen').classList.remove('visible');
  document.getElementById('question-card').style.display = 'none';
  updateProgress(0);
  updateLeftPanel(0, {});
  await boot();
}

// ── Phase history modal ───────────────────────────────────────────────────────
const PHASE_NAMES = ['Research', 'PRD', 'Data', 'Workflow'];

function openHistoryModal(phaseNum) {
  const entries = sessionHistory.filter(e => e.phase === phaseNum);
  if (entries.length === 0) return;

  document.getElementById('history-modal-title').textContent =
    `Phase ${phaseNum} — ${PHASE_NAMES[phaseNum]} 대화 기록`;

  const body = document.getElementById('history-modal-body');
  body.innerHTML = '';

  // Pair questions with their following answers
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.role === 'question' && e.content) {
      const row = document.createElement('div');
      row.className = 'history-row';
      const answer = entries[i + 1]?.role === 'answer' ? entries[i + 1].content : null;
      row.innerHTML = `
        <div class="history-q">${e.content}</div>
        ${answer ? `<div class="history-a">${answer}</div>` : ''}`;
      body.appendChild(row);
      if (answer) i++; // skip the answer entry
    }
  }

  document.getElementById('history-modal-overlay').style.display = 'flex';
}

function closeHistoryModal() {
  document.getElementById('history-modal-overlay').style.display = 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────────
boot();
