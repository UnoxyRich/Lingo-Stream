const DEFAULT_SETTINGS = {
  translationProvider: 'auto',
  targetLanguage: 'es',
  replacementPercentage: 5,
  enabled: true,
  saveVocabulary: true
};
const DEBUG_STORAGE_KEYS = {
  enabled: 'debug',
  logs: 'debugLogs'
};
const LOCAL_STORAGE_KEYS = {
  lastTranslationSuccessAt: 'lastTranslationSuccessAt',
  lastTranslationSuccessProvider: 'lastTranslationSuccessProvider',
  lastTranslationSuccessCount: 'lastTranslationSuccessCount',
  vocabularyEntries: 'vocabularyEntries',
  vocabularyQuizBuckets: 'vocabularyQuizBuckets'
};
const LOG_POLL_INTERVAL_MS = 500;
const SUPPORTED_PROVIDERS = new Set(['auto', 'google', 'libre', 'apertium', 'mymemory']);
const CONTENT_READY_MESSAGE = 'LINGO_STREAM_HEALTH_CHECK';
const CONTENT_REFRESH_MESSAGE = 'LINGO_STREAM_FORCE_REFRESH';

const storageKeys = Object.keys(DEFAULT_SETTINGS);

const translationProviderSelect = document.getElementById('translationProvider');
const targetLanguageSelect = document.getElementById('targetLanguage');
const replacementPercentageInput = document.getElementById('replacementPercentage');
const replacementPercentageValue = document.getElementById('replacementPercentageValue');
const enabledInput = document.getElementById('enabled');
const saveVocabularyInput = document.getElementById('saveVocabulary');
const saveButton = document.getElementById('saveButton');
const saveStatus = document.getElementById('saveStatus');
const runtimeStatus = document.getElementById('runtimeStatus');
const attachButton = document.getElementById('attachButton');
const quizButton = document.getElementById('quizButton');
const contentHealthStatus = document.getElementById('contentHealthStatus');
const translationHealthStatus = document.getElementById('translationHealthStatus');
const recheckHealthButton = document.getElementById('recheckHealthButton');
const vocabularyStatus = document.getElementById('vocabularyStatus');
const quizBucketStatus = document.getElementById('quizBucketStatus');
const vocabularyTotalBadge = document.getElementById('vocabularyTotalBadge');
const vocabularyFilteredBadge = document.getElementById('vocabularyFilteredBadge');
const vocabularyProviderBadge = document.getElementById('vocabularyProviderBadge');
const vocabularyFilterInput = document.getElementById('vocabularyFilterInput');
const vocabularyLanguageFilter = document.getElementById('vocabularyLanguageFilter');
const vocabularyProviderFilter = document.getElementById('vocabularyProviderFilter');
const vocabularyDateFrom = document.getElementById('vocabularyDateFrom');
const vocabularyDateTo = document.getElementById('vocabularyDateTo');
const vocabularyClearFiltersButton = document.getElementById('vocabularyClearFiltersButton');
const vocabularyEmptyState = document.getElementById('vocabularyEmptyState');
const vocabularyList = document.getElementById('vocabularyList');
const vocabularyTableBody = document.getElementById('vocabularyTableBody');
const importVocabularyButton = document.getElementById('importVocabularyButton');
const importVocabularyInput = document.getElementById('importVocabularyInput');
const exportVocabularyButton = document.getElementById('exportVocabularyButton');
const clearVocabularyButton = document.getElementById('clearVocabularyButton');
const vocabularyActionStatus = document.getElementById('vocabularyActionStatus');
const debugEnabledInput = document.getElementById('debugEnabled');
const clearLogsButton = document.getElementById('clearLogsButton');
const logPanel = document.getElementById('logPanel');

let logPollTimer = null;
let currentVocabularyEntries = [];
let currentQuizBuckets = {
  notQuizzed: [],
  correct: [],
  incorrect: []
};

function getAnime() {
  if (typeof window === 'undefined') {
    return null;
  }

  return typeof window.anime === 'function' ? window.anime : null;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateNode(node, config) {
  if (!(node instanceof HTMLElement) || prefersReducedMotion()) {
    return;
  }

  const anime = getAnime();
  if (!anime) {
    return;
  }

  anime.remove(node);
  anime({
    targets: node,
    ...config
  });
}

function setTextWithPulse(node, value) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const nextText = String(value);
  const previousText = node.textContent ?? '';
  node.textContent = nextText;

  if (previousText !== nextText) {
    animateNode(node, {
      scale: [1, 1.08, 1],
      duration: 260,
      easing: 'easeOutQuad'
    });
  }
}

function getButtonLabel(button, fallback = '') {
  if (!(button instanceof HTMLButtonElement)) {
    return fallback;
  }

  const textNode = button.querySelector('.btn-text');
  if (textNode) {
    return textNode.textContent ?? fallback;
  }

  return button.textContent ?? fallback;
}

function setButtonLabel(button, value) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const textNode = button.querySelector('.btn-text');
  if (textNode) {
    textNode.textContent = value;
    return;
  }

  button.textContent = value;
}

function attachPopupRevealAnimation() {
  const revealNodes = Array.from(document.querySelectorAll('[data-reveal]'));
  if (revealNodes.length === 0) {
    return;
  }

  const anime = getAnime();
  if (!anime || prefersReducedMotion()) {
    for (const node of revealNodes) {
      node.classList.add('is-visible');
    }
    return;
  }

  anime({
    targets: revealNodes,
    opacity: [0, 1],
    translateY: [10, 0],
    scale: [0.99, 1],
    delay: (_target, index) => {
      const node = revealNodes[index];
      const explicitDelay = Number.parseInt(node?.dataset.delay ?? '0', 10);
      return Number.isFinite(explicitDelay) ? explicitDelay : index * 55;
    },
    duration: 360,
    easing: 'easeOutExpo',
    begin: () => {
      for (const node of revealNodes) {
        node.classList.add('is-visible');
      }
    }
  });
}

