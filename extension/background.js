const DEFAULT_TIMEOUT_MS = 1200;
const DEBUG_LOGS_KEY = 'debugLogs';
const MAX_LOG_ENTRIES = 200;
const PROVIDERS = {
  AUTO: 'auto',
  LIBRE: 'libre',
  MYMEMORY: 'mymemory',
  APERTIUM: 'apertium',
  GOOGLE: 'google'
};
const AUTO_PROVIDER_ORDER = [PROVIDERS.GOOGLE, PROVIDERS.MYMEMORY, PROVIDERS.APERTIUM, PROVIDERS.LIBRE];

const LIBRE_ENDPOINTS = [
  'https://libretranslate.com/translate',
  'https://translate.argosopentech.com/translate'
];
const APERTIUM_ENDPOINTS = [
  'https://apertium.org/apy/translate',
  'https://beta.apertium.org/apy/translate'
];
const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

const ALLOWED_LIBRE_ORIGINS = new Set([
  'https://libretranslate.com',
  'https://translate.argosopentech.com'
]);

const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const WORD_PATTERN = /[\p{L}\p{N}]/u;
const MAX_WORDS_PER_REQUEST = 30;

const APERTIUM_CODE_MAP = {
  en: 'eng',
  es: 'spa',
  fr: 'fra',
  de: 'deu',
  it: 'ita',
  pt: 'por',
  ja: 'jpn',
  ko: 'kor'
};

function hasLocalStorageApi() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function appendDebugLog(message) {
  if (!hasLocalStorageApi()) {
    return;
  }

  chrome.storage.local.get([DEBUG_LOGS_KEY], (items) => {
    const existing = Array.isArray(items?.[DEBUG_LOGS_KEY]) ? items[DEBUG_LOGS_KEY] : [];
    const entry = `[${formatTimestamp()}] ${message}`;
    const next = [...existing, entry].slice(-MAX_LOG_ENTRIES);
    chrome.storage.local.set({ [DEBUG_LOGS_KEY]: next });
  });
}

function isYouTubeHostname(hostname) {
  if (typeof hostname !== 'string' || !hostname) {
    return false;
  }

  const normalized = hostname.toLowerCase();
  return normalized === 'youtube.com' || normalized.endsWith('.youtube.com');
}

function extractSenderHostnames(sender) {
  const hostnames = [];
  const candidateUrls = [
    sender?.url,
    sender?.origin,
    sender?.tab?.url,
    sender?.documentUrl
  ];

  for (const candidate of candidateUrls) {
    if (typeof candidate !== 'string' || !candidate) {
      continue;
    }

    try {
      const hostname = new URL(candidate).hostname;
      if (hostname) {
        hostnames.push(hostname);
      }
    } catch {
      // Ignore malformed sender URL values.
    }
  }

  return hostnames;
}

function isYouTubeSender(sender) {
  const hostnames = extractSenderHostnames(sender);
  return hostnames.some((hostname) => isYouTubeHostname(hostname));
}

function isTrustedInternalSender(sender) {
  const runtimeId = chrome?.runtime?.id;
  return Boolean(runtimeId) && sender?.id === runtimeId;
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

function normalizeProvider(provider) {
  if (
    provider === PROVIDERS.LIBRE ||
    provider === PROVIDERS.MYMEMORY ||
    provider === PROVIDERS.APERTIUM ||
    provider === PROVIDERS.GOOGLE
  ) {
    return provider;
  }

  return PROVIDERS.AUTO;
}

function normalizeLibreEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    return null;
  }

  try {
    const parsed = new URL(endpoint.trim());
    if (parsed.protocol !== 'https:') {
      return null;
    }

    if (!ALLOWED_LIBRE_ORIGINS.has(parsed.origin)) {
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

function resolveLibreEndpoints(customEndpoint) {
  const candidates = [];

  const normalizedCustom = normalizeLibreEndpoint(customEndpoint);
  if (normalizedCustom) {
    candidates.push(normalizedCustom);
  }

  for (const endpoint of LIBRE_ENDPOINTS) {
    if (!candidates.includes(endpoint)) {
      candidates.push(endpoint);
    }
  }

  return candidates;
}

function resolveProviderOrder(provider) {
  if (provider === PROVIDERS.AUTO) {
    return AUTO_PROVIDER_ORDER;
  }

  return [provider];
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

function normalizeTranslationCandidate(sourceWord, candidate) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase() === sourceWord.toLowerCase()) {
    return null;
  }

  return trimmed;
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

async function requestLibreWord(word, settings) {
  const endpoints = resolveLibreEndpoints(settings.translationEndpoint);

  for (const endpoint of endpoints) {
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
      continue;
    }

    const payload = await response.json();
    const translated = normalizeTranslationCandidate(word, payload?.translatedText);
    if (translated) {
      return translated;
    }
  }

  return null;
}

function toApertiumCode(code) {
  const lowered = code.toLowerCase();
  return APERTIUM_CODE_MAP[lowered] ?? lowered;
}

function buildApertiumLangPairs(sourceLanguage, targetLanguage) {
  const pairs = new Set();
  pairs.add(`${sourceLanguage}|${targetLanguage}`);

  const sourceApertium = toApertiumCode(sourceLanguage);
  const targetApertium = toApertiumCode(targetLanguage);
  pairs.add(`${sourceApertium}|${targetApertium}`);

  return Array.from(pairs);
}

async function requestApertiumWord(word, settings) {
  const langPairs = buildApertiumLangPairs(settings.sourceLanguage, settings.targetLanguage);

  for (const endpoint of APERTIUM_ENDPOINTS) {
    for (const langpair of langPairs) {
      const url = new URL(endpoint);
      url.searchParams.set('q', word);
      url.searchParams.set('langpair', langpair);

      const response = await fetchWithTimeout(
        url.toString(),
        {
          method: 'GET'
        },
        settings.translationTimeoutMs
      );

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const translated = normalizeTranslationCandidate(word, payload?.responseData?.translatedText);
      if (translated) {
        return translated;
      }
    }
  }

  return null;
}

async function requestMyMemoryWord(word, settings) {
  const url = new URL(MYMEMORY_ENDPOINT);
  url.searchParams.set('q', word);
  url.searchParams.set('langpair', `${settings.sourceLanguage}|${settings.targetLanguage}`);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: 'GET'
    },
    settings.translationTimeoutMs
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return normalizeTranslationCandidate(word, payload?.responseData?.translatedText);
}

