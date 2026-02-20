const LIBRETRANSLATE_API = "https://libretranslate.de/translate";
const MYMEMORY_API = "https://api.mymemory.translated.net/get";
const GOOGLE_TRANSLATE_API = "https://translate.googleapis.com/translate_a/single";

const INVALID_TRANSLATION_PATTERNS = [
  "INVALID SOURCE LANGUAGE",
  "EXAMPLE: LANGPAIR",
  "RFC3066",
  "ALMOST ALL LANGUAGES SUPPORTED"
];

function isValidTranslation(original, candidate) {
  if (typeof candidate !== "string") {
    return false;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return false;
  }

  const upper = trimmed.toUpperCase();
  if (INVALID_TRANSLATION_PATTERNS.some((pattern) => upper.includes(pattern))) {
    return false;
  }

  if (trimmed.length > Math.max(80, original.length * 8)) {
    return false;
  }

  return true;
}

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

  const result = words.map((original, index) => {
    const candidate = split[index];
    return isValidTranslation(original, candidate) ? candidate : original;
  });

  if (result.every((value, index) => value === words[index])) {
    throw new Error("LibreTranslate returned unusable results");
  }

  return result;
}

async function translateWordWithMyMemory(word, targetLanguage) {
  const url = new URL(MYMEMORY_API);
  url.searchParams.set("q", word);
  url.searchParams.set("langpair", `en|${targetLanguage}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MyMemory failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data?.responseData?.translatedText;

  if (!isValidTranslation(word, result)) {
    throw new Error("MyMemory returned invalid translation");
  }

  return result;
}

async function translateWithMyMemory(words, targetLanguage) {
  const translated = await Promise.all(
    words.map(async (word) => {
      try {
        return await translateWordWithMyMemory(word, targetLanguage);
      } catch {
        return word;
      }
    })
  );

  if (translated.every((value, index) => value === words[index])) {
    throw new Error("MyMemory returned no usable translations");
  }

  return translated;
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
    translated.push(isValidTranslation(word, translatedText) ? translatedText : word);
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
