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
const TRANSLATIONS_BY_LANGUAGE = {
  es: {
    enjoy: 'disfrutar',
    learning: 'aprender',
    skills: 'habilidades',
    every: 'cada',
    day: 'dia',
    watching: 'mirando',
    videos: 'videos',
    helps: 'ayuda',
    build: 'construir',
    language: 'idioma',
    confidence: 'confianza',
    quickly: 'rapido',
    practice: 'practicar',
    speaking: 'hablar',
    friends: 'amigos',
    review: 'repasar',
    new: 'nuevo',
    vocabulary: 'vocabulario',
    night: 'noche',
    daily: 'diario'
  },
  fr: {
    enjoy: 'aimer',
    learning: 'apprendre',
    skills: 'competences',
    every: 'chaque',
    day: 'jour',
    watching: 'regarder',
    videos: 'videos',
    helps: 'aide',
    build: 'construire',
    language: 'langue',
    confidence: 'confiance',
    quickly: 'vite',
    practice: 'pratiquer',
    speaking: 'parler',
    friends: 'amis',
    review: 'reviser',
    new: 'nouveau',
    vocabulary: 'vocabulaire',
    night: 'nuit',
    daily: 'quotidien'
  },
  de: {
    enjoy: 'geniessen',
    learning: 'lernen',
    skills: 'fertigkeiten',
    every: 'jeden',
    day: 'tag',
    watching: 'ansehen',
    videos: 'videos',
    helps: 'hilft',
    build: 'aufbauen',
    language: 'sprache',
    confidence: 'vertrauen',
    quickly: 'schnell',
    practice: 'uben',
    speaking: 'sprechen',
    friends: 'freunde',
    review: 'wiederholen',
    new: 'neu',
    vocabulary: 'wortschatz',
    night: 'nacht',
    daily: 'taglich'
  },
  it: {
    enjoy: 'godere',
    learning: 'imparare',
    skills: 'abilita',
    every: 'ogni',
    day: 'giorno',
    watching: 'guardare',
    videos: 'video',
    helps: 'aiuta',
    build: 'costruire',
    language: 'lingua',
    confidence: 'fiducia',
    quickly: 'veloce',
    practice: 'praticare',
    speaking: 'parlare',
    friends: 'amici',
    review: 'ripassare',
    new: 'nuovo',
    vocabulary: 'vocabolario',
    night: 'notte',
    daily: 'quotidiano'
  },
  pt: {
    enjoy: 'curtir',
    learning: 'aprender',
    skills: 'habilidades',
    every: 'cada',
    day: 'dia',
    watching: 'assistindo',
    videos: 'videos',
    helps: 'ajuda',
    build: 'construir',
    language: 'idioma',
    confidence: 'confianca',
    quickly: 'rapido',
    practice: 'praticar',
    speaking: 'falar',
    friends: 'amigos',
    review: 'revisar',
    new: 'novo',
    vocabulary: 'vocabulario',
    night: 'noite',
    daily: 'diario'
  },
  ja: {
    enjoy: 'tanoshimu',
    learning: 'manabu',
    skills: 'sukiru',
    every: 'mai',
    day: 'hi',
    watching: 'miru',
    videos: 'bideo',
    helps: 'tasukeru',
    build: 'kizuku',
    language: 'gengo',
    confidence: 'jishin',
    quickly: 'hayaku',
    practice: 'renshuu',
    speaking: 'hanasu',
    friends: 'tomodachi',
    review: 'fukushu',
    new: 'atarashii',
    vocabulary: 'goi',
    night: 'yoru',
    daily: 'mainichi'
  },
  ko: {
    enjoy: 'jeulgida',
    learning: 'baeuda',
    skills: 'gisul',
    every: 'maeil',
    day: 'nal',
    watching: 'boda',
    videos: 'bidio',
    helps: 'doum',
    build: 'mandeulda',
    language: 'eoneo',
    confidence: 'jasin',
    quickly: 'ppareuge',
    practice: 'yeonseub',
    speaking: 'malhada',
    friends: 'chingu',
    review: 'bogi',
    new: 'sae',
    vocabulary: 'eohwi',
    night: 'bam',
    daily: 'maeil'
  }
};

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

