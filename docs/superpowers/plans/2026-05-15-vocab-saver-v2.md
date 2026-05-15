# Vocab Saver v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vocab Saver Chrome Extension에 ON/OFF 토글, 다국어(FR/EN/KO/JP) 선택, 언어 자동 감지, 단어 카드 로컬 저장, 옵션 페이지 단어장 뷰를 추가한다.

**Architecture:** 기존 파일 구조를 유지하면서 `popup.html/js` 추가, `options.html/js` 탭 확장, `background.js`/`content.js` 수정으로 구현한다. 단어 카드는 `chrome.storage.local`의 `wordCards` 배열에 저장하며, Sheets 내보내기는 언어별 시트(FR/EN/KO/JP)에 append한다.

**Tech Stack:** Chrome Extension Manifest V3, Vanilla JS, Google Translate API v2 (source auto-detect), Google Sheets API v4, chrome.storage.local

---

## File Map

| 파일 | 변경 | 역할 |
|------|------|------|
| `manifest.json` | 수정 | `action.default_popup` 추가 |
| `popup.html` | 신규 | ON/OFF 토글 + 언어 선택 버튼 UI |
| `popup.js` | 신규 | 토글/언어 상태 읽기·쓰기, 브라우저 언어 감지 |
| `background.js` | 수정 | `source` 제거(auto-detect), `detectedSourceLanguage` 반환, `exportToSheets` 추가 |
| `content.js` | 수정 | ON/OFF 체크, targetLang 전달, skip 처리, 카드 저장, UI 업데이트 |
| `options.html` | 수정 | 상단 탭(설정/단어장), 단어장 탭 레이아웃 |
| `options.js` | 수정 | 탭 전환, ON/OFF 토글, 언어 탭, 카드 렌더링, 삭제, Sheets 내보내기 |
| `CHANGELOG.md` | 신규 | 변경 이력 |

---

## Task 1: manifest.json + popup.html + popup.js

**Files:**
- Modify: `manifest.json`
- Create: `popup.html`
- Create: `popup.js`

- [ ] **Step 1: manifest.json에 popup 추가**

`manifest.json`의 `action` 블록을 다음으로 교체:

```json
"action": {
  "default_title": "Vocab Saver",
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png"
  }
}
```

