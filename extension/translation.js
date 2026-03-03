const cache = {};
const missCache = {};

const DEFAULT_TIMEOUT_MS = 1200;
const MISS_CACHE_TTL_MS = 30 * 1000;
const BRIDGE_FAILURE_BACKOFF_MS = 1500;
const LAST_TRANSLATION_SUCCESS_AT_KEY = 'lastTranslationSuccessAt';
const LAST_TRANSLATION_SUCCESS_PROVIDER_KEY = 'lastTranslationSuccessProvider';
const LAST_TRANSLATION_SUCCESS_COUNT_KEY = 'lastTranslationSuccessCount';
const VOCABULARY_ENTRIES_KEY = 'vocabularyEntries';
const VOCABULARY_QUIZ_BUCKETS_KEY = 'vocabularyQuizBuckets';
const CACHE_PROVIDER_LABEL = 'cache';
const UNKNOWN_PROVIDER_LABEL = 'unknown';
let vocabularyPersistPromise = Promise.resolve();

function hasLocalStorageApi() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (items) => resolve(items ?? {}));
  });
}

function getLocalFromStorage(keys) {
  return new Promise((resolve) => {
    if (!hasLocalStorageApi()) {
      resolve({});
      return;
    }

    chrome.storage.local.get(keys, (items) => resolve(items ?? {}));
  });
}

function setLocalStorage(items) {
  return new Promise((resolve) => {
    if (!hasLocalStorageApi()) {
      resolve();
      return;
    }

    chrome.storage.local.set(items, () => resolve());
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
    'translationTimeoutMs',
    'saveVocabulary'
  ]);

  const customEndpoint = typeof settings.translationEndpoint === 'string'
    ? settings.translationEndpoint.trim()
    : '';

  return {
    translationProvider: settings.translationProvider ?? 'auto',
    targetLanguage: settings.targetLanguage ?? 'es',
    sourceLanguage: settings.sourceLanguage ?? 'en',
    translationEndpoint: customEndpoint,
    translationTimeoutMs: settings.translationTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    saveVocabulary: typeof settings.saveVocabulary === 'boolean' ? settings.saveVocabulary : true
  };
}

async function persistTranslationHealth({ successCount, providerByWord }) {
  if (!hasLocalStorageApi() || !Number.isFinite(successCount) || successCount <= 0) {
    return;
  }

  const firstProvider = Object.values(providerByWord ?? {}).find(
    (provider) => typeof provider === 'string' && provider.trim()
  );
  const providerLabel = firstProvider ?? UNKNOWN_PROVIDER_LABEL;

  await setLocalStorage({
    [LAST_TRANSLATION_SUCCESS_AT_KEY]: Date.now(),
    [LAST_TRANSLATION_SUCCESS_PROVIDER_KEY]: providerLabel,
    [LAST_TRANSLATION_SUCCESS_COUNT_KEY]: successCount
  });
}

function createVocabularyKey(entry) {
  return [
    entry.source.toLowerCase(),
    entry.translation.toLowerCase(),
    entry.sourceLanguage.toLowerCase(),
    entry.targetLanguage.toLowerCase()
  ].join('|');
}

function normalizeVocabularyEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  if (
    typeof entry.source !== 'string' ||
    typeof entry.translation !== 'string' ||
    typeof entry.sourceLanguage !== 'string' ||
    typeof entry.targetLanguage !== 'string'
  ) {
    return null;
  }

  const source = entry.source.trim();
  const translation = entry.translation.trim();
  const sourceLanguage = entry.sourceLanguage.trim().toLowerCase();
  const targetLanguage = entry.targetLanguage.trim().toLowerCase();

  if (!source || !translation || !sourceLanguage || !targetLanguage) {
    return null;
  }

  const now = Date.now();
  const firstSeenAt = Number.isFinite(entry.firstSeenAt) ? entry.firstSeenAt : now;
  const lastSeenAt = Number.isFinite(entry.lastSeenAt) ? entry.lastSeenAt : firstSeenAt;
  const count = Number.isFinite(entry.count) ? Math.max(1, Math.floor(entry.count)) : 1;
  const provider = typeof entry.provider === 'string' && entry.provider.trim()
    ? entry.provider.trim()
    : UNKNOWN_PROVIDER_LABEL;

  return {
    source,
    translation,
    sourceLanguage,
    targetLanguage,
    provider,
    firstSeenAt,
    lastSeenAt,
    count
  };
}

function mergeVocabularyEntries(baseEntry, incomingEntry) {
  return {
    ...baseEntry,
    provider: (
      incomingEntry.provider === CACHE_PROVIDER_LABEL ||
      incomingEntry.provider === UNKNOWN_PROVIDER_LABEL
    )
      ? baseEntry.provider
      : incomingEntry.provider,
    firstSeenAt: Math.min(baseEntry.firstSeenAt, incomingEntry.firstSeenAt),
    lastSeenAt: Math.max(baseEntry.lastSeenAt, incomingEntry.lastSeenAt),
    count: baseEntry.count + incomingEntry.count
  };
}