function attachButtonPressAnimation() {
  const anime = getAnime();
  if (!anime || prefersReducedMotion()) {
    return;
  }

  const buttons = Array.from(document.querySelectorAll('button'));
  for (const button of buttons) {
    button.addEventListener('click', () => {
      animateNode(button, {
        scale: [1, 0.97, 1],
        duration: 180,
        easing: 'easeOutQuad'
      });
    });
  }
}

function updateReplacementLabel(value) {
  setTextWithPulse(replacementPercentageValue, `${value}%`);
}

function setStatusElement(element, message, tone = 'neutral') {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const previousMessage = element.textContent ?? '';
  element.textContent = message;
  element.classList.remove('ok', 'error');

  if (tone === 'ok') {
    element.classList.add('ok');
  } else if (tone === 'error') {
    element.classList.add('error');
  }

  if (message && message !== previousMessage) {
    animateNode(element, {
      opacity: [0.2, 1],
      translateY: [4, 0],
      duration: 220,
      easing: 'easeOutQuad'
    });
  }
}

function readFormSettings() {
  const replacementPercentage = Number.parseInt(replacementPercentageInput.value, 10);

  return {
    translationProvider: SUPPORTED_PROVIDERS.has(translationProviderSelect.value)
      ? translationProviderSelect.value
      : DEFAULT_SETTINGS.translationProvider,
    targetLanguage: targetLanguageSelect.value,
    replacementPercentage: Number.isFinite(replacementPercentage)
      ? Math.max(0, Math.min(100, replacementPercentage))
      : DEFAULT_SETTINGS.replacementPercentage,
    enabled: enabledInput.checked,
    saveVocabulary: saveVocabularyInput.checked
  };
}

function applySettingsToForm(settings) {
  const safeProvider = SUPPORTED_PROVIDERS.has(settings.translationProvider)
    ? settings.translationProvider
    : DEFAULT_SETTINGS.translationProvider;

  translationProviderSelect.value = safeProvider;
  targetLanguageSelect.value = settings.targetLanguage;
  replacementPercentageInput.value = String(settings.replacementPercentage);
  enabledInput.checked = settings.enabled;
  saveVocabularyInput.checked = settings.saveVocabulary === true;
  updateReplacementLabel(settings.replacementPercentage);
}

function showStatus(message, isError = false) {
  setStatusElement(saveStatus, message, isError ? 'error' : (message ? 'ok' : 'neutral'));
}

function showRuntimeStatus(message, isError = false) {
  setStatusElement(runtimeStatus, message, isError ? 'error' : (message ? 'ok' : 'neutral'));
}

function showVocabularyActionStatus(message, tone = 'neutral') {
  if (!vocabularyActionStatus) {
    return;
  }

  setStatusElement(vocabularyActionStatus, message, tone);
}

function openQuizTab() {
  const quizUrl = chrome.runtime.getURL('quiz.html');
  chrome.tabs.create({ url: quizUrl }, () => {
    if (chrome.runtime.lastError) {
      showRuntimeStatus(`Unable to open quiz: ${chrome.runtime.lastError.message}`, true);
    }
  });
}

function isYouTubeUrl(url) {
  if (typeof url !== 'string' || !url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(Array.isArray(tabs) ? (tabs[0] ?? null) : null);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, response: null, error: chrome.runtime.lastError.message });
        return;
      }

      resolve({ ok: true, response });
    });
  });
}

function getLocalStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }

      resolve(items ?? {});
    });
  });
}

function setLocalStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function showContentHealth(message, isError = false) {
  setStatusElement(contentHealthStatus, message, isError ? 'error' : (message ? 'ok' : 'neutral'));
}

function formatHealthTimestamp(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const asDate = new Date(timestamp);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  return asDate.toLocaleString();
}

function renderTranslationHealth(items) {
  const timestamp = Number(items?.[LOCAL_STORAGE_KEYS.lastTranslationSuccessAt]);
  const provider = typeof items?.[LOCAL_STORAGE_KEYS.lastTranslationSuccessProvider] === 'string'
    ? items[LOCAL_STORAGE_KEYS.lastTranslationSuccessProvider].trim()
    : '';
  const count = Number(items?.[LOCAL_STORAGE_KEYS.lastTranslationSuccessCount]);
  const formattedTimestamp = formatHealthTimestamp(timestamp);

  if (!formattedTimestamp) {
    setStatusElement(translationHealthStatus, 'Last translation success: none yet.', 'neutral');
    return;
  }

  const providerLabel = provider ? ` via ${provider}` : '';
  const countLabel = Number.isFinite(count) && count > 0 ? ` (${count} words)` : '';
  setStatusElement(
    translationHealthStatus,
    `Last translation success: ${formattedTimestamp}${providerLabel}${countLabel}.`,
    'ok'
  );
}

function parseTimestampCandidate(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseCountCandidate(value) {
  if (Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed)) {
    return Math.max(1, parsed);
  }

  return 1;
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
  const sourceLanguage = entry.sourceLanguage.trim();
  const targetLanguage = entry.targetLanguage.trim();

  if (!source || !translation || !sourceLanguage || !targetLanguage) {
    return null;
  }

  return {
    source,
    translation,
    sourceLanguage,
    targetLanguage,
    provider: typeof entry.provider === 'string' ? entry.provider.trim() : '',
    count: parseCountCandidate(entry.count),
    firstSeenAt: parseTimestampCandidate(entry.firstSeenAt),
    lastSeenAt: parseTimestampCandidate(entry.lastSeenAt)
  };
}