function buildTranslatedLine(sentence, language, replacementPercentage, enabled) {
  const translations = TRANSLATIONS_BY_LANGUAGE[language] ?? TRANSLATIONS_BY_LANGUAGE.es;
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
    if (key && Object.prototype.hasOwnProperty.call(translations, key)) {
      candidates.push({ index, key, word: parts.word });
    }
  }

  const replacementCount = calculateReplacementCount(replacementPercentage, enabled, candidates.length);
  const selectedIndices = enabled ? pickReplacementIndices(candidates, replacementCount) : new Set();
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
    return `${safePrefix}<span class="word-pair">${safeWord} <span class="translation">(${safeTranslated})</span></span>${safeSuffix}`;
  });

  return {
    sentence: normalizedSentence,
    html: fragments.join(' '),
    replacedCount: enabled ? selectedIndices.size : 0,
    candidateCount: candidates.length,
    totalWords
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
    topbar.classList.toggle('compact', window.scrollY > 30);
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

function attachBackgroundParallax() {
  const glowA = document.querySelector('.glow-a');
  const glowB = document.querySelector('.glow-b');
  if (!glowA || !glowB) {
    return;
  }

  let ticking = false;

  const update = () => {
    const y = window.scrollY || 0;
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
  update();
}

function getSlideSections() {
  return Array.from(document.querySelectorAll('main .screen[id]'));
}

function findNearestSectionIndex(sections) {
  if (sections.length === 0) {
    return 0;
  }

  const marker = window.scrollY + window.innerHeight * 0.42;
  let nearestIndex = 0;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < sections.length; index += 1) {
    const distance = Math.abs(sections[index].offsetTop - marker);
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
    sections[targetIndex].scrollIntoView({ behavior, block: 'start' });
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

  const deltaThreshold = 24;
  const lockDurationMs = 680;
  let accumulatedDelta = 0;
  let locked = false;
  let lockTimer = 0;

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

  const updatePreview = () => {
    const percentage = clamp(Number.parseInt(replacementInput.value, 10) || 1, 1, 100);
    replacementInput.value = String(percentage);
    replacementValue.textContent = `${percentage}%`;

    const enabled = enabledInput.checked;
    const providerLabel = providerInput.options[providerInput.selectedIndex]?.textContent || 'Auto fallback';
    const languageLabel = languageInput.options[languageInput.selectedIndex]?.textContent || 'Spanish';
    const sentence = sanitizeSentence(customSentenceInput ? customSentenceInput.value : DEFAULT_SENTENCE);
    const translated = buildTranslatedLine(sentence, languageInput.value, percentage, enabled);

    originalLineNode.textContent = translated.sentence;
    const renderedLine = enabled ? translated.html : escapeHtml(translated.sentence);
    animateLine(translatedLineNode, renderedLine);
    if (heroSubtitleLineNode) {
      animateLine(heroSubtitleLineNode, renderedLine);
    }

    if (previewDensityNode) {
      const density = translated.candidateCount > 0 ? Math.round((translated.replacedCount / translated.candidateCount) * 100) : 0;
      previewDensityNode.textContent = `${density}%`;
    }

    if (previewWordCountNode) {
      previewWordCountNode.textContent = String(translated.totalWords);
    }

    if (previewStatusNode) {
      previewStatusNode.textContent = enabled ? 'Active' : 'Paused';
    }

    if (!enabled) {
      previewMeta.textContent = 'Lingo Stream disabled - captions stay original.';
      setActivePhrase(sentence);
      return;
    }

    previewMeta.textContent = `Provider: ${providerLabel} - Target: ${languageLabel} - Replaced words: ${translated.replacedCount}`;
    setActivePhrase(sentence);
  };

  for (const button of phraseButtons) {
    button.addEventListener('click', () => {
      if (!customSentenceInput) {
        return;
      }

      customSentenceInput.value = sanitizeSentence(button.dataset.phrase || DEFAULT_SENTENCE);
      updatePreview();
    });
  }

  providerInput.addEventListener('change', updatePreview);
  languageInput.addEventListener('change', updatePreview);
  replacementInput.addEventListener('input', updatePreview);
  enabledInput.addEventListener('change', updatePreview);
  if (customSentenceInput) {
    customSentenceInput.addEventListener('input', updatePreview);
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
    refreshButton.addEventListener('click', updatePreview);
  }

  loadStoredSettings();
  if (customSentenceInput && !customSentenceInput.value.trim()) {
    customSentenceInput.value = DEFAULT_SENTENCE;
  }
  updatePreview();
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
  attachRevealAnimation();
  attachTopbarContraction();
  attachBackgroundParallax();
  const sectionController = attachSectionNavigation();
  attachSegmentScroll(sectionController);
  attachInteractivePreview();
  updateCopyrightYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSite, { once: true });
} else {
  initializeSite();
}