function normalizeQuizBucketEntry(entry) {
  const normalized = normalizeVocabularyEntry(entry);
  if (!normalized) {
    return null;
  }

  const wrongCount = Number.isFinite(entry?.wrongCount)
    ? Math.max(0, Math.floor(entry.wrongCount))
    : 0;
  const lastQuizAt = Number.isFinite(entry?.lastQuizAt) ? entry.lastQuizAt : null;

  return {
    ...normalized,
    wrongCount,
    lastQuizAt
  };
}

function mergeQuizBucketEntries(baseEntry, incomingEntry) {
  const merged = mergeVocabularyEntries(baseEntry, incomingEntry);
  merged.wrongCount = Math.max(baseEntry.wrongCount ?? 0, incomingEntry.wrongCount ?? 0);

  const baseQuizAt = Number.isFinite(baseEntry.lastQuizAt) ? baseEntry.lastQuizAt : null;
  const incomingQuizAt = Number.isFinite(incomingEntry.lastQuizAt) ? incomingEntry.lastQuizAt : null;
  merged.lastQuizAt = Number.isFinite(baseQuizAt) && Number.isFinite(incomingQuizAt)
    ? Math.max(baseQuizAt, incomingQuizAt)
    : (baseQuizAt ?? incomingQuizAt);
  return merged;
}

function upsertBucketEntry(map, entry) {
  const key = createVocabularyKey(entry);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, entry);
    return;
  }

  map.set(key, mergeQuizBucketEntries(existing, entry));
}

function sortVocabularyEntriesByLastSeen(entries) {
  return [...entries].sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

function normalizeQuizBuckets(rawBuckets, fallbackEntries = []) {
  const notQuizzedMap = new Map();
  const correctMap = new Map();
  const incorrectMap = new Map();

  const rawNotQuizzed = Array.isArray(rawBuckets?.notQuizzed) ? rawBuckets.notQuizzed : [];
  const rawCorrect = Array.isArray(rawBuckets?.correct) ? rawBuckets.correct : [];
  const rawIncorrect = Array.isArray(rawBuckets?.incorrect) ? rawBuckets.incorrect : [];

  for (const entry of rawNotQuizzed) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }
    upsertBucketEntry(notQuizzedMap, normalized);
  }

  for (const entry of rawCorrect) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }
    upsertBucketEntry(correctMap, normalized);
  }

  for (const entry of rawIncorrect) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }
    upsertBucketEntry(incorrectMap, normalized);
  }

  for (const entry of fallbackEntries) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }

    const key = createVocabularyKey(normalized);
    if (correctMap.has(key) || incorrectMap.has(key)) {
      continue;
    }
    upsertBucketEntry(notQuizzedMap, normalized);
  }

  for (const key of correctMap.keys()) {
    notQuizzedMap.delete(key);
    incorrectMap.delete(key);
  }

  for (const key of incorrectMap.keys()) {
    notQuizzedMap.delete(key);
  }

  return {
    notQuizzed: sortVocabularyEntriesByLastSeen(Array.from(notQuizzedMap.values())),
    correct: sortVocabularyEntriesByLastSeen(Array.from(correctMap.values())),
    incorrect: sortVocabularyEntriesByLastSeen(Array.from(incorrectMap.values()))
  };
}