- [ ] **Step 2: popup.html 생성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      width: 220px;
      padding: 16px;
      color: #1e293b;
      background: #ffffff;
    }
    .header { font-size: 14px; font-weight: 700; margin-bottom: 16px; }
    .row {
      display: flex; align-items: center;
      justify-content: space-between; margin-bottom: 14px;
    }
    .label { font-size: 12px; font-weight: 500; color: #475569; }
    .toggle { position: relative; width: 40px; height: 22px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #cbd5e1; border-radius: 22px; transition: 0.2s;
    }
    .slider:before {
      position: absolute; content: "";
      height: 16px; width: 16px; left: 3px; bottom: 3px;
      background: white; border-radius: 50%; transition: 0.2s;
    }
    input:checked + .slider { background: #3b82f6; }
    input:checked + .slider:before { transform: translateX(18px); }
    .lang-buttons { display: flex; gap: 6px; margin-bottom: 8px; }
    .lang-btn {
      flex: 1; padding: 6px 0;
      border: 1.5px solid #e2e8f0; border-radius: 6px;
      font-size: 11px; font-weight: 600; cursor: pointer;
      background: #f8fafc; color: #475569; transition: all 0.15s;
    }
    .lang-btn.active { background: #3b82f6; border-color: #3b82f6; color: white; }
    .lang-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .browser-note { font-size: 10px; color: #94a3b8; margin-bottom: 14px; }
    .divider { height: 1px; background: #f1f5f9; margin-bottom: 12px; }
    .settings-link {
      font-size: 11px; color: #3b82f6; cursor: pointer;
      background: none; border: none; padding: 0; text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="header">📚 Vocab Saver</div>
  <div class="row">
    <span class="label">확장 사용</span>
    <label class="toggle">
      <input type="checkbox" id="enableToggle">
      <span class="slider"></span>
    </label>
  </div>
  <div class="label" style="margin-bottom:8px;">번역 대상 언어</div>
  <div class="lang-buttons">
    <button class="lang-btn" data-lang="fr">FR</button>
    <button class="lang-btn" data-lang="en">EN</button>
    <button class="lang-btn" data-lang="ko">KO</button>
    <button class="lang-btn" data-lang="ja">JP</button>
  </div>
  <div class="browser-note" id="browserNote"></div>
  <div class="divider"></div>
  <button class="settings-link" id="openSettings">⚙ 설정 열기</button>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: popup.js 생성**

```javascript
const LANG_LABELS = { fr: 'FR', en: 'EN', ko: 'KO', ja: 'JP' };

function getBrowserLangCode() {
  const nav = navigator.language.toLowerCase().split('-')[0];
  return Object.keys(LANG_LABELS).includes(nav) ? nav : null;
}

chrome.storage.local.get(['extensionEnabled', 'targetLang'], ({ extensionEnabled, targetLang }) => {
  const enabled = extensionEnabled !== false;
  const lang = targetLang || 'en';
  const browserLang = getBrowserLangCode();

  document.getElementById('enableToggle').checked = enabled;

  document.querySelectorAll('.lang-btn').forEach(btn => {
    const l = btn.dataset.lang;
    if (l === browserLang) btn.disabled = true;
    if (l === lang) btn.classList.add('active');
  });

  if (browserLang) {
    document.getElementById('browserNote').textContent =
      `현재 브라우저 언어: ${LANG_LABELS[browserLang]}`;
  }
});

document.getElementById('enableToggle').addEventListener('change', (e) => {
  chrome.storage.local.set({ extensionEnabled: e.target.checked });
});

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chrome.storage.local.set({ targetLang: btn.dataset.lang });
  });
});

document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
```

- [ ] **Step 4: 수동 확인**

Chrome 확장 페이지(`chrome://extensions`)에서 확장 리로드 후 툴바 아이콘 클릭:
- ON/OFF 토글이 보임
- 언어 버튼 4개가 보임
- 브라우저 언어에 해당하는 버튼이 회색(비활성)
- 언어 버튼 클릭 시 파란색으로 변함
- "설정 열기" 클릭 시 options 페이지 열림

- [ ] **Step 5: 커밋**

```bash
git add manifest.json popup.html popup.js
git commit -m "feat: add popup with ON/OFF toggle and language selection"
```

---

## Task 2: background.js — 언어 자동 감지 + Sheets 내보내기

**Files:**
- Modify: `background.js`

- [ ] **Step 1: background.js 전체 교체**

```javascript
// Service Worker: Google Translate API + Google Sheets API 호출 담당

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslate(request.text, request.words, request.targetLang)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (request.action === 'saveToSheets') {
    handleSaveToSheets(request.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (request.action === 'exportToSheets') {
    handleExportToSheets(request.lang, request.cards)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleTranslate(text, words, targetLang) {
  const { googleTranslateApiKey } = await chrome.storage.local.get('googleTranslateApiKey');
  if (!googleTranslateApiKey) {
    throw new Error('Google Translate API 키가 설정되지 않았습니다. 옵션 페이지에서 입력해주세요.');
  }

  const { translatedText, detectedLang } = await translateText(text, targetLang, googleTranslateApiKey);

  if (detectedLang === targetLang) {
    return { skip: true };
  }

  const wordResults = await Promise.all(
    words.map(async (word) => {
      const { translatedText: meaning } = await translateText(word, targetLang, googleTranslateApiKey);
      const sentence = extractSentenceContaining(text, word);
      return { word, meaning, sentence };
    })
  );

  return { detectedLang, translation: translatedText, words: wordResults };
}

async function translateText(text, targetLang, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLang, format: 'text' })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `번역 API 오류 (${res.status})`);
  }
  const data = await res.json();
  const t = data.data.translations[0];
  return {
    translatedText: t.translatedText,
    detectedLang: t.detectedSourceLanguage || null
  };
}

function extractSentenceContaining(text, word) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const lower = word.toLowerCase();
  const found = sentences.find(s => s.toLowerCase().includes(lower));
  return found ? found.trim() : text.substring(0, 100).trim();
}

async function handleSaveToSheets(data) {
  const token = await getAuthToken();
  const { spreadsheetId } = await chrome.storage.local.get('spreadsheetId');
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID가 설정되지 않았습니다. 옵션 페이지에서 입력해주세요.');
  }

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  const values = data.map(({ word, meaning, sentence }) => [word, meaning, sentence, today]);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A:D:append?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Sheets API 오류 (${res.status})`);
  }

  return { success: true, count: values.length };
}

async function handleExportToSheets(lang, cards) {
  const token = await getAuthToken();
  const { spreadsheetId } = await chrome.storage.local.get('spreadsheetId');
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID가 설정되지 않았습니다. 옵션 페이지에서 입력해주세요.');
  }

  const sheetName = lang.toUpperCase();
  const values = [];
  for (const card of cards) {
    for (const w of card.words) {
      values.push([w.word, w.meaning, w.sentence, card.date || '']);
    }
  }

  if (values.length === 0) {
    throw new Error('내보낼 단어가 없습니다.');
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:D:append?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Sheets API 오류 (${res.status})`);
  }

  return { success: true, count: values.length };
}

function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}
```

- [ ] **Step 2: 수동 확인**

Chrome 확장 리로드 후 Service Worker 콘솔(`chrome://extensions` → Inspect views: service worker)에서 오류 없는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add background.js
git commit -m "feat: add language auto-detect and export to language-named sheet"
```

---

## Task 3: content.js — ON/OFF 체크, 다국어, 카드 저장

**Files:**
- Modify: `content.js`

- [ ] **Step 1: content.js 전체 교체**

```javascript
// Content Script: 텍스트 선택 감지 + Shadow DOM 팝업 렌더링

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','of','for','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','shall','can','must',
  'that','this','these','those','it','its','they','them','their','we','our',
  'you','your','he','she','his','her','i','my','me','us','not','from','by',
  'as','if','then','than','when','where','which','who','how','what','all',
  'also','more','some','other','into','about','up','out','so','just',
  'only','even','such','each','both','after','before','between','through',
  'during','without','within','along','following','across','behind','beyond'
]);

const POPUP_CSS = `
#vocab-popup {
  position: fixed;
  width: 320px;
  max-height: 480px;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #1e293b;
  box-sizing: border-box;
  z-index: 1;
}
#vocab-popup * { box-sizing: border-box; margin: 0; padding: 0; }
.vp-header {
  display: flex; align-items: center; gap: 6px;
  padding: 12px 14px 8px;
  font-weight: 600; font-size: 13px; color: #475569;
  border-bottom: 1px solid #f1f5f9;
}
.vp-icon { font-size: 14px; }
.vp-lang-badge {
  font-size: 11px; color: #94a3b8; font-weight: 400; margin-left: 2px;
}
.vp-x {
  margin-left: auto; background: none; border: none;
  cursor: pointer; color: #94a3b8; font-size: 14px; padding: 0 2px; line-height: 1;
}
.vp-x:hover { color: #475569; }
.vp-translation {
  padding: 10px 14px; font-size: 13px; color: #1e293b;
  background: #f8fafc; border-bottom: 1px solid #f1f5f9;
}
.vp-section-label {
  padding: 8px 14px 4px; font-size: 11px; font-weight: 600;
  color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;
}
.vp-words { padding: 0 14px 8px; }
.vp-word-item { padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
.vp-word-item:last-child { border-bottom: none; }
.vp-word { font-weight: 600; color: #3b82f6; }
.vp-arrow { color: #94a3b8; margin: 0 5px; }
.vp-meaning { color: #1e293b; }
.vp-sentence {
  margin-top: 3px; font-size: 11px; color: #64748b; font-style: italic;
  display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.vp-actions {
  display: flex; gap: 8px; padding: 10px 14px 12px;
  border-top: 1px solid #f1f5f9;
}
.vp-btn {
  flex: 1; padding: 7px 12px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background 0.15s; font-family: inherit;
}
.vp-btn:disabled { opacity: 0.7; cursor: default; }
.vp-confirm { background: #3b82f6; color: #ffffff; }
.vp-confirm:hover:not(:disabled) { background: #2563eb; }
.vp-close { background: #f1f5f9; color: #475569; }
.vp-close:hover { background: #e2e8f0; }
.vp-loading { padding: 20px 14px; text-align: center; color: #94a3b8; }
.vp-error { padding: 12px 14px; color: #ef4444; font-size: 12px; }
.vp-save-msg { padding: 4px 14px; font-size: 12px; }
.vp-save-error { color: #ef4444; }
`;

const host = document.createElement('div');
host.id = 'vocab-saver-host';
host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
document.documentElement.appendChild(host);

const shadow = host.attachShadow({ mode: 'open' });

const styleEl = document.createElement('style');
styleEl.textContent = POPUP_CSS;
shadow.appendChild(styleEl);

let popup = null;
let currentData = null;
let translateTimeout = null;

document.addEventListener('mouseup', onMouseUp);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') removePopup(); });
document.addEventListener('mousedown', (e) => {
  if (!popup) return;
  const path = e.composedPath();
  if (!path.includes(popup)) removePopup();
});

function onMouseUp() {
  clearTimeout(translateTimeout);
  translateTimeout = setTimeout(async () => {
    const { extensionEnabled } = await chrome.storage.local.get('extensionEnabled');
    if (extensionEnabled === false) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 10) { removePopup(); return; }

    const { targetLang = 'en' } = await chrome.storage.local.get('targetLang');
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const words = extractKeywords(text);

    showLoading(rect);

    chrome.runtime.sendMessage({ action: 'translate', text, words, targetLang }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        showError(response?.error || '번역 중 오류가 발생했습니다.', rect);
        return;
      }
      if (response?.skip) {
        removePopup();
        return;
      }
      currentData = response;
      showResult(response, rect);
    });
  }, 300);
}

