const jsonResponse = (payload, status = 200, headers = {}) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
};

const errorResponse = (message, code, status, stage, details) => {
  const payload = { error: { message, code, stage } };
  if (details) {
    payload.error.details = details;
  }
  return jsonResponse(payload, status);
};

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

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env?.GEMINI_API_KEY) {
    return errorResponse(
      "서버에 GEMINI_API_KEY가 설정되지 않았습니다.",
      "missing_api_key",
      500,
      "env_check",
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (error) {
    return errorResponse(
      "이미지 업로드 형식이 올바르지 않습니다.",
      "invalid_form",
      400,
      "parse_form",
      error?.message,
    );
  }

  const imageFile = formData.get("image");
  if (!imageFile || typeof imageFile.arrayBuffer !== "function") {
    return errorResponse(
      "이미지 파일을 찾아볼 수 없습니다.",
      "missing_image",
      400,
      "get_image",
    );
  }

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

  const model = env?.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const apiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

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
    return errorResponse(
      "AI 서버에 연결할 수 없습니다.",
      "upstream_unreachable",
      502,
      "call_upstream",
      error?.message,
    );
  }

  if (!geminiResponse.ok) {
    const status = geminiResponse.status;
    const detail = await geminiResponse.json().catch(() => null);
    const message =
      status === 429
        ? "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        : detail?.error?.message || "AI 분석에 실패했습니다.";
    return errorResponse(message, "upstream_error", status, "upstream_response", {
      status,
      upstream: detail?.error || detail,
    });
  }

  let geminiPayload;
  try {
    geminiPayload = await geminiResponse.json();
  } catch (error) {
    return errorResponse(
      "AI 응답을 해석할 수 없습니다.",
      "invalid_ai_response",
      502,
      "parse_upstream_json",
      error?.message,
    );
  }

  const text = geminiPayload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return errorResponse(
      "AI 응답을 해석할 수 없습니다.",
      "invalid_ai_response",
      502,
      "extract_text",
      geminiPayload,
    );
  }

  try {
    const parsed = JSON.parse(text);
    return jsonResponse(parsed);
  } catch (error) {
    return errorResponse(
      "AI가 JSON 형식으로 응답하지 않았습니다.",
      "invalid_json",
      502,
      "parse_ai_json",
      error?.message,
    );
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return jsonResponse(
      { error: { message: "허용되지 않은 요청입니다.", code: "method_not_allowed" } },
      405,
    );
  }
  return onRequestPost(context);
}