async function persistVocabularyEntries(entriesToMerge) {
  if (!hasLocalStorageApi() || !Array.isArray(entriesToMerge) || entriesToMerge.length === 0) {
    return;
  }

  const stored = await getLocalFromStorage([VOCABULARY_ENTRIES_KEY, VOCABULARY_QUIZ_BUCKETS_KEY]);
  const existingEntries = Array.isArray(stored[VOCABULARY_ENTRIES_KEY])
    ? stored[VOCABULARY_ENTRIES_KEY]
    : [];

  const byKey = new Map();
  for (const rawEntry of existingEntries) {
    const normalized = normalizeVocabularyEntry(rawEntry);
    if (!normalized) {
      continue;
    }
    byKey.set(createVocabularyKey(normalized), normalized);
  }

  for (const rawEntry of entriesToMerge) {
    const normalized = normalizeVocabularyEntry(rawEntry);
    if (!normalized) {
      continue;
    }

    const key = createVocabularyKey(normalized);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      continue;
    }

    byKey.set(key, mergeVocabularyEntries(existing, normalized));
  }

  const merged = sortVocabularyEntriesByLastSeen(Array.from(byKey.values()));
  const normalizedBuckets = normalizeQuizBuckets(stored[VOCABULARY_QUIZ_BUCKETS_KEY], existingEntries);

  const notQuizzedMap = new Map(
    normalizedBuckets.notQuizzed.map((entry) => [createVocabularyKey(entry), entry])
  );
  const correctMap = new Map(
    normalizedBuckets.correct.map((entry) => [createVocabularyKey(entry), entry])
  );
  const incorrectMap = new Map(
    normalizedBuckets.incorrect.map((entry) => [createVocabularyKey(entry), entry])
  );

  for (const entry of entriesToMerge) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }

    const key = createVocabularyKey(normalized);
    if (correctMap.has(key)) {
      notQuizzedMap.delete(key);
      incorrectMap.delete(key);
      continue;
    }

    if (incorrectMap.has(key)) {
      incorrectMap.set(key, mergeQuizBucketEntries(incorrectMap.get(key), normalized));
      continue;
    }

    const existing = notQuizzedMap.get(key);
    if (!existing) {
      notQuizzedMap.set(key, normalized);
      continue;
    }

    notQuizzedMap.set(key, mergeQuizBucketEntries(existing, normalized));
  }

  for (const key of correctMap.keys()) {
    notQuizzedMap.delete(key);
    incorrectMap.delete(key);
  }

  for (const key of incorrectMap.keys()) {
    notQuizzedMap.delete(key);
  }

  const nextBuckets = {
    notQuizzed: sortVocabularyEntriesByLastSeen(Array.from(notQuizzedMap.values())),
    correct: sortVocabularyEntriesByLastSeen(Array.from(correctMap.values())),
    incorrect: sortVocabularyEntriesByLastSeen(Array.from(incorrectMap.values()))
  };

  await setLocalStorage({
    [VOCABULARY_ENTRIES_KEY]: merged,
    [VOCABULARY_QUIZ_BUCKETS_KEY]: nextBuckets
  });
}

function queueVocabularyPersistence(entriesToMerge) {
  vocabularyPersistPromise = vocabularyPersistPromise
    .catch(() => {})
    .then(() => persistVocabularyEntries(entriesToMerge));

  return vocabularyPersistPromise;
}

function collectVocabularyEntries({ uniqueWords, translations, settings, providerByWord = {} }) {
  if (!Array.isArray(uniqueWords) || uniqueWords.length === 0) {
    return [];
  }

  const now = Date.now();
  const entries = [];

  for (const word of uniqueWords) {
    if (typeof word !== 'string' || !word.trim()) {
      continue;
    }

    const normalized = word.toLowerCase();
    const translated = translations[normalized];
    if (typeof translated !== 'string' || !translated.trim()) {
      continue;
    }

    entries.push({
      source: word.trim(),
      translation: translated.trim(),
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      provider: providerByWord[normalized] ?? CACHE_PROVIDER_LABEL,
      firstSeenAt: now,
      lastSeenAt: now,
      count: 1
    });
  }

  return entries;
}

function finalizeTranslationBatch({ uniqueWords, translations, settings, providerByWord }) {
  const successCount = Object.keys(translations).length;
  if (successCount > 0) {
    void persistTranslationHealth({
      successCount,
      providerByWord
    });
  }

  if (!settings?.saveVocabulary) {
    return;
  }

  const vocabularyEntries = collectVocabularyEntries({
    uniqueWords,
    translations,
    settings,
    providerByWord
  });
  if (vocabularyEntries.length > 0) {
    void queueVocabularyPersistence(vocabularyEntries);
  }
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
  const providerByWord = {};
  const uniqueWords = toUniqueWords(words);
  const misses = [];
  const now = Date.now();

  for (const word of uniqueWords) {
    const normalized = word.toLowerCase();
    if (cache[normalized]) {
      translations[normalized] = cache[normalized];
      providerByWord[normalized] = CACHE_PROVIDER_LABEL;
      void window.log?.(`Cache hit: ${word}`);
      continue;
    }

    if (isMissCached(normalized, now)) {
      void window.log?.(`Miss cache hit: ${word}`);
      continue;
    }

    misses.push(word);
  }

  const settings = await getTranslationSettings();

  if (misses.length === 0) {
    finalizeTranslationBatch({
      uniqueWords,
      translations,
      settings,
      providerByWord
    });

    return translations;
  }

  void window.log?.(
    `Word translation batch started: ${JSON.stringify(misses)} (provider=${settings.translationProvider})`
  );

  const fetched = await requestBackgroundTranslations(misses, settings);
  if (!fetched) {
    void window.log?.('Translation batch failed in background bridge');

    for (const word of misses) {
      markMissCached(word.toLowerCase(), now, BRIDGE_FAILURE_BACKOFF_MS);
    }

    finalizeTranslationBatch({
      uniqueWords,
      translations,
      settings,
      providerByWord
    });

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
      providerByWord[normalized] = providerUsed;
      void window.log?.(`Translation success (${providerUsed}): ${normalized} -> ${cleanTranslated}`);
    } else {
      providerByWord[normalized] = UNKNOWN_PROVIDER_LABEL;
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

  finalizeTranslationBatch({
    uniqueWords,
    translations,
    settings,
    providerByWord
  });

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