function extractKeywords(text) {
  const words = text.match(/\b[a-zA-Z\u00C0-\u024F\u4E00-\u9FFF\u3040-\u30FF]+\b/g) || [];
  const seen = new Set();
  const result = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (w.length >= 4 && !STOP_WORDS.has(lower) && !seen.has(lower)) {
      seen.add(lower);
      result.push(w);
      if (result.length >= 5) break;
    }
  }
  return result;
}

function showLoading(rect) {
  removePopup();
  popup = createPopup(`<div class="vp-loading">번역 중...</div>`);
  mountAndPosition(popup, rect);
}

function showError(msg, rect) {
  removePopup();
  popup = createPopup(`
    <div class="vp-error">${escapeHtml(msg)}</div>
    <div class="vp-actions"><button class="vp-btn vp-close">닫기</button></div>
  `);
  popup.querySelector('.vp-close').addEventListener('click', removePopup);
  mountAndPosition(popup, rect);
}

function showResult({ detectedLang, translation, words }, rect) {
  const langBadge = detectedLang ? `<span class="vp-lang-badge">[${detectedLang.toUpperCase()} →]</span>` : '';
  const wordsHtml = words.length === 0 ? '' : `
    <div class="vp-section-label">주요 단어</div>
    <div class="vp-words">
      ${words.map(({ word, meaning, sentence }) => `
        <div class="vp-word-item">
          <div><span class="vp-word">${escapeHtml(word)}</span><span class="vp-arrow">→</span><span class="vp-meaning">${escapeHtml(meaning)}</span></div>
          <div class="vp-sentence">${escapeHtml(sentence)}</div>
        </div>
      `).join('')}
    </div>
  `;

  removePopup();
  popup = createPopup(`
    <div class="vp-header">
      <span class="vp-icon">📖</span> 번역 ${langBadge}
      <button class="vp-x" title="닫기">✕</button>
    </div>
    <div class="vp-translation">${escapeHtml(translation)}</div>
    ${wordsHtml}
    <div class="vp-actions">
      <button class="vp-btn vp-confirm">카드 저장</button>
      <button class="vp-btn vp-close">닫기</button>
    </div>
  `);

  popup.querySelector('.vp-x').addEventListener('click', removePopup);
  popup.querySelector('.vp-close').addEventListener('click', removePopup);
  popup.querySelector('.vp-confirm').addEventListener('click', onSaveCard);
  mountAndPosition(popup, rect);
}

