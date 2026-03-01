const cache = {};

const DEFAULT_TIMEOUT_MS = 3500;

function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (items) => resolve(items ?? {}));
  });
}

function toUniqueWords(words) {
  const seen = new Set();
  const unique = [];

  for (const word of words) {
    const normalized = word.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(word);
    }
  }

  return unique;
}

async function getTranslationSettings() {
  const settings = await getFromStorage([
    'targetLanguage',
    'sourceLanguage',
    'translationEndpoint',
    'translationTimeoutMs'
  ]);

  const customEndpoint = typeof settings.translationEndpoint === 'string'
    ? settings.translationEndpoint.trim()
    : '';

  return {
    targetLanguage: settings.targetLanguage ?? 'es',
    sourceLanguage: settings.sourceLanguage ?? 'en',
    translationEndpoint: customEndpoint,
    translationTimeoutMs: settings.translationTimeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

function requestBackgroundTranslations(words, settings) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'IMMERSION_TRANSLATE_WORDS',
        payload: {
          words,
          targetLanguage: settings.targetLanguage,
          sourceLanguage: settings.sourceLanguage,
          translationEndpoint: settings.translationEndpoint,
          translationTimeoutMs: settings.translationTimeoutMs
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          void window.log?.(`Translation bridge failed: ${chrome.runtime.lastError.message}`);
          resolve(null);
          return;
        }

        if (!response?.ok || typeof response.translations !== 'object' || response.translations === null) {
          void window.log?.(`Translation bridge returned no data: ${response?.error ?? 'unknown_error'}`);
          resolve(null);
          return;
        }

        resolve(response.translations);
      }
    );
  });
}

async function translateWords(words) {
  const translations = {};
  const uniqueWords = toUniqueWords(words);
  const misses = [];

  for (const word of uniqueWords) {
    const normalized = word.toLowerCase();
    if (cache[normalized]) {
      translations[normalized] = cache[normalized];
      void window.log?.(`Cache hit: ${word}`);
    } else {
      misses.push(word);
    }
  }

  if (misses.length === 0) {
    return translations;
  }

  const settings = await getTranslationSettings();
  void window.log?.(`Word translation batch started: ${JSON.stringify(misses)}`);

  const fetched = await requestBackgroundTranslations(misses, settings);
  if (!fetched) {
    void window.log?.('Translation batch failed in background bridge');
    return translations;
  }

  for (const [normalized, translated] of Object.entries(fetched)) {
    if (typeof translated !== 'string' || !translated.trim()) {
      continue;
    }

    const cleanTranslated = translated.trim();
    cache[normalized] = cleanTranslated;
    translations[normalized] = cleanTranslated;
    void window.log?.(`Translation success: ${normalized} -> ${cleanTranslated}`);
  }

  for (const word of misses) {
    const normalized = word.toLowerCase();
    if (!translations[normalized]) {
      void window.log?.(`Translation unavailable: ${word}`);
    }
  }

  return translations;
}

async function translateWord(word) {
  const translations = await translateWords([word]);
  return translations[word.toLowerCase()] ?? null;
}

window.translationCache = cache;
window.translateWords = translateWords;
window.translateWord = translateWord;
