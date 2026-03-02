const crypto = require('node:crypto');

if (typeof crypto.getRandomValues !== 'function' && crypto.webcrypto?.getRandomValues) {
  crypto.getRandomValues = crypto.webcrypto.getRandomValues.bind(crypto.webcrypto);
}

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto = crypto.webcrypto ?? crypto;
}