function createVocabularyKey(entry) {
  return [
    entry.source.toLowerCase(),
    entry.translation.toLowerCase(),
    entry.sourceLanguage.toLowerCase(),
    entry.targetLanguage.toLowerCase()
  ].join('|');
}

function mergeVocabularyEntries(baseEntry, incomingEntry) {
  const merged = {
    ...baseEntry,
    provider: incomingEntry.provider || baseEntry.provider,
    count: parseCountCandidate(baseEntry.count) + parseCountCandidate(incomingEntry.count),
    firstSeenAt: null,
    lastSeenAt: null
  };

  const firstSeenCandidates = [baseEntry.firstSeenAt, incomingEntry.firstSeenAt].filter((value) => Number.isFinite(value));
  merged.firstSeenAt = firstSeenCandidates.length > 0 ? Math.min(...firstSeenCandidates) : null;

  const lastSeenCandidates = [baseEntry.lastSeenAt, incomingEntry.lastSeenAt].filter((value) => Number.isFinite(value));
  merged.lastSeenAt = lastSeenCandidates.length > 0 ? Math.max(...lastSeenCandidates) : null;

  return merged;
}

function normalizeQuizBucketEntry(entry) {
  const normalized = normalizeVocabularyEntry(entry);
  if (!normalized) {
    return null;
  }

  const wrongCountRaw = Number.parseInt(String(entry?.wrongCount ?? 0), 10);
  const wrongCount = Number.isFinite(wrongCountRaw) ? Math.max(0, wrongCountRaw) : 0;
  const lastQuizAt = parseTimestampCandidate(entry?.lastQuizAt);

  return {
    ...normalized,
    wrongCount,
    lastQuizAt
  };
}

function sortEntriesByRecency(entries) {
  return [...entries].sort((left, right) => {
    const leftLast = Number.isFinite(left.lastSeenAt) ? left.lastSeenAt : 0;
    const rightLast = Number.isFinite(right.lastSeenAt) ? right.lastSeenAt : 0;
    return rightLast - leftLast;
  });
}

function upsertBucketEntry(map, entry) {
  const key = createVocabularyKey(entry);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, entry);
    return;
  }

  const merged = mergeVocabularyEntries(existing, entry);
  merged.wrongCount = Math.max(
    Number.isFinite(existing.wrongCount) ? existing.wrongCount : 0,
    Number.isFinite(entry.wrongCount) ? entry.wrongCount : 0
  );
  const existingQuiz = Number.isFinite(existing.lastQuizAt) ? existing.lastQuizAt : null;
  const nextQuiz = Number.isFinite(entry.lastQuizAt) ? entry.lastQuizAt : null;
  merged.lastQuizAt = Number.isFinite(existingQuiz) && Number.isFinite(nextQuiz)
    ? Math.max(existingQuiz, nextQuiz)
    : (existingQuiz ?? nextQuiz);
  map.set(key, merged);
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
    notQuizzed: sortEntriesByRecency(Array.from(notQuizzedMap.values())),
    correct: sortEntriesByRecency(Array.from(correctMap.values())),
    incorrect: sortEntriesByRecency(Array.from(incorrectMap.values()))
  };
}

function getVocabularyEntriesFromItems(items) {
  const raw = items?.[LOCAL_STORAGE_KEYS.vocabularyEntries];
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => normalizeVocabularyEntry(entry))
    .filter((entry) => entry !== null);
}

function renderVocabularyStatus(entries, buckets = currentQuizBuckets) {
  const count = Array.isArray(entries) ? entries.length : 0;
  setStatusElement(vocabularyStatus, `Saved words: ${count}`, count > 0 ? 'ok' : 'neutral');

  if (quizBucketStatus) {
    const notQuizzedCount = Array.isArray(buckets?.notQuizzed) ? buckets.notQuizzed.length : 0;
    const correctCount = Array.isArray(buckets?.correct) ? buckets.correct.length : 0;
    const incorrectCount = Array.isArray(buckets?.incorrect) ? buckets.incorrect.length : 0;
    setStatusElement(
      quizBucketStatus,
      `Not quizzed: ${notQuizzedCount} | Correct: ${correctCount} | Incorrect: ${incorrectCount}`,
      'neutral'
    );
  }

  exportVocabularyButton.disabled = count === 0;
  clearVocabularyButton.disabled = count === 0;
}

function renderVocabularyBadges(entries, filteredEntries) {
  const totalCount = Array.isArray(entries) ? entries.length : 0;
  const filteredCount = Array.isArray(filteredEntries) ? filteredEntries.length : 0;

  const providerSet = new Set();
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const provider = typeof entry.provider === 'string' && entry.provider.trim()
        ? entry.provider.trim().toLowerCase()
        : 'unknown';
      providerSet.add(provider);
    }
  }

  if (vocabularyTotalBadge) {
    setTextWithPulse(vocabularyTotalBadge, totalCount);
  }
  if (vocabularyFilteredBadge) {
    setTextWithPulse(vocabularyFilteredBadge, filteredCount);
  }
  if (vocabularyProviderBadge) {
    setTextWithPulse(vocabularyProviderBadge, providerSet.size);
  }
}

function createVocabularyRow(entry) {
  const row = document.createElement('tr');
  const sourceCell = document.createElement('td');
  const translationCell = document.createElement('td');
  const countCell = document.createElement('td');

  sourceCell.textContent = entry.source;
  translationCell.textContent = entry.translation;
  countCell.textContent = String(entry.count);

  row.append(sourceCell, translationCell, countCell);
  return row;
}

