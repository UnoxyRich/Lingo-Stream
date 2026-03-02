const DEFAULT_REPLACEMENT_PERCENTAGE = 5;
const DEFAULT_SETTINGS = {
  enabled: true,
  replacementPercentage: DEFAULT_REPLACEMENT_PERCENTAGE,
  translationProvider: 'auto',
  sourceLanguage: 'en',
  targetLanguage: 'es',
  translationEndpoint: ''
};
const SETTINGS_CACHE_TTL_MS = 1500;
const SCRUB_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'j', 'l']);
const CONTENT_CAPTION_SEGMENT_SELECTOR = '.ytp-caption-segment, .captions-text .caption-visual-line span';
const PERSISTENT_REFRESH_INTERVAL_MS = 350;
const MIN_FORCE_REFRESH_GAP_MS = 120;
const INITIAL_WARMUP_INTERVAL_MS = 250;
const INITIAL_WARMUP_RUNS = 8;
const CONTENT_READY_MESSAGE = 'LINGO_STREAM_HEALTH_CHECK';
const CONTENT_REFRESH_MESSAGE = 'LINGO_STREAM_FORCE_REFRESH';

if (window.__lingoStreamContentInitialized) {
  void window.log?.('content.js already initialized; duplicate setup skipped');
} else {
  window.__lingoStreamContentInitialized = true;

function normalizeReplacementPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_REPLACEMENT_PERCENTAGE;
  }

  return Math.max(0, Math.min(100, Math.floor(numeric)));
}

function buildRenderConfigKey(settings) {
  const safeReplacement = normalizeReplacementPercentage(settings?.replacementPercentage);
  const translationProvider = typeof settings?.translationProvider === 'string'
    ? settings.translationProvider.trim().toLowerCase()
    : DEFAULT_SETTINGS.translationProvider;
  const sourceLanguage = typeof settings?.sourceLanguage === 'string'
    ? settings.sourceLanguage.trim().toLowerCase()
    : DEFAULT_SETTINGS.sourceLanguage;
  const targetLanguage = typeof settings?.targetLanguage === 'string'
    ? settings.targetLanguage.trim().toLowerCase()
    : DEFAULT_SETTINGS.targetLanguage;
  const translationEndpoint = typeof settings?.translationEndpoint === 'string'
    ? settings.translationEndpoint.trim().toLowerCase()
    : DEFAULT_SETTINGS.translationEndpoint;

  return [
    `replacement:${safeReplacement}`,
    `provider:${translationProvider}`,
    `source:${sourceLanguage}`,
    `target:${targetLanguage}`,
    `endpoint:${translationEndpoint}`
  ].join('|');
}

let cachedSettings = {
  ...DEFAULT_SETTINGS,
  renderConfigKey: buildRenderConfigKey(DEFAULT_SETTINGS)
};
let lastSettingsReadAt = 0;
let inflightSettingsPromise = null;

console.log('Lingo Stream loaded');
void window.log?.('content.js loaded');

function readSettingsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      [
        'enabled',
        'replacementPercentage',
        'translationProvider',
        'sourceLanguage',
        'targetLanguage',
        'translationEndpoint'
      ],
      (items) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to read content settings from storage.', chrome.runtime.lastError);
        resolve({
          ...DEFAULT_SETTINGS,
          renderConfigKey: buildRenderConfigKey(DEFAULT_SETTINGS)
        });
        return;
      }

      const resolved = {
        enabled: items.enabled ?? DEFAULT_SETTINGS.enabled,
        replacementPercentage: normalizeReplacementPercentage(
          items.replacementPercentage ?? DEFAULT_REPLACEMENT_PERCENTAGE
        ),
        translationProvider: items.translationProvider ?? DEFAULT_SETTINGS.translationProvider,
        sourceLanguage: items.sourceLanguage ?? DEFAULT_SETTINGS.sourceLanguage,
        targetLanguage: items.targetLanguage ?? DEFAULT_SETTINGS.targetLanguage,
        translationEndpoint: typeof items.translationEndpoint === 'string'
          ? items.translationEndpoint
          : DEFAULT_SETTINGS.translationEndpoint
      };
      resolved.renderConfigKey = buildRenderConfigKey(resolved);

      console.log('Content settings loaded.', resolved);
      void window.log?.(`Content settings loaded: enabled=${resolved.enabled}, replacement=${resolved.replacementPercentage}`);
      resolve(resolved);
      }
    );
  });
}

async function getSettings() {
  const now = Date.now();
  if (now - lastSettingsReadAt <= SETTINGS_CACHE_TTL_MS) {
    return cachedSettings;
  }

  if (inflightSettingsPromise) {
    return inflightSettingsPromise;
  }

  inflightSettingsPromise = readSettingsFromStorage()
    .then((resolved) => {
      cachedSettings = resolved;
      lastSettingsReadAt = Date.now();
      return cachedSettings;
    })
    .finally(() => {
      inflightSettingsPromise = null;
    });

  return inflightSettingsPromise;
}

const handler = window.createCaptionMutationHandler({
  getSettings,
  transformSubtitle: (subtitleText, replacementPercentage, pinnedTranslations = {}) =>
    window.buildImmersiveSubtitle(
      subtitleText,
      window.translateWords,
      replacementPercentage,
      pinnedTranslations
    ),
  debounceMs: 5
});

