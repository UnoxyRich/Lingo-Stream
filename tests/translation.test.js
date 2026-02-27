import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache, translateWord } from '../extension/translation.js';

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
              translationEndpoint: 'https://example.test/translate'
            });
          })
        }
      }
    };
  });

  it('uses fetch and caches translation results', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ translatedText: 'hola' })
    }));

    const first = await translateWord('Hello');
    const second = await translateWord('hello');

    expect(first).toBe('hola');
    expect(second).toBe('hola');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('handles api errors gracefully', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const result = await translateWord('world');
    expect(result).toBeNull();
  });
});
