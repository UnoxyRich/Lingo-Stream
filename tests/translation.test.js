import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.window = globalThis;
await import('../extension/translation.js');

describe('translation layer', () => {
  beforeEach(() => {
    Object.keys(window.translationCache).forEach((key) => delete window.translationCache[key]);

    global.chrome = {
      storage: {
        sync: {
          get: vi.fn((_keys, callback) => {
            callback({
              translationProvider: 'libre',
              targetLanguage: 'es',
              sourceLanguage: 'en',
              translationEndpoint: 'https://translate.cutie.dating/translate',
              translationTimeoutMs: 20
            });
          })
        }
      }
    };

    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('uses batch fetch and caches translation results for libre provider', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [{ translatedText: 'hola' }, { translatedText: 'mundo' }]
    }));

    const first = await window.translateWords(['Hello', 'World']);
    const second = await window.translateWords(['hello']);

    expect(first.hello).toBe('hola');
    expect(first.world).toBe('mundo');
    expect(second.hello).toBe('hola');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to lingva when libre endpoint is unavailable', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translation: 'hola' }) });

    const result = await window.translateWords(['hello']);

    expect(result).toEqual({ hello: 'hola' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('https://lingva.ml/api/v1/en/es/hello');
  });

  it('uses lingva provider directly when selected', async () => {
    global.chrome.storage.sync.get = vi.fn((_keys, callback) => {
      callback({
        translationProvider: 'lingva',
        targetLanguage: 'fr',
        sourceLanguage: 'en',
        translationEndpoint: 'https://lingva.ml/api/v1',
        translationTimeoutMs: 20
      });
    });

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ translation: 'bonjour' })
    }));

    const result = await window.translateWord('hello');

    expect(result).toBe('bonjour');
    expect(global.fetch.mock.calls[0][0]).toContain('https://lingva.ml/api/v1/en/fr/hello');
  });

  it('falls back to the alternate provider when batch response is invalid', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ invalid: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translation: 'hola' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translation: 'mundo' }) });

    const result = await window.translateWords(['hello', 'world']);

    expect(result).toEqual({ hello: 'hola', world: 'mundo' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('handles timeout simulation', async () => {
    global.fetch = vi.fn((_url, options) =>
      new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      })
    );

    const result = await window.translateWord('timeout');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null for invalid response structure', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ translated: 'bad' }) }));

    const result = await window.translateWord('shape');
    expect(result).toBeNull();
  });

  it('returns cached value without network calls', async () => {
    window.translationCache.hello = 'hola';
    global.fetch = vi.fn();

    const result = await window.translateWords(['hello']);
    expect(result).toEqual({ hello: 'hola' });
    expect(global.fetch).toHaveBeenCalledTimes(0);
  });

  it('handles provider defaults when storage is empty', async () => {
    global.chrome.storage.sync.get = vi.fn((_keys, callback) => callback({}));
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ translatedText: 'hola' }) }));

    const result = await window.translateWord('hello');
    expect(result).toBe('hola');
    expect(global.fetch.mock.calls[0][0]).toBe('https://translate.cutie.dating/translate');
  });

  it('falls back to single-word loop when batch throws non-timeout error', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translatedText: 'hola' }) });

    const result = await window.translateWords(['hello']);
    expect(result).toEqual({ hello: 'hola' });
  });


  it('returns empty result when fallback provider times out', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const result = await window.translateWords(['hello']);
    expect(result).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('handles non-timeout errors during single-word fallback loop', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('hard failure'));

    const result = await window.translateWords(['hello']);
    expect(result).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });


  it('logs libre rate limit branch and falls back successfully', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translation: 'hola' }) });

    const result = await window.translateWords(['hello']);
    expect(result).toEqual({ hello: 'hola' });
    expect(console.warn).toHaveBeenCalled();
  });

  it('logs lingva rate limit branch and falls back to libre', async () => {
    global.chrome.storage.sync.get = vi.fn((_keys, callback) => {
      callback({
        translationProvider: 'lingva',
        targetLanguage: 'es',
        sourceLanguage: 'en',
        translationEndpoint: 'https://lingva.ml/api/v1',
        translationTimeoutMs: 20
      });
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translatedText: 'hola' }) });

    const result = await window.translateWords(['hello']);
    expect(result).toEqual({ hello: 'hola' });
    expect(console.warn).toHaveBeenCalled();
  });

});
