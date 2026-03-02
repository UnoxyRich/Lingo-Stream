import { defineConfig } from 'vitest/config';
import { webcrypto } from 'node:crypto';

if ((!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') && webcrypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'extension/stopwords.js',
        'extension/processor.js',
        'extension/translation.js',
        'extension/captionObserver.js'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});