function parseDateBoundary(value, asEndOfDay = false) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const [yearValue, monthValue, dayValue] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(yearValue) || !Number.isFinite(monthValue) || !Number.isFinite(dayValue)) {
    return null;
  }

  const date = asEndOfDay
    ? new Date(yearValue, monthValue - 1, dayValue, 23, 59, 59, 999)
    : new Date(yearValue, monthValue - 1, dayValue, 0, 0, 0, 0);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getVocabularyEntryTimestamp(entry) {
  if (Number.isFinite(entry?.lastSeenAt)) {
    return entry.lastSeenAt;
  }

  if (Number.isFinite(entry?.firstSeenAt)) {
    return entry.firstSeenAt;
  }

  return null;
}

function getVocabularyFilterQuery() {
  return typeof vocabularyFilterInput?.value === 'string'
    ? vocabularyFilterInput.value.trim().toLowerCase()
    : '';
}

function getVocabularyLanguageFilterValue() {
  return typeof vocabularyLanguageFilter?.value === 'string'
    ? vocabularyLanguageFilter.value.trim().toLowerCase()
    : '';
}

function getVocabularyProviderFilterValue() {
  return typeof vocabularyProviderFilter?.value === 'string'
    ? vocabularyProviderFilter.value.trim().toLowerCase()
    : '';
}

function hasActiveVocabularyFilters() {
  return (
    getVocabularyFilterQuery().length > 0 ||
    getVocabularyLanguageFilterValue().length > 0 ||
    getVocabularyProviderFilterValue().length > 0 ||
    (typeof vocabularyDateFrom?.value === 'string' && vocabularyDateFrom.value.trim().length > 0) ||
    (typeof vocabularyDateTo?.value === 'string' && vocabularyDateTo.value.trim().length > 0)
  );
}

function renderDynamicSelectOptions(selectNode, options, placeholderLabel) {
  if (!(selectNode instanceof HTMLSelectElement)) {
    return;
  }

  const previousValue = selectNode.value;
  selectNode.textContent = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholderLabel;
  selectNode.appendChild(placeholderOption);

  const sortedOptions = [...options].sort((left, right) => left.label.localeCompare(right.label));
  for (const option of sortedOptions) {
    const optionNode = document.createElement('option');
    optionNode.value = option.value;
    optionNode.textContent = option.label;
    selectNode.appendChild(optionNode);
  }

  const hasPreviousValue = sortedOptions.some((option) => option.value === previousValue);
  selectNode.value = hasPreviousValue ? previousValue : '';
}

function updateVocabularyFilterControls(entries) {
  const providerCounts = new Map();
  const languageCounts = new Map();

  for (const entry of entries) {
    const languageKey = `${entry.sourceLanguage.toLowerCase()}->${entry.targetLanguage.toLowerCase()}`;
    languageCounts.set(languageKey, (languageCounts.get(languageKey) ?? 0) + 1);

    const providerKey = typeof entry.provider === 'string' && entry.provider.trim()
      ? entry.provider.trim().toLowerCase()
      : 'unknown';
    providerCounts.set(providerKey, (providerCounts.get(providerKey) ?? 0) + 1);
  }

  renderDynamicSelectOptions(
    vocabularyLanguageFilter,
    Array.from(languageCounts.entries()).map(([value, count]) => ({
      value,
      label: `${value} (${count})`
    })),
    'All language pairs'
  );

  renderDynamicSelectOptions(
    vocabularyProviderFilter,
    Array.from(providerCounts.entries()).map(([value, count]) => ({
      value,
      label: `${value} (${count})`
    })),
    'All providers'
  );
}

function getFilteredVocabularyEntries(entries) {
  const query = getVocabularyFilterQuery();
  const languageFilter = getVocabularyLanguageFilterValue();
  const providerFilter = getVocabularyProviderFilterValue();
  const dateFromTimestamp = parseDateBoundary(vocabularyDateFrom?.value ?? '', false);
  const dateToTimestamp = parseDateBoundary(vocabularyDateTo?.value ?? '', true);

  return entries.filter((entry) => {
    const source = entry.source.toLowerCase();
    const translation = entry.translation.toLowerCase();
    const languagePair = `${entry.sourceLanguage}->${entry.targetLanguage}`.toLowerCase();

    if (query && !(source.includes(query) || translation.includes(query) || languagePair.includes(query))) {
      return false;
    }

    if (languageFilter && languagePair !== languageFilter) {
      return false;
    }

    const provider = typeof entry.provider === 'string' && entry.provider.trim()
      ? entry.provider.trim().toLowerCase()
      : 'unknown';
    if (providerFilter && provider !== providerFilter) {
      return false;
    }

    const timestamp = getVocabularyEntryTimestamp(entry);
    if (Number.isFinite(dateFromTimestamp) && (!Number.isFinite(timestamp) || timestamp < dateFromTimestamp)) {
      return false;
    }

    if (Number.isFinite(dateToTimestamp) && (!Number.isFinite(timestamp) || timestamp > dateToTimestamp)) {
      return false;
    }

    return true;
  });
}

