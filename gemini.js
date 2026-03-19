const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
function getModel() {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn('[gemini] GEMINI_API_KEY not set — running in fallback mode');
      return null;
    }
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

// Returns a 1-2 sentence Korean contextual message to show before a question.
// Falls back to a generic message if Gemini is unavailable.
async function getContext(questionId, collected) {
  const model = getModel();
  if (!model) return getFallbackContext(questionId);

  const collectedSummary = Object.entries(collected)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ') || '없음';

  const prompt = `당신은 MEGA 파이프라인 빌더 AI입니다. 사용자가 LLM 파이프라인을 설계하는 과정에서 대화를 이어가고 있습니다.

현재 질문 ID: ${questionId}
지금까지 수집된 정보: ${collectedSummary}

다음 질문으로 자연스럽게 넘어가기 위해 1-2문장의 짧은 한국어 메시지를 작성하세요.
- 이미 확인된 내용을 간단히 언급하고, 다음에 물어볼 것을 예고하세요.
- 친근하고 간결하게 작성하세요.
- 마크다운 없이 순수 텍스트로 반환하세요.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.warn('[gemini] getContext failed:', err.message);
    return getFallbackContext(questionId);
  }
}

// After R-initial: detect which question groups can be skipped.
// Returns { skip: string[], reason: string }
async function detectSkips(initialText) {
  const model = getModel();
  if (!model) return { skip: [], reason: 'Gemini unavailable' };

  const prompt = `사용자가 만들고 싶은 LLM 파이프라인을 다음과 같이 설명했습니다:

"${initialText}"

아래 질문 그룹 중 이미 명확하게 답변된 것을 판단하세요:
- A1: Goal (목적), Domain (도메인), I/O format (입출력 형식) — 세 항목 모두 명확해야 스킵 가능
- A2: Scale (규모), Constraints (기술 제약), Priority (우선순위) — 세 항목 모두 명확해야 스킵 가능
- A3: Scope (v1 필수 기능 목록) — 구체적인 기능이 명시되어야 스킵 가능

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"skip": ["A1", "A2"], "reason": "스킵 이유 한 문장"}

스킵할 그룹이 없으면: {"skip": [], "reason": "추가 정보가 필요합니다"}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Extract JSON from response (handle possible markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { skip: [], reason: 'Could not parse skip response' };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('[gemini] detectSkips failed:', err.message);
    return { skip: [], reason: 'Gemini unavailable' };
  }
}

function getFallbackContext(questionId) {
  const fallbacks = {
    'R-A1-goal': '좋아요! 몇 가지 기본 정보를 확인할게요.',
    'R-A2-scale': '목표와 도메인이 확인됐어요. 이제 규모와 제약 조건을 파악할게요.',
    'R-A3-scope': '거의 다 왔어요! v1에 꼭 필요한 기능을 선택해주세요.',
    'R-step3': '지금까지 말씀하신 내용을 정리했어요. 확인해주세요.',
    'P-A-approach': 'Research Phase가 완료됐어요. 이제 PRD를 작성할게요. 기술적 접근 방식을 선택해주세요.',
    'P-B1-title': '접근 방식이 선택됐어요. 프로젝트 제목과 설명을 확인해주세요.',
    'P-B2-requirements': '시나리오가 확인됐어요. 이제 구체적인 요구사항을 정의할게요.',
    'P-B3': 'PRD 작성이 완료됐어요. 최종 검토 후 Data Phase로 넘어갈게요.',
    'D-strategy': 'PRD Phase가 완료됐어요. 이제 데이터 전략을 선택해주세요.',
    'D-dataset': '데이터를 검색했어요. 사용할 데이터셋을 선택해주세요.',
    'D-synthesis-strategy': '합성 데이터 생성 계획을 수립했어요. 전략을 확인해주세요.',
    'D-sample': '샘플 데이터를 생성했어요. 검토해주세요.',
    'D-final': '데이터셋 생성이 완료됐어요. 최종 확인해주세요.',
    'W-env': 'Data Phase가 완료됐어요! 마지막으로 환경 설정을 확인해주세요.',
  };
  return fallbacks[questionId] || '다음 단계로 진행할게요.';
}

