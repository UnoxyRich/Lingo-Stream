const LIBRETRANSLATE_API = "https://libretranslate.de/translate";
const MYMEMORY_API = "https://api.mymemory.translated.net/get";
const GOOGLE_TRANSLATE_API = "https://translate.googleapis.com/translate_a/single";

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

async function translateWordWithMyMemory(word, targetLanguage) {
  const url = new URL(MYMEMORY_API);
  url.searchParams.set("q", word);
  url.searchParams.set("langpair", `auto|${targetLanguage}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MyMemory failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data?.responseData?.translatedText;
  if (typeof result === "string" && result.trim()) {
    return result;
  }

  throw new Error("MyMemory returned empty translation");
}

async function translateWithMyMemory(words, targetLanguage) {
  return Promise.all(
    words.map(async (word) => {
      try {
        return await translateWordWithMyMemory(word, targetLanguage);
      } catch {
        return word;
      }
    })
  );
}

async function translateWithGoogle(words, targetLanguage) {
  const translated = [];

  for (const word of words) {
    const url = new URL(GOOGLE_TRANSLATE_API);
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", targetLanguage);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", word);

    const response = await fetch(url);
    if (!response.ok) {
      translated.push(word);
      continue;
    }

    const data = await response.json();
    const translatedText = data?.[0]?.map((part) => part?.[0]).join("")?.trim();
    translated.push(translatedText || word);
  }

  return translated;
}

async function translateBatch(words, targetLanguage) {
  try {
    return await translateWithLibreTranslate(words, targetLanguage);
  } catch {
    try {
      return await translateWithMyMemory(words, targetLanguage);
    } catch {
      return translateWithGoogle(words, targetLanguage);
    }
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
