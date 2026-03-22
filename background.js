// Service Worker: Google Translate API + Google Sheets API 호출 담당

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslate(request.text, request.words)
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
});

async function handleTranslate(text, words) {
  const { googleTranslateApiKey } = await chrome.storage.local.get('googleTranslateApiKey');
  if (!googleTranslateApiKey) {
    throw new Error('Google Translate API 키가 설정되지 않았습니다. 옵션 페이지에서 입력해주세요.');
  }

  // 전체 텍스트 번역
  const translation = await translateText(text, googleTranslateApiKey);

  // 키워드 각각 번역
  const wordResults = await Promise.all(
    words.map(async (word) => {
      const meaning = await translateText(word, googleTranslateApiKey);
      // 원문에서 해당 단어가 포함된 문장 추출
      const sentence = extractSentenceContaining(text, word);
      return { word, meaning, sentence };
    })
  );

  return { translation, words: wordResults };
}

async function translateText(text, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'en', target: 'ko', format: 'text' })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `번역 API 오류 (${res.status})`);
  }
  const data = await res.json();
  return data.data.translations[0].translatedText;
}

function extractSentenceContaining(text, word) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const lower = word.toLowerCase();
  const found = sentences.find(s => s.toLowerCase().includes(lower));
  return found ? found.trim() : text.substring(0, 100).trim();
}

async function handleSaveToSheets(data) {
  // data: [{ word, meaning, sentence }]
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
