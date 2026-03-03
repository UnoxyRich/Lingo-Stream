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
  vocabularyEntries: 'vocabularyEntries'
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
const vocabularyFilterInput = document.getElementById('vocabularyFilterInput');
const vocabularyEmptyState = document.getElementById('vocabularyEmptyState');
const vocabularyList = document.getElementById('vocabularyList');
const vocabularyTableBody = document.getElementById('vocabularyTableBody');
const exportVocabularyButton = document.getElementById('exportVocabularyButton');
const clearVocabularyButton = document.getElementById('clearVocabularyButton');
const debugEnabledInput = document.getElementById('debugEnabled');
const clearLogsButton = document.getElementById('clearLogsButton');
const logPanel = document.getElementById('logPanel');

let logPollTimer = null;
let currentVocabularyEntries = [];

function updateReplacementLabel(value) {
  replacementPercentageValue.textContent = `${value}%`;
}

function setStatusElement(element, message, tone = 'neutral') {
  element.textContent = message;
  element.classList.remove('ok', 'error');

  if (tone === 'ok') {
    element.classList.add('ok');
  } else if (tone === 'error') {
    element.classList.add('error');
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
    count: Number.isFinite(entry.count) ? Math.max(1, Math.floor(entry.count)) : 1,
    firstSeenAt: Number.isFinite(entry.firstSeenAt) ? entry.firstSeenAt : null,
    lastSeenAt: Number.isFinite(entry.lastSeenAt) ? entry.lastSeenAt : null
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

function renderVocabularyStatus(entries) {
  const count = Array.isArray(entries) ? entries.length : 0;
  setStatusElement(vocabularyStatus, `Saved words: ${count}`, count > 0 ? 'ok' : 'neutral');
  exportVocabularyButton.disabled = count === 0;
  clearVocabularyButton.disabled = count === 0;
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

function getVocabularyFilterQuery() {
  return typeof vocabularyFilterInput?.value === 'string'
    ? vocabularyFilterInput.value.trim().toLowerCase()
    : '';
}

function getFilteredVocabularyEntries(entries) {
  const query = getVocabularyFilterQuery();
  if (!query) {
    return entries;
  }

  return entries.filter((entry) => {
    const source = entry.source.toLowerCase();
    const translation = entry.translation.toLowerCase();
    const languagePair = `${entry.sourceLanguage}->${entry.targetLanguage}`.toLowerCase();
    return source.includes(query) || translation.includes(query) || languagePair.includes(query);
  });
}

function renderVocabularyList(entries) {
  if (!vocabularyTableBody || !vocabularyList || !vocabularyEmptyState) {
    return;
  }

  const filtered = getFilteredVocabularyEntries(entries);
  const hasEntries = filtered.length > 0;
  const hasFilter = getVocabularyFilterQuery().length > 0;

  vocabularyTableBody.textContent = '';
  for (const entry of filtered) {
    vocabularyTableBody.appendChild(createVocabularyRow(entry));
  }

  vocabularyList.classList.toggle('hidden', !hasEntries);
  vocabularyEmptyState.classList.toggle('hidden', hasEntries);
  vocabularyEmptyState.textContent = hasFilter
    ? 'No saved words match this filter.'
    : 'No saved words yet.';
}

function renderVocabulary(entries) {
  currentVocabularyEntries = Array.isArray(entries) ? entries : [];
  renderVocabularyStatus(currentVocabularyEntries);
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
  const items = await getLocalStorage([LOCAL_STORAGE_KEYS.vocabularyEntries]);
  renderVocabulary(getVocabularyEntriesFromItems(items));
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
  const items = await getLocalStorage([LOCAL_STORAGE_KEYS.vocabularyEntries]);
  const entries = getVocabularyEntriesFromItems(items);

  if (entries.length === 0) {
    showRuntimeStatus('No saved vocabulary to export.', true);
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
    showRuntimeStatus('Export failed. Please try again.', true);
    return;
  }

  showRuntimeStatus(`Exported ${entries.length} vocabulary entries.`);
}

async function clearVocabulary() {
  const success = await setLocalStorage({ [LOCAL_STORAGE_KEYS.vocabularyEntries]: [] });
  if (!success) {
    showRuntimeStatus('Unable to clear saved vocabulary.', true);
    return;
  }

  renderVocabulary([]);
  showRuntimeStatus('Cleared saved vocabulary.');
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
  const originalLabel = saveButton.textContent;
  saveButton.textContent = 'Saving...';

  chrome.storage.sync.set(settings, () => {
    saveButton.disabled = false;
    saveButton.textContent = originalLabel;

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
clearVocabularyButton.addEventListener('click', () => {
  void clearVocabulary();
});
vocabularyFilterInput?.addEventListener('input', () => {
  renderVocabularyList(currentVocabularyEntries);
});
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
      [LOCAL_STORAGE_KEYS.vocabularyEntries]: changes[LOCAL_STORAGE_KEYS.vocabularyEntries]?.newValue
    });
    renderVocabulary(entries);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadDebugSettings();
  startLogPolling();
  void refreshHealthPanel();
});
