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

  if (!detectedLang) {
    throw new Error('언어를 감지할 수 없습니다.');
  }

  if (detectedLang === targetLang) {
    return { skip: true };
  }

  const wordResults = await Promise.all(
    words.map(async (word) => {
      const { translatedText: meaning } = await translateText(word, targetLang, googleTranslateApiKey, detectedLang);
      const sentence = extractSentenceContaining(text, word);
      return { word, meaning, sentence };
    })
  );

  return { detectedLang, translation: translatedText, words: wordResults };
}

async function translateText(text, targetLang, apiKey, sourceLang = null) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const body = { q: text, target: targetLang, format: 'text' };
  if (sourceLang) body.source = sourceLang;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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
  if (!lang) throw new Error('언어 코드가 없습니다.');
  if (!Array.isArray(cards)) throw new Error('카드 목록이 올바르지 않습니다.');
  const token = await getAuthToken();
  const { spreadsheetId } = await chrome.storage.local.get('spreadsheetId');
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID가 설정되지 않았습니다. 옵션 페이지에서 입력해주세요.');
  }

  const sheetName = lang.toUpperCase();
  const values = [];
  for (const card of cards) {
    for (const w of (card.words || [])) {
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
