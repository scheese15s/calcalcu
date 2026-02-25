# Blueprint

## Overview
CalCalcu는 음식 사진을 업로드하면 AI가 음식 종류, 대략 중량, 칼로리 및 탄단지를 추정해 카드 UI로 보여주는 웹앱이다. 서버에서만 Gemini API 키를 사용하며, 프론트는 `/ocr` 엔드포인트만 호출한다.

## Current Implementation
- UI
- Hero 섹션, 업로드 패널, 미리보기, 로딩/에러 영역, 결과 카드와 경고 문구로 구성.
- 사진 촬영/업로드, 재선택, 분석 시작 버튼 제공.
- 결과 카드에 items, total kcal, macros, confidence, notes 표시.
- 로딩 스피너와 사용자 친화적 에러 메시지 표시.
- 디자인은 그라디언트 배경, 명확한 카드/버튼 스타일, 애니메이션을 포함.
- 접근성 고려: 명확한 상태 텍스트, 대체 텍스트, 대비 확보.
- 프론트 로직
- 이미지 선택 시 미리보기 표시 및 분석 버튼 활성화.
- `/ocr`로 multipart/form-data POST 요청 전송.
- 응답 JSON을 카드에 렌더링하고 실패 시 에러 메시지 표시.
- 서버 로직
- `functions/ocr.js`에서 multipart/form-data를 받아 이미지 처리.
- `context.env.GEMINI_API_KEY`로 Gemini Vision 호출.
- AI 결과를 JSON으로 파싱해 반환.
- 에러는 JSON으로 통일.

## Current Plan
- 프론트 UI/UX를 음식 칼로리 추정 흐름에 맞게 구성.
- `/ocr` 서버 엔드포인트 구현 및 Gemini 호출 연결.
- 로딩/에러/결과 렌더링 로직을 추가하고 경고 문구 표시.
