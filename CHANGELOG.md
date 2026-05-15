# Changelog

## [2.0.0] - 2026-05-15

### Added
- Extension ON/OFF 토글 (툴바 팝업 + 옵션 페이지)
- 번역 대상 언어 선택 (FR / EN / KO / JP)
- 브라우저 언어 자동 감지 — 해당 언어 버튼 비활성 표시
- Google Translate API 언어 자동 감지 (`source` 제거 → API 자동 감지)
- 감지 언어 = 타겟 언어인 경우 팝업 미표시
- 팝업 헤더에 `[감지언어 → 타겟언어]` 배지 표시
- 단어 카드 로컬 저장 (`chrome.storage.local`, 최대 500개)
- 옵션 페이지 2탭 구조 (설정 / 단어장)
- 단어장 탭: 언어별 좌측 탭, 카드 목록, 삭제 기능
- Sheets 내보내기: 언어별 시트(FR/EN/KO/JP)에 append
- 툴바 팝업 (`popup.html`) 추가
- 브라우저 언어 충돌 시 자동 대체 언어 선택

### Changed
- 드래그 팝업 버튼: "확인" → "카드 저장"
- 번역 섹션 라벨: "단어장 추가" → "주요 단어"
- `background.js`: `source: 'en'` 제거 (자동 감지), 단어별 번역 시 감지된 원문 언어 고정
- 카드 저장 날짜 형식: locale string → ISO 8601 (`YYYY-MM-DD`)

## [1.0.0] - 2026-05-14

### Added
- 드래그 텍스트 영어 → 한국어 번역
- 주요 키워드 추출 및 번역 (최대 5개)
- Google Sheets 저장 (Sheet1)
- Shadow DOM 팝업 렌더링
- 옵션 페이지 (API 키, Spreadsheet ID, OAuth)
