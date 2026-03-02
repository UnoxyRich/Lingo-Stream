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

function createContentRuntimeContext() {
  let runtimeMessageListener = null;
  const silentConsole = {
    log: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };

  const context = vm.createContext({
    console: silentConsole,
    location: {
      href: 'https://www.youtube.com/watch?v=test'
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    MutationObserver: function MockMutationObserver() {
      this.observe = () => {};
    },
    document: {
      body: {},
      visibilityState: 'visible',
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    },
    chrome: {
      runtime: {
        id: 'test-extension-id',
        lastError: null,
        onMessage: {
          addListener: (listener) => {
            runtimeMessageListener = listener;
          }
        },
        sendMessage: (_message, callback) => {
          callback({ ok: true, translations: {}, meta: {} });
        }
      },
      storage: {
        sync: {
          get: (_keys, callback) => {
            callback({});
          }
        },
        local: {
          get: (_keys, callback) => {
            callback({});
          },
          set: (_items, callback) => {
            if (typeof callback === 'function') {
              callback();
            }
          }
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  context.window = context;

  return {
    context,
    getRuntimeMessageListener: () => runtimeMessageListener
  };
}

describe('content bundle loading', () => {
  it('loads all content scripts in manifest order without collisions', () => {
    const { context, getRuntimeMessageListener } = createContentRuntimeContext();

    for (const scriptPath of CONTENT_SCRIPT_FILES) {
      const source = fs.readFileSync(scriptPath, 'utf8');
      expect(() => vm.runInContext(source, context, { filename: scriptPath })).not.toThrow();
    }

    const listener = getRuntimeMessageListener();
    expect(typeof listener).toBe('function');

    let response = null;
    listener(
      { type: 'LINGO_STREAM_HEALTH_CHECK' },
      { id: 'test-extension-id' },
      (payload) => {
        response = payload;
      }
    );

    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        initialized: true
      })
    );
  });
});
