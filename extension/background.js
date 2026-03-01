const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_ENDPOINTS = [
  'https://libretranslate.com/translate',
  'https://translate.argosopentech.com/translate'
];
const ALLOWED_ENDPOINT_ORIGINS = new Set([
  'https://libretranslate.com',
  'https://translate.argosopentech.com'
]);
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const WORD_PATTERN = /[\p{L}\p{N}]/u;
const MAX_WORDS_PER_REQUEST = 30;

function isYouTubeSender(sender) {
  try {
    const url = new URL(sender?.url ?? '');
    const hostname = url.hostname.toLowerCase();
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function normalizeLanguageCode(code, fallback) {
  if (typeof code !== 'string') {
    return fallback;
  }

  const trimmed = code.trim();
  if (!LANGUAGE_PATTERN.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function normalizeEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    return null;
  }

  try {
    const parsed = new URL(endpoint.trim());
    if (parsed.protocol !== 'https:') {
      return null;
    }

    if (!ALLOWED_ENDPOINT_ORIGINS.has(parsed.origin)) {
      return null;
    }

    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/translate';
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveEndpointCandidates(customEndpoint) {
  const candidates = [];

  const normalizedCustom = normalizeEndpoint(customEndpoint);
  if (normalizedCustom) {
    candidates.push(normalizedCustom);
  }

  for (const endpoint of DEFAULT_ENDPOINTS) {
    if (!candidates.includes(endpoint)) {
      candidates.push(endpoint);
    }
  }

  return candidates;
}

function sanitizeWords(words) {
  if (!Array.isArray(words)) {
    return [];
  }

  const seen = new Set();
  const output = [];

  for (const candidate of words) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length > 64) {
      continue;
    }

    if (!WORD_PATTERN.test(trimmed)) {
      continue;
    }

    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(trimmed);

    if (output.length >= MAX_WORDS_PER_REQUEST) {
      break;
    }
  }

  return output;
}

async function fetchWithTimeout(url, options, timeoutMs) {
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

async function requestWordFromEndpoint(word, settings, endpoint) {
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: word,
        source: settings.sourceLanguage,
        target: settings.targetLanguage,
        format: 'text'
      })
    },
    settings.translationTimeoutMs
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (typeof payload?.translatedText !== 'string' || !payload.translatedText.trim()) {
    return null;
  }

  return payload.translatedText.trim();
}

async function translateWords(words, settings) {
  const translations = {};
  const endpoints = resolveEndpointCandidates(settings.translationEndpoint);

  for (const word of words) {
    const normalized = word.toLowerCase();

    for (const endpoint of endpoints) {
      try {
        const translated = await requestWordFromEndpoint(word, settings, endpoint);
        if (translated) {
          translations[normalized] = translated;
          break;
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('Translation request failed.', { endpoint, word, error: String(error) });
        }
      }
    }
  }

  return translations;
}

function buildSettings(raw) {
  const sourceLanguage = normalizeLanguageCode(raw?.sourceLanguage, 'en');
  const targetLanguage = normalizeLanguageCode(raw?.targetLanguage, 'es');
  const timeout = Number.isFinite(raw?.translationTimeoutMs)
    ? Math.max(800, Math.min(10000, Math.floor(raw.translationTimeoutMs)))
    : DEFAULT_TIMEOUT_MS;

  return {
    sourceLanguage,
    targetLanguage,
    translationEndpoint: raw?.translationEndpoint,
    translationTimeoutMs: timeout
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'IMMERSION_TRANSLATE_WORDS') {
    return false;
  }

  if (!isYouTubeSender(sender)) {
    sendResponse({ ok: false, error: 'unauthorized_sender' });
    return false;
  }

  const words = sanitizeWords(message?.payload?.words);
  const settings = buildSettings(message?.payload);

  void (async () => {
    try {
      const translations = await translateWords(words, settings);
      sendResponse({ ok: true, translations });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();

  return true;
});
