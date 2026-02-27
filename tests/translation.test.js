import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache, translateWord, translateWords } from '../extension/translation.js';

describe('translation layer', () => {
  beforeEach(() => {
    Object.keys(cache).forEach((key) => delete cache[key]);

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

    const first = await translateWords(['Hello', 'World']);
    const second = await translateWords(['hello']);

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

    const result = await translateWords(['hello']);

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

    const result = await translateWord('hello');

    expect(result).toBe('bonjour');
    expect(global.fetch.mock.calls[0][0]).toContain('https://lingva.ml/api/v1/en/fr/hello');
  });

  it('falls back to the alternate provider when batch response is invalid', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ invalid: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translation: 'hola' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ translation: 'mundo' }) });

    const result = await translateWords(['hello', 'world']);

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

    const result = await translateWord('timeout');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null for invalid response structure', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ translated: 'bad' }) }));

    const result = await translateWord('shape');
    expect(result).toBeNull();
  });
});
