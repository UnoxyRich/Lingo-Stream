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
              apiKey: 'test-key',
              targetLanguage: 'es',
              sourceLanguage: 'en',
              translationEndpoint: 'https://example.test/translate',
              translationTimeoutMs: 20
            });
          })
        }
      }
    };

    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('uses batch fetch and caches translation results', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { translatedText: 'hola' },
        { translatedText: 'mundo' }
      ]
    }));

    const first = await translateWords(['Hello', 'World']);
    const second = await translateWords(['hello']);

    expect(first.hello).toBe('hola');
    expect(first.world).toBe('mundo');
    expect(second.hello).toBe('hola');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to single requests when batch response is invalid', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ translatedText: 'hola' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ translatedText: 'mundo' })
      });

    const result = await translateWords(['hello', 'world']);

    expect(result).toEqual({ hello: 'hola', world: 'mundo' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('handles invalid api key and rate limits gracefully', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));

    const keyResult = await translateWord('world');

    global.fetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const rateResult = await translateWord('again');

    expect(keyResult).toBeNull();
    expect(rateResult).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('handles timeout simulation', async () => {
    global.fetch = vi.fn((_url, options) => {
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });

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
