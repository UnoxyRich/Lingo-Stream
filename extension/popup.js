const DEFAULT_SETTINGS = {
  translationProvider: 'libre',
  targetLanguage: 'es',
  replacementPercentage: 5,
  enabled: true
};

const storageKeys = Object.keys(DEFAULT_SETTINGS);

const translationProviderSelect = document.getElementById('translationProvider');
const targetLanguageSelect = document.getElementById('targetLanguage');
const replacementPercentageInput = document.getElementById('replacementPercentage');
const replacementPercentageValue = document.getElementById('replacementPercentageValue');
const enabledInput = document.getElementById('enabled');
const saveButton = document.getElementById('saveButton');
const saveStatus = document.getElementById('saveStatus');

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

document.addEventListener('DOMContentLoaded', loadSettings);
