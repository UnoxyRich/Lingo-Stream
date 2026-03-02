import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.window = globalThis;
await import('../extension/translation.js');

function createChromeMock({ storageItems = {}, response = null, runtimeErrorMessage = '' } = {}) {
  const localStorageState = {};

  return {
    storage: {
      sync: {
        get: vi.fn((_keys, callback) => {
          callback(storageItems);
        })
      },
      local: {
        get: vi.fn((keys, callback) => {
          if (Array.isArray(keys)) {
            const picked = {};
            for (const key of keys) {
              picked[key] = localStorageState[key];
            }
            callback(picked);
            return;
          }

          if (typeof keys === 'string') {
            callback({ [keys]: localStorageState[keys] });
            return;
          }

          callback({ ...localStorageState });
        }),
        set: vi.fn((items, callback) => {
          Object.assign(localStorageState, items);
          if (typeof callback === 'function') {
            callback();
          }
        })
      }
    },
    runtime: {
      lastError: null,
      sendMessage: vi.fn((_message, callback) => {
        if (runtimeErrorMessage) {
          globalThis.chrome.runtime.lastError = { message: runtimeErrorMessage };
          callback(undefined);
          globalThis.chrome.runtime.lastError = null;
          return;
        }

        callback(response);
      })
    },
    _localStorageState: localStorageState
  };
}

function resetTranslationCaches() {
  Object.keys(window.translationCache).forEach((key) => delete window.translationCache[key]);
  Object.keys(window.translationMissCache).forEach((key) => delete window.translationMissCache[key]);
}