const observer = new MutationObserver((mutations) => {
  handler.handleMutations(mutations);
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  });
  console.log('Lingo Stream observer attached to document.body');
  handler.primeFromCurrentCaptions();
} else {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
      console.log('Lingo Stream observer attached after DOMContentLoaded');
      void window.log?.('MutationObserver attached after DOMContentLoaded');
      handler.primeFromCurrentCaptions();
    },
    { once: true }
  );
}

if (document.body) {
  void window.log?.('MutationObserver attached to document.body');
}

function installRealtimeHooks() {
  let lastForcedRefreshAt = 0;
  const forceRefresh = ({ immediate = false } = {}) => {
    const now = Date.now();
    if (!immediate && now - lastForcedRefreshAt < MIN_FORCE_REFRESH_GAP_MS) {
      return;
    }

    lastForcedRefreshAt = now;
    handler.primeFromCurrentCaptions();
    handler.flushNow();
  };

  const shouldRunPersistentRefresh = () => {
    if (!cachedSettings.enabled) {
      return false;
    }

    if (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden') {
      return false;
    }

    return Boolean(document.querySelector(CONTENT_CAPTION_SEGMENT_SELECTOR));
  };

  const persistentRefresh = () => {
    if (!shouldRunPersistentRefresh()) {
      return;
    }

    forceRefresh();
  };

  const attachVideoListeners = (video) => {
    if (!video || video.__lingoStreamHooksInstalled) {
      return;
    }

    video.__lingoStreamHooksInstalled = true;
    video.addEventListener('seeking', forceRefresh, { passive: true });
    video.addEventListener('seeked', forceRefresh, { passive: true });
    video.addEventListener('ratechange', forceRefresh, { passive: true });
    video.addEventListener('play', forceRefresh, { passive: true });
  };

  const tryAttach = () => {
    const video = document.querySelector('video.html5-main-video');
    if (video) {
      attachVideoListeners(video);
      return true;
    }

    return false;
  };

  const keyHandler = (event) => {
    if (event && SCRUB_KEYS.has(event.key)) {
      forceRefresh();
    }
  };

  document.addEventListener('keydown', keyHandler, true);

  if (!tryAttach()) {
    const attachTimer = setInterval(() => {
      if (tryAttach()) {
        clearInterval(attachTimer);
      }
    }, 250);

    setTimeout(() => clearInterval(attachTimer), 12000);
  }

  // Aggressive initial warmup so the extension starts reacting without waiting for user interaction.
  let warmupRuns = 0;
  const warmupTimer = setInterval(() => {
    warmupRuns += 1;
    forceRefresh({ immediate: true });
    if (warmupRuns >= INITIAL_WARMUP_RUNS) {
      clearInterval(warmupTimer);
    }
  }, INITIAL_WARMUP_INTERVAL_MS);

  // Persistent refresh catches rare caption rewrites that do not emit reliable mutations.
  setInterval(() => {
    persistentRefresh();
  }, PERSISTENT_REFRESH_INTERVAL_MS);

  document.addEventListener(
    'visibilitychange',
    () => {
      persistentRefresh();
    },
    { passive: true }
  );
}

installRealtimeHooks();

chrome.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  const trackedKeys = [
    'enabled',
    'replacementPercentage',
    'translationProvider',
    'sourceLanguage',
    'targetLanguage',
    'translationEndpoint'
  ];
  let shouldRefresh = false;

  for (const key of trackedKeys) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) {
      continue;
    }

    const nextValue = changes[key].newValue;
    if (key === 'enabled') {
      cachedSettings.enabled = nextValue ?? DEFAULT_SETTINGS.enabled;
    } else if (key === 'replacementPercentage') {
      cachedSettings.replacementPercentage = normalizeReplacementPercentage(
        nextValue ?? DEFAULT_REPLACEMENT_PERCENTAGE
      );
    } else if (key === 'translationProvider') {
      cachedSettings.translationProvider = nextValue ?? DEFAULT_SETTINGS.translationProvider;
    } else if (key === 'sourceLanguage') {
      cachedSettings.sourceLanguage = nextValue ?? DEFAULT_SETTINGS.sourceLanguage;
    } else if (key === 'targetLanguage') {
      cachedSettings.targetLanguage = nextValue ?? DEFAULT_SETTINGS.targetLanguage;
    } else if (key === 'translationEndpoint') {
      cachedSettings.translationEndpoint = typeof nextValue === 'string'
        ? nextValue
        : DEFAULT_SETTINGS.translationEndpoint;
    }
    shouldRefresh = true;
  }

  cachedSettings.renderConfigKey = buildRenderConfigKey(cachedSettings);
  lastSettingsReadAt = Date.now();

  if (shouldRefresh) {
    handler.primeFromCurrentCaptions();
    handler.flushNow();
  }
});

chrome.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
  if (message?.type === CONTENT_READY_MESSAGE) {
    sendResponse({
      ok: true,
      initialized: true,
      href: location.href
    });
    return false;
  }

  if (message?.type === CONTENT_REFRESH_MESSAGE) {
    handler.primeFromCurrentCaptions();
    handler.flushNow();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
}
