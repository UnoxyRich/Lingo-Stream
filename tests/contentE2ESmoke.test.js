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

const FIXTURE_PATH = new URL('./fixtures/youtube-caption-fixture.v1.json', import.meta.url);
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

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

function createE2EContext({ settings, translations, videoUrl }) {
  let mutationObserverCallback = null;
  let runtimeMessageListener = null;

  const syncStorage = createStorageArea({
    enabled: settings.enabled,
    replacementPercentage: settings.replacementPercentage,
    translationProvider: settings.translationProvider,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translationTimeoutMs: settings.translationTimeoutMs
  });
  const localStorage = createStorageArea({
    debug: false,
    debugLogs: [],
    vocabularyEntries: [],
    vocabularyQuizBuckets: {
      notQuizzed: [],
      correct: [],
      incorrect: []
    }
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
      href: videoUrl
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
          const translatedWords = {};
          const providerByWord = {};

          for (const word of words) {
            const normalized = String(word).toLowerCase();
            if (!translations[normalized]) {
              continue;
            }

            translatedWords[normalized] = translations[normalized];
            providerByWord[normalized] = settings.translationProvider;
          }

          callback({
            ok: true,
            translations: translatedWords,
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

describe('nightly content E2E smoke fixture', () => {
  it('applies translations for each stable fixture cue', async () => {
    expect(FIXTURE?.fixtureId).toBe('youtube-caption-fixture-v1');
    expect(Array.isArray(FIXTURE?.cues)).toBe(true);
    expect(FIXTURE.cues.length).toBeGreaterThan(0);

    const runtime = createE2EContext({
      settings: FIXTURE.settings,
      translations: FIXTURE.translations,
      videoUrl: FIXTURE.videoUrl
    });

    for (const scriptPath of CONTENT_SCRIPT_FILES) {
      const source = fs.readFileSync(scriptPath, 'utf8');
      expect(() => vm.runInContext(source, runtime.context, { filename: scriptPath })).not.toThrow();
    }

    expect(typeof runtime.getRuntimeMessageListener()).toBe('function');

    const firstCue = FIXTURE.cues[0];
    const segment = createCaptionSegment(firstCue.text);
    runtime.addCaptionSegment(segment);
    runtime.emitMutation([
      {
        type: 'childList',
        addedNodes: [segment]
      }
    ]);

    await waitForAsyncWork();

    for (const expected of firstCue.expectedContains) {
      expect(segment.textContent.toLowerCase()).toContain(String(expected).toLowerCase());
    }

    for (const cue of FIXTURE.cues.slice(1)) {
      segment.textContent = cue.text;
      runtime.emitMutation([
        {
          type: 'childList',
          target: segment,
          addedNodes: []
        }
      ]);

      await waitForAsyncWork();

      for (const expected of cue.expectedContains) {
        expect(segment.textContent.toLowerCase()).toContain(String(expected).toLowerCase());
      }
    }
  });
});
