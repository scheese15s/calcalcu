// DOM 요소 참조 (재사용을 위해 상단에서 한 번만 가져옴)
const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const previewWrapper = document.querySelector(".preview");
const resetBtn = document.getElementById("resetBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const statusText = document.getElementById("statusText");
const resultCard = document.getElementById("resultCard");
// ?debug가 있으면 에러 메시지에 상세 정보를 표시
const isDebug = new URLSearchParams(window.location.search).has("debug");

// 결과 카드 UI를 렌더링하는 커스텀 엘리먼트
class CalorieResult extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: white;
          border-radius: 22px;
          padding: 24px;
          box-shadow: 0 18px 40px rgba(30, 25, 35, 0.16);
          animation: rise 0.45s ease;
        }
        h3 {
          margin: 0 0 16px;
          font-family: "Source Sans 3", system-ui, -apple-system, sans-serif;
          font-size: 1.5rem;
        }
        .grid {
          display: grid;
          gap: 16px;
        }
        .summary {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        .pill {
          padding: 12px 16px;
          border-radius: 14px;
          background: rgba(255, 214, 170, 0.4);
          font-weight: 600;
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 10px;
        }
        li {
          display: flex;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(240, 244, 255, 0.7);
          font-weight: 600;
        }
        .muted {
          color: #5d5b66;
          font-weight: 600;
        }
        @keyframes rise {
          from {
            transform: translateY(8px);
            opacity: 0.6;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      </style>
      <div class="grid">
        <div>
          <h3>추정 결과</h3>
          <div class="summary" id="summary"></div>
        </div>
        <div>
          <div class="muted">음식별 상세</div>
          <ul id="items"></ul>
        </div>
        <div class="muted" id="notes"></div>
      </div>
    `;
  }

  // 서버 응답 데이터를 받아 카드 내용을 구성
  set data(payload) {
    if (!payload) {
      return;
    }

    const summaryEl = this.shadowRoot.getElementById("summary");
    const itemsEl = this.shadowRoot.getElementById("items");
    const notesEl = this.shadowRoot.getElementById("notes");

    // 이전 내용을 초기화
    summaryEl.innerHTML = "";
    itemsEl.innerHTML = "";

    const confidence = typeof payload.confidence === "number"
      ? `${Math.round(payload.confidence * 100)}%`
      : "알 수 없음";

    // 탄단지 정보는 없을 수 있으므로 기본값 처리
    const macros = payload.macros || {};
    const summaryItems = [
      `총 kcal: ${formatNumber(payload.total_kcal)} kcal`,
      `탄수화물: ${formatNumber(macros.carbs_g)} g`,
      `단백질: ${formatNumber(macros.protein_g)} g`,
      `지방: ${formatNumber(macros.fat_g)} g`,
      `신뢰도: ${confidence}`,
    ];

    // 요약 정보를 pill 형태로 표시
    summaryItems.forEach((text) => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = text;
      summaryEl.appendChild(pill);
    });

    // 음식 아이템 목록 렌더링
    (payload.items || []).forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${item.name || "이름 없음"} (${formatNumber(item.estimated_grams)} g)</span>
        <span>${formatNumber(item.kcal)} kcal</span>
      `;
      itemsEl.appendChild(li);
    });

    // 추가 메모 표시
    notesEl.textContent = payload.notes ? `메모: ${payload.notes}` : "메모: 없음";
  }
}

// 커스텀 엘리먼트 등록
customElements.define("calorie-result", CalorieResult);

// 상태 텍스트 업데이트
const setStatus = (text) => {
  statusText.textContent = text;
};

// 로딩 표시 및 버튼 비활성화 처리
const setLoading = (isLoading) => {
  loadingEl.hidden = !isLoading;
  analyzeBtn.disabled = isLoading || !imageInput.files?.length;
};

// 에러 메시지 표시/숨김
const setError = (message) => {
  errorEl.textContent = message;
  errorEl.hidden = !message;
};

// 화면 초기화
const resetAll = () => {
  imageInput.value = "";
  previewImage.src = "";
  previewWrapper.classList.remove("has-image");
  analyzeBtn.disabled = true;
  resultCard.hidden = true;
  setError("");
  setStatus("준비 완료");
};

// 숫자 포맷 (정수 표시)
const formatNumber = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(0);
};

// 파일 선택 시 미리보기 업데이트
const updatePreview = (file) => {
  if (!file) {
    resetAll();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    previewImage.src = reader.result;
    previewWrapper.classList.add("has-image");
  };
  reader.readAsDataURL(file);
};

// 이미지 분석 요청
const analyzeImage = async () => {
  const file = imageInput.files?.[0];
  if (!file) {
    setError("사진을 먼저 선택해주세요.");
    return;
  }

  setLoading(true);
  setError("");
  setStatus("AI 분석 중");
  resultCard.hidden = true;

  try {
    const formData = new FormData();
    formData.append("image", file);

    // 서버에 이미지 전송
    const response = await fetch("/ocr", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => null);

    // 서버 응답이 에러인 경우 처리
    if (!response.ok) {
      const baseMessage = payload?.error?.message || "분석에 실패했습니다. 잠시 후 다시 시도해주세요.";
      if (isDebug && payload?.error) {
        const { code, stage, details } = payload.error;
        const detailText =
          details && typeof details === "object" ? JSON.stringify(details) : details || "";
        const debugInfo = [code && `code=${code}`, stage && `stage=${stage}`, detailText]
          .filter(Boolean)
          .join(" | ");
        throw new Error(debugInfo ? `${baseMessage} (${debugInfo})` : baseMessage);
      }
      throw new Error(baseMessage);
    }

    // 성공 시 결과 카드에 데이터 주입
    resultCard.data = payload;
    resultCard.hidden = false;
    setStatus("분석 완료");
  } catch (error) {
    // 사용자에게 에러 메시지 표시
    setError(error.message);
    setStatus("오류 발생");
  } finally {
    // 항상 로딩 종료
    setLoading(false);
  }
};

// 파일 선택 이벤트
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  updatePreview(file);
  analyzeBtn.disabled = !file;
  setStatus(file ? "사진 선택됨" : "준비 완료");
});

// 버튼 이벤트 바인딩
resetBtn.addEventListener("click", resetAll);
analyzeBtn.addEventListener("click", analyzeImage);

// 초기 상태 설정
resetAll();
