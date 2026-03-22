// 설정 페이지 로직

// 저장된 값 불러오기
chrome.storage.local.get(['googleTranslateApiKey', 'spreadsheetId'], ({ googleTranslateApiKey, spreadsheetId }) => {
  if (googleTranslateApiKey) {
    document.getElementById('apiKey').value = googleTranslateApiKey;
    showStatus('apiKeyStatus', '저장됨', 'ok');
  }
  if (spreadsheetId) {
    document.getElementById('spreadsheetId').value = spreadsheetId;
    showStatus('sheetIdStatus', '저장됨', 'ok');
  }
});

// Translate API 키 저장
document.getElementById('saveApiKey').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) {
    showStatus('apiKeyStatus', 'API 키를 입력해주세요', 'err');
    return;
  }
  chrome.storage.local.set({ googleTranslateApiKey: key }, () => {
    showStatus('apiKeyStatus', '저장 완료', 'ok');
  });
});

// Spreadsheet ID 저장
document.getElementById('saveSheetId').addEventListener('click', () => {
  const id = document.getElementById('spreadsheetId').value.trim();
  if (!id) {
    showStatus('sheetIdStatus', 'ID를 입력해주세요', 'err');
    return;
  }
  // URL에서 ID만 추출 (URL을 붙여넣었을 경우 대비)
  const match = id.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const cleanId = match ? match[1] : id;
  chrome.storage.local.set({ spreadsheetId: cleanId }, () => {
    document.getElementById('spreadsheetId').value = cleanId;
    showStatus('sheetIdStatus', '저장 완료', 'ok');
  });
});

// Google OAuth 연결
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

function showStatus(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `status ${type}`;
  el.style.display = 'inline-block';
}
