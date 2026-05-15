# Vocab Saver v2 — Design Spec
Date: 2026-05-15

## Overview

Vocab Saver Chrome Extension에 6가지 신규 기능을 추가한다. 기존 파일 구조를 최대한 유지하면서 `popup.html/js` 추가, `options.html/js` 탭 확장, `background.js`/`content.js` 수정으로 구현한다.

---

## Features

### 1. Extension ON/OFF 토글
- 툴바 popup (`popup.html`) 과 옵션 페이지 상단 양쪽에서 토글 가능
- `chrome.storage.local`의 `extensionEnabled` (boolean, 기본값 `true`) 로 상태 관리
- OFF 상태에서는 `content.js`가 드래그 이벤트를 무시하여 팝업을 표시하지 않음

### 2. 언어 선택 (4개)
- 지원 언어: 프랑스어(FR), 영어(EN), 한국어(KO), 일본어(JP)
- `chrome.storage.local`의 `targetLang` (`fr` | `en` | `ko` | `ja`) 으로 저장
- Popup에서 버튼 형태로 선택; 브라우저 언어(`navigator.language`)에 해당하는 버튼은 비활성(회색)

### 3. 언어 자동 감지 + 번역
- Google Translate API `source: auto` 로 드래그 텍스트 언어 자동 감지
- 감지 언어 = 타겟 언어인 경우 팝업을 표시하지 않음
- 팝업 헤더에 `[감지언어 → 타겟언어]` 표시 (예: `FR → KO`)
- 브라우저 언어는 설정에서 타겟 선택 불가로 UX 유도 (선택 자체는 막지 않음)

### 4. 팝업 UI 간소화
- 표시 내용: 전체 번역 + 주요 단어 (word → meaning + 예문)
- 기존 "단어장 추가" 라벨 제거, "카드 저장" / "닫기" 버튼으로 교체
- 주요 단어는 최대 5개, 4글자 이상, stop words 제외 (기존 로직 유지)

### 5. 단어 카드 저장
- [카드 저장] 클릭 시 `chrome.storage.local`의 `wordCards` 배열에 저장
- 카드 구조:
  ```json
  {
    "id": "uuid-v4-like-timestamp",
    "lang": "fr",
    "translation": "전체 번역 텍스트",
    "words": [{ "word": "...", "meaning": "...", "sentence": "..." }],
    "date": "2026-05-15"
  }
  ```
- 저장 성공 시 버튼 "저장 완료 ✓" 표시 후 1.5초 뒤 팝업 닫힘

### 6. 단어장 뷰 (옵션 페이지)
- 옵션 페이지에 상단 탭 추가: **⚙ 설정** / **📖 단어장**
- 단어장 탭 레이아웃:
  - 좌측 언어 탭: FR / EN / KO / JP (저장된 카드 수 표시)
  - 우측 카드 목록: 언어별 필터링된 카드 카드뷰
  - 각 카드: 전체 번역, 주요 단어 목록, 날짜, [삭제] 버튼
  - 하단: [Sheets로 내보내기] 버튼
- [Sheets로 내보내기]: 선택 언어의 카드를 `background.js`를 통해 해당 언어명 시트(예: `FR`)에 append

---

## File Changes

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `manifest.json` | 수정 | `action.default_popup` 추가 |
| `popup.html` | 신규 | ON/OFF 토글 + 언어 선택 버튼 |
| `popup.js` | 신규 | 토글/언어 상태 읽기·쓰기 |
| `background.js` | 수정 | `source: auto` 언어 감지, Sheets 내보내기(언어별 시트) |
| `content.js` | 수정 | ON/OFF 체크, 카드 저장 로직, 팝업 UI 수정 |
| `content.css` | 수정 | 카드 저장 버튼 스타일 |
| `options.html` | 수정 | 상단 탭(설정/단어장), 단어장 레이아웃 |
| `options.js` | 수정 | 탭 전환, 언어 탭, 카드 렌더링, 삭제, 내보내기 |
| `CHANGELOG.md` | 신규 | 변경 이력 관리 |

---

## Data Model

```
chrome.storage.local:
  extensionEnabled: boolean          // 기본: true
  targetLang: "fr"|"en"|"ko"|"ja"   // 기본: "en"
  googleTranslateApiKey: string
  spreadsheetId: string
  wordCards: Card[]                  // 단어 카드 배열
```

---

## Architecture

```
[드래그] → content.js
  → extensionEnabled 체크 (OFF면 중단)
  → background.js: translate(text, targetLang)
    → Google Translate API (source:auto, target:targetLang)
    → 감지언어 == targetLang? → 중단
    → 단어별 번역 (기존 로직)
    → return { detectedLang, translation, words }
  → content.js: showResult() 팝업 표시
  → [카드 저장] 클릭 → chrome.storage.local에 직접 저장

[옵션 페이지 단어장 탭]
  → chrome.storage.local.wordCards 읽기
  → 언어 탭 선택 → 필터링 렌더링
  → [삭제] → storage에서 제거
  → [Sheets 내보내기] → background.js: exportToSheets(lang, cards)
    → Google Sheets API: 언어명 시트에 append
```

---

## Out of Scope
- 단어 카드 편집 기능
- 단어 카드 검색/정렬
- 다크모드
- 5개 이상의 주요 단어