async function flushStorageWrites() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('translation bridge layer', () => {
  beforeEach(() => {
    resetTranslationCaches();
    globalThis.chrome = createChromeMock();
  });

  it('sends only missing words to the runtime bridge and caches successful translations', async () => {
    globalThis.chrome = createChromeMock({
      storageItems: {
        translationProvider: 'auto',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        translationEndpoint: '',
        translationTimeoutMs: 1200
      },
      response: {
        ok: true,
        translations: {
          hello: 'hola',
          world: 'mundo'
        },
        meta: {
          providerByWord: {
            hello: 'libre',
            world: 'mymemory'
          },
          failedProvidersByWord: {}
        }
      }
    });

    const first = await window.translateWords(['Hello', 'World']);
    const second = await window.translateWords(['hello']);

    expect(first).toEqual({ hello: 'hola', world: 'mundo' });
    expect(second).toEqual({ hello: 'hola' });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('deduplicates repeated words in a single batch before sending to runtime', async () => {
    globalThis.chrome = createChromeMock({
      response: {
        ok: true,
        translations: {
          hello: 'hola'
        },
        meta: {
          providerByWord: { hello: 'libre' },
          failedProvidersByWord: {}
        }
      }
    });

    await window.translateWords(['Hello', 'hello', 'HELLO']);

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    const sentWords = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].payload.words;
    expect(sentWords).toEqual(['Hello']);
  });

  it('returns null from translateWord when runtime bridge reports no translation', async () => {
    globalThis.chrome = createChromeMock({
      response: {
        ok: true,
        translations: {},
        meta: {
          providerByWord: {},
          failedProvidersByWord: { hello: ['libre', 'mymemory'] }
        }
      }
    });

    const translated = await window.translateWord('hello');
    expect(translated).toBeNull();
  });

  it('treats invalid bridge responses as misses and avoids immediate retries', async () => {
    globalThis.chrome = createChromeMock({
      response: {
        ok: false,
        error: 'provider_down'
      }
    });

    const first = await window.translateWords(['hello']);
    const second = await window.translateWords(['hello']);

    expect(first).toEqual({});
    expect(second).toEqual({});
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores empty translated values while keeping valid translations', async () => {
    globalThis.chrome = createChromeMock({
      response: {
        ok: true,
        translations: {
          hello: '   ',
          world: 'mundo'
        },
        meta: {
          providerByWord: { world: 'libre' },
          failedProvidersByWord: { hello: ['libre', 'mymemory'] }
        }
      }
    });

    const translated = await window.translateWords(['hello', 'world']);

    expect(translated).toEqual({ world: 'mundo' });
    expect(window.translationMissCache.hello).toBeTypeOf('number');
  });

  it('gracefully handles missing runtime messaging API', async () => {
    globalThis.chrome = {
      storage: {
        sync: {
          get: vi.fn((_keys, callback) => callback({}))
        }
      }
    };

    const result = await window.translateWords(['hello']);
    expect(result).toEqual({});
  });

  it('retries a word after its miss-cache entry expires', async () => {
    window.translationMissCache.hello = Date.now() - (4 * 60 * 1000);

    globalThis.chrome = createChromeMock({
      response: {
        ok: true,
        translations: { hello: 'hola' },
        meta: {
          providerByWord: { hello: 'libre' },
          failedProvidersByWord: {}
        }
      }
    });

    const result = await window.translateWords(['hello']);

    expect(result).toEqual({ hello: 'hola' });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('miss-caches failed words to avoid immediate bridge retries', async () => {
    globalThis.chrome = createChromeMock({
      runtimeErrorMessage: 'bridge unavailable'
    });

    const first = await window.translateWords(['hello']);
    const second = await window.translateWords(['hello']);

    expect(first).toEqual({});
    expect(second).toEqual({});
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('uses defaults when translation settings are absent in storage', async () => {
    globalThis.chrome = createChromeMock({
      storageItems: {},
      response: {
        ok: true,
        translations: { hello: 'hola' },
        meta: {
          providerByWord: { hello: 'libre' },
          failedProvidersByWord: {}
        }
      }
    });

    await window.translateWords(['hello']);

    const payload = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].payload;
    expect(payload.translationProvider).toBe('auto');
    expect(payload.sourceLanguage).toBe('en');
    expect(payload.targetLanguage).toBe('es');
    expect(payload.translationTimeoutMs).toBe(1200);
  });

  it('forwards configured provider and language settings from storage to the bridge', async () => {
    globalThis.chrome = createChromeMock({
      storageItems: {
        translationProvider: 'apertium',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        translationEndpoint: 'https://apertium.org/apy/translate',
        translationTimeoutMs: 1500
      },
      response: {
        ok: true,
        translations: { hello: 'bonjour' },
        meta: {
          providerByWord: { hello: 'apertium' },
          failedProvidersByWord: {}
        }
      }
    });

    await window.translateWords(['hello']);

    const payload = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].payload;
    expect(payload.translationProvider).toBe('apertium');
    expect(payload.sourceLanguage).toBe('en');
    expect(payload.targetLanguage).toBe('fr');
    expect(payload.translationEndpoint).toBe('https://apertium.org/apy/translate');
    expect(payload.translationTimeoutMs).toBe(1500);
  });

  it('stores last translation success health metadata in local storage', async () => {
    globalThis.chrome = createChromeMock({
      response: {
        ok: true,
        translations: { hello: 'hola' },
        meta: {
          providerByWord: { hello: 'google' },
          failedProvidersByWord: {}
        }
      }
    });

    await window.translateWords(['hello']);
    await flushStorageWrites();

    expect(globalThis.chrome._localStorageState.lastTranslationSuccessProvider).toBe('google');
    expect(globalThis.chrome._localStorageState.lastTranslationSuccessCount).toBe(1);
    expect(globalThis.chrome._localStorageState.lastTranslationSuccessAt).toBeTypeOf('number');
  });

  it('saves and merges vocabulary entries when saveVocabulary is enabled', async () => {
    globalThis.chrome = createChromeMock({
      storageItems: {
        saveVocabulary: true,
        sourceLanguage: 'en',
        targetLanguage: 'es'
      },
      response: {
        ok: true,
        translations: { hello: 'hola' },
        meta: {
          providerByWord: { hello: 'mymemory' },
          failedProvidersByWord: {}
        }
      }
    });

    await window.translateWords(['hello']);
    await flushStorageWrites();

    await window.translateWords(['Hello']);
    await flushStorageWrites();

    const entries = globalThis.chrome._localStorageState.vocabularyEntries;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        source: expect.any(String),
        translation: 'hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        count: 2
      })
    );
  });

  it('persists cached vocabulary hits even when new misses fail in bridge', async () => {
    globalThis.chrome = createChromeMock({
      storageItems: {
        saveVocabulary: true,
        sourceLanguage: 'en',
        targetLanguage: 'es'
      },
      response: {
        ok: true,
        translations: { hello: 'hola' },
        meta: {
          providerByWord: { hello: 'google' },
          failedProvidersByWord: {}
        }
      }
    });

    await window.translateWords(['hello']);
    await flushStorageWrites();

    globalThis.chrome.runtime.sendMessage.mockImplementation((_message, callback) => {
      globalThis.chrome.runtime.lastError = { message: 'bridge unavailable' };
      callback(undefined);
      globalThis.chrome.runtime.lastError = null;
    });

    const translated = await window.translateWords(['hello', 'world']);
    await flushStorageWrites();

    expect(translated).toEqual({ hello: 'hola' });

    const entries = globalThis.chrome._localStorageState.vocabularyEntries;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        translation: 'hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        count: 2
      })
    );
  });
});
