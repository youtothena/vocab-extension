const LANG_LABELS = { fr: 'FR', en: 'EN', ko: 'KO', ja: 'JP' };
const LANG_CODES = ['fr', 'en', 'ko', 'ja'];

function getBrowserLangCode() {
  const nav = navigator.language.toLowerCase().split('-')[0];
  return LANG_CODES.includes(nav) ? nav : null;
}

chrome.storage.local.get(['extensionEnabled', 'targetLang'], ({ extensionEnabled, targetLang }) => {
  const enabled = extensionEnabled !== false;
  const browserLang = getBrowserLangCode();

  // If stored lang equals browser lang (or no stored lang and default 'en' equals browser lang),
  // pick the first available non-browser lang
  let lang = targetLang || 'en';
  if (browserLang && lang === browserLang) {
    lang = LANG_CODES.find(l => l !== browserLang) || 'en';
    chrome.storage.local.set({ targetLang: lang });
  }

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
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
});
