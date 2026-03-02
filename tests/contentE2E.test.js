import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const CONTENT_SCRIPT_FILES = [
  'extension/captionObserver.js',
  'extension/logger.js',
  'extension/translation.js',
  'extension/stopwords.js',
  'extension/processor.js',
  'extension/content.js'
];

function createStorageArea(initialState = {}) {
  const state = { ...initialState };

  return {
    get(keys, callback) {
      if (Array.isArray(keys)) {
        const picked = {};
        for (const key of keys) {
          picked[key] = state[key];
        }
        callback(picked);
        return;
      }

      if (typeof keys === 'string') {
        callback({ [keys]: state[keys] });
        return;
      }

      callback({ ...state });
    },
    set(items, callback) {
      Object.assign(state, items);
      if (typeof callback === 'function') {
        callback();
      }
    },
    _state: state
  };
}

function createCaptionSegment(text) {
  const segment = {
    nodeType: 1,
    textContent: text,
    isConnected: true,
    parentElement: null,
    parentNode: null,
    matches: (selector) => selector.includes('.ytp-caption-segment'),
    querySelectorAll: () => [],
    closest: (selector) => (selector.includes('.ytp-caption-segment') ? segment : null)
  };

  return segment;
}

function createE2EContext() {
  let mutationObserverCallback = null;
  let runtimeMessageListener = null;

  const syncStorage = createStorageArea({
    enabled: true,
    replacementPercentage: 100,
    translationProvider: 'mymemory',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    translationTimeoutMs: 1200
  });
  const localStorage = createStorageArea({
    debug: false,
    debugLogs: [],
    vocabularyEntries: []
  });

  const segments = [];
  const mockVideo = {
    __lingoStreamHooksInstalled: false,
    addEventListener: () => {}
  };
  const documentBody = {};
  const documentMock = {
    body: documentBody,
    visibilityState: 'visible',
    addEventListener: () => {},
    querySelector(selector) {
      if (selector === 'video.html5-main-video') {
        return mockVideo;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('.ytp-caption-segment')) {
        return segments;
      }
      return [];
    }
  };

  const translator = {
    enjoy: 'gusto',
    coding: 'codificar',
    daily: 'diario'
  };

  const context = vm.createContext({
    console: {
      log: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    URL,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    MutationObserver: function MockMutationObserver(callback) {
      mutationObserverCallback = callback;
      this.observe = () => {};
    },
    location: {
      href: 'https://www.youtube.com/watch?v=test'
    },
    document: documentMock,
    chrome: {
      runtime: {
        id: 'test-extension-id',
        lastError: null,
        onMessage: {
          addListener(listener) {
            runtimeMessageListener = listener;
          }
        },
        sendMessage(message, callback) {
          if (message?.type !== 'LINGO_STREAM_TRANSLATE_WORDS') {
            callback({ ok: false, error: 'unsupported_message' });
            return;
          }

          const words = Array.isArray(message?.payload?.words) ? message.payload.words : [];
          const translations = {};
          const providerByWord = {};

          for (const word of words) {
            const normalized = String(word).toLowerCase();
            if (!translator[normalized]) {
              continue;
            }

            translations[normalized] = translator[normalized];
            providerByWord[normalized] = 'mymemory';
          }

          callback({
            ok: true,
            translations,
            meta: {
              providerByWord,
              failedProvidersByWord: {}
            }
          });
        }
      },
      storage: {
        sync: syncStorage,
        local: localStorage,
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  context.window = context;

  function addCaptionSegment(segment) {
    segments.push(segment);
  }

  function emitMutation(mutations) {
    if (typeof mutationObserverCallback !== 'function') {
      throw new Error('MutationObserver callback not initialized');
    }

    mutationObserverCallback(mutations);
  }

  return {
    context,
    addCaptionSegment,
    emitMutation,
    getRuntimeMessageListener: () => runtimeMessageListener
  };
}

async function waitForAsyncWork() {
  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });
}

describe('content scripts end-to-end caption updates', () => {
  it('applies translations as captions mutate over time', async () => {
    const runtime = createE2EContext();

    for (const scriptPath of CONTENT_SCRIPT_FILES) {
      const source = fs.readFileSync(scriptPath, 'utf8');
      expect(() => vm.runInContext(source, runtime.context, { filename: scriptPath })).not.toThrow();
    }

    expect(typeof runtime.getRuntimeMessageListener()).toBe('function');

    const segment = createCaptionSegment('I enjoy coding');
    runtime.addCaptionSegment(segment);

    runtime.emitMutation([
      {
        type: 'childList',
        addedNodes: [segment]
      }
    ]);

    await waitForAsyncWork();
    expect(segment.textContent).toContain('enjoy (gusto)');

    segment.textContent = 'I enjoy coding daily';
    runtime.emitMutation([
      {
        type: 'childList',
        target: segment,
        addedNodes: []
      }
    ]);

    await waitForAsyncWork();
    expect(segment.textContent).toContain('enjoy (gusto)');
    expect(segment.textContent).toContain('daily (diario)');
  });
});
