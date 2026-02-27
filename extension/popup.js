const DEFAULT_SETTINGS = {
  translationProvider: 'libre',
  targetLanguage: 'es',
  replacementPercentage: 5,
  enabled: true
};
const DEBUG_STORAGE_KEYS = {
  enabled: 'debug',
  logs: 'debugLogs'
};
const LOG_POLL_INTERVAL_MS = 500;

const storageKeys = Object.keys(DEFAULT_SETTINGS);

const translationProviderSelect = document.getElementById('translationProvider');
const targetLanguageSelect = document.getElementById('targetLanguage');
const replacementPercentageInput = document.getElementById('replacementPercentage');
const replacementPercentageValue = document.getElementById('replacementPercentageValue');
const enabledInput = document.getElementById('enabled');
const saveButton = document.getElementById('saveButton');
const saveStatus = document.getElementById('saveStatus');
const debugEnabledInput = document.getElementById('debugEnabled');
const clearLogsButton = document.getElementById('clearLogsButton');
const logPanel = document.getElementById('logPanel');

let logPollTimer = null;

function updateReplacementLabel(value) {
  replacementPercentageValue.textContent = `${value}%`;
}

function readFormSettings() {
  return {
    translationProvider: translationProviderSelect.value,
    targetLanguage: targetLanguageSelect.value,
    replacementPercentage: Number.parseInt(replacementPercentageInput.value, 10),
    enabled: enabledInput.checked
  };
}

function applySettingsToForm(settings) {
  translationProviderSelect.value = settings.translationProvider;
  targetLanguageSelect.value = settings.targetLanguage;
  replacementPercentageInput.value = String(settings.replacementPercentage);
  enabledInput.checked = settings.enabled;
  updateReplacementLabel(settings.replacementPercentage);
}

function showStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.style.color = isError ? '#b00020' : '';
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

    logPanel.classList.toggle('hidden', !enabled);
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
    if (debugEnabledInput.checked) {
      pollLogs();
    }
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
    logPanel.classList.toggle('hidden', !debugEnabled);
    renderLogs(items[DEBUG_STORAGE_KEYS.logs] ?? []);
  });
}

function saveSettings() {
  const settings = readFormSettings();

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to save extension settings.', chrome.runtime.lastError);
      showStatus('Save failed.', true);
      return;
    }

    console.log('Popup settings saved.', settings);
    showStatus('Saved.');
    setTimeout(() => {
      if (saveStatus.textContent === 'Saved.') {
        saveStatus.textContent = '';
      }
    }, 1200);
  });
}

replacementPercentageInput.addEventListener('input', (event) => {
  updateReplacementLabel(event.target.value);
});

saveButton.addEventListener('click', saveSettings);
debugEnabledInput.addEventListener('change', (event) => {
  setDebugMode(event.target.checked);
});
clearLogsButton.addEventListener('click', clearLogs);

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadDebugSettings();
  startLogPolling();
});
