export const cache = {};

const DEFAULT_TIMEOUT_MS = 3000;

function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (items) => resolve(items));
  });
}

function buildRequestBody(q, settings) {
  return {
    q,
    source: settings.sourceLanguage,
    target: settings.targetLanguage,
    format: 'text',
    api_key: settings.apiKey
  };
}

function normalizeTranslations(words, payload) {
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

async function requestTranslations(words, settings) {
  const response = await fetchWithTimeout(
    settings.translationEndpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildRequestBody(words.length === 1 ? words[0] : words, settings))
    },
    settings.translationTimeoutMs
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      console.warn('Translation request rejected. Check API key.');
    } else if (response.status === 429) {
      console.warn('Translation API rate limit reached.');
    }

    return null;
  }

  const payload = await response.json();
  return normalizeTranslations(words, payload);
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
    'apiKey',
    'targetLanguage',
    'sourceLanguage',
    'translationEndpoint',
    'translationTimeoutMs'
  ]);

  return {
    apiKey: settings.apiKey ?? '',
    targetLanguage: settings.targetLanguage ?? 'es',
    sourceLanguage: settings.sourceLanguage ?? 'en',
    translationEndpoint: settings.translationEndpoint ?? 'https://libretranslate.com/translate',
    translationTimeoutMs: settings.translationTimeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

export async function translateWords(words) {
  const translations = {};
  const uniqueWords = toUniqueWords(words);
  const misses = [];

  for (const word of uniqueWords) {
    const normalized = word.toLowerCase();
    if (cache[normalized]) {
      translations[normalized] = cache[normalized];
    } else {
      misses.push(word);
    }
  }

  if (misses.length === 0) {
    return translations;
  }

  const settings = await getTranslationSettings();

  if (!settings.apiKey) {
    console.warn('No API key configured. Translation requests may be rejected by the provider.');
  }

  try {
    const batched = await requestTranslations(misses, settings);
    if (batched) {
      for (const [normalized, translated] of Object.entries(batched)) {
        cache[normalized] = translated;
        translations[normalized] = translated;
      }

      return translations;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.warn('Translation request timed out.');
    } else {
      console.warn('Batch translation failed. Falling back to single requests.');
    }
  }

  for (const word of misses) {
    try {
      const single = await requestTranslations([word], settings);
      if (single) {
        const normalized = word.toLowerCase();
        const translated = single[normalized];
        if (translated) {
          cache[normalized] = translated;
          translations[normalized] = translated;
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        console.warn(`Translation timed out for word: ${word}`);
      } else {
        console.warn(`Translation failed for word: ${word}`);
      }
    }
  }

  return translations;
}

export async function translateWord(word) {
  const translations = await translateWords([word]);
  return translations[word.toLowerCase()] ?? null;
}