async function onSaveCard() {
  if (!currentData) return;
  const btn = popup.querySelector('.vp-confirm');
  btn.textContent = '저장 중...';
  btn.disabled = true;

  try {
    await saveCard(currentData);
    btn.textContent = '저장 완료 ✓';
    btn.style.background = '#22c55e';
    setTimeout(removePopup, 1500);
  } catch (e) {
    btn.textContent = '오류';
    btn.style.background = '#ef4444';
    const msg = document.createElement('div');
    msg.className = 'vp-save-msg vp-save-error';
    msg.textContent = e.message || '저장 실패';
    popup.querySelector('.vp-actions').before(msg);
  }
}

async function saveCard({ detectedLang, translation, words }) {
  const card = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    lang: detectedLang || 'unknown',
    translation,
    words,
    date: new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    })
  };
  const { wordCards = [] } = await chrome.storage.local.get('wordCards');
  wordCards.unshift(card);
  await chrome.storage.local.set({ wordCards });
}

function createPopup(html) {
  const el = document.createElement('div');
  el.id = 'vocab-popup';
  el.style.pointerEvents = 'auto';
  el.innerHTML = html;
  return el;
}

function mountAndPosition(el, rect) {
  shadow.appendChild(el);
  const margin = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pw = el.offsetWidth || 320;
  const ph = el.offsetHeight || 180;
  let left = rect.left;
  let top = rect.bottom + margin;
  if (left + pw > vw - margin) left = vw - pw - margin;
  if (top + ph > vh - margin) top = rect.top - ph - margin;
  el.style.left = `${Math.max(margin, left)}px`;
  el.style.top = `${Math.max(margin, top)}px`;
}