function parseGoogleTranslateText(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return null;
  }

  const parts = [];
  for (const segment of payload[0]) {
    if (!Array.isArray(segment) || typeof segment[0] !== 'string') {
      continue;
    }
    parts.push(segment[0]);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function requestGoogleWord(word, settings) {
  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', settings.sourceLanguage);
  url.searchParams.set('tl', settings.targetLanguage);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', word);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: 'GET'
    },
    settings.translationTimeoutMs
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const translated = parseGoogleTranslateText(payload);
  return normalizeTranslationCandidate(word, translated);
}

async function requestWordWithProvider(provider, word, settings) {
  if (provider === PROVIDERS.LIBRE) {
    return requestLibreWord(word, settings);
  }

  if (provider === PROVIDERS.MYMEMORY) {
    return requestMyMemoryWord(word, settings);
  }

  if (provider === PROVIDERS.APERTIUM) {
    return requestApertiumWord(word, settings);
  }

  if (provider === PROVIDERS.GOOGLE) {
    return requestGoogleWord(word, settings);
  }

  return null;
}

async function requestWordAuto(word, settings, providerOrder) {
  const failedProviders = [];

  const attempts = providerOrder.map((provider) =>
    (async () => {
      try {
        const translated = await requestWordWithProvider(provider, word, settings);
        if (!translated) {
          throw new Error(`provider_unavailable:${provider}`);
        }

        return { translated, provider };
      } catch (error) {
        failedProviders.push(provider);
        throw error;
      }
    })()
  );

  try {
    const resolved = await Promise.any(attempts);
    return {
      ...resolved,
      failedProviders: Array.from(new Set(failedProviders))
    };
  } catch {
    return {
      translated: null,
      provider: null,
      failedProviders: Array.from(new Set(failedProviders))
    };
  }
}

async function translateWords(words, settings) {
  const translations = {};
  const providerByWord = {};
  const failedProvidersByWord = {};
  const providerOrder = resolveProviderOrder(settings.translationProvider);

  for (const word of words) {
    const normalized = word.toLowerCase();

    if (settings.translationProvider === PROVIDERS.AUTO) {
      const autoResult = await requestWordAuto(word, settings, providerOrder);
      if (autoResult.translated && autoResult.provider) {
        translations[normalized] = autoResult.translated;
        providerByWord[normalized] = autoResult.provider;
      } else if (autoResult.failedProviders.length > 0) {
        failedProvidersByWord[normalized] = autoResult.failedProviders;
      }

      continue;
    }

    const failedProviders = [];

    for (const provider of providerOrder) {
      try {
        const translated = await requestWordWithProvider(provider, word, settings);
        if (translated) {
          translations[normalized] = translated;
          providerByWord[normalized] = provider;
          break;
        }

        failedProviders.push(provider);
      } catch (error) {
        failedProviders.push(provider);
        if (error?.name !== 'AbortError') {
          console.warn('Translation provider request failed.', {
            provider,
            word,
            error: String(error)
          });
        }
      }
    }

    if (!translations[normalized] && failedProviders.length > 0) {
      failedProvidersByWord[normalized] = failedProviders;
    }
  }

  return {
    translations,
    meta: {
      providerByWord,
      failedProvidersByWord
    }
  };
}

function buildSettings(raw) {
  const sourceLanguage = normalizeLanguageCode(raw?.sourceLanguage, 'en');
  const targetLanguage = normalizeLanguageCode(raw?.targetLanguage, 'es');
  const timeout = Number.isFinite(raw?.translationTimeoutMs)
    ? Math.max(600, Math.min(8000, Math.floor(raw.translationTimeoutMs)))
    : DEFAULT_TIMEOUT_MS;

  return {
    translationProvider: normalizeProvider(raw?.translationProvider),
    sourceLanguage,
    targetLanguage,
    translationEndpoint: raw?.translationEndpoint,
    translationTimeoutMs: timeout
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'LINGO_STREAM_TRANSLATE_WORDS') {
    return false;
  }

  if (!isYouTubeSender(sender) && !isTrustedInternalSender(sender)) {
    appendDebugLog('Translation bridge rejected request: unauthorized sender');
    sendResponse({ ok: false, error: 'unauthorized_sender' });
    return false;
  }

  const words = sanitizeWords(message?.payload?.words);
  const settings = buildSettings(message?.payload);
  appendDebugLog(
    `Translation request accepted: words=${words.length}, provider=${settings.translationProvider}, target=${settings.targetLanguage}`
  );

  void (async () => {
    try {
      const result = await translateWords(words, settings);
      appendDebugLog(
        `Translation request completed: translated=${Object.keys(result.translations).length}, words=${words.length}`
      );
      sendResponse({ ok: true, ...result });
    } catch (error) {
      appendDebugLog(`Translation request failed: ${String(error)}`);
      sendResponse({ ok: false, error: String(error) });
    }
  })();

  return true;
});

appendDebugLog('background.js loaded');
