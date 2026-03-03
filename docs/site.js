function inferRepositoryUrl() {
  const host = window.location.hostname;
  const pathSegments = window.location.pathname.split('/').filter(Boolean);

  if (!host.endsWith('.github.io') || pathSegments.length === 0) {
    return 'https://github.com/your-username/Lingo-Stream';
  }

  const owner = host.split('.')[0];
  const repo = pathSegments[0];
  return `https://github.com/${owner}/${repo}`;
}

const DEFAULT_SENTENCE = 'I really enjoy learning new skills every day.';
const WORD_PRIORITY = [
  'vocabulary',
  'language',
  'learning',
  'skills',
  'speaking',
  'watching',
  'videos',
  'confidence',
  'practice',
  'friends',
  'review',
  'build',
  'helps',
  'daily',
  'new',
  'enjoy',
  'every',
  'day',
  'night',
  'quickly'
];
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'she',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'us',
  'we',
  'with',
  'you',
  'your'
]);
const TRANSLATION_TIMEOUT_MS = 2400;
const TRANSLATION_MISS_TTL_MS = 30 * 1000;
const SOURCE_LANGUAGE = 'en';
const AUTO_PROVIDER_ORDER = ['google', 'libre', 'apertium', 'mymemory'];
const LIBRE_ENDPOINTS = ['https://translate.argosopentech.com/translate', 'https://libretranslate.com/translate'];
const translationCache = new Map();
const translationMissCache = new Map();

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeHtmlEntities(value) {
  const decoderNode = document.createElement('textarea');
  decoderNode.innerHTML = String(value ?? '');
  return decoderNode.value;
}

function sanitizeSentence(inputValue) {
  const normalized = String(inputValue || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || DEFAULT_SENTENCE;
}

function normalizeWord(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z']/g, '');
}

function getTranslationCacheKey(provider, sourceLanguage, targetLanguage, normalizedWord) {
  return `${provider}|${sourceLanguage}|${targetLanguage}|${normalizedWord}`;
}

function isMissCached(cacheKey, now = Date.now()) {
  const expiry = translationMissCache.get(cacheKey);
  if (!expiry) {
    return false;
  }

  if (expiry > now) {
    return true;
  }

  translationMissCache.delete(cacheKey);
  return false;
}

function markMissCached(cacheKey, now = Date.now()) {
  translationMissCache.set(cacheKey, now + TRANSLATION_MISS_TTL_MS);
}

function extractTranslatedText(payload) {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (typeof payload.translatedText === 'string') {
    return payload.translatedText;
  }

  if (typeof payload.translation === 'string') {
    return payload.translation;
  }

  if (payload.responseData && typeof payload.responseData.translatedText === 'string') {
    return payload.responseData.translatedText;
  }

  if (Array.isArray(payload.matches)) {
    for (const match of payload.matches) {
      if (typeof match?.translation === 'string' && match.translation.trim()) {
        return match.translation;
      }
    }
  }

  return '';
}

async function fetchJsonWithTimeout(url, init = {}, timeoutMs = TRANSLATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cleanTranslatedResult(originalWord, value) {
  const decoded = decodeHtmlEntities(value);
  const cleaned = decoded
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return '';
  }

  if (normalizeWord(cleaned) === normalizeWord(originalWord)) {
    return '';
  }

  return cleaned;
}

async function requestGoogleTranslation(word, targetLanguage, sourceLanguage) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLanguage);
  url.searchParams.set('tl', targetLanguage);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', word);

  const payload = await fetchJsonWithTimeout(url.toString());
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return '';
  }

  const fragments = payload[0]
    .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
    .filter(Boolean);
  return fragments.join('').trim();
}

async function requestLibreTranslation(word, targetLanguage, sourceLanguage) {
  const body = JSON.stringify({
    q: word,
    source: sourceLanguage,
    target: targetLanguage,
    format: 'text'
  });

  for (const endpoint of LIBRE_ENDPOINTS) {
    try {
      const payload = await fetchJsonWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body
      });

      const translated = extractTranslatedText(payload);
      if (translated) {
        return translated;
      }
    } catch (_error) {
      // Try next mirror when available.
    }
  }

  return '';
}

