(() => {
  const STORAGE_KEY = "targetLanguage";
  const WORD_REGEX = /\b[\p{L}']+\b/gu;

  let targetLanguage = "es";

  class TranslationQueue {
    constructor() {
      this.cache = new Map();
      this.pendingWords = new Set();
      this.waiters = new Map();
      this.flushTimer = null;
      this.lastRequestAt = 0;
      this.minRequestIntervalMs = 800;
      this.maxBatchSize = 30;
      this.flushDelayMs = 300;
    }

    normalize(word) {
      return word.toLowerCase();
    }

    async translateWord(word) {
      const normalized = this.normalize(word);
      if (!normalized) {
        return word;
      }

      if (this.cache.has(normalized)) {
        return this.cache.get(normalized);
      }

      return new Promise((resolve) => {
        if (!this.waiters.has(normalized)) {
          this.waiters.set(normalized, []);
        }

        this.waiters.get(normalized).push(resolve);
        this.pendingWords.add(normalized);
        this.scheduleFlush();
      });
    }

    scheduleFlush() {
      if (this.flushTimer) {
        return;
      }

      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushPending().catch(() => {
          // Fail silently so subtitles keep rendering.
        });
      }, this.flushDelayMs);
    }

    async flushPending() {
      if (!this.pendingWords.size) {
        return;
      }

      const queue = [...this.pendingWords];
      this.pendingWords.clear();

      for (let i = 0; i < queue.length; i += this.maxBatchSize) {
        const batch = queue.slice(i, i + this.maxBatchSize);
        await this.waitForRateLimit();
        const translations = await requestTranslations(batch, targetLanguage);

        for (let j = 0; j < batch.length; j += 1) {
          const sourceWord = batch[j];
          const translatedWord = translations[j] || sourceWord;
          this.cache.set(sourceWord, translatedWord);

          const resolvers = this.waiters.get(sourceWord) || [];
          for (const resolve of resolvers) {
            resolve(translatedWord);
          }
          this.waiters.delete(sourceWord);
        }
      }
    }

    async waitForRateLimit() {
      const now = Date.now();
      const elapsed = now - this.lastRequestAt;
      if (elapsed < this.minRequestIntervalMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minRequestIntervalMs - elapsed));
      }
      this.lastRequestAt = Date.now();
    }

    clear() {
      this.cache.clear();
      this.pendingWords.clear();
      this.waiters.clear();
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
    }
  }

  const translator = new TranslationQueue();
  const processedLineCache = new Map();

  function requestTranslations(words, language) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "TRANSLATE_BATCH",
          words,
          targetLanguage: language
        },
        (response) => {
          if (chrome.runtime.lastError || !response || !Array.isArray(response.translations)) {
            resolve(words);
            return;
          }

          resolve(response.translations);
        }
      );
    });
  }

  function preserveCase(original, translated) {
    if (!translated) {
      return original;
    }

    if (original === original.toUpperCase()) {
      return translated.toUpperCase();
    }

    if (original[0] && original[0] === original[0].toUpperCase()) {
      return translated[0].toUpperCase() + translated.slice(1);
    }

    return translated;
  }

  function getReplacementRatio() {
    return 0.08 + Math.random() * 0.08;
  }

  async function translateSubtitleLine(text) {
    if (!text || !text.trim()) {
      return text;
    }

    const words = [...text.matchAll(WORD_REGEX)].map((match) => ({
      value: match[0],
      index: match.index || 0
    }));

    if (!words.length) {
      return text;
    }

    const ratio = getReplacementRatio();
    const targetCount = Math.max(1, Math.floor(words.length * ratio));
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, targetCount);

    const translations = await Promise.all(
      selected.map((word) => translator.translateWord(word.value))
    );

    const replacementMap = new Map();
    for (let i = 0; i < selected.length; i += 1) {
      replacementMap.set(selected[i].index, preserveCase(selected[i].value, translations[i]));
    }

    let cursor = 0;
    let output = "";
    for (const match of text.matchAll(WORD_REGEX)) {
      const start = match.index || 0;
      const original = match[0];

      output += text.slice(cursor, start);
      output += replacementMap.has(start) ? replacementMap.get(start) : original;
      cursor = start + original.length;
    }

    return output + text.slice(cursor);
  }

  async function processSubtitleNode(node) {
    const currentText = node.textContent;
    if (!currentText || !currentText.trim()) {
      return;
    }

    const alreadyProcessed = node.dataset.subtitleMixerOriginal;
    const sourceText = alreadyProcessed || currentText;
    const cacheKey = `${targetLanguage}|${sourceText}`;

    if (processedLineCache.has(cacheKey)) {
      node.textContent = processedLineCache.get(cacheKey);
      node.dataset.subtitleMixerOriginal = sourceText;
      return;
    }

    const translated = await translateSubtitleLine(sourceText);
    processedLineCache.set(cacheKey, translated);
    node.textContent = translated;
    node.dataset.subtitleMixerOriginal = sourceText;

    if (processedLineCache.size > 500) {
      const firstKey = processedLineCache.keys().next().value;
      processedLineCache.delete(firstKey);
    }
  }

  function getSubtitleNodes() {
    return document.querySelectorAll(
      ".ytp-caption-window-container .ytp-caption-segment, .caption-window .captions-text span"
    );
  }

  function handleMutations() {
    const nodes = getSubtitleNodes();
    nodes.forEach((node) => {
      processSubtitleNode(node);
    });
  }

  async function loadLanguagePreference() {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    targetLanguage = stored[STORAGE_KEY] || "es";
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[STORAGE_KEY]) {
      return;
    }

    targetLanguage = changes[STORAGE_KEY].newValue || "es";
    translator.clear();
    processedLineCache.clear();

    document
      .querySelectorAll("[data-subtitle-mixer-original]")
      .forEach((node) => {
        node.textContent = node.dataset.subtitleMixerOriginal || node.textContent;
      });

    handleMutations();
  });

  async function init() {
    await loadLanguagePreference();

    const observer = new MutationObserver(() => {
      handleMutations();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    handleMutations();
  }

  init();
})();