function removePopup() {
  if (popup) { popup.remove(); popup = null; currentData = null; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: 수동 확인**

1. 확장 리로드 후 영어 텍스트(10자 이상) 드래그 → 팝업에 번역 + 주요 단어 표시
2. "카드 저장" 클릭 → "저장 완료 ✓" 후 팝업 닫힘
3. `chrome://extensions` → Service Worker → Application → Storage → Local에서 `wordCards` 배열 확인
4. 팝업 OFF 토글 후 드래그 → 팝업 미표시 확인

- [ ] **Step 3: 커밋**

```bash
git add content.js
git commit -m "feat: add ON/OFF check, language-aware translation, card save"
```

---

## Task 4: options.html + options.js — 2탭 구조 + 단어장 뷰

**Files:**
- Modify: `options.html`
- Modify: `options.js`

- [ ] **Step 1: options.html 전체 교체**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vocab Saver 설정</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f8fafc;
      color: #1e293b;
      min-height: 100vh;
    }

    /* 탭 네비게이션 */
    .tab-nav {
      display: flex;
      border-bottom: 2px solid #e2e8f0;
      background: #ffffff;
      padding: 0 20px;
    }
    .tab-nav button {
      padding: 14px 20px;
      border: none;
      background: none;
      font-size: 13px;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.15s;
    }
    .tab-nav button.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
      font-weight: 600;
    }

    /* 탭 패널 */
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* 설정 탭 */
    .settings-container { max-width: 520px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { font-size: 13px; color: #64748b; margin-bottom: 24px; }

    /* ON/OFF 토글 카드 */
    .toggle-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 24px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .toggle-card-label { font-size: 14px; font-weight: 600; }
    .toggle { position: relative; width: 44px; height: 24px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #cbd5e1; border-radius: 24px; transition: 0.2s;
    }
    .slider:before {
      position: absolute; content: "";
      height: 18px; width: 18px; left: 3px; bottom: 3px;
      background: white; border-radius: 50%; transition: 0.2s;
    }
    input:checked + .slider { background: #3b82f6; }
    input:checked + .slider:before { transform: translateX(20px); }

    .card {
      background: #ffffff; border: 1px solid #e2e8f0;
      border-radius: 12px; padding: 24px; margin-bottom: 20px;
    }
    .card-title {
      font-size: 14px; font-weight: 600; margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .card-title .step {
      width: 22px; height: 22px; background: #3b82f6; color: white;
      border-radius: 50%; font-size: 12px; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
    }
    label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 6px; }
    input[type="text"], input[type="password"] {
      width: 100%; padding: 9px 12px; border: 1px solid #e2e8f0;
      border-radius: 8px; font-size: 13px; color: #1e293b;
      background: #f8fafc; outline: none; transition: border-color 0.15s;
    }
    input:focus { border-color: #3b82f6; background: #ffffff; }
    .help-text { font-size: 11px; color: #94a3b8; margin-top: 5px; }
    .btn {
      padding: 9px 16px; border: none; border-radius: 8px;
      font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s;
    }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #f1f5f9; color: #475569; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-row { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
    .status { font-size: 12px; padding: 3px 8px; border-radius: 4px; }
    .status.ok { background: #dcfce7; color: #15803d; }
    .status.err { background: #fee2e2; color: #dc2626; }
    .divider { height: 1px; background: #f1f5f9; margin: 16px 0; }

    /* 단어장 탭 */
    .vocab-container {
      display: flex;
      height: calc(100vh - 50px);
    }
    .lang-tabs {
      width: 72px; flex-shrink: 0;
      background: #ffffff;
      border-right: 1px solid #e2e8f0;
      padding: 16px 0;
      display: flex; flex-direction: column; gap: 4px;
    }
    .lang-tab {
      display: flex; flex-direction: column; align-items: center;
      padding: 10px 4px; border: none; background: none;
      cursor: pointer; border-radius: 8px; margin: 0 8px;
      transition: all 0.15s;
    }
    .lang-tab .lang-code { font-size: 13px; font-weight: 700; color: #64748b; }
    .lang-tab .lang-count { font-size: 10px; color: #94a3b8; margin-top: 2px; }
    .lang-tab.active { background: #eff6ff; }
    .lang-tab.active .lang-code { color: #3b82f6; }
    .lang-tab.active .lang-count { color: #3b82f6; }

    .cards-panel {
      flex: 1; overflow-y: auto; padding: 20px;
      background: #f8fafc;
    }
    .cards-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .cards-title { font-size: 14px; font-weight: 600; }
    .btn-export {
      padding: 7px 14px; background: #3b82f6; color: white;
      border: none; border-radius: 8px; font-size: 12px;
      font-weight: 500; cursor: pointer; transition: background 0.15s;
    }
    .btn-export:hover { background: #2563eb; }
    .btn-export:disabled { opacity: 0.6; cursor: default; }

    .word-card {
      background: #ffffff; border: 1px solid #e2e8f0;
      border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
    }
    .word-card-header {
      display: flex; justify-content: space-between;
      align-items: flex-start; margin-bottom: 8px;
    }
    .word-card-translation {
      font-size: 13px; color: #1e293b; flex: 1; margin-right: 8px;
    }
    .word-card-date { font-size: 11px; color: #94a3b8; white-space: nowrap; }
    .word-card-words { margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; }
    .word-entry { font-size: 12px; margin-bottom: 4px; }
    .word-entry .w { font-weight: 600; color: #3b82f6; }
    .word-entry .arr { color: #94a3b8; margin: 0 4px; }
    .word-entry .m { color: #1e293b; }
    .word-entry .s { font-size: 11px; color: #64748b; font-style: italic; display: block; margin-top: 1px; }
    .btn-delete {
      padding: 3px 8px; background: #fee2e2; color: #dc2626;
      border: none; border-radius: 6px; font-size: 11px;
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
      transition: background 0.15s;
    }
    .btn-delete:hover { background: #fecaca; }
    .empty-state {
      text-align: center; padding: 60px 20px; color: #94a3b8;
    }
    .empty-state .emoji { font-size: 36px; margin-bottom: 12px; }
    .export-status {
      font-size: 12px; padding: 6px 12px; border-radius: 6px;
      margin-top: 8px; display: none;
    }
    .export-status.ok { background: #dcfce7; color: #15803d; display: block; }
    .export-status.err { background: #fee2e2; color: #dc2626; display: block; }
  </style>
</head>
<body>

  <!-- 탭 네비게이션 -->
  <nav class="tab-nav">
    <button class="active" data-tab="settings">⚙ 설정</button>
    <button data-tab="vocab">📖 단어장</button>
  </nav>

  <!-- 설정 탭 -->
  <div class="tab-panel active" id="tab-settings">
    <div class="settings-container">
      <h1>📚 Vocab Saver 설정</h1>
      <p class="subtitle">아래 설정을 완료하면 드래그 번역과 단어 카드 저장을 사용할 수 있습니다.</p>

      <!-- ON/OFF 토글 -->
      <div class="toggle-card">
        <span class="toggle-card-label">확장 사용</span>
        <label class="toggle">
          <input type="checkbox" id="enableToggle" checked>
          <span class="slider"></span>
        </label>
      </div>

      <!-- Step 1: Translate API Key -->
      <div class="card">
        <div class="card-title">
          <span class="step">1</span>
          Google Translate API 키
        </div>
        <label for="apiKey">API 키</label>
        <input type="password" id="apiKey" placeholder="AIza..." autocomplete="off">
        <p class="help-text">
          Google Cloud Console → Cloud Translation API → 사용자 인증 정보 → API 키 생성
        </p>
        <div class="btn-row">
          <button class="btn btn-primary" id="saveApiKey">저장</button>
          <span id="apiKeyStatus" class="status" style="display:none"></span>
        </div>
      </div>

      <!-- Step 2: Spreadsheet ID -->
      <div class="card">
        <div class="card-title">
          <span class="step">2</span>
          Google Sheets Spreadsheet ID
        </div>
        <label for="spreadsheetId">Spreadsheet ID</label>
        <input type="text" id="spreadsheetId" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms">
        <p class="help-text">
          Google Sheets URL에서 /d/ 뒤 ~ /edit 앞의 문자열을 복사해주세요.<br>
          예: docs.google.com/spreadsheets/d/<strong>여기</strong>/edit
        </p>
        <div class="btn-row">
          <button class="btn btn-primary" id="saveSheetId">저장</button>
          <span id="sheetIdStatus" class="status" style="display:none"></span>
        </div>
      </div>

      <!-- Step 3: Google OAuth -->
      <div class="card">
        <div class="card-title">
          <span class="step">3</span>
          Google Sheets 계정 연결
        </div>
        <p style="font-size:13px; color:#475569; margin-bottom:12px;">
          단어장을 Sheets로 내보낼 때 Google 계정 인증이 필요합니다.
        </p>
        <div class="btn-row">
          <button class="btn btn-primary" id="connectSheets">Google 계정 연결</button>
          <span id="oauthStatus" class="status" style="display:none"></span>
        </div>
        <div class="divider"></div>
        <p style="font-size:11px; color:#94a3b8;">
          내보내기 시 FR / EN / KO / JP 시트에 단어 | 뜻 | 문장 | 날짜 순으로 저장됩니다.
        </p>
      </div>
    </div>
  </div>

  <!-- 단어장 탭 -->
  <div class="tab-panel" id="tab-vocab">
    <div class="vocab-container">
      <!-- 좌측 언어 탭 -->
      <div class="lang-tabs">
        <button class="lang-tab active" data-lang="fr">
          <span class="lang-code">FR</span>
          <span class="lang-count" id="count-fr">0</span>
        </button>
        <button class="lang-tab" data-lang="en">
          <span class="lang-code">EN</span>
          <span class="lang-count" id="count-en">0</span>
        </button>
        <button class="lang-tab" data-lang="ko">
          <span class="lang-code">KO</span>
          <span class="lang-count" id="count-ko">0</span>
        </button>
        <button class="lang-tab" data-lang="ja">
          <span class="lang-code">JP</span>
          <span class="lang-count" id="count-ja">0</span>
        </button>
      </div>

      <!-- 우측 카드 목록 -->
      <div class="cards-panel">
        <div class="cards-header">
          <span class="cards-title" id="cardsTitle">프랑스어 단어</span>
          <div>
            <button class="btn-export" id="btnExport">Sheets로 내보내기</button>
            <div class="export-status" id="exportStatus"></div>
          </div>
        </div>
        <div id="cardsList"></div>
      </div>
    </div>
  </div>

  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: options.js 전체 교체**

```javascript
// 설정 페이지 로직

const LANG_LABELS = { fr: '프랑스어', en: '영어', ko: '한국어', ja: '일본어' };

// ── 탭 전환 ──────────────────────────────────────────
document.querySelectorAll('.tab-nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'vocab') loadVocabTab();
  });
});

// ── 설정 탭 ──────────────────────────────────────────

chrome.storage.local.get(['googleTranslateApiKey', 'spreadsheetId', 'extensionEnabled'], ({
  googleTranslateApiKey, spreadsheetId, extensionEnabled
}) => {
  if (googleTranslateApiKey) {
    document.getElementById('apiKey').value = googleTranslateApiKey;
    showStatus('apiKeyStatus', '저장됨', 'ok');
  }
  if (spreadsheetId) {
    document.getElementById('spreadsheetId').value = spreadsheetId;
    showStatus('sheetIdStatus', '저장됨', 'ok');
  }
  document.getElementById('enableToggle').checked = extensionEnabled !== false;
});

document.getElementById('enableToggle').addEventListener('change', (e) => {
  chrome.storage.local.set({ extensionEnabled: e.target.checked });
});

document.getElementById('saveApiKey').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) { showStatus('apiKeyStatus', 'API 키를 입력해주세요', 'err'); return; }
  chrome.storage.local.set({ googleTranslateApiKey: key }, () => {
    showStatus('apiKeyStatus', '저장 완료', 'ok');
  });
});

document.getElementById('saveSheetId').addEventListener('click', () => {
  const id = document.getElementById('spreadsheetId').value.trim();
  if (!id) { showStatus('sheetIdStatus', 'ID를 입력해주세요', 'err'); return; }
  const match = id.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const cleanId = match ? match[1] : id;
  chrome.storage.local.set({ spreadsheetId: cleanId }, () => {
    document.getElementById('spreadsheetId').value = cleanId;
    showStatus('sheetIdStatus', '저장 완료', 'ok');
  });
});

document.getElementById('connectSheets').addEventListener('click', () => {
  showStatus('oauthStatus', '연결 중...', 'ok');
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      showStatus('oauthStatus', '연결 실패: ' + (chrome.runtime.lastError?.message || '알 수 없는 오류'), 'err');
    } else {
      showStatus('oauthStatus', '연결 완료 ✓', 'ok');
    }
  });
});

// ── 단어장 탭 ──────────────────────────────────────────

let currentLang = 'fr';

function loadVocabTab() {
  chrome.storage.local.get('wordCards', ({ wordCards = [] }) => {
    updateLangCounts(wordCards);
    renderCards(wordCards, currentLang);
  });
}

function updateLangCounts(cards) {
  ['fr', 'en', 'ko', 'ja'].forEach(lang => {
    const count = cards.filter(c => c.lang === lang).length;
    document.getElementById(`count-${lang}`).textContent = count;
  });
}

function renderCards(allCards, lang) {
  const cards = allCards.filter(c => c.lang === lang);
  const list = document.getElementById('cardsList');
  document.getElementById('cardsTitle').textContent =
    `${LANG_LABELS[lang] || lang} 단어 (${cards.length}개)`;

  if (cards.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">📭</div>
        <div>저장된 단어 카드가 없습니다</div>
      </div>`;
    return;
  }

  list.innerHTML = cards.map(card => `
    <div class="word-card" data-id="${escapeAttr(card.id)}">
      <div class="word-card-header">
        <div class="word-card-translation">${escapeHtml(card.translation)}</div>
        <div style="display:flex;align-items:flex-start;gap:8px;flex-shrink:0;">
          <span class="word-card-date">${escapeHtml(card.date || '')}</span>
          <button class="btn-delete" data-id="${escapeAttr(card.id)}">삭제</button>
        </div>
      </div>
      ${card.words && card.words.length > 0 ? `
        <div class="word-card-words">
          ${card.words.map(w => `
            <div class="word-entry">
              <span class="w">${escapeHtml(w.word)}</span>
              <span class="arr">→</span>
              <span class="m">${escapeHtml(w.meaning)}</span>
              <span class="s">${escapeHtml(w.sentence)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteCard(btn.dataset.id));
  });
}

function deleteCard(id) {
  chrome.storage.local.get('wordCards', ({ wordCards = [] }) => {
    const updated = wordCards.filter(c => c.id !== id);
    chrome.storage.local.set({ wordCards: updated }, () => {
      updateLangCounts(updated);
      renderCards(updated, currentLang);
    });
  });
}

document.querySelectorAll('.lang-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.lang-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentLang = tab.dataset.lang;
    document.getElementById('exportStatus').className = 'export-status';
    chrome.storage.local.get('wordCards', ({ wordCards = [] }) => {
      renderCards(wordCards, currentLang);
    });
  });
});

document.getElementById('btnExport').addEventListener('click', () => {
  const btn = document.getElementById('btnExport');
  const statusEl = document.getElementById('exportStatus');
  btn.disabled = true;
  btn.textContent = '내보내는 중...';
  statusEl.className = 'export-status';

  chrome.storage.local.get('wordCards', ({ wordCards = [] }) => {
    const cards = wordCards.filter(c => c.lang === currentLang);
    if (cards.length === 0) {
      statusEl.textContent = '내보낼 카드가 없습니다.';
      statusEl.className = 'export-status err';
      btn.disabled = false;
      btn.textContent = 'Sheets로 내보내기';
      return;
    }
    chrome.runtime.sendMessage({ action: 'exportToSheets', lang: currentLang, cards }, (response) => {
      btn.disabled = false;
      btn.textContent = 'Sheets로 내보내기';
      if (chrome.runtime.lastError || response?.error) {
        statusEl.textContent = response?.error || '내보내기 실패';
        statusEl.className = 'export-status err';
      } else {
        statusEl.textContent = `완료: ${response.count}개 단어 내보냄`;
        statusEl.className = 'export-status ok';
      }
    });
  });
});

// ── 유틸리티 ──────────────────────────────────────────

function showStatus(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `status ${type}`;
  el.style.display = 'inline-block';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
}
```

- [ ] **Step 3: 수동 확인**

1. 확장 리로드 후 options 페이지 열기
2. 상단 탭 "⚙ 설정" / "📖 단어장" 전환 확인
3. 설정 탭: ON/OFF 토글 작동, API 키 저장 확인
4. 단어장 탭: 저장된 카드 표시, 언어별 탭 전환, 삭제 버튼 작동
5. Sheets 내보내기 버튼 클릭 시 해당 언어 시트에 데이터 추가 확인

- [ ] **Step 4: 커밋**

```bash
git add options.html options.js
git commit -m "feat: add 2-tab options page with vocab card viewer and Sheets export"
```

---

## Task 5: CHANGELOG.md 작성

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG.md 생성**

```markdown
# Changelog

## [2.0.0] - 2026-05-15

### Added
- Extension ON/OFF 토글 (툴바 팝업 + 옵션 페이지)
- 번역 대상 언어 선택 (FR / EN / KO / JP)
- 브라우저 언어 자동 감지 — 해당 언어 버튼 비활성 표시
- Google Translate API 언어 자동 감지 (`source: auto`)
- 감지 언어 = 타겟 언어인 경우 팝업 미표시
- 팝업 헤더에 `[감지언어 →]` 배지 표시
- 단어 카드 로컬 저장 (`chrome.storage.local`)
- 옵션 페이지 2탭 구조 (설정 / 단어장)
- 단어장 탭: 언어별 좌측 탭, 카드 목록, 삭제 기능
- Sheets 내보내기: 언어별 시트(FR/EN/KO/JP)에 append
- 툴바 팝업 (`popup.html`) 추가

### Changed
- 드래그 팝업 버튼: "확인" → "카드 저장"
- 번역 섹션 라벨: "단어장 추가" → "주요 단어"
- `background.js`: `source: 'en'` → source 제거(자동 감지)

## [1.0.0] - 2026-05-14

### Added
- 드래그 텍스트 영어 → 한국어 번역
- 주요 키워드 추출 및 번역
- Google Sheets 저장 (Sheet1)
- Shadow DOM 팝업 렌더링
- 옵션 페이지 (API 키, Spreadsheet ID, OAuth)
```

- [ ] **Step 2: 커밋**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG for v1.0.0 and v2.0.0"
```

---

## Self-Review

**Spec coverage:**
- ✅ ON/OFF 토글 (Task 1 popup + Task 4 options)
- ✅ 언어 선택 4개 (Task 1 popup.js)
- ✅ 브라우저 언어 감지/비활성 (Task 1 popup.js getBrowserLangCode)
- ✅ 언어 자동 감지 + skip (Task 2 background.js, Task 3 content.js)
- ✅ 팝업 UI: 전체 번역 + 주요 단어 (Task 3 showResult)
- ✅ 카드 저장 (Task 3 saveCard)
- ✅ 단어장 뷰 옵션 페이지 2탭 (Task 4)
- ✅ 언어별 좌측 탭 (Task 4)
- ✅ Sheets 내보내기 언어별 시트 (Task 2 handleExportToSheets + Task 4)
- ✅ CHANGELOG.md (Task 5)

**Placeholder 없음** — 모든 단계에 실제 코드 포함

**타입 일관성:**
- `saveCard({ detectedLang, translation, words })` → card.lang = detectedLang ✅
- `exportToSheets` message: `{ action, lang, cards }` → background의 `handleExportToSheets(lang, cards)` ✅
- `wordCards` 배열: `{ id, lang, translation, words, date }` — content.js, options.js 모두 동일 ✅