async function requestApertiumTranslation(word, targetLanguage, sourceLanguage) {
  const url = new URL('https://beta.apertium.org/apy/translate');
  url.searchParams.set('q', word);
  url.searchParams.set('langpair', `${sourceLanguage}|${targetLanguage}`);

  const payload = await fetchJsonWithTimeout(url.toString());
  return extractTranslatedText(payload);
}

async function requestMyMemoryTranslation(word, targetLanguage, sourceLanguage) {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', word);
  url.searchParams.set('langpair', `${sourceLanguage}|${targetLanguage}`);

  const payload = await fetchJsonWithTimeout(url.toString());
  return extractTranslatedText(payload);
}

const providerHandlers = {
  google: requestGoogleTranslation,
  libre: requestLibreTranslation,
  apertium: requestApertiumTranslation,
  mymemory: requestMyMemoryTranslation
};

function extractWordParts(token) {
  const match = String(token).match(/^([^A-Za-z']*)([A-Za-z']+)([^A-Za-z']*)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1],
    word: match[2],
    suffix: match[3]
  };
}

function calculateReplacementCount(replacementPercentage, enabled, candidateCount) {
  if (!enabled || candidateCount <= 0) {
    return 0;
  }

  const numeric = Number.parseInt(String(replacementPercentage), 10);
  const clampedPercentage = Number.isFinite(numeric) ? clamp(numeric, 1, 100) : 35;
  const scaled = Math.floor((candidateCount * clampedPercentage) / 100);
  return clamp(Math.max(1, scaled), 1, candidateCount);
}

function pickReplacementIndices(candidates, replacementCount) {
  if (replacementCount <= 0 || candidates.length === 0) {
    return new Set();
  }

  const priorityLookup = new Map(WORD_PRIORITY.map((word, index) => [word, index]));
  const sortedCandidates = [...candidates].sort((left, right) => {
    const leftRank = priorityLookup.has(left.key) ? priorityLookup.get(left.key) : Number.MAX_SAFE_INTEGER;
    const rightRank = priorityLookup.has(right.key) ? priorityLookup.get(right.key) : Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.word.length !== right.word.length) {
      return right.word.length - left.word.length;
    }

    return left.index - right.index;
  });

  return new Set(sortedCandidates.slice(0, replacementCount).map((entry) => entry.index));
}

async function translateWordByProvider(word, provider, sourceLanguage, targetLanguage) {
  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) {
    return { translated: '', providerUsed: '', failedProviders: [] };
  }

  const now = Date.now();
  const providers =
    provider === 'auto'
      ? AUTO_PROVIDER_ORDER
      : AUTO_PROVIDER_ORDER.includes(provider)
      ? [provider]
      : AUTO_PROVIDER_ORDER;
  const failedProviders = [];

  for (const providerName of providers) {
    const cacheKey = getTranslationCacheKey(providerName, sourceLanguage, targetLanguage, normalizedWord);
    if (translationCache.has(cacheKey)) {
      return {
        translated: translationCache.get(cacheKey) ?? '',
        providerUsed: providerName,
        failedProviders
      };
    }

    if (isMissCached(cacheKey, now)) {
      failedProviders.push(providerName);
      continue;
    }

    const handler = providerHandlers[providerName];
    if (typeof handler !== 'function') {
      failedProviders.push(providerName);
      continue;
    }

    try {
      const rawTranslated = await handler(word, targetLanguage, sourceLanguage);
      const cleaned = cleanTranslatedResult(word, rawTranslated);
      if (cleaned) {
        translationCache.set(cacheKey, cleaned);
        if (provider === 'auto') {
          const autoCacheKey = getTranslationCacheKey('auto', sourceLanguage, targetLanguage, normalizedWord);
          translationCache.set(autoCacheKey, cleaned);
        }

        return { translated: cleaned, providerUsed: providerName, failedProviders };
      }
    } catch (_error) {
      // Try fallback providers.
    }

    markMissCached(cacheKey, now);
    failedProviders.push(providerName);
  }

  return { translated: '', providerUsed: '', failedProviders };
}

