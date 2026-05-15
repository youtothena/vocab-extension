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
  const langBadge = detectedLang
    ? `<span class="vp-lang-badge">[${escapeHtml(detectedLang.toUpperCase())} →]</span>`
    : '';
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
    btn.disabled = false;
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
