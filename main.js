const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const previewWrapper = document.querySelector(".preview");
const resetBtn = document.getElementById("resetBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const statusText = document.getElementById("statusText");
const resultCard = document.getElementById("resultCard");

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

  set data(payload) {
    if (!payload) {
      return;
    }

    const summaryEl = this.shadowRoot.getElementById("summary");
    const itemsEl = this.shadowRoot.getElementById("items");
    const notesEl = this.shadowRoot.getElementById("notes");

    summaryEl.innerHTML = "";
    itemsEl.innerHTML = "";

    const confidence = typeof payload.confidence === "number"
      ? `${Math.round(payload.confidence * 100)}%`
      : "알 수 없음";

    const macros = payload.macros || {};
    const summaryItems = [
      `총 kcal: ${formatNumber(payload.total_kcal)} kcal`,
      `탄수화물: ${formatNumber(macros.carbs_g)} g`,
      `단백질: ${formatNumber(macros.protein_g)} g`,
      `지방: ${formatNumber(macros.fat_g)} g`,
      `신뢰도: ${confidence}`,
    ];

    summaryItems.forEach((text) => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = text;
      summaryEl.appendChild(pill);
    });

    (payload.items || []).forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${item.name || "이름 없음"} (${formatNumber(item.estimated_grams)} g)</span>
        <span>${formatNumber(item.kcal)} kcal</span>
      `;
      itemsEl.appendChild(li);
    });

    notesEl.textContent = payload.notes ? `메모: ${payload.notes}` : "메모: 없음";
  }
}

customElements.define("calorie-result", CalorieResult);

const setStatus = (text) => {
  statusText.textContent = text;
};

const setLoading = (isLoading) => {
  loadingEl.hidden = !isLoading;
  analyzeBtn.disabled = isLoading || !imageInput.files?.length;
};

const setError = (message) => {
  errorEl.textContent = message;
  errorEl.hidden = !message;
};

const resetAll = () => {
  imageInput.value = "";
  previewImage.src = "";
  previewWrapper.classList.remove("has-image");
  analyzeBtn.disabled = true;
  resultCard.hidden = true;
  setError("");
  setStatus("준비 완료");
};

const formatNumber = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(0);
};

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

    const response = await fetch("/ocr", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error?.message || "분석에 실패했습니다. 잠시 후 다시 시도해주세요.";
      throw new Error(message);
    }

    resultCard.data = payload;
    resultCard.hidden = false;
    setStatus("분석 완료");
  } catch (error) {
    setError(error.message);
    setStatus("오류 발생");
  } finally {
    setLoading(false);
  }
};

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  updatePreview(file);
  analyzeBtn.disabled = !file;
  setStatus(file ? "사진 선택됨" : "준비 완료");
});

resetBtn.addEventListener("click", resetAll);
analyzeBtn.addEventListener("click", analyzeImage);

resetAll();