async function translateWordsViaApi(words, provider, sourceLanguage, targetLanguage) {
  const uniqueWords = [];
  const seen = new Set();

  for (const word of words) {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord || seen.has(normalizedWord)) {
      continue;
    }

    seen.add(normalizedWord);
    uniqueWords.push(normalizedWord);
  }

  const translations = {};
  const providerByWord = {};
  const failedProvidersByWord = {};

  const translationTasks = uniqueWords.map(async (normalizedWord) => {
    const result = await translateWordByProvider(normalizedWord, provider, sourceLanguage, targetLanguage);
    if (result.translated) {
      translations[normalizedWord] = result.translated;
    }

    if (result.providerUsed) {
      providerByWord[normalizedWord] = result.providerUsed;
    }

    if (result.failedProviders.length > 0) {
      failedProvidersByWord[normalizedWord] = result.failedProviders;
    }
  });

  await Promise.all(translationTasks);

  return {
    translations,
    providerByWord,
    failedProvidersByWord
  };
}

async function buildTranslatedLine(sentence, language, replacementPercentage, enabled, provider) {
  const normalizedSentence = sanitizeSentence(sentence);
  const tokens = normalizedSentence.split(' ');
  const candidates = [];
  let totalWords = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const parts = extractWordParts(tokens[index]);
    if (!parts) {
      continue;
    }

    totalWords += 1;
    const key = normalizeWord(parts.word);
    if (key.length >= 2 && !STOPWORDS.has(key)) {
      candidates.push({ index, key, word: parts.word });
    }
  }

  const replacementCount = calculateReplacementCount(replacementPercentage, enabled, candidates.length);
  const selectedIndices = enabled ? pickReplacementIndices(candidates, replacementCount) : new Set();
  const wordsToTranslate = [];
  for (const candidate of candidates) {
    if (selectedIndices.has(candidate.index)) {
      wordsToTranslate.push(candidate.key);
    }
  }

  const translationResponse =
    enabled && wordsToTranslate.length > 0
      ? await translateWordsViaApi(wordsToTranslate, provider, SOURCE_LANGUAGE, language)
      : { translations: {}, providerByWord: {}, failedProvidersByWord: {} };
  const translations = translationResponse.translations;
  let replacedCount = 0;

  const fragments = tokens.map((token, index) => {
    const parts = extractWordParts(token);
    if (!parts) {
      return escapeHtml(token);
    }

    const key = normalizeWord(parts.word);
    if (!enabled || !selectedIndices.has(index)) {
      return escapeHtml(token);
    }

    const translated = translations[key];
    if (!translated) {
      return escapeHtml(token);
    }

    const safePrefix = escapeHtml(parts.prefix);
    const safeWord = escapeHtml(parts.word);
    const safeSuffix = escapeHtml(parts.suffix);
    const safeTranslated = escapeHtml(translated);
    replacedCount += 1;
    return `${safePrefix}<span class="word-pair">${safeWord} <span class="translation">(${safeTranslated})</span></span>${safeSuffix}`;
  });

  return {
    sentence: normalizedSentence,
    html: fragments.join(' '),
    replacedCount,
    candidateCount: candidates.length,
    totalWords,
    providerByWord: translationResponse.providerByWord,
    failedProvidersByWord: translationResponse.failedProvidersByWord
  };
}

function animateLine(node, content) {
  if (!node) {
    return;
  }

  node.classList.remove('line-change');
  node.innerHTML = content;
  void node.offsetWidth;
  node.classList.add('line-change');
}

function attachRepositoryLinks(repositoryUrl) {
  const linkNodes = document.querySelectorAll('[data-repo-link]');
  for (const linkNode of linkNodes) {
    linkNode.href = repositoryUrl;
  }
}

function attachReleaseLinks(repositoryUrl) {
  const releasesUrl = `${repositoryUrl}/releases`;
  const linkNodes = document.querySelectorAll('[data-releases-link]');
  for (const linkNode of linkNodes) {
    linkNode.href = releasesUrl;
  }
}

