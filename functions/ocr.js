// AI EDIT NOTE:
// 앞으로 이 파일을 수정할 때마다 초보자도 이해할 수 있도록
// 주요 섹션/블록에 설명 주석을 자세히 추가·유지하세요.
// 공통 JSON 응답 헬퍼
const jsonResponse = (payload, status = 200, headers = {}) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
};

// 표준 에러 포맷으로 응답
const errorResponse = (message, code, status) => {
  const payload = { error: { message, code } };
  return jsonResponse(payload, status);
};

// 업로드된 파일을 base64 문자열로 변환
const toBase64 = async (file) => {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

// 응답 텍스트에 불필요한 문장이 섞였을 때 JSON 부분만 추출 시도
const normalizeJsonText = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
};

export async function onRequestPost(context) {
  const { request, env } = context;

  // 환경변수 검사
  if (!env?.GEMINI_API_KEY) {
    return errorResponse("서버에 GEMINI_API_KEY가 설정되지 않았습니다.", "missing_api_key", 500);
  }

  // multipart/form-data 파싱
  let formData;
  try {
    formData = await request.formData();
  } catch (error) {
    return errorResponse("이미지 업로드 형식이 올바르지 않습니다.", "invalid_form", 400);
  }

  // 이미지 파일 추출
  const imageFile = formData.get("image");
  if (!imageFile || typeof imageFile.arrayBuffer !== "function") {
    return errorResponse("이미지 파일을 찾아볼 수 없습니다.", "missing_image", 400);
  }

  // Gemini에 전달할 프롬프트 구성
  const base64Image = await toBase64(imageFile);
  const prompt = [
    "음식 사진을 보고 엄격한 JSON만 반환하세요.",
    "아래 스키마를 엄격히 따르세요.",
    "items 배열에는 음식 이름, 대략 g, kcal를 포함하세요.",
    "total_kcal, macros(탄수/단백질/지방 g), confidence(0-1), notes를 포함하세요.",
    "불확실하면 confidence를 낮추고 notes에 이유를 작성하세요.",
    "설명문, 마크다운, 추가 텍스트는 금지됩니다. JSON만 출력하세요.",
    "스키마 예시:",
    "{\"items\":[{\"name\":\"김치볶음밥\",\"estimated_grams\":250,\"kcal\":420}],\"total_kcal\":420,\"macros\":{\"carbs_g\":55,\"protein_g\":12,\"fat_g\":14},\"confidence\":0.62,\"notes\":\"대략 추정치\"}",
  ].join("\n");

  // 사용할 모델 (환경변수 우선, 없으면 기본값)
  const model = env?.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const apiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  // Gemini API 호출
  let geminiResponse;
  try {
    geminiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: imageFile.type || "image/jpeg",
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (error) {
    return errorResponse("AI 서버에 연결할 수 없습니다.", "upstream_unreachable", 502);
  }

  // 상위 API 에러 처리
  if (!geminiResponse.ok) {
    const status = geminiResponse.status;
    const detail = await geminiResponse.json().catch(() => null);
    const message =
      status === 429
        ? "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        : detail?.error?.message || "AI 분석에 실패했습니다.";
    return errorResponse(message, "upstream_error", status);
  }

  // 상위 API 응답 JSON 파싱
  let geminiPayload;
  try {
    geminiPayload = await geminiResponse.json();
  } catch (error) {
    return errorResponse("AI 응답을 해석할 수 없습니다.", "invalid_ai_response", 502);
  }

  // 모델 응답 텍스트 추출
  const text = geminiPayload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return errorResponse("AI 응답을 해석할 수 없습니다.", "invalid_ai_response", 502);
  }

  try {
    const normalized = normalizeJsonText(text);
    const parsed = JSON.parse(normalized);
    return jsonResponse(parsed);
  } catch (error) {
    return errorResponse("AI가 JSON 형식으로 응답하지 않았습니다.", "invalid_json", 502);
  }
}

export async function onRequest(context) {
  // POST 외 요청은 거부
  if (context.request.method !== "POST") {
    return jsonResponse(
      { error: { message: "허용되지 않은 요청입니다.", code: "method_not_allowed" } },
      405,
    );
  }
  return onRequestPost(context);
}
