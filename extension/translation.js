export const cache = {};

function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (items) => resolve(items));
  });
}

export async function translateWord(word) {
  const normalized = word.toLowerCase();
  if (cache[normalized]) {
    return cache[normalized];
  }

  const {
    apiKey = '',
    targetLanguage = 'es',
    sourceLanguage = 'en',
    translationEndpoint = 'https://libretranslate.com/translate'
  } = await getFromStorage(['apiKey', 'targetLanguage', 'sourceLanguage', 'translationEndpoint']);

  try {
    const response = await fetch(translationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: word,
        source: sourceLanguage,
        target: targetLanguage,
        format: 'text',
        api_key: apiKey
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const translated = data?.translatedText;

    if (!translated || typeof translated !== 'string') {
      return null;
    }

    cache[normalized] = translated;
    return translated;
  } catch {
    return null;
  }
}
