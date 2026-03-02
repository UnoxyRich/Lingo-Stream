const cache = {};
const missCache = {};

const DEFAULT_TIMEOUT_MS = 1200;
const MISS_CACHE_TTL_MS = 30 * 1000;
const BRIDGE_FAILURE_BACKOFF_MS = 1500;

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

function isMissCached(normalized, now = Date.now()) {
  const missedAt = missCache[normalized];
  if (!missedAt) {
    return false;
  }

  if (now - missedAt > MISS_CACHE_TTL_MS) {
    delete missCache[normalized];
    return false;
  }

  return true;
}

function markMissCached(normalized, now = Date.now(), ttlMs = MISS_CACHE_TTL_MS) {
  const clampedTtlMs = Math.max(0, Math.min(MISS_CACHE_TTL_MS, Number(ttlMs) || 0));
  // Encode shorter TTLs with the same timestamp-only cache format.
  missCache[normalized] = now - MISS_CACHE_TTL_MS + clampedTtlMs;
}

async function getTranslationSettings() {
  const settings = await getFromStorage([
    'translationProvider',
    'targetLanguage',
    'sourceLanguage',
    'translationEndpoint',
    'translationTimeoutMs'
  ]);

  const customEndpoint = typeof settings.translationEndpoint === 'string'
    ? settings.translationEndpoint.trim()
    : '';

  return {
    translationProvider: settings.translationProvider ?? 'auto',
    targetLanguage: settings.targetLanguage ?? 'es',
    sourceLanguage: settings.sourceLanguage ?? 'en',
    translationEndpoint: customEndpoint,
    translationTimeoutMs: settings.translationTimeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

function requestBackgroundTranslations(words, settings) {
  return new Promise((resolve) => {
    if (typeof chrome?.runtime?.sendMessage !== 'function') {
      void window.log?.('Translation bridge unavailable: chrome.runtime.sendMessage not found');
      resolve(null);
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'LINGO_STREAM_TRANSLATE_WORDS',
        payload: {
          words,
          translationProvider: settings.translationProvider,
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

        resolve(response);
      }
    );
  });
}

async function translateWords(words) {
  const translations = {};
  const uniqueWords = toUniqueWords(words);
  const misses = [];
  const now = Date.now();

  for (const word of uniqueWords) {
    const normalized = word.toLowerCase();
    if (cache[normalized]) {
      translations[normalized] = cache[normalized];
      void window.log?.(`Cache hit: ${word}`);
      continue;
    }

    if (isMissCached(normalized, now)) {
      void window.log?.(`Miss cache hit: ${word}`);
      continue;
    }

    misses.push(word);
  }

  if (misses.length === 0) {
    return translations;
  }

  const settings = await getTranslationSettings();
  void window.log?.(
    `Word translation batch started: ${JSON.stringify(misses)} (provider=${settings.translationProvider})`
  );

  const fetched = await requestBackgroundTranslations(misses, settings);
  if (!fetched) {
    void window.log?.('Translation batch failed in background bridge');

    for (const word of misses) {
      markMissCached(word.toLowerCase(), now, BRIDGE_FAILURE_BACKOFF_MS);
    }

    return translations;
  }

  for (const [normalized, translated] of Object.entries(fetched.translations)) {
    if (typeof translated !== 'string' || !translated.trim()) {
      continue;
    }

    const cleanTranslated = translated.trim();
    cache[normalized] = cleanTranslated;
    delete missCache[normalized];
    translations[normalized] = cleanTranslated;

    const providerUsed = fetched.meta?.providerByWord?.[normalized];
    if (providerUsed) {
      void window.log?.(`Translation success (${providerUsed}): ${normalized} -> ${cleanTranslated}`);
    } else {
      void window.log?.(`Translation success: ${normalized} -> ${cleanTranslated}`);
    }
  }

  for (const word of misses) {
    const normalized = word.toLowerCase();
    if (!translations[normalized]) {
      markMissCached(normalized, now);
      const failedProviders = fetched.meta?.failedProvidersByWord?.[normalized];
      if (Array.isArray(failedProviders) && failedProviders.length > 0) {
        void window.log?.(`Translation unavailable (${failedProviders.join('>')}): ${word}`);
      } else {
        void window.log?.(`Translation unavailable: ${word}`);
      }
    }
  }

  return translations;
}

async function translateWord(word) {
  const translations = await translateWords([word]);
  return translations[word.toLowerCase()] ?? null;
}

window.translationCache = cache;
window.translationMissCache = missCache;
window.translateWords = translateWords;
window.translateWord = translateWord;