function renderVocabularyList(entries) {
  if (!vocabularyTableBody || !vocabularyList || !vocabularyEmptyState) {
    return;
  }

  updateVocabularyFilterControls(entries);
  const filtered = getFilteredVocabularyEntries(entries);
  const hasEntries = filtered.length > 0;
  const hasFilter = hasActiveVocabularyFilters();

  vocabularyTableBody.textContent = '';
  for (const entry of filtered) {
    vocabularyTableBody.appendChild(createVocabularyRow(entry));
  }

  const anime = getAnime();
  if (anime && !prefersReducedMotion() && filtered.length > 0) {
    anime.remove(vocabularyTableBody.children);
    anime({
      targets: vocabularyTableBody.children,
      opacity: [0, 1],
      translateY: [6, 0],
      delay: anime.stagger(18),
      duration: 210,
      easing: 'easeOutQuad'
    });
  }

  renderVocabularyBadges(entries, filtered);
  vocabularyList.classList.toggle('hidden', !hasEntries);
  vocabularyEmptyState.classList.toggle('hidden', hasEntries);
  vocabularyEmptyState.textContent = hasFilter
    ? 'No saved words match this filter.'
    : 'No saved words yet.';
}

function renderVocabulary(entries, buckets = currentQuizBuckets) {
  currentVocabularyEntries = Array.isArray(entries) ? entries : [];
  currentQuizBuckets = normalizeQuizBuckets(buckets, currentVocabularyEntries);
  renderVocabularyStatus(currentVocabularyEntries, currentQuizBuckets);
  renderVocabularyList(currentVocabularyEntries);
}

function csvEscapeCell(value) {
  const normalized = String(value ?? '');
  if (/["\n,]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function toIsoOrEmpty(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function buildVocabularyCsv(entries) {
  const header = [
    'source',
    'translation',
    'sourceLanguage',
    'targetLanguage',
    'provider',
    'count',
    'firstSeenAt',
    'lastSeenAt'
  ];
  const rows = [header.join(',')];

  for (const entry of entries) {
    rows.push(
      [
        csvEscapeCell(entry.source),
        csvEscapeCell(entry.translation),
        csvEscapeCell(entry.sourceLanguage),
        csvEscapeCell(entry.targetLanguage),
        csvEscapeCell(entry.provider || ''),
        csvEscapeCell(entry.count),
        csvEscapeCell(toIsoOrEmpty(entry.firstSeenAt)),
        csvEscapeCell(toIsoOrEmpty(entry.lastSeenAt))
      ].join(',')
    );
  }

  return rows.join('\n');
}

function mergeVocabularyEntryArrays(baseEntries, incomingEntries) {
  const byKey = new Map();

  for (const entry of baseEntries) {
    const normalized = normalizeVocabularyEntry(entry);
    if (!normalized) {
      continue;
    }
    byKey.set(createVocabularyKey(normalized), normalized);
  }

  for (const entry of incomingEntries) {
    const normalized = normalizeVocabularyEntry(entry);
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

  return sortEntriesByRecency(Array.from(byKey.values()));
}

function ingestEntriesIntoQuizBuckets(rawBuckets, incomingEntries, fallbackEntries = []) {
  const normalizedBuckets = normalizeQuizBuckets(rawBuckets, fallbackEntries);
  const notQuizzedMap = new Map(
    normalizedBuckets.notQuizzed.map((entry) => [createVocabularyKey(entry), entry])
  );
  const correctMap = new Map(
    normalizedBuckets.correct.map((entry) => [createVocabularyKey(entry), entry])
  );
  const incorrectMap = new Map(
    normalizedBuckets.incorrect.map((entry) => [createVocabularyKey(entry), entry])
  );

  for (const rawEntry of incomingEntries) {
    const entry = normalizeQuizBucketEntry(rawEntry);
    if (!entry) {
      continue;
    }

    const key = createVocabularyKey(entry);
    if (correctMap.has(key)) {
      notQuizzedMap.delete(key);
      incorrectMap.delete(key);
      continue;
    }

    if (incorrectMap.has(key)) {
      const mergedIncorrect = mergeVocabularyEntries(incorrectMap.get(key), entry);
      mergedIncorrect.wrongCount = Math.max(
        Number.isFinite(incorrectMap.get(key)?.wrongCount) ? incorrectMap.get(key).wrongCount : 0,
        Number.isFinite(entry.wrongCount) ? entry.wrongCount : 0
      );
      mergedIncorrect.lastQuizAt = Number.isFinite(incorrectMap.get(key)?.lastQuizAt)
        ? incorrectMap.get(key).lastQuizAt
        : (Number.isFinite(entry.lastQuizAt) ? entry.lastQuizAt : null);
      incorrectMap.set(key, mergedIncorrect);
      continue;
    }

    const existingNotQuizzed = notQuizzedMap.get(key);
    if (!existingNotQuizzed) {
      notQuizzedMap.set(key, entry);
      continue;
    }

    notQuizzedMap.set(key, mergeVocabularyEntries(existingNotQuizzed, entry));
  }

  for (const key of correctMap.keys()) {
    notQuizzedMap.delete(key);
    incorrectMap.delete(key);
  }

  for (const key of incorrectMap.keys()) {
    notQuizzedMap.delete(key);
  }

  return {
    notQuizzed: sortEntriesByRecency(Array.from(notQuizzedMap.values())),
    correct: sortEntriesByRecency(Array.from(correctMap.values())),
    incorrect: sortEntriesByRecency(Array.from(incorrectMap.values()))
  };
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(cell);
      cell = '';
      if (row.some((value) => String(value).trim() !== '')) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => String(value).trim() !== '')) {
    rows.push(row);
  }

  return rows;
}

function normalizeImportHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function parseVocabularyCsv(csvText) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return [];
  }

  const headerIndexMap = new Map();
  rows[0].forEach((cell, index) => {
    headerIndexMap.set(normalizeImportHeader(cell), index);
  });

  const getCell = (row, key) => {
    const index = headerIndexMap.get(key);
    return typeof index === 'number' ? row[index] : '';
  };

  const parsedEntries = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const sourceLanguage = getCell(row, 'sourcelanguage') || getCell(row, 'sl') || 'en';
    const targetLanguage = getCell(row, 'targetlanguage') || getCell(row, 'tl') || 'es';
    const entry = normalizeVocabularyEntry({
      source: getCell(row, 'source'),
      translation: getCell(row, 'translation'),
      sourceLanguage,
      targetLanguage,
      provider: getCell(row, 'provider'),
      count: getCell(row, 'count'),
      firstSeenAt: getCell(row, 'firstseenat'),
      lastSeenAt: getCell(row, 'lastseenat')
    });
    if (entry) {
      parsedEntries.push(entry);
    }
  }

  return parsedEntries;
}

function parseVocabularyJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  const sourceArray = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.vocabularyEntries) ? parsed.vocabularyEntries : []);

  const entries = [];
  for (const candidate of sourceArray) {
    const normalized = normalizeVocabularyEntry(candidate);
    if (normalized) {
      entries.push(normalized);
    }
  }

  return entries;
}

function clearVocabularyFilters() {
  if (vocabularyFilterInput) {
    vocabularyFilterInput.value = '';
  }
  if (vocabularyLanguageFilter) {
    vocabularyLanguageFilter.value = '';
  }
  if (vocabularyProviderFilter) {
    vocabularyProviderFilter.value = '';
  }
  if (vocabularyDateFrom) {
    vocabularyDateFrom.value = '';
  }
  if (vocabularyDateTo) {
    vocabularyDateTo.value = '';
  }

  renderVocabularyList(currentVocabularyEntries);
}

function triggerAnchorDownload(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
}

function scheduleBlobCleanup(url) {
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 5000);
}

function downloadTextFile({ filename, content, mimeType }) {
  return new Promise((resolve) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    if (typeof chrome.downloads?.download === 'function') {
      chrome.downloads.download(
        {
          url,
          filename,
          saveAs: true,
          conflictAction: 'uniquify'
        },
        (downloadId) => {
          const hasError = Boolean(chrome.runtime.lastError) || !Number.isFinite(downloadId);
          if (hasError) {
            try {
              triggerAnchorDownload(url, filename);
              resolve(true);
            } catch {
              resolve(false);
            }
            scheduleBlobCleanup(url);
            return;
          }

          resolve(true);
          scheduleBlobCleanup(url);
        }
      );
      return;
    }

    try {
      triggerAnchorDownload(url, filename);
      resolve(true);
    } catch {
      resolve(false);
    }

    scheduleBlobCleanup(url);
  });
}

async function loadTranslationHealth() {
  const items = await getLocalStorage([
    LOCAL_STORAGE_KEYS.lastTranslationSuccessAt,
    LOCAL_STORAGE_KEYS.lastTranslationSuccessProvider,
    LOCAL_STORAGE_KEYS.lastTranslationSuccessCount
  ]);
  renderTranslationHealth(items);
}

async function loadVocabularyStatus() {
  const items = await getLocalStorage([
    LOCAL_STORAGE_KEYS.vocabularyEntries,
    LOCAL_STORAGE_KEYS.vocabularyQuizBuckets
  ]);
  const entries = getVocabularyEntriesFromItems(items);
  const buckets = normalizeQuizBuckets(items?.[LOCAL_STORAGE_KEYS.vocabularyQuizBuckets], entries);
  renderVocabulary(entries, buckets);
}

async function importVocabularyFromFile(file) {
  if (!file) {
    return;
  }

  const originalImportLabel = getButtonLabel(importVocabularyButton, 'Import');
  if (importVocabularyButton) {
    importVocabularyButton.disabled = true;
    setButtonLabel(importVocabularyButton, 'Importing...');
  }
  showVocabularyActionStatus('Reading import file...');

  const filename = String(file.name || '').toLowerCase();
  const fileText = await file.text();
  let importedEntries = [];

  try {
    const looksLikeJson = filename.endsWith('.json') || fileText.trim().startsWith('{') || fileText.trim().startsWith('[');
    importedEntries = looksLikeJson ? parseVocabularyJson(fileText) : parseVocabularyCsv(fileText);
  } catch (error) {
    showVocabularyActionStatus(`Import failed: ${error instanceof Error ? error.message : 'invalid file format'}`, 'error');
    if (importVocabularyButton) {
      importVocabularyButton.disabled = false;
      setButtonLabel(importVocabularyButton, originalImportLabel);
    }
    return;
  }

  if (!Array.isArray(importedEntries) || importedEntries.length === 0) {
    showVocabularyActionStatus('Import failed: no valid vocabulary entries found.', 'error');
    if (importVocabularyButton) {
      importVocabularyButton.disabled = false;
      setButtonLabel(importVocabularyButton, originalImportLabel);
    }
    return;
  }

  const items = await getLocalStorage([
    LOCAL_STORAGE_KEYS.vocabularyEntries,
    LOCAL_STORAGE_KEYS.vocabularyQuizBuckets
  ]);

  const existingEntries = getVocabularyEntriesFromItems(items);
  const mergedEntries = mergeVocabularyEntryArrays(existingEntries, importedEntries);
  const mergedBuckets = ingestEntriesIntoQuizBuckets(
    items?.[LOCAL_STORAGE_KEYS.vocabularyQuizBuckets],
    importedEntries,
    existingEntries
  );

  const success = await setLocalStorage({
    [LOCAL_STORAGE_KEYS.vocabularyEntries]: mergedEntries,
    [LOCAL_STORAGE_KEYS.vocabularyQuizBuckets]: mergedBuckets
  });

  if (!success) {
    showVocabularyActionStatus('Unable to store imported vocabulary.', 'error');
    if (importVocabularyButton) {
      importVocabularyButton.disabled = false;
      setButtonLabel(importVocabularyButton, originalImportLabel);
    }
    return;
  }

  renderVocabulary(mergedEntries, mergedBuckets);
  showVocabularyActionStatus(`Imported ${importedEntries.length} entries from ${file.name}.`, 'ok');
  if (importVocabularyButton) {
    importVocabularyButton.disabled = false;
    setButtonLabel(importVocabularyButton, originalImportLabel);
  }
}