function attachRevealAnimation() {
  const revealNodes = document.querySelectorAll('[data-reveal]');
  if (revealNodes.length === 0) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const delayMs = Number.parseInt(entry.target.dataset.delay || '0', 10);
        entry.target.style.transitionDelay = `${Math.max(0, delayMs)}ms`;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.2 }
  );

  for (const revealNode of revealNodes) {
    observer.observe(revealNode);
  }
}

function attachTopbarContraction() {
  const topbar = document.getElementById('topbar');
  if (!topbar) {
    return;
  }

  let ticking = false;

  const update = () => {
    const threshold = Math.max(44, window.innerHeight * 0.1);
    const compact = window.scrollY > threshold;
    topbar.classList.toggle('compact', compact);
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
}

function attachFloatingPlusField() {
  const field = document.getElementById('floatingPlusField');
  if (!field) {
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ornaments = [];

  const buildOrnaments = () => {
    field.replaceChildren();
    ornaments.length = 0;
    const desiredCount = clamp(Math.round(window.innerWidth / 58), 14, 36);

    for (let index = 0; index < desiredCount; index += 1) {
      const node = document.createElement('span');
      node.className = 'floating-plus';
      node.style.left = `${Math.random() * 100}%`;
      node.style.top = `${Math.random() * 100}%`;
      node.style.setProperty('--size', `${12 + Math.random() * 22}px`);
      node.style.setProperty('--alpha', (0.06 + Math.random() * 0.16).toFixed(3));
      node.style.setProperty('--spin-duration', `${12 + Math.random() * 30}s`);

      const glyph = document.createElement('span');
      glyph.className = 'floating-plus-glyph';
      node.append(glyph);
      field.append(node);

      ornaments.push({
        node,
        driftX: (Math.random() * 90 - 45) * (Math.random() > 0.5 ? 1 : -1),
        driftY: (Math.random() * 120 - 60) * (Math.random() > 0.5 ? 1 : -1),
        depth: 0.25 + Math.random() * 1.05
      });
    }
  };

  const update = () => {
    const y = window.scrollY || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = clamp(y / maxScroll, 0, 1);
    document.documentElement.style.setProperty('--scroll-progress', progress.toFixed(4));

    for (const ornament of ornaments) {
      const x = ornament.driftX * progress * ornament.depth;
      const vertical = ornament.driftY * progress * ornament.depth;
      const flow = y * (0.015 * ornament.depth);
      ornament.node.style.transform = `translate3d(${x.toFixed(2)}px, ${(vertical + flow).toFixed(2)}px, 0)`;
    }
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking || reducedMotion.matches) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  };

  const onResize = () => {
    buildOrnaments();
    update();
  };

  buildOrnaments();
  update();

  if (!reducedMotion.matches) {
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  window.addEventListener('resize', onResize);
}

function attachBackgroundParallax() {
  const glowA = document.querySelector('.glow-a');
  const glowB = document.querySelector('.glow-b');
  if (!glowA || !glowB) {
    return;
  }

  let ticking = false;

  const update = () => {
    const y = window.scrollY || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    document.documentElement.style.setProperty('--scroll-progress', String(clamp(y / maxScroll, 0, 1)));
    glowA.style.transform = `translate3d(${-y * 0.02}px, ${y * 0.04}px, 0)`;
    glowB.style.transform = `translate3d(${y * 0.018}px, ${-y * 0.03}px, 0)`;
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

function getSlideSections() {
  return Array.from(document.querySelectorAll('main .screen[id]'));
}

function attachSectionDepthEffect(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) {
    for (const section of sections) {
      section.style.setProperty('--section-shift', '0');
    }
    return;
  }

  let ticking = false;

  const update = () => {
    const viewportCenter = window.innerHeight / 2;
    const normalizer = Math.max(window.innerHeight * 0.7, 1);

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const sectionCenter = rect.top + rect.height / 2;
      const shift = clamp((sectionCenter - viewportCenter) / normalizer, -1, 1);
      section.style.setProperty('--section-shift', shift.toFixed(4));
    }

    ticking = false;
  };

  const onScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

function getSectionCenterOffset(section) {
  return section.offsetTop + section.offsetHeight / 2;
}

function getCenteredScrollTop(section) {
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const target = getSectionCenterOffset(section) - window.innerHeight / 2;
  return clamp(target, 0, maxScroll);
}

function scrollSectionToCenter(section, behavior = 'smooth') {
  if (!section) {
    return;
  }

  window.scrollTo({
    top: getCenteredScrollTop(section),
    behavior
  });
}

function findNearestSectionIndex(sections) {
  if (sections.length === 0) {
    return 0;
  }

  const marker = window.scrollY + window.innerHeight / 2;
  let nearestIndex = 0;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < sections.length; index += 1) {
    const distance = Math.abs(getSectionCenterOffset(sections[index]) - marker);
    if (distance >= smallestDistance) {
      continue;
    }

    smallestDistance = distance;
    nearestIndex = index;
  }

  return nearestIndex;
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable]'));
}

function hasScrollableAncestor(target, deltaY) {
  if (!(target instanceof Element)) {
    return false;
  }

  let node = target;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;

    if (canScrollY) {
      const maxScroll = node.scrollHeight - node.clientHeight;
      if (deltaY > 0 && node.scrollTop < maxScroll - 1) {
        return true;
      }

      if (deltaY < 0 && node.scrollTop > 1) {
        return true;
      }
    }

    node = node.parentElement;
  }

  return false;
}

