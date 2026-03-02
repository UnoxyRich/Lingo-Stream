const DEFAULT_SETTINGS = {
  translationProvider: 'auto',
  targetLanguage: 'es',
  replacementPercentage: 5,
  enabled: true
};
const DEBUG_STORAGE_KEYS = {
  enabled: 'debug',
  logs: 'debugLogs'
};
const LOG_POLL_INTERVAL_MS = 500;
const SUPPORTED_PROVIDERS = new Set(['auto', 'google', 'libre', 'apertium', 'mymemory']);
const CONTENT_READY_MESSAGE = 'IMMERSION_HEALTH_CHECK';
const CONTENT_REFRESH_MESSAGE = 'IMMERSION_FORCE_REFRESH';

const storageKeys = Object.keys(DEFAULT_SETTINGS);

const translationProviderSelect = document.getElementById('translationProvider');
const targetLanguageSelect = document.getElementById('targetLanguage');
const replacementPercentageInput = document.getElementById('replacementPercentage');
const replacementPercentageValue = document.getElementById('replacementPercentageValue');
const enabledInput = document.getElementById('enabled');
const saveButton = document.getElementById('saveButton');
const saveStatus = document.getElementById('saveStatus');
const runtimeStatus = document.getElementById('runtimeStatus');
const attachButton = document.getElementById('attachButton');
const debugEnabledInput = document.getElementById('debugEnabled');
const clearLogsButton = document.getElementById('clearLogsButton');
const logPanel = document.getElementById('logPanel');

let logPollTimer = null;

function updateReplacementLabel(value) {
  replacementPercentageValue.textContent = `${value}%`;
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
    enabled: enabledInput.checked
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
  updateReplacementLabel(settings.replacementPercentage);
}

function showStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.remove('ok', 'error');
  if (isError) {
    saveStatus.classList.add('error');
    return;
  }

  if (message) {
    saveStatus.classList.add('ok');
  }
}

function showRuntimeStatus(message, isError = false) {
  runtimeStatus.textContent = message;
  runtimeStatus.classList.remove('ok', 'error');
  if (isError) {
    runtimeStatus.classList.add('error');
    return;
  }

  if (message) {
    runtimeStatus.classList.add('ok');
  }
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

async function checkContentConnection() {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    attachButton.disabled = true;
    showRuntimeStatus('No active tab detected.', true);
    return;
  }

  const tabUrl = typeof activeTab.url === 'string' ? activeTab.url : '';
  if (tabUrl && !isYouTubeUrl(tabUrl)) {
    attachButton.disabled = true;
    showRuntimeStatus('Open a YouTube video tab, then reopen this popup.');
    return;
  }

  attachButton.disabled = false;
  const ping = await sendTabMessage(activeTab.id, { type: CONTENT_READY_MESSAGE });

  if (ping.ok && ping.response?.ok) {
    showRuntimeStatus('Connected to this tab.');
    return;
  }

  showRuntimeStatus('Not connected yet. Refresh the YouTube tab once, then click Recheck.', true);
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

function loadSettings() {
  chrome.storage.sync.get(storageKeys, (items) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load extension settings.', chrome.runtime.lastError);
      showStatus('Unable to load settings.', true);
      return;
    }

    const loaded = {
      ...DEFAULT_SETTINGS,
      ...items
    };

    applySettingsToForm(loaded);
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
debugEnabledInput.addEventListener('change', (event) => {
  setDebugMode(event.target.checked);
});
clearLogsButton.addEventListener('click', clearLogs);

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadDebugSettings();
  startLogPolling();
  void checkContentConnection();
});
