import { log } from './logger.js';

export const cache = {};

const DEFAULT_TIMEOUT_MS = 3000;
const FREE_TRANSLATION_PROVIDERS = {
  libre: {
    endpoint: 'https://translate.cutie.dating/translate'
  },
  lingva: {
    endpoint: 'https://lingva.ml/api/v1'
  }
};

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

function normalizeLibreTranslations(words, payload) {
  if (Array.isArray(payload)) {
    if (payload.length !== words.length) {
      return null;
    }

    const output = {};
    for (let index = 0; index < words.length; index += 1) {
      const entry = payload[index];
      const translated = typeof entry === 'string' ? entry : entry?.translatedText;
      if (typeof translated !== 'string' || !translated.trim()) {
        return null;
      }

      output[words[index].toLowerCase()] = translated.trim();
    }

    return output;
  }

  if (words.length === 1 && typeof payload?.translatedText === 'string' && payload.translatedText.trim()) {
    return {
      [words[0].toLowerCase()]: payload.translatedText.trim()
    };
  }

  return null;
}

function normalizeLingvaTranslations(words, payload) {
  if (words.length !== 1) {
    return null;
  }

  if (typeof payload?.translation !== 'string' || !payload.translation.trim()) {
    return null;
  }

  return {
    [words[0].toLowerCase()]: payload.translation.trim()
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

async function requestLibreTranslations(words, settings) {
  void log(`Translation API called (libre): ${JSON.stringify(words)}`);
  const response = await fetchWithTimeout(
    settings.translationEndpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildLibreRequestBody(words.length === 1 ? words[0] : words, settings))
    },
    settings.translationTimeoutMs
  );

  if (!response.ok) {
    if (response.status === 429) {
      console.warn('LibreTranslate rate limit reached.');
    }

    void log(`Translation API failed (libre): status=${response.status}`);
    return null;
  }

  const payload = await response.json();
  const normalized = normalizeLibreTranslations(words, payload);
  void log(`Translation API response valid (libre): ${Boolean(normalized)}`);
  return normalized;
}

async function requestLingvaTranslation(word, settings) {
  const url = `${settings.translationEndpoint}/${encodeURIComponent(settings.sourceLanguage)}/${encodeURIComponent(settings.targetLanguage)}/${encodeURIComponent(word)}`;

  void log(`Translation API called (lingva): ${word}`);
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET'
    },
    settings.translationTimeoutMs
  );

  if (!response.ok) {
    if (response.status === 429) {
      console.warn('Lingva rate limit reached.');
    }

    void log(`Translation API failed (lingva): status=${response.status}`);
    return null;
  }

  const payload = await response.json();
  const normalized = normalizeLingvaTranslations([word], payload);
  void log(`Translation API response valid (lingva): ${Boolean(normalized)}`);
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

  const provider = settings.translationProvider ?? 'libre';
  const defaultEndpoint = FREE_TRANSLATION_PROVIDERS[provider]?.endpoint ?? FREE_TRANSLATION_PROVIDERS.libre.endpoint;

  return {
    translationProvider: provider,
    targetLanguage: settings.targetLanguage ?? 'es',
    sourceLanguage: settings.sourceLanguage ?? 'en',
    translationEndpoint: settings.translationEndpoint ?? defaultEndpoint,
    translationTimeoutMs: settings.translationTimeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

async function requestFromSelectedProvider(words, settings) {
  if (settings.translationProvider === 'lingva') {
    const translations = {};
    for (const word of words) {
      const single = await requestLingvaTranslation(word, settings);
      if (!single) {
        return null;
      }

      translations[word.toLowerCase()] = single[word.toLowerCase()];
    }

    return translations;
  }

  return requestLibreTranslations(words, settings);
}

async function requestWithFallback(words, settings) {
  const selected = await requestFromSelectedProvider(words, settings);
  if (selected) {
    return selected;
  }

  const fallbackProvider = settings.translationProvider === 'lingva' ? 'libre' : 'lingva';
  const fallbackSettings = {
    ...settings,
    translationProvider: fallbackProvider,
    translationEndpoint: FREE_TRANSLATION_PROVIDERS[fallbackProvider].endpoint
  };

  try {
    const fallback = await requestFromSelectedProvider(words, fallbackSettings);
    if (fallback) {
      console.warn(`Primary translation provider failed. Switched to ${fallbackProvider}.`);
      return fallback;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.warn('Fallback translation request timed out.');
    }
  }

  return null;
}

export async function translateWords(words) {
  const translations = {};
  const uniqueWords = toUniqueWords(words);
  const misses = [];

  for (const word of uniqueWords) {
    const normalized = word.toLowerCase();
    if (cache[normalized]) {
      translations[normalized] = cache[normalized];
      void log(`Cache hit: ${word}`);
    } else {
      misses.push(word);
    }
  }

  if (misses.length === 0) {
    return translations;
  }

  const settings = await getTranslationSettings();
  void log(`Batch request sent: ${JSON.stringify(misses)}`);

  try {
    const batched = await requestWithFallback(misses, settings);
    if (batched) {
      for (const [normalized, translated] of Object.entries(batched)) {
        cache[normalized] = translated;
        translations[normalized] = translated;
      }

      void log('Batch translation request succeeded');
      return translations;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.warn('Translation request timed out.');
      void log('Translation API failed: batch request timed out');
    } else {
      console.warn('Batch translation failed. Falling back to single requests.');
      void log('Translation API failed: batch request error, falling back to single requests');
    }
  }

  for (const word of misses) {
    try {
      const single = await requestWithFallback([word], settings);
      if (single) {
        const normalized = word.toLowerCase();
        const translated = single[normalized];
        if (translated) {
          cache[normalized] = translated;
          translations[normalized] = translated;
          void log(`Translation success: ${word} -> ${translated}`);
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        console.warn(`Translation timed out for word: ${word}`);
        void log(`Translation API failed: timeout for ${word}`);
      } else {
        console.warn(`Translation failed for word: ${word}`);
        void log(`Translation API failed: single request error for ${word}`);
      }
    }
  }

  return translations;
}

export async function translateWord(word) {
  const translations = await translateWords([word]);
  return translations[word.toLowerCase()] ?? null;
}