function attachSectionNavigation() {
  const sections = getSlideSections();
  const dotButtons = Array.from(document.querySelectorAll('.section-dot[data-target]'));
  const anchorLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
  const progressBar = document.getElementById('scrollProgressBar');
  if (sections.length === 0) {
    return {
      sections,
      getActiveIndex: () => 0,
      scrollToIndex: () => {}
    };
  }

  let activeIndex = 0;
  const sectionIndexById = new Map(sections.map((section, index) => [section.id, index]));

  const setActiveIndex = (index) => {
    activeIndex = clamp(index, 0, sections.length - 1);
    const activeSectionId = sections[activeIndex].id;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      sections[sectionIndex].classList.toggle('is-current', sectionIndex === activeIndex);
    }

    for (const button of dotButtons) {
      const isActive = button.dataset.target === activeSectionId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-current', isActive ? 'true' : 'false');
    }

    if (progressBar) {
      const ratio = sections.length > 1 ? activeIndex / (sections.length - 1) : 1;
      progressBar.style.width = `${Math.round(ratio * 100)}%`;
    }
  };

  const scrollToIndex = (index, behavior = 'smooth') => {
    const targetIndex = clamp(index, 0, sections.length - 1);
    setActiveIndex(targetIndex);
    scrollSectionToCenter(sections[targetIndex], behavior);
  };

  for (const button of dotButtons) {
    const targetIndex = sectionIndexById.get(button.dataset.target);
    if (typeof targetIndex !== 'number') {
      continue;
    }

    button.addEventListener('click', () => {
      scrollToIndex(targetIndex, 'smooth');
    });
  }

  for (const link of anchorLinks) {
    const hash = (link.getAttribute('href') || '').trim();
    const targetId = hash.startsWith('#') ? hash.slice(1) : '';
    if (!targetId) {
      continue;
    }

    if (targetId === 'top') {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        scrollToIndex(0, 'smooth');
      });
      continue;
    }

    const targetIndex = sectionIndexById.get(targetId);
    if (typeof targetIndex !== 'number') {
      continue;
    }

    link.addEventListener('click', (event) => {
      event.preventDefault();
      scrollToIndex(targetIndex, 'smooth');
    });
  }

  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(
      (entries) => {
        let topEntry = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          if (!topEntry || entry.intersectionRatio > topEntry.intersectionRatio) {
            topEntry = entry;
          }
        }

        if (!topEntry) {
          return;
        }

        const nextIndex = sections.findIndex((section) => section === topEntry.target);
        if (nextIndex >= 0) {
          setActiveIndex(nextIndex);
        }
      },
      { threshold: [0.35, 0.5, 0.7, 0.9] }
    );

    for (const section of sections) {
      observer.observe(section);
    }
  }

  let ticking = false;
  const syncFromViewport = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(() => {
      setActiveIndex(findNearestSectionIndex(sections));
      ticking = false;
    });
  };

  window.addEventListener('scroll', syncFromViewport, { passive: true });
  window.addEventListener('resize', syncFromViewport);
  syncFromViewport();

  return {
    sections,
    getActiveIndex: () => activeIndex,
    scrollToIndex
  };
}

