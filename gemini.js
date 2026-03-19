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

module.exports = { getContext, detectSkips };