async function checkContentConnection() {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    attachButton.disabled = true;
    showContentHealth('Content script: no active tab detected.', true);
    return;
  }

  const tabUrl = typeof activeTab.url === 'string' ? activeTab.url : '';
  if (tabUrl && !isYouTubeUrl(tabUrl)) {
    attachButton.disabled = true;
    showContentHealth('Content script: open a YouTube video tab first.', true);
    return;
  }

  attachButton.disabled = false;
  const ping = await sendTabMessage(activeTab.id, { type: CONTENT_READY_MESSAGE });

  if (ping.ok && ping.response?.ok) {
    showContentHealth('Content script: connected to active tab.');
    return;
  }

  showContentHealth('Content script: not connected. Refresh the YouTube tab and recheck.', true);
}

async function refreshHealthPanel() {
  await Promise.all([
    checkContentConnection(),
    loadTranslationHealth(),
    loadVocabularyStatus()
  ]);
}

async function refreshActiveCaptions() {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    showRuntimeStatus('No active tab detected.', true);
    return;
  }

  const tabUrl = typeof activeTab.url === 'string' ? activeTab.url : '';
  if (tabUrl && !isYouTubeUrl(tabUrl)) {
    showRuntimeStatus('Open a YouTube video tab first.', true);
    return;
  }

  const result = await sendTabMessage(activeTab.id, { type: CONTENT_REFRESH_MESSAGE });
  if (!result.ok || !result.response?.ok) {
    showRuntimeStatus('Content script not connected. Refresh the YouTube tab first.', true);
    return;
  }

  showRuntimeStatus('Refresh signal sent to content script.');
}

async function exportVocabulary() {
  const originalExportLabel = getButtonLabel(exportVocabularyButton, 'Export');
  exportVocabularyButton.disabled = true;
  setButtonLabel(exportVocabularyButton, 'Exporting...');
  showVocabularyActionStatus('Preparing vocabulary export...');

  const items = await getLocalStorage([LOCAL_STORAGE_KEYS.vocabularyEntries]);
  const entries = getVocabularyEntriesFromItems(items);

  if (entries.length === 0) {
    showVocabularyActionStatus('No saved vocabulary to export.', 'error');
    setButtonLabel(exportVocabularyButton, originalExportLabel);
    exportVocabularyButton.disabled = true;
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvContent = buildVocabularyCsv(entries);
  const downloaded = await downloadTextFile({
    filename: `lingo-stream-vocabulary-${timestamp}.csv`,
    content: csvContent,
    mimeType: 'text/csv;charset=utf-8'
  });

  if (!downloaded) {
    showVocabularyActionStatus('Export failed. Please try again.', 'error');
    setButtonLabel(exportVocabularyButton, originalExportLabel);
    exportVocabularyButton.disabled = false;
    return;
  }

  showVocabularyActionStatus(`Export complete: ${entries.length} entries exported.`, 'ok');
  setButtonLabel(exportVocabularyButton, originalExportLabel);
  exportVocabularyButton.disabled = false;
}

async function clearVocabulary() {
  const originalClearLabel = getButtonLabel(clearVocabularyButton, 'Reset');
  clearVocabularyButton.disabled = true;
  setButtonLabel(clearVocabularyButton, 'Clearing...');

  const success = await setLocalStorage({
    [LOCAL_STORAGE_KEYS.vocabularyEntries]: [],
    [LOCAL_STORAGE_KEYS.vocabularyQuizBuckets]: {
      notQuizzed: [],
      correct: [],
      incorrect: []
    }
  });
  if (!success) {
    showVocabularyActionStatus('Unable to clear saved vocabulary.', 'error');
    setButtonLabel(clearVocabularyButton, originalClearLabel);
    clearVocabularyButton.disabled = false;
    return;
  }

  renderVocabulary([], {
    notQuizzed: [],
    correct: [],
    incorrect: []
  });
  showVocabularyActionStatus('Cleared all saved vocabulary.', 'ok');
  setButtonLabel(clearVocabularyButton, originalClearLabel);
  clearVocabularyButton.disabled = true;
}

function loadSettings() {
  chrome.storage.sync.get(storageKeys, (items) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load extension settings.', chrome.runtime.lastError);
      showStatus('Unable to load settings.', true);
      return;
    }

    const hasSaveVocabularySetting = typeof items.saveVocabulary === 'boolean';

    const loaded = {
      ...DEFAULT_SETTINGS,
      ...items,
      saveVocabulary: hasSaveVocabularySetting ? items.saveVocabulary : DEFAULT_SETTINGS.saveVocabulary
    };

    applySettingsToForm(loaded);

    if (!hasSaveVocabularySetting) {
      chrome.storage.sync.set({ saveVocabulary: DEFAULT_SETTINGS.saveVocabulary }, () => {});
    }

    console.log('Popup settings loaded.', loaded);
  });
}

function renderLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    logPanel.textContent = 'Live logs appear here.';
    return;
  }

  logPanel.textContent = logs.join('\n');
  logPanel.scrollTop = logPanel.scrollHeight;
}

function pollLogs() {
  chrome.storage.local.get([DEBUG_STORAGE_KEYS.logs], (items) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load debug logs.', chrome.runtime.lastError);
      return;
    }

    renderLogs(items[DEBUG_STORAGE_KEYS.logs] ?? []);
  });
}