function attachSegmentScroll(sectionController) {
  const sections = sectionController.sections;
  if (sections.length < 2) {
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  if (reducedMotion.matches || coarsePointer.matches) {
    return;
  }

  const deltaThreshold = 44;
  const lockDurationMs = 760;
  let accumulatedDelta = 0;
  let locked = false;
  let lockTimer = 0;
  let deltaResetTimer = 0;

  const scrollByDirection = (direction) => {
    const currentIndex = findNearestSectionIndex(sections);
    const nextIndex = clamp(currentIndex + direction, 0, sections.length - 1);
    if (nextIndex === currentIndex) {
      return;
    }

    locked = true;
    sectionController.scrollToIndex(nextIndex, 'smooth');
    window.clearTimeout(lockTimer);
    lockTimer = window.setTimeout(() => {
      locked = false;
    }, lockDurationMs);
  };

  const onWheel = (event) => {
    if (event.ctrlKey) {
      return;
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    if (isEditableTarget(event.target) || hasScrollableAncestor(event.target, event.deltaY)) {
      return;
    }

    if (locked) {
      event.preventDefault();
      return;
    }

    accumulatedDelta += event.deltaY;
    window.clearTimeout(deltaResetTimer);
    deltaResetTimer = window.setTimeout(() => {
      accumulatedDelta = 0;
    }, 140);

    if (Math.abs(accumulatedDelta) < deltaThreshold) {
      return;
    }

    event.preventDefault();
    const direction = accumulatedDelta > 0 ? 1 : -1;
    accumulatedDelta = 0;
    scrollByDirection(direction);
  };

  const onKeydown = (event) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    let direction = 0;
    if (event.key === 'PageDown' || event.key === 'ArrowDown') {
      direction = 1;
    } else if (event.key === 'PageUp' || event.key === 'ArrowUp') {
      direction = -1;
    }

    if (direction === 0) {
      return;
    }

    event.preventDefault();
    if (locked) {
      return;
    }

    scrollByDirection(direction);
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('blur', () => {
    accumulatedDelta = 0;
    locked = false;
    window.clearTimeout(lockTimer);
    window.clearTimeout(deltaResetTimer);
  });
}

function attachInteractivePreview() {
  const providerInput = document.getElementById('previewProvider');
  const languageInput = document.getElementById('previewLanguage');
  const replacementInput = document.getElementById('previewReplacement');
  const replacementValue = document.getElementById('previewReplacementValue');
  const enabledInput = document.getElementById('previewEnabled');
  const customSentenceInput = document.getElementById('previewCustomSentence');
  const previewMeta = document.getElementById('previewMeta');
  const previewDensityNode = document.getElementById('previewDensity');
  const previewWordCountNode = document.getElementById('previewWordCount');
  const previewStatusNode = document.getElementById('previewStatus');
  const originalLineNode = document.getElementById('previewOriginalLine');
  const translatedLineNode = document.getElementById('previewTranslatedLine');
  const heroSubtitleLineNode = document.getElementById('heroSubtitleLine');
  const phraseButtons = Array.from(document.querySelectorAll('.pill-btn[data-phrase]'));
  const saveButton = document.querySelector('[data-preview-save]');
  const refreshButton = document.querySelector('[data-preview-refresh]');

  if (
    !providerInput ||
    !languageInput ||
    !replacementInput ||
    !replacementValue ||
    !enabledInput ||
    !previewMeta ||
    !originalLineNode ||
    !translatedLineNode
  ) {
    return;
  }

  const selectHasOption = (selectNode, value) =>
    Array.from(selectNode.options).some((optionNode) => optionNode.value === value);

  const setActivePhrase = (sentence) => {
    const normalized = sanitizeSentence(sentence).toLowerCase();
    for (const button of phraseButtons) {
      const phrase = sanitizeSentence(button.dataset.phrase || '').toLowerCase();
      button.classList.toggle('is-active', phrase === normalized);
    }
  };

  const loadStoredSettings = () => {
    try {
      const rawValue = window.localStorage.getItem('lingo-stream-preview-settings');
      if (!rawValue) {
        return;
      }

      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.provider === 'string' && selectHasOption(providerInput, parsed.provider)) {
          providerInput.value = parsed.provider;
        }

        if (typeof parsed.language === 'string' && selectHasOption(languageInput, parsed.language)) {
          languageInput.value = parsed.language;
        }

        const replacement = Number.parseInt(String(parsed.replacement), 10);
        if (Number.isFinite(replacement)) {
          replacementInput.value = String(clamp(replacement, 1, 100));
        }

        if (typeof parsed.enabled === 'boolean') {
          enabledInput.checked = parsed.enabled;
        }

        if (customSentenceInput && typeof parsed.sentence === 'string') {
          customSentenceInput.value = sanitizeSentence(parsed.sentence);
        }
      }
    } catch (_error) {
      /* Ignore corrupted storage payload. */
    }
  };

  const persistSettings = () => {
    const payload = {
      provider: providerInput.value,
      language: languageInput.value,
      replacement: replacementInput.value,
      enabled: enabledInput.checked,
      sentence: sanitizeSentence(customSentenceInput ? customSentenceInput.value : DEFAULT_SENTENCE)
    };

    try {
      window.localStorage.setItem('lingo-stream-preview-settings', JSON.stringify(payload));
      return true;
    } catch (_error) {
      return false;
    }
  };

  let previewRequestId = 0;
  let updateTimerId = 0;

  const summarizeUsedProviders = (providerByWord) => {
    const used = new Set(Object.values(providerByWord));
    if (used.size === 0) {
      return '';
    }

    return Array.from(used)
      .sort()
      .join(', ');
  };

  const runPreviewUpdate = async () => {
    const percentage = clamp(Number.parseInt(replacementInput.value, 10) || 1, 1, 100);
    replacementInput.value = String(percentage);
    replacementValue.textContent = `${percentage}%`;

    const enabled = enabledInput.checked;
    const providerValue = providerInput.value;
    const providerLabel = providerInput.options[providerInput.selectedIndex]?.textContent || 'Auto fallback';
    const languageLabel = languageInput.options[languageInput.selectedIndex]?.textContent || 'Spanish';
    const sentence = sanitizeSentence(customSentenceInput ? customSentenceInput.value : DEFAULT_SENTENCE);

    if (!enabled) {
      originalLineNode.textContent = sentence;
      const originalLineHtml = escapeHtml(sentence);
      animateLine(translatedLineNode, originalLineHtml);
      if (heroSubtitleLineNode) {
        animateLine(heroSubtitleLineNode, originalLineHtml);
      }

      if (previewDensityNode) {
        previewDensityNode.textContent = '0%';
      }

      if (previewWordCountNode) {
        previewWordCountNode.textContent = String(sentence.split(/\s+/).filter(Boolean).length);
      }

      if (previewStatusNode) {
        previewStatusNode.textContent = 'Paused';
      }

      previewMeta.textContent = 'Lingo Stream disabled - captions stay original.';
      setActivePhrase(sentence);
      return;
    }

    const requestId = ++previewRequestId;
    if (previewStatusNode) {
      previewStatusNode.textContent = 'Translating...';
    }
    previewMeta.textContent = `Provider: ${providerLabel} - Target: ${languageLabel} - Translating...`;

    const translated = await buildTranslatedLine(
      sentence,
      languageInput.value,
      percentage,
      enabled,
      providerValue
    );

    if (requestId !== previewRequestId) {
      return;
    }

    originalLineNode.textContent = translated.sentence;
    animateLine(translatedLineNode, translated.html);
    if (heroSubtitleLineNode) {
      animateLine(heroSubtitleLineNode, translated.html);
    }

    if (previewDensityNode) {
      const density =
        translated.candidateCount > 0
          ? Math.round((translated.replacedCount / translated.candidateCount) * 100)
          : 0;
      previewDensityNode.textContent = `${density}%`;
    }

    if (previewWordCountNode) {
      previewWordCountNode.textContent = String(translated.totalWords);
    }

    const usedProviders = summarizeUsedProviders(translated.providerByWord);
    const failedWords = Object.keys(translated.failedProvidersByWord).length;
    if (previewStatusNode) {
      if (translated.replacedCount > 0 && failedWords === 0) {
        previewStatusNode.textContent = 'Active';
      } else if (translated.replacedCount > 0) {
        previewStatusNode.textContent = 'Partial';
      } else {
        previewStatusNode.textContent = 'No matches';
      }
    }

    const autoProviderInfo = providerValue === 'auto' && usedProviders ? ` (${usedProviders})` : '';
    const missInfo = failedWords > 0 ? ` - API misses: ${failedWords}` : '';
    previewMeta.textContent = `Provider: ${providerLabel}${autoProviderInfo} - Target: ${languageLabel} - Replaced words: ${translated.replacedCount}${missInfo}`;
    setActivePhrase(sentence);
  };

  const schedulePreviewUpdate = (delayMs = 0) => {
    window.clearTimeout(updateTimerId);
    updateTimerId = window.setTimeout(() => {
      void runPreviewUpdate();
    }, delayMs);
  };

  for (const button of phraseButtons) {
    button.addEventListener('click', () => {
      if (!customSentenceInput) {
        return;
      }

      customSentenceInput.value = sanitizeSentence(button.dataset.phrase || DEFAULT_SENTENCE);
      schedulePreviewUpdate();
    });
  }

  providerInput.addEventListener('change', () => {
    schedulePreviewUpdate();
  });
  languageInput.addEventListener('change', () => {
    schedulePreviewUpdate();
  });
  replacementInput.addEventListener('input', () => {
    schedulePreviewUpdate(120);
  });
  enabledInput.addEventListener('change', () => {
    schedulePreviewUpdate();
  });
  if (customSentenceInput) {
    customSentenceInput.addEventListener('input', () => {
      schedulePreviewUpdate(260);
    });
  }

  if (saveButton) {
    saveButton.addEventListener('click', () => {
      const saved = persistSettings();
      previewMeta.textContent = saved
        ? 'Settings saved locally for this preview.'
        : 'Unable to store settings in this browser context.';
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      schedulePreviewUpdate();
    });
  }

  loadStoredSettings();
  if (customSentenceInput && !customSentenceInput.value.trim()) {
    customSentenceInput.value = DEFAULT_SENTENCE;
  }
  schedulePreviewUpdate();
}

