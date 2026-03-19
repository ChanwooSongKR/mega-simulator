// Question catalog — all content hardcoded from agent .md files.
// Gemini generates context messages; it does NOT generate these questions/options.

const PHASES = {
  research: { id: 0, name: 'Phase 0 · Research', label: 'Research' },
  prd:      { id: 1, name: 'Phase 1 · PRD',      label: 'PRD' },
  data:     { id: 2, name: 'Phase 2 · Data',     label: 'Data' },
  workflow: { id: 3, name: 'Phase 3 · Workflow', label: 'Workflow' },
};

const QUESTIONS = [
  // ─── Phase 0: Research ───────────────────────────────────────────────────

  {
    id: 'R-initial',
    phase: 0,
    group: null,
    type: 'initial',
    question: '만들고 싶은 LLM 파이프라인을 자유롭게 설명해주세요.',
    header: '시작',
    hardGate: false,
    skippable: false,
    collectsTo: 'initialRequest',
  },

  // Group A1 — Foundation (skippable if initial request is specific)
  {
    id: 'R-A1-goal',
    phase: 0,
    group: 'A1',
    type: 'card',
    question: 'What is the primary goal of this system?',
    header: 'Goal',
    hardGate: false,
    skippable: true,
    collectsTo: 'goal',
    options: [
      { label: 'Classify/categorize content', description: 'Sort inputs into predefined categories', recommended: true },
      { label: 'Generate/create content', description: 'Produce new text, code, or data' },
      { label: 'Extract/parse information', description: 'Pull structured data from unstructured sources' },
      { label: 'Transform/convert data', description: 'Change format or structure of existing data' },
    ],
  },
  {
    id: 'R-A1-domain',
    phase: 0,
    group: 'A1',
    type: 'card',
    question: 'What domain or content type will this system work with?',
    header: 'Domain',
    hardGate: false,
    skippable: true,
    collectsTo: 'domain',
    options: [
      { label: 'Text / Natural Language', description: 'Articles, support tickets, documents, chat messages', recommended: true },
      { label: 'Code / Technical', description: 'Source code, configs, logs, API responses' },
      { label: 'Structured Data', description: 'Tables, JSON, CSV, database records' },
      { label: 'Mixed / Multimodal', description: 'Combination of text, data, and possibly images' },
    ],
  },
  {
    id: 'R-A1-io',
    phase: 0,
    group: 'A1',
    type: 'card',
    question: 'What does the input/output look like?',
    header: 'I/O format',
    hardGate: false,
    skippable: true,
    collectsTo: 'io',
    options: [
      { label: 'Text in → Text out', description: 'Free-form text input, structured or free-form text output' },
      { label: 'Text in → Label/Category out', description: 'Free-form text input, classification label output', recommended: true },
      { label: 'Structured in → Structured out', description: 'JSON/CSV input, JSON/CSV output' },
    ],
  },

  // Group A2 — Constraints (skippable if clear from context)
  {
    id: 'R-A2-scale',
    phase: 0,
    group: 'A2',
    type: 'card',
    question: 'How much data/traffic do you expect?',
    header: 'Scale',
    hardGate: false,
    skippable: true,
    collectsTo: 'scale',
    options: [
      { label: 'Small (< 1K items)', description: 'Batch processing, development/prototype scale' },
      { label: 'Medium (1K–100K items)', description: 'Production workload, moderate throughput', recommended: true },
      { label: 'Large (100K+ items)', description: 'High-volume production, streaming or real-time' },
    ],
  },
  {
    id: 'R-A2-constraints',
    phase: 0,
    group: 'A2',
    type: 'card',
    question: 'Any specific technical constraints?',
    header: 'Constraints',
    hardGate: false,
    skippable: true,
    collectsTo: 'constraints',
    options: [
      { label: 'No strong constraints', description: 'Open to any stack or approach', recommended: true },
      { label: 'Language/framework locked', description: 'Must use specific language or framework' },
      { label: 'API/cost limits', description: 'Specific API provider or budget ceiling' },
      { label: 'Multiple constraints', description: "I'll list the constraints" },
    ],
  },
  {
    id: 'R-A2-priority',
    phase: 0,
    group: 'A2',
    type: 'card',
    question: 'Which quality matters most?',
    header: 'Priority',
    hardGate: false,
    skippable: true,
    collectsTo: 'priority',
    options: [
      { label: 'Accuracy first', description: 'Correctness matters most, willing to trade speed/cost', recommended: true },
      { label: 'Speed first', description: 'Fast response time, willing to trade some accuracy' },
      { label: 'Cost first', description: 'Minimize API/compute costs, willing to trade accuracy/speed' },
      { label: 'Balanced', description: 'No single dimension dominates' },
    ],
  },

  // Group A3 — Scope (skippable if explicit)
  {
    id: 'R-A3-scope',
    phase: 0,
    group: 'A3',
    type: 'card',
    question: 'Which of these features are must-haves for v1?',
    header: 'Scope',
    hardGate: false,
    skippable: true,
    multiSelect: true,
    collectsTo: 'scope',
    options: [
      { label: 'Core processing pipeline', description: 'The main LLM call and output handling' },
      { label: 'Input validation & preprocessing', description: 'Clean and normalize inputs before processing' },
      { label: 'Output formatting & postprocessing', description: 'Structure and format LLM outputs' },
      { label: 'Error handling & fallbacks', description: 'Handle LLM failures and edge cases' },
    ],
  },

  // Step 3 — HARD GATE
  {
    id: 'R-step3',
    phase: 0,
    group: 'confirm',
    type: 'confirm',
    question: 'Does this capture your intent correctly?',
    header: 'Confirm',
    hardGate: true,
    skippable: false,
    collectsTo: 'researchConfirm',
    confirmOptions: [
      { label: 'Yes, proceed to research', value: 'yes' },
      { label: 'Mostly, but...', value: 'mostly' },
      { label: 'No, let me re-explain', value: 'no' },
    ],
  },

  // ─── Phase 1: PRD ─────────────────────────────────────────────────────────

  {
    id: 'P-A-approach',
    phase: 1,
    group: 'A',
    type: 'card',
    question: 'Based on research, here are the top approaches. Which fits best?',
    header: 'Approach',
    hardGate: false,
    skippable: false,
    collectsTo: 'approach',
    options: [
      { label: 'Approach A: Direct LLM Classification', description: 'Simple prompt-based classification, fast to build', recommended: true },
      { label: 'Approach B: RAG + Classification', description: 'Retrieval-augmented, higher accuracy for complex domains' },
      { label: 'Approach C: Fine-tuned Model', description: 'Domain-specific model, best accuracy but higher cost' },
    ],
    dynamicOptions: true,
  },

  // Group B1
  {
    id: 'P-B1-title',
    phase: 1,
    group: 'B1',
    type: 'card',
    question: 'Does this title and description capture the project well?',
    header: 'Title',
    hardGate: false,
    skippable: false,
    collectsTo: 'titleApproval',
    options: [
      { label: 'Yes, looks good', description: 'Title and description are accurate', recommended: true },
      { label: 'Adjust the title', description: "I'll suggest a better title" },
      { label: 'Adjust the description', description: "I'll clarify what to change" },
    ],
  },
  {
    id: 'P-B1-scenarios',
    phase: 1,
    group: 'B1',
    type: 'card',
    question: 'Are these key scenarios and target users correct?',
    header: 'Scenarios',
    hardGate: false,
    skippable: false,
    collectsTo: 'scenariosApproval',
    options: [
      { label: 'Scenarios look correct', description: 'Proceed to requirements', recommended: true },
      { label: 'Add or remove scenarios', description: "I'll specify what to change" },
      { label: 'Adjust target users', description: "I'll clarify who the users are" },
    ],
  },

  // Group B2
  {
    id: 'P-B2-requirements',
    phase: 1,
    group: 'B2',
    type: 'card',
    question: 'Are these must-have requirements (REQ-001 through REQ-00N) correct and complete?',
    header: 'Must-haves',
    hardGate: false,
    skippable: false,
    collectsTo: 'requirementsApproval',
    options: [
      { label: 'Requirements look correct', description: 'Proceed to priorities', recommended: true },
      { label: 'Add missing requirements', description: "I'll specify what's missing" },
      { label: 'Remove or modify some', description: "I'll say which to change" },
    ],
  },
  {
    id: 'P-B2-priorities',
    phase: 1,
    group: 'B2',
    type: 'card',
    question: 'Are the should-have and could-have requirement priorities correct?',
    header: 'Priorities',
    hardGate: false,
    skippable: false,
    collectsTo: 'prioritiesApproval',
    options: [
      { label: 'Priorities are correct', description: 'Proceed to non-goals', recommended: true },
      { label: 'Move items between tiers', description: "I'll specify what to change" },
      { label: 'Remove some requirements', description: "I'll say which to cut" },
    ],
  },
  {
    id: 'P-B2-nongoals',
    phase: 1,
    group: 'B2',
    type: 'card',
    question: "Do these non-goals correctly define what's OUT of scope?",
    header: 'Non-Goals',
    hardGate: false,
    skippable: false,
    collectsTo: 'nongoalsApproval',
    options: [
      { label: 'Non-goals are correct', description: 'Scope boundaries are clear', recommended: true },
      { label: 'Add more exclusions', description: "I'll specify what else to exclude" },
      { label: 'Remove some non-goals', description: 'Some should actually be in scope' },
    ],
  },

  // Group B3 — HARD GATE
  {
    id: 'P-B3',
    phase: 1,
    group: 'B3',
    type: 'confirm',
    question: "Here's the complete PRD summary. Ready to finalize?",
    header: 'Final',
    hardGate: true,
    skippable: false,
    collectsTo: 'prdConfirm',
    confirmOptions: [
      { label: 'Approved — proceed to Data phase', value: 'yes' },
      { label: 'Need changes', value: 'mostly' },
      { label: 'Start over from a section', value: 'no' },
    ],
  },

  // ─── Phase 2: Data ────────────────────────────────────────────────────────

  {
    id: 'D-strategy',
    phase: 2,
    group: 'strategy',
    type: 'card',
    question: 'What data sourcing strategy do you prefer for this project?',
    header: 'Data source',
    hardGate: false,
    skippable: false,
    collectsTo: 'dataStrategy',
    options: [
      { label: 'Open data first', description: 'Search existing datasets on Kaggle/HuggingFace, synthesize only to fill gaps', recommended: true },
      { label: 'Fully synthetic', description: 'Generate all data from scratch based on PRD requirements' },
      { label: 'Hybrid', description: 'Actively mix existing datasets with purpose-built synthetic entries' },
    ],
  },

  // Conditional: skip if strategy = 'Fully synthetic'
  {
    id: 'D-dataset',
    phase: 2,
    group: 'dataset',
    type: 'card',
    question: 'Here are the datasets I found. Which should we use?',
    header: 'Dataset',
    hardGate: false,
    skippable: true,
    collectsTo: 'datasetChoice',
    options: [
      { label: 'Use recommended dataset', description: 'Best coverage for requirements', recommended: true },
      { label: 'Combine multiple datasets', description: 'Maximize coverage with merged sources' },
      { label: 'None — synthesize from scratch', description: "These don't fit well enough" },
    ],
    dynamicOptions: true,
  },

  // Conditional: skip if user chose an existing dataset with no gaps
  {
    id: 'D-synthesis-strategy',
    phase: 2,
    group: 'synthesis',
    type: 'card',
    question: "Here's the synthesis strategy. Does this approach work?",
    header: 'Strategy',
    hardGate: false,
    skippable: true,
    collectsTo: 'synthesisStrategy',
    options: [
      { label: 'Looks good', description: 'Proceed to schema definition', recommended: true },
      { label: 'Adjust the approach', description: "I'll explain what to change" },
    ],
  },
  {
    id: 'D-synthesis-schema',
    phase: 2,
    group: 'synthesis',
    type: 'card',
    question: "Here's the data schema with examples. Does this match your expectations?",
    header: 'Schema',
    hardGate: false,
    skippable: true,
    collectsTo: 'synthesisSchema',
    options: [
      { label: 'Schema looks correct', description: 'Proceed to distribution planning', recommended: true },
      { label: 'Needs adjustment', description: "I'll specify what to change" },
    ],
  },
  {
    id: 'D-synthesis-distribution',
    phase: 2,
    group: 'synthesis',
    type: 'card',
    question: "Here's the difficulty distribution and edge case list. Anything to add or change?",
    header: 'Distribution',
    hardGate: false,
    skippable: true,
    collectsTo: 'synthesisDistribution',
    options: [
      { label: 'Distribution is good', description: 'Proceed to sample generation', recommended: true },
      { label: 'Add more edge cases', description: "I'll list additional cases to include" },
      { label: 'Adjust difficulty ratio', description: 'I want a different balance' },
    ],
  },

  // D-sample — HARD GATE
  {
    id: 'D-sample',
    phase: 2,
    group: 'sample',
    type: 'confirm',
    question: 'Here are 5 sample entries across difficulty levels. Do these match what you expect?',
    header: 'Sample Approval',
    hardGate: true,
    skippable: false,
    collectsTo: 'sampleApproval',
    confirmOptions: [
      { label: 'Samples look great — generate full dataset', value: 'yes' },
      { label: 'Adjust quality/style', value: 'mostly' },
      { label: 'Wrong direction — re-explain', value: 'no' },
    ],
  },

  {
    id: 'D-final',
    phase: 2,
    group: 'final',
    type: 'confirm',
    question: 'The dataset is ready. Does everything look correct?',
    header: 'Approval',
    hardGate: false,
    skippable: false,
    collectsTo: 'dataApproval',
    confirmOptions: [
      { label: 'Approved — generate files', value: 'yes' },
      { label: 'Need adjustments', value: 'mostly' },
      { label: 'Start over', value: 'no' },
    ],
  },

  // ─── Phase 3: Workflow ────────────────────────────────────────────────────

  // W-env — HARD GATE (only user-facing question in Phase 3)
  {
    id: 'W-env',
    phase: 3,
    group: 'env',
    type: 'confirm',
    question: 'The workflow code requires API keys to run. Please confirm your .env is configured.',
    header: 'Environment Setup',
    hardGate: true,
    skippable: false,
    collectsTo: 'envConfirm',
    confirmOptions: [
      { label: 'Ready — .env is configured', value: 'yes' },
      { label: 'Show me what keys are needed', value: 'mostly' },
    ],
  },
];

function getAllQuestions() {
  return QUESTIONS;
}

function getPhaseQuestions(phaseId) {
  return QUESTIONS.filter(q => q.phase === phaseId);
}

function getQuestion(id) {
  return QUESTIONS.find(q => q.id === id) || null;
}

module.exports = { PHASES, QUESTIONS, getAllQuestions, getPhaseQuestions, getQuestion };
