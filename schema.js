// Phase field schemas and hard gate question templates.
// Replaces phases.js — only defines WHAT to collect, not HOW to ask.

const PHASE_SCHEMA = {
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
};

// All hard gate field names — Gemini is forbidden from generating these.
const HARD_GATE_FIELD_NAMES = [
  'researchConfirm', 'prdConfirm', 'sampleApproval', 'dataApproval', 'envConfirm',
];

// Server-controlled hard gate question templates.
const HARD_GATE_QUESTIONS = {
  researchConfirm: {
    question: '지금까지 파악된 내용이 맞나요? 확인 후 Research 단계를 마무리합니다.',
    type: 'confirm',
    header: 'Research 확인',
    hardGate: true,
    collectsTo: 'researchConfirm',
    confirmOptions: [
      { label: '맞아요, PRD 단계로', value: 'yes' },
      { label: '일부 수정이 필요해요', value: 'mostly' },
      { label: '다시 설명할게요', value: 'no' },
    ],
  },
  prdConfirm: {
    question: 'PRD 내용을 최종 확인해주세요. 승인하면 Data 단계로 넘어갑니다.',
    type: 'confirm',
    header: 'PRD 최종 확인',
    hardGate: true,
    collectsTo: 'prdConfirm',
    confirmOptions: [
      { label: '승인 — Data 단계로', value: 'yes' },
      { label: '수정이 필요해요', value: 'mostly' },
      { label: '처음부터 다시', value: 'no' },
    ],
  },
  sampleApproval: {
    question: '생성된 5개 샘플 데이터를 검토해주세요. 승인하면 전체 데이터셋을 생성합니다.',
    type: 'confirm',
    header: '샘플 승인',
    hardGate: true,
    collectsTo: 'sampleApproval',
    confirmOptions: [
      { label: '샘플 좋아요 — 전체 생성', value: 'yes' },
      { label: '품질/스타일 조정 필요', value: 'mostly' },
      { label: '방향이 다릅니다', value: 'no' },
    ],
  },
  dataApproval: {
    question: '데이터셋 생성이 완료됐어요. 최종 승인해주세요.',
    type: 'confirm',
    header: '데이터셋 승인',
    hardGate: true,
    collectsTo: 'dataApproval',
    confirmOptions: [
      { label: '승인 — 파일 생성', value: 'yes' },
      { label: '조정이 필요해요', value: 'mostly' },
      { label: '다시 시작', value: 'no' },
    ],
  },
  envConfirm: {
    question: '.env 파일에 API 키를 설정했나요? 확인 후 워크플로우를 실행합니다.',
    type: 'confirm',
    header: '환경 설정',
    hardGate: true,
    collectsTo: 'envConfirm',
    confirmOptions: [
      { label: '준비됐어요 — .env 설정 완료', value: 'yes' },
      { label: '어떤 키가 필요한지 알려주세요', value: 'mostly' },
    ],
  },
};

function getPhaseSchema(phaseId) {
  return PHASE_SCHEMA[phaseId] ?? null;
}

module.exports = { PHASE_SCHEMA, HARD_GATE_FIELD_NAMES, HARD_GATE_QUESTIONS, getPhaseSchema };