// Analyzes the last answer, extracts field values, and generates the next question.
// phaseNum: integer 0-3
// collected: current collected fields object
// history: full history array (will use last 10 entries internally)
// lastAnswer: the most recent user answer string
// Returns the question object, or a fallback if Gemini is unavailable.
async function analyzeAndGenerate(phaseNum, collected, history, lastAnswer) {
  const { getPhaseSchema, HARD_GATE_FIELD_NAMES } = require('./schema');
  const schema = getPhaseSchema(phaseNum);
  if (!schema) return getFallbackQuestion(phaseNum, collected, []);

  const remainingFields = schema.fields.filter(f => !collected[f]);

  const model = getModel();
  if (!model) return getFallbackQuestion(phaseNum, collected, remainingFields);

  const collectedSummary = Object.entries(collected)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n') || '  (없음)';

  const recentHistory = history
    .slice(-10)
    .map(h => `[${h.role}] ${h.content}`)
    .join('\n') || '(없음)';

  const prompt = `당신은 MEGA 파이프라인 시뮬레이터의 질문 생성 엔진입니다.

현재 Phase: ${phaseNum} (${schema.name})
이 Phase에서 수집해야 할 필드: ${schema.fields.join(', ') || '(없음)'}
아직 비어있는 필드: ${remainingFields.join(', ') || '(없음)'}

지금까지 수집된 정보:
${collectedSummary}

최근 대화:
${recentHistory}

마지막 사용자 답변: "${lastAnswer}"

━━━ 작업 ━━━
1. 마지막 답변에서 아직 비어있는 필드에 해당하는 정보를 추출하세요.
   - 이미 값이 있는 필드는 절대 덮어쓰지 마세요.
2. 아직 비어있는 필드가 있으면 가장 중요한 하나에 대한 질문을 생성하세요.
3. 모든 필드가 채워졌으면 fieldsComplete: true를 반환하고 question: ""으로 두세요.

━━━ 절대 금지 ━━━
다음 hard gate 필드에 대한 질문을 생성하지 마세요:
${HARD_GATE_FIELD_NAMES.join(', ')}
이 필드들은 서버가 직접 처리합니다.

━━━ 응답 형식 ━━━
아래 JSON만 반환하세요 (다른 텍스트 없이):
{
  "extractedFields": { "fieldName": "추출된 값" },
  "remainingFields": ["아직 비어있는 필드명"],
  "fieldsComplete": false,
  "question": "다음 질문 텍스트 (fieldsComplete=true면 빈 문자열)",
  "type": "card",
  "header": "짧은 헤더 (2-4글자)",
  "options": [
    { "label": "선택지 레이블", "description": "설명", "recommended": false }
  ],
  "collectsTo": "이 질문이 채우는 필드명",
  "contextMessage": "1-2문장의 한국어 전환 메시지"
}

type이 "open"이면 options는 빈 배열로 두세요.
type은 반드시 "card" 또는 "open" 중 하나입니다.
options는 card일 때 2-4개가 적당합니다.
collectsTo는 반드시 remainingFields 중 하나여야 합니다.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return getFallbackQuestion(phaseNum, collected, remainingFields);

    const parsed = JSON.parse(jsonMatch[0]);

    // Server-side validation: collectsTo must be a known field
    if (parsed.collectsTo && !schema.fields.includes(parsed.collectsTo)) {
      parsed.collectsTo = null;
    }

    return parsed;
  } catch (err) {
    console.warn('[gemini] analyzeAndGenerate failed:', err.message);
    return getFallbackQuestion(phaseNum, collected, remainingFields);
  }
}

function getFallbackQuestion(phaseNum, collected, remainingFields) {
  const { getPhaseSchema } = require('./schema');
  const schema = getPhaseSchema(phaseNum);
  const missing = remainingFields && remainingFields.length > 0
    ? remainingFields
    : (schema ? schema.fields.filter(f => !collected[f]) : []);

  if (missing.length === 0) {
    return { extractedFields: {}, remainingFields: [], fieldsComplete: true, question: '', type: 'open', options: [], collectsTo: null, contextMessage: '정보 수집이 완료됐습니다.' };
  }

  const fieldLabels = {
    goal: '목표', domain: '도메인', io: '입출력 형식', scale: '처리 규모',
    constraints: '기술 제약', priority: '품질 우선순위', scope: 'v1 필수 기능',
    approach: '기술 접근법', dataStrategy: '데이터 전략',
  };
  const next = missing[0];
  return {
    extractedFields: {},
    remainingFields: missing,
    fieldsComplete: false,
    question: `${fieldLabels[next] || next}에 대해 알려주세요.`,
    type: 'open',
    header: fieldLabels[next] || next,
    options: [],
    collectsTo: next,
    contextMessage: 'Gemini를 사용할 수 없어 기본 질문을 표시합니다.',
  };
}

module.exports = { getContext, detectSkips, analyzeAndGenerate };