function attachQuizShowcase() {
  const cards = Array.from(document.querySelectorAll('.quiz-match-card[data-pair]'));
  if (cards.length === 0) {
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) {
    return;
  }

  const groups = new Map();
  for (const card of cards) {
    const pair = card.dataset.pair || '';
    if (!groups.has(pair)) {
      groups.set(pair, []);
    }
    groups.get(pair).push(card);
  }

  const pairs = Array.from(groups.values()).filter((group) => group.length >= 2);
  if (pairs.length === 0) {
    return;
  }

  let cursor = 0;
  const clearHighlights = () => {
    for (const card of cards) {
      card.classList.remove('is-demo-match');
    }
  };

  const runStep = () => {
    clearHighlights();
    const current = pairs[cursor];
    for (const card of current) {
      card.classList.add('is-demo-match');
    }
    cursor = (cursor + 1) % pairs.length;
  };

  runStep();
  window.setInterval(runStep, 1300);
}

function updateCopyrightYear() {
  const yearNode = document.getElementById('year');
  if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
  }
}

function initializeSite() {
  const repositoryUrl = inferRepositoryUrl();
  attachRepositoryLinks(repositoryUrl);
  attachReleaseLinks(repositoryUrl);
  attachRevealAnimation();
  attachTopbarContraction();
  attachFloatingPlusField();
  attachBackgroundParallax();
  const sectionController = attachSectionNavigation();
  attachSectionDepthEffect(sectionController.sections);
  attachSegmentScroll(sectionController);
  attachInteractivePreview();
  attachQuizShowcase();
  updateCopyrightYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSite, { once: true });
} else {
  initializeSite();
}
