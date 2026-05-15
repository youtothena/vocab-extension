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
