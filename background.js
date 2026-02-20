const LIBRETRANSLATE_API = "https://libretranslate.de/translate";
const MYMEMORY_API = "https://api.mymemory.translated.net/get";

async function translateWithLibreTranslate(words, targetLanguage) {
  const query = words.join("\n");
  const response = await fetch(LIBRETRANSLATE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      q: query,
      source: "auto",
      target: targetLanguage,
      format: "text"
    })
  });

  if (!response.ok) {
    throw new Error(`LibreTranslate failed: ${response.status}`);
  }

  const data = await response.json();
  const translatedText = typeof data.translatedText === "string" ? data.translatedText : "";
  const split = translatedText.split("\n").map((part) => part.trim());
  return words.map((original, index) => split[index] || original);
}

async function translateWithMyMemory(words, targetLanguage) {
  const translated = [];

  for (const word of words) {
    const url = new URL(MYMEMORY_API);
    url.searchParams.set("q", word);
    url.searchParams.set("langpair", `en|${targetLanguage}`);

    const response = await fetch(url);
    if (!response.ok) {
      translated.push(word);
      continue;
    }

    const data = await response.json();
    const result = data?.responseData?.translatedText;
    translated.push(typeof result === "string" && result.trim() ? result : word);
  }

  return translated;
}

async function translateBatch(words, targetLanguage) {
  try {
    return await translateWithLibreTranslate(words, targetLanguage);
  } catch {
    return translateWithMyMemory(words, targetLanguage);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "TRANSLATE_BATCH") {
    return;
  }

  const words = Array.isArray(message.words) ? message.words : [];
  const targetLanguage = typeof message.targetLanguage === "string" ? message.targetLanguage : "es";

  translateBatch(words, targetLanguage)
    .then((translations) => {
      sendResponse({ translations });
    })
    .catch(() => {
      sendResponse({ translations: words });
    });

  return true;
});