function setDebugMode(enabled) {
  chrome.storage.local.set({ [DEBUG_STORAGE_KEYS.enabled]: enabled }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to set debug mode.', chrome.runtime.lastError);
      return;
    }

    if (enabled) {
      pollLogs();
    }
  });
}

function clearLogs() {
  chrome.storage.local.set({ [DEBUG_STORAGE_KEYS.logs]: [] }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to clear debug logs.', chrome.runtime.lastError);
      return;
    }

    renderLogs([]);
  });
}

function startLogPolling() {
  if (logPollTimer) {
    clearInterval(logPollTimer);
  }

  logPollTimer = setInterval(() => {
    pollLogs();
  }, LOG_POLL_INTERVAL_MS);
}

function loadDebugSettings() {
  chrome.storage.local.get([DEBUG_STORAGE_KEYS.enabled, DEBUG_STORAGE_KEYS.logs], (items) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load debug settings.', chrome.runtime.lastError);
      return;
    }

    const debugEnabled = items[DEBUG_STORAGE_KEYS.enabled] ?? false;
    debugEnabledInput.checked = debugEnabled;
    renderLogs(items[DEBUG_STORAGE_KEYS.logs] ?? []);
  });
}

function saveSettings() {
  const settings = readFormSettings();
  saveButton.disabled = true;
  const originalLabel = getButtonLabel(saveButton, 'Save');
  setButtonLabel(saveButton, 'Saving...');

  chrome.storage.sync.set(settings, () => {
    saveButton.disabled = false;
    setButtonLabel(saveButton, originalLabel);

    if (chrome.runtime.lastError) {
      console.error('Failed to save extension settings.', chrome.runtime.lastError);
      showStatus('Save failed.', true);
      return;
    }

    console.log('Popup settings saved.', settings);
    showStatus('Saved.');
    setTimeout(() => {
      if (saveStatus.textContent === 'Saved.') {
        showStatus('');
      }
    }, 1200);
  });
}

replacementPercentageInput.addEventListener('input', (event) => {
  updateReplacementLabel(event.target.value);
});

saveButton.addEventListener('click', saveSettings);
attachButton.addEventListener('click', refreshActiveCaptions);
quizButton?.addEventListener('click', openQuizTab);
recheckHealthButton.addEventListener('click', () => {
  showRuntimeStatus('Rechecking extension health...');
  void refreshHealthPanel().then(() => {
    if (runtimeStatus.textContent === 'Rechecking extension health...') {
      showRuntimeStatus('');
    }
  });
});
exportVocabularyButton.addEventListener('click', () => {
  void exportVocabulary();
});
importVocabularyButton?.addEventListener('click', () => {
  importVocabularyInput?.click();
});
importVocabularyInput?.addEventListener('change', () => {
  const selectedFile = importVocabularyInput.files?.[0];
  if (!selectedFile) {
    return;
  }

  void importVocabularyFromFile(selectedFile).finally(() => {
    importVocabularyInput.value = '';
  });
});
clearVocabularyButton.addEventListener('click', () => {
  void clearVocabulary();
});
vocabularyFilterInput?.addEventListener('input', () => {
  renderVocabularyList(currentVocabularyEntries);
});
vocabularyLanguageFilter?.addEventListener('change', () => {
  renderVocabularyList(currentVocabularyEntries);
});
vocabularyProviderFilter?.addEventListener('change', () => {
  renderVocabularyList(currentVocabularyEntries);
});
vocabularyDateFrom?.addEventListener('change', () => {
  renderVocabularyList(currentVocabularyEntries);
});
vocabularyDateTo?.addEventListener('change', () => {
  renderVocabularyList(currentVocabularyEntries);
});
vocabularyClearFiltersButton?.addEventListener('click', clearVocabularyFilters);
debugEnabledInput.addEventListener('change', (event) => {
  setDebugMode(event.target.checked);
});
clearLogsButton.addEventListener('click', clearLogs);

chrome.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (
    Object.prototype.hasOwnProperty.call(changes, LOCAL_STORAGE_KEYS.lastTranslationSuccessAt) ||
    Object.prototype.hasOwnProperty.call(changes, LOCAL_STORAGE_KEYS.lastTranslationSuccessProvider) ||
    Object.prototype.hasOwnProperty.call(changes, LOCAL_STORAGE_KEYS.lastTranslationSuccessCount)
  ) {
    void loadTranslationHealth();
  }

  if (Object.prototype.hasOwnProperty.call(changes, LOCAL_STORAGE_KEYS.vocabularyEntries)) {
    const entries = getVocabularyEntriesFromItems({
      [LOCAL_STORAGE_KEYS.vocabularyEntries]:
        changes[LOCAL_STORAGE_KEYS.vocabularyEntries]?.newValue ?? currentVocabularyEntries
    });
    const buckets = normalizeQuizBuckets(
      changes[LOCAL_STORAGE_KEYS.vocabularyQuizBuckets]?.newValue ?? currentQuizBuckets,
      entries
    );
    renderVocabulary(entries, buckets);
  }

  if (Object.prototype.hasOwnProperty.call(changes, LOCAL_STORAGE_KEYS.vocabularyQuizBuckets)) {
    const entries = currentVocabularyEntries;
    const buckets = normalizeQuizBuckets(
      changes[LOCAL_STORAGE_KEYS.vocabularyQuizBuckets]?.newValue,
      entries
    );
    renderVocabulary(entries, buckets);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  attachPopupRevealAnimation();
  attachButtonPressAnimation();
  loadSettings();
  loadDebugSettings();
  startLogPolling();
  void refreshHealthPanel();
});
