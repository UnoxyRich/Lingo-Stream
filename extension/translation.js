const cache = {};

const DEFAULT_TIMEOUT_MS = 3000;
const LIBRE_ENDPOINTS = [
  'https://libretranslate.com/translate',
  'https://translate.argosopentech.com/translate'
];

function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (items) => resolve(items));
  });
}

function buildLibreRequestBody(q, settings) {
  return {
    q,
    source: settings.sourceLanguage,
    target: settings.targetLanguage,
    format: 'text'
  };
}

function normalizeLibreTranslation(word, payload) {
  if (typeof payload?.translatedText !== 'string' || !payload.translatedText.trim()) {
    return null;
  }

  return {
    [word.toLowerCase()]: payload.translatedText.trim()
  };
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestLibreTranslationFromEndpoint(word, settings, endpoint) {
  void window.log?.(`Translation API called (libre): ${word} @ ${endpoint}`);
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildLibreRequestBody(word, settings))
    },
    settings.translationTimeoutMs
  );

  if (!response.ok) {
    if (response.status === 429) {
      console.warn('LibreTranslate rate limit reached.');
    }

    void window.log?.(`Translation API failed (libre): endpoint=${endpoint}, status=${response.status}`);
    return null;
  }

  const payload = await response.json();
  const normalized = normalizeLibreTranslation(word, payload);
  void window.log?.(`Translation API response valid (libre): ${Boolean(normalized)}`);
  return normalized;
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
    'translationProvider',
    'targetLanguage',
    'sourceLanguage',
    'translationEndpoint',
    'translationTimeoutMs'
  ]);

  const customEndpoint = typeof settings.translationEndpoint === 'string' ? settings.translationEndpoint.trim() : '';

  return {
    translationProvider: 'libre',
    targetLanguage: settings.targetLanguage ?? 'es',
    sourceLanguage: settings.sourceLanguage ?? 'en',
    translationEndpoint: customEndpoint,
    translationTimeoutMs: settings.translationTimeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

function resolveEndpointCandidates(settings) {
  const endpoints = [];

  if (settings.translationEndpoint) {
    endpoints.push(settings.translationEndpoint);
  }

  for (const endpoint of LIBRE_ENDPOINTS) {
    if (!endpoints.includes(endpoint)) {
      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

async function requestOneWord(word, settings) {
  const endpoints = resolveEndpointCandidates(settings);

  for (const endpoint of endpoints) {
    try {
      const translated = await requestLibreTranslationFromEndpoint(word, settings, endpoint);
      if (translated) {
        return translated;
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        console.warn(`Translation request timed out for endpoint: ${endpoint}`);
        void window.log?.(`Translation API timeout: endpoint=${endpoint}`);
      } else {
        console.warn(`Translation request failed for endpoint: ${endpoint}`, error);
        void window.log?.(`Translation API error: endpoint=${endpoint}`);
      }
    }
  }

  return null;
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

  const results = await Promise.all(
    misses.map(async (word) => {
      const single = await requestOneWord(word, settings);
      return { word, single };
    })
  );

  for (const { word, single } of results) {
    if (!single) {
      void window.log?.(`Translation unavailable: ${word}`);
      continue;
    }

    const normalized = word.toLowerCase();
    const translated = single[normalized];
    if (!translated) {
      continue;
    }

    cache[normalized] = translated;
    translations[normalized] = translated;
    void window.log?.(`Translation success: ${word} -> ${translated}`);
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
