import { describe, expect, it, vi } from 'vitest';

function createRuntimeMock() {
  let messageListener = null;

  const chromeMock = {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener) => {
          messageListener = listener;
        })
      }
    }
  };

  return {
    chromeMock,
    getMessageListener: () => messageListener
  };
}

async function loadBackgroundModule() {
  vi.resetModules();
  await import('../extension/background.js');
}

function sendMessage(listener, message, sender) {
  return new Promise((resolve) => {
    let returnedValue = null;
    const callback = (response) => {
      queueMicrotask(() => {
        resolve({ returned: returnedValue, response });
      });
    };
    returnedValue = listener(message, sender, callback);

    if (returnedValue === false) {
      queueMicrotask(() => {
        resolve({ returned: returnedValue, response: null });
      });
    }
  });
}

describe('background translation bridge sender validation', () => {
  it('accepts youtube sender information when sender.url is absent but sender.origin exists', async () => {
    const { chromeMock, getMessageListener } = createRuntimeMock();
    globalThis.chrome = chromeMock;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        responseData: {
          translatedText: 'hola'
        }
      })
    }));

    await loadBackgroundModule();
    const listener = getMessageListener();
    expect(typeof listener).toBe('function');

    const { returned, response } = await sendMessage(
      listener,
      {
        type: 'LINGO_STREAM_TRANSLATE_WORDS',
        payload: {
          words: ['hello'],
          translationProvider: 'mymemory',
          sourceLanguage: 'en',
          targetLanguage: 'es'
        }
      },
      {
        origin: 'https://www.youtube.com/watch?v=test'
      }
    );

    expect(returned).toBe(true);
    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        translations: {
          hello: 'hola'
        }
      })
    );
  });

  it('rejects non-youtube senders', async () => {
    const { chromeMock, getMessageListener } = createRuntimeMock();
    globalThis.chrome = chromeMock;
    globalThis.fetch = vi.fn();

    await loadBackgroundModule();
    const listener = getMessageListener();
    expect(typeof listener).toBe('function');

    const { returned, response } = await sendMessage(
      listener,
      {
        type: 'LINGO_STREAM_TRANSLATE_WORDS',
        payload: {
          words: ['hello']
        }
      },
      {
        origin: 'https://example.com/article'
      }
    );

    expect(returned).toBe(false);
    expect(response).toEqual({
      ok: false,
      error: 'unauthorized_sender'
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('accepts internal content-script sender when URL metadata is unavailable', async () => {
    const { chromeMock, getMessageListener } = createRuntimeMock();
    chromeMock.runtime.id = 'test-extension-id';
    globalThis.chrome = chromeMock;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        responseData: {
          translatedText: 'hola'
        }
      })
    }));

    await loadBackgroundModule();
    const listener = getMessageListener();
    expect(typeof listener).toBe('function');

    const { returned, response } = await sendMessage(
      listener,
      {
        type: 'LINGO_STREAM_TRANSLATE_WORDS',
        payload: {
          words: ['hello'],
          translationProvider: 'mymemory',
          sourceLanguage: 'en',
          targetLanguage: 'es'
        }
      },
      {
        id: 'test-extension-id'
      }
    );

    expect(returned).toBe(true);
    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        translations: {
          hello: 'hola'
        }
      })
    );
  });
});

describe('background translation provider fallback', () => {
  it('supports google provider requests', async () => {
    const { chromeMock, getMessageListener } = createRuntimeMock();
    globalThis.chrome = chromeMock;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [[['hola', 'hello']]]
    }));

    await loadBackgroundModule();
    const listener = getMessageListener();
    expect(typeof listener).toBe('function');

    const { returned, response } = await sendMessage(
      listener,
      {
        type: 'LINGO_STREAM_TRANSLATE_WORDS',
        payload: {
          words: ['hello'],
          translationProvider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'es'
        }
      },
      {
        origin: 'https://www.youtube.com/watch?v=test'
      }
    );

    expect(returned).toBe(true);
    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        translations: {
          hello: 'hola'
        }
      })
    );
  });
});
