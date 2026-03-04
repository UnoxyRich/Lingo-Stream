const VOCABULARY_ENTRIES_KEY = 'vocabularyEntries';
const VOCABULARY_QUIZ_BUCKETS_KEY = 'vocabularyQuizBuckets';
export const RECENT_WINDOW_MS = 60 * 60 * 1000;
export const PAIRS_PER_ROUND = 5;
export const MIN_PAIRS_PER_ROUND = PAIRS_PER_ROUND;
export const MAX_PAIRS_PER_ROUND = PAIRS_PER_ROUND;
const INCORRECT_SELECTION_WEIGHT = 0.24;
const WRONG_FLASH_MS = 340;
const SCORE_PER_CORRECT = 12;
const SCORE_PENALTY_PER_WRONG = 3;
const QUIZ_INTRO_STORAGE_KEY = 'lingoStreamQuizIntroSeen';
const EASE_STANDARD = 'cubicBezier(0.22, 1, 0.36, 1)';
const EASE_GENTLE = 'cubicBezier(0.25, 0.46, 0.45, 0.94)';
const EASE_POP = 'cubicBezier(0.34, 1.56, 0.64, 1)';
const EASE_TEXT = 'cubicBezier(0.16, 1, 0.3, 1)';

const state = {
  quizBuckets: {
    notQuizzed: [],
    correct: [],
    incorrect: []
  },
  round: null,
  roundIndex: 0,
  selectedSourceId: null,
  selectedTranslationId: null,
  wrongSourceId: null,
  wrongTranslationId: null,
  matchedIds: new Set(),
  roundOutcomeById: new Map(),
  correctMatches: 0,
  wrongMatches: 0,
  score: 0,
  progressPercent: 0,
  wrongFlashTimer: null,
  roundPersisted: false
};

const elements = {
  quizPanel: null,
  emptyState: null,
  sourceChoices: null,
  translationChoices: null,
  progressLabel: null,
  progressFill: null,
  roundValue: null,
  correctCountValue: null,
  incorrectCountValue: null,
  pairValue: null,
  remainingCountValue: null,
  wordPoolValue: null,
  accuracyValue: null,
  scoreValue: null,
  nextRoundButton: null,
  firstQuizModal: null,
  startQuizButton: null
};

const activeTextSplitByNode = new WeakMap();
const lastAnimatedTextByNode = new WeakMap();
const choiceReflectionStateByNode = new WeakMap();
const CHOICE_REFLECTION_EASE = 0.22;
const CHOICE_REFLECTION_SETTLE_DELTA = 0.16;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAnime() {
  if (typeof window === 'undefined') {
    return null;
  }

  return typeof window.anime === 'function' ? window.anime : null;
}

function getAnimeText() {
  if (typeof window === 'undefined') {
    return null;
  }

  const animeTextApi = window.anime4;
  if (!animeTextApi || typeof animeTextApi.animate !== 'function' || typeof animeTextApi.splitText !== 'function') {
    return null;
  }

  return animeTextApi;
}

function pulseNode(node, options = {}) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const anime = getAnime();
  if (!anime || prefersReducedMotion()) {
    return;
  }

  anime.remove(node);
  anime({
    targets: node,
    ...options
  });
}

function animateTextChange(node, options = {}) {
  if (!(node instanceof HTMLElement) || prefersReducedMotion()) {
    return;
  }

  const currentText = node.textContent ?? '';
  const forceAnimation = options.force === true;
  if (!forceAnimation && lastAnimatedTextByNode.get(node) === currentText) {
    return;
  }

  lastAnimatedTextByNode.set(node, currentText);

  const animeText = getAnimeText();
  if (!animeText) {
    return;
  }

  const previousSplit = activeTextSplitByNode.get(node);
  if (previousSplit && typeof previousSplit.revert === 'function') {
    previousSplit.revert();
  }

  const split = animeText.splitText(node, { chars: true, words: false });
  const chars = Array.isArray(split?.chars) ? split.chars : [];
  if (chars.length === 0) {
    return;
  }

  activeTextSplitByNode.set(node, split);
  animeText.animate(chars, {
    y: [options.fromY ?? '0.42em', '0em'],
    opacity: [0, 1],
    duration: options.duration ?? 360,
    delay: animeText.stagger(options.stagger ?? 9),
    ease: options.ease ?? EASE_TEXT,
    onComplete: () => {
      if (activeTextSplitByNode.get(node) === split) {
        split.revert();
        activeTextSplitByNode.delete(node);
      }
    }
  });
}

function shouldAnimateChoiceReflection() {
  if (prefersReducedMotion()) {
    return false;
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }

  return !window.matchMedia('(pointer: coarse)').matches;
}

function paintChoiceReflection(button, reflectionState) {
  button.style.setProperty('--reflect-x', `${reflectionState.x.toFixed(2)}%`);
  button.style.setProperty('--reflect-y', `${reflectionState.y.toFixed(2)}%`);
}

function getChoiceReflectionState(button) {
  let reflectionState = choiceReflectionStateByNode.get(button);
  if (reflectionState) {
    return reflectionState;
  }

  reflectionState = {
    x: 50,
    y: 50,
    targetX: 50,
    targetY: 50,
    active: false,
    frameId: 0
  };
  choiceReflectionStateByNode.set(button, reflectionState);
  paintChoiceReflection(button, reflectionState);
  return reflectionState;
}

function setChoiceReflectionTarget(button, reflectionState, clientX, clientY) {
  const rect = button.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  reflectionState.targetX = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  reflectionState.targetY = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
}

function queueChoiceReflectionFrame(button, reflectionState) {
  if (reflectionState.frameId) {
    return;
  }

  reflectionState.frameId = window.requestAnimationFrame(() => {
    reflectionState.frameId = 0;

    reflectionState.x += (reflectionState.targetX - reflectionState.x) * CHOICE_REFLECTION_EASE;
    reflectionState.y += (reflectionState.targetY - reflectionState.y) * CHOICE_REFLECTION_EASE;
    paintChoiceReflection(button, reflectionState);

    const settledX = Math.abs(reflectionState.targetX - reflectionState.x) <= CHOICE_REFLECTION_SETTLE_DELTA;
    const settledY = Math.abs(reflectionState.targetY - reflectionState.y) <= CHOICE_REFLECTION_SETTLE_DELTA;
    if (!reflectionState.active && settledX && settledY) {
      reflectionState.x = reflectionState.targetX;
      reflectionState.y = reflectionState.targetY;
      paintChoiceReflection(button, reflectionState);
      return;
    }

    queueChoiceReflectionFrame(button, reflectionState);
  });
}

function handleChoicePointerEnter(event) {
  if (!shouldAnimateChoiceReflection()) {
    return;
  }

  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const reflectionState = getChoiceReflectionState(button);
  reflectionState.active = true;
  button.style.setProperty('--reflect-opacity', '1');
  setChoiceReflectionTarget(button, reflectionState, event.clientX, event.clientY);
  queueChoiceReflectionFrame(button, reflectionState);
}

function handleChoicePointerMove(event) {
  if (!shouldAnimateChoiceReflection()) {
    return;
  }

  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const reflectionState = getChoiceReflectionState(button);
  reflectionState.active = true;
  setChoiceReflectionTarget(button, reflectionState, event.clientX, event.clientY);
  queueChoiceReflectionFrame(button, reflectionState);
}

function handleChoicePointerLeave(event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const reflectionState = getChoiceReflectionState(button);
  reflectionState.active = false;
  reflectionState.targetX = 50;
  reflectionState.targetY = 50;
  button.style.setProperty('--reflect-opacity', '0');
  queueChoiceReflectionFrame(button, reflectionState);
}

function cleanupChoiceReflection(button) {
  const reflectionState = choiceReflectionStateByNode.get(button);
  if (!reflectionState) {
    return;
  }

  if (reflectionState.frameId) {
    window.cancelAnimationFrame(reflectionState.frameId);
  }
  choiceReflectionStateByNode.delete(button);
}

function parseTimestampCandidate(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value.trim());
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseCountCandidate(value) {
  if (Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed)) {
    return Math.max(1, parsed);
  }

  return 1;
}

export function createVocabularyKey(entry) {
  return [
    entry.source.toLowerCase(),
    entry.translation.toLowerCase(),
    entry.sourceLanguage.toLowerCase(),
    entry.targetLanguage.toLowerCase()
  ].join('|');
}

export function normalizeVocabularyEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  if (
    typeof entry.source !== 'string' ||
    typeof entry.translation !== 'string' ||
    typeof entry.sourceLanguage !== 'string' ||
    typeof entry.targetLanguage !== 'string'
  ) {
    return null;
  }

  const source = entry.source.trim();
  const translation = entry.translation.trim();
  const sourceLanguage = entry.sourceLanguage.trim().toLowerCase();
  const targetLanguage = entry.targetLanguage.trim().toLowerCase();

  if (!source || !translation || !sourceLanguage || !targetLanguage) {
    return null;
  }

  return {
    source,
    translation,
    sourceLanguage,
    targetLanguage,
    provider: typeof entry.provider === 'string' ? entry.provider.trim() : '',
    count: parseCountCandidate(entry.count),
    firstSeenAt: parseTimestampCandidate(entry.firstSeenAt),
    lastSeenAt: parseTimestampCandidate(entry.lastSeenAt)
  };
}

function normalizeQuizBucketEntry(entry) {
  const normalized = normalizeVocabularyEntry(entry);
  if (!normalized) {
    return null;
  }

  const wrongCountRaw = Number.parseInt(String(entry?.wrongCount ?? 0), 10);
  const wrongCount = Number.isFinite(wrongCountRaw) ? Math.max(0, wrongCountRaw) : 0;
  const lastQuizAt = parseTimestampCandidate(entry?.lastQuizAt);

  return {
    ...normalized,
    wrongCount,
    lastQuizAt
  };
}

function mergeVocabularyEntries(baseEntry, incomingEntry) {
  const merged = {
    ...baseEntry,
    provider: incomingEntry.provider || baseEntry.provider,
    count: parseCountCandidate(baseEntry.count) + parseCountCandidate(incomingEntry.count),
    firstSeenAt: null,
    lastSeenAt: null
  };

  const firstSeenCandidates = [baseEntry.firstSeenAt, incomingEntry.firstSeenAt].filter((value) => Number.isFinite(value));
  merged.firstSeenAt = firstSeenCandidates.length > 0 ? Math.min(...firstSeenCandidates) : null;

  const lastSeenCandidates = [baseEntry.lastSeenAt, incomingEntry.lastSeenAt].filter((value) => Number.isFinite(value));
  merged.lastSeenAt = lastSeenCandidates.length > 0 ? Math.max(...lastSeenCandidates) : null;

  return merged;
}

function mergeQuizBucketEntries(baseEntry, incomingEntry) {
  const merged = mergeVocabularyEntries(baseEntry, incomingEntry);
  merged.wrongCount = Math.max(baseEntry.wrongCount ?? 0, incomingEntry.wrongCount ?? 0);

  const baseQuizAt = Number.isFinite(baseEntry.lastQuizAt) ? baseEntry.lastQuizAt : null;
  const incomingQuizAt = Number.isFinite(incomingEntry.lastQuizAt) ? incomingEntry.lastQuizAt : null;
  merged.lastQuizAt = Number.isFinite(baseQuizAt) && Number.isFinite(incomingQuizAt)
    ? Math.max(baseQuizAt, incomingQuizAt)
    : (baseQuizAt ?? incomingQuizAt);
  return merged;
}

function sortEntriesByRecency(entries) {
  return [...entries].sort((left, right) => {
    const leftLast = Number.isFinite(left.lastSeenAt) ? left.lastSeenAt : 0;
    const rightLast = Number.isFinite(right.lastSeenAt) ? right.lastSeenAt : 0;
    return rightLast - leftLast;
  });
}

function upsertBucketEntry(map, entry) {
  const key = createVocabularyKey(entry);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, entry);
    return;
  }

  map.set(key, mergeQuizBucketEntries(existing, entry));
}

export function normalizeQuizBuckets(rawBuckets, fallbackEntries = []) {
  const notQuizzedMap = new Map();
  const correctMap = new Map();
  const incorrectMap = new Map();

  const rawNotQuizzed = Array.isArray(rawBuckets?.notQuizzed) ? rawBuckets.notQuizzed : [];
  const rawCorrect = Array.isArray(rawBuckets?.correct) ? rawBuckets.correct : [];
  const rawIncorrect = Array.isArray(rawBuckets?.incorrect) ? rawBuckets.incorrect : [];

  for (const entry of rawNotQuizzed) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }
    upsertBucketEntry(notQuizzedMap, normalized);
  }

  for (const entry of rawCorrect) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }
    upsertBucketEntry(correctMap, normalized);
  }

  for (const entry of rawIncorrect) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }
    upsertBucketEntry(incorrectMap, normalized);
  }

  for (const entry of fallbackEntries) {
    const normalized = normalizeQuizBucketEntry(entry);
    if (!normalized) {
      continue;
    }

    const key = createVocabularyKey(normalized);
    if (correctMap.has(key) || incorrectMap.has(key)) {
      continue;
    }
    upsertBucketEntry(notQuizzedMap, normalized);
  }

  for (const key of correctMap.keys()) {
    notQuizzedMap.delete(key);
    incorrectMap.delete(key);
  }

  for (const key of incorrectMap.keys()) {
    notQuizzedMap.delete(key);
  }

  return {
    notQuizzed: sortEntriesByRecency(Array.from(notQuizzedMap.values())),
    correct: sortEntriesByRecency(Array.from(correctMap.values())),
    incorrect: sortEntriesByRecency(Array.from(incorrectMap.values()))
  };
}

export function filterRecentEntries(entries, now = Date.now(), windowMs = RECENT_WINDOW_MS) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const minTimestamp = now - windowMs;
  const deduped = new Map();

  for (const rawEntry of entries) {
    const entry = normalizeVocabularyEntry(rawEntry);
    if (!entry) {
      continue;
    }

    const seenAt = Number.isFinite(entry.lastSeenAt) ? entry.lastSeenAt : entry.firstSeenAt;
    if (!Number.isFinite(seenAt) || seenAt < minTimestamp || seenAt > now) {
      continue;
    }

    const key = createVocabularyKey(entry);
    const existing = deduped.get(key);
    if (!existing || seenAt > (existing.lastSeenAt ?? existing.firstSeenAt ?? 0)) {
      deduped.set(key, {
        ...entry,
        firstSeenAt: entry.firstSeenAt ?? seenAt,
        lastSeenAt: seenAt
      });
    }
  }

  return sortEntriesByRecency(Array.from(deduped.values()));
}

export function shuffle(values, random = Math.random) {
  const copy = [...values];
  for (let cursor = copy.length - 1; cursor > 0; cursor -= 1) {
    const swapIndex = Math.floor(random() * (cursor + 1));
    const temp = copy[cursor];
    copy[cursor] = copy[swapIndex];
    copy[swapIndex] = temp;
  }
  return copy;
}

export function buildQuizCandidateEntries(buckets) {
  const normalized = normalizeQuizBuckets(buckets);

  const notQuizzed = normalized.notQuizzed.map((entry) => ({
    ...entry,
    quizBucket: 'not_quizzed',
    selectionWeight: 1
  }));

  const incorrect = normalized.incorrect.map((entry) => {
    const wrongCount = Number.isFinite(entry.wrongCount) ? entry.wrongCount : 0;
    const decayedWeight = INCORRECT_SELECTION_WEIGHT / (1 + wrongCount * 0.35);
    return {
      ...entry,
      quizBucket: 'incorrect',
      selectionWeight: clamp(decayedWeight, 0.05, INCORRECT_SELECTION_WEIGHT)
    };
  });

  return [...notQuizzed, ...incorrect];
}

function getCandidateWeight(entry) {
  const explicitWeight = Number(entry?.selectionWeight);
  if (Number.isFinite(explicitWeight) && explicitWeight > 0) {
    return explicitWeight;
  }

  return entry?.quizBucket === 'incorrect' ? INCORRECT_SELECTION_WEIGHT : 1;
}

function pickWeightedCandidate(candidates, random = Math.random) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce((sum, entry) => sum + getCandidateWeight(entry), 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return candidates[Math.floor(random() * candidates.length)] ?? null;
  }

  let threshold = random() * totalWeight;
  for (const entry of candidates) {
    threshold -= getCandidateWeight(entry);
    if (threshold <= 0) {
      return entry;
    }
  }

  return candidates[candidates.length - 1] ?? null;
}

export function buildMatchingRound(
  entries,
  {
    random = Math.random,
    minPairs = MIN_PAIRS_PER_ROUND,
    maxPairs = MAX_PAIRS_PER_ROUND
  } = {}
) {
  if (!Array.isArray(entries) || entries.length < minPairs) {
    return null;
  }

  const dedupedByKey = new Map();
  for (const rawEntry of entries) {
    const normalized = normalizeVocabularyEntry(rawEntry);
    if (!normalized) {
      continue;
    }

    const key = createVocabularyKey(normalized);
    const existing = dedupedByKey.get(key);
    const candidate = {
      ...normalized,
      quizBucket: rawEntry?.quizBucket === 'incorrect' ? 'incorrect' : 'not_quizzed',
      wrongCount: Number.isFinite(rawEntry?.wrongCount) ? Math.max(0, rawEntry.wrongCount) : 0,
      selectionWeight: getCandidateWeight(rawEntry)
    };

    if (!existing) {
      dedupedByKey.set(key, candidate);
      continue;
    }

    const merged = mergeQuizBucketEntries(existing, candidate);
    merged.quizBucket = existing.quizBucket === 'not_quizzed' ? 'not_quizzed' : candidate.quizBucket;
    merged.selectionWeight = Math.max(getCandidateWeight(existing), getCandidateWeight(candidate));
    dedupedByKey.set(key, merged);
  }

  const pool = Array.from(dedupedByKey.values());
  if (pool.length < minPairs) {
    return null;
  }

  const selectedPairs = [];
  const usedSource = new Set();
  const usedTranslation = new Set();
  const selectedIds = new Set();

  while (selectedPairs.length < maxPairs) {
    const eligible = pool.filter((entry) => {
      const pairId = createVocabularyKey(entry);
      if (selectedIds.has(pairId)) {
        return false;
      }

      const sourceKey = entry.source.toLowerCase();
      const translationKey = entry.translation.toLowerCase();
      return !usedSource.has(sourceKey) && !usedTranslation.has(translationKey);
    });

    if (eligible.length === 0) {
      break;
    }

    const chosen = pickWeightedCandidate(eligible, random);
    if (!chosen) {
      break;
    }

    const pairId = createVocabularyKey(chosen);
    selectedIds.add(pairId);
    usedSource.add(chosen.source.toLowerCase());
    usedTranslation.add(chosen.translation.toLowerCase());

    selectedPairs.push({
      id: pairId,
      source: chosen.source,
      translation: chosen.translation,
      sourceLanguage: chosen.sourceLanguage,
      targetLanguage: chosen.targetLanguage,
      provider: chosen.provider,
      count: chosen.count,
      firstSeenAt: chosen.firstSeenAt,
      lastSeenAt: chosen.lastSeenAt,
      wrongCount: chosen.wrongCount,
      quizBucket: chosen.quizBucket
    });
  }

  if (selectedPairs.length < minPairs) {
    return null;
  }

  const sourceOrder = shuffle(selectedPairs.map((pair) => pair.id), random);
  const translationOrder = shuffle(selectedPairs.map((pair) => pair.id), random);

  return {
    pairs: selectedPairs,
    pairById: new Map(selectedPairs.map((pair) => [pair.id, pair])),
    sourceOrder,
    translationOrder
  };
}

function cacheElements() {
  elements.quizPanel = document.getElementById('quizPanel');
  elements.emptyState = document.getElementById('emptyState');
  elements.sourceChoices = document.getElementById('sourceChoices');
  elements.translationChoices = document.getElementById('translationChoices');
  elements.progressLabel = document.getElementById('progressLabel');
  elements.progressFill = document.getElementById('progressFill');
  elements.roundValue = document.getElementById('roundValue');
  elements.correctCountValue = document.getElementById('correctCountValue');
  elements.incorrectCountValue = document.getElementById('incorrectCountValue');
  elements.pairValue = document.getElementById('pairValue');
  elements.remainingCountValue = document.getElementById('remainingCountValue');
  elements.wordPoolValue = document.getElementById('wordPoolValue');
  elements.accuracyValue = document.getElementById('accuracyValue');
  elements.scoreValue = document.getElementById('scoreValue');
  elements.nextRoundButton = document.getElementById('nextRoundButton');
  elements.firstQuizModal = document.getElementById('firstQuizModal');
  elements.startQuizButton = document.getElementById('startQuizButton');
}

function attachRevealAnimation() {
  const revealNodes = document.querySelectorAll('[data-reveal]');
  if (revealNodes.length === 0) {
    return;
  }

  const anime = getAnime();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const delayMs = Number.parseInt(entry.target.dataset.delay || '0', 10);
        entry.target.classList.add('visible');
        if (anime && !prefersReducedMotion()) {
          anime.remove(entry.target);
          anime({
            targets: entry.target,
            opacity: [0, 1],
            translateY: [18, 0],
            scale: [0.985, 1],
            duration: 560,
            delay: Math.max(0, delayMs),
            easing: EASE_STANDARD
          });
        } else {
          entry.target.style.transitionDelay = `${Math.max(0, delayMs)}ms`;
        }
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.1 }
  );

  for (const revealNode of revealNodes) {
    observer.observe(revealNode);
  }
}

function attachFloatingPlusField() {
  const field = document.getElementById('floatingPlusField');
  if (!field) {
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const anime = getAnime();
  const ornaments = [];

  const buildOrnaments = () => {
    field.replaceChildren();
    ornaments.length = 0;
    const desiredCount = clamp(Math.round(window.innerWidth / 58), 12, 30);

    for (let index = 0; index < desiredCount; index += 1) {
      const node = document.createElement('span');
      node.className = 'floating-plus';
      node.style.left = `${Math.random() * 100}%`;
      node.style.top = `${Math.random() * 100}%`;
      node.style.setProperty('--size', `${12 + Math.random() * 22}px`);
      const baseAlpha = (0.06 + Math.random() * 0.16).toFixed(3);
      node.style.setProperty('--alpha', baseAlpha);
      node.style.setProperty('--spin-duration', `${12 + Math.random() * 30}s`);

      const glyph = document.createElement('span');
      glyph.className = 'floating-plus-glyph';
      node.append(glyph);
      field.append(node);

      if (anime && !reducedMotion.matches) {
        anime({
          targets: node,
          opacity: [Number.parseFloat(baseAlpha), clamp(Number.parseFloat(baseAlpha) + 0.12, 0.04, 0.32)],
          duration: 2200 + Math.random() * 1900,
          easing: EASE_GENTLE,
          direction: 'alternate',
          loop: true,
          delay: Math.random() * 1000
        });
      }

      ornaments.push({
        node,
        driftX: (Math.random() * 90 - 45) * (Math.random() > 0.5 ? 1 : -1),
        driftY: (Math.random() * 120 - 60) * (Math.random() > 0.5 ? 1 : -1),
        depth: 0.3 + Math.random() * 0.9
      });
    }
  };

  const update = () => {
    const y = window.scrollY || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = clamp(y / maxScroll, 0, 1);

    for (const ornament of ornaments) {
      const x = ornament.driftX * progress * ornament.depth;
      const vertical = ornament.driftY * progress * ornament.depth;
      const flow = y * (0.012 * ornament.depth);
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

  buildOrnaments();
  update();

  if (!reducedMotion.matches) {
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  window.addEventListener('resize', () => {
    buildOrnaments();
    update();
  });
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
  window.addEventListener('resize', onScroll);
  update();
}

function hasSeenQuizIntro() {
  try {
    return window.localStorage.getItem(QUIZ_INTRO_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function markQuizIntroSeen() {
  try {
    window.localStorage.setItem(QUIZ_INTRO_STORAGE_KEY, '1');
  } catch {
    // Ignore localStorage write errors.
  }
}

function showFirstQuizModalIfNeeded() {
  if (!elements.firstQuizModal || hasSeenQuizIntro()) {
    return;
  }

  elements.firstQuizModal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  const modalCard = elements.firstQuizModal.querySelector('.intro-card');
  pulseNode(modalCard, {
    opacity: [0.2, 1],
    translateY: [24, 0],
    scale: [0.95, 1],
    duration: 480,
    easing: EASE_STANDARD
  });

  animateTextChange(document.querySelector('.intro-kicker'), { duration: 420, stagger: 9 });
  animateTextChange(document.getElementById('introTitle'), { duration: 560, stagger: 12 });
}

function closeFirstQuizModal() {
  if (!elements.firstQuizModal || elements.firstQuizModal.classList.contains('hidden')) {
    return;
  }

  markQuizIntroSeen();
  const modal = elements.firstQuizModal;
  const modalCard = modal.querySelector('.intro-card');
  const anime = getAnime();

  if (anime && !prefersReducedMotion() && modalCard) {
    anime.remove(modalCard);
    anime({
      targets: modalCard,
      opacity: [1, 0],
      translateY: [0, -16],
      scale: [1, 0.94],
      duration: 280,
      easing: EASE_GENTLE,
      complete: () => {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
      }
    });
    return;
  }

  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function attachTextEntranceMotion() {
  const animatedNodes = [
    document.querySelector('.brand-name'),
    document.querySelector('.panel-head h2'),
    ...Array.from(document.querySelectorAll('.column-title'))
  ];

  for (const [index, node] of animatedNodes.entries()) {
    window.setTimeout(() => {
      animateTextChange(node, {
        duration: 460,
        stagger: 8,
        ease: EASE_STANDARD
      });
    }, index * 60);
  }
}

function getLocalStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }
      resolve(items ?? {});
    });
  });
}

function setLocalStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function getQuizBucketsFromStorage() {
  const items = await getLocalStorage([VOCABULARY_ENTRIES_KEY, VOCABULARY_QUIZ_BUCKETS_KEY]);
  const fallbackEntries = Array.isArray(items[VOCABULARY_ENTRIES_KEY]) ? items[VOCABULARY_ENTRIES_KEY] : [];
  const buckets = normalizeQuizBuckets(items[VOCABULARY_QUIZ_BUCKETS_KEY], fallbackEntries);

  if (!items[VOCABULARY_QUIZ_BUCKETS_KEY] && fallbackEntries.length > 0) {
    await setLocalStorage({ [VOCABULARY_QUIZ_BUCKETS_KEY]: buckets });
  }

  return buckets;
}

function clearWrongFeedbackTimer() {
  if (state.wrongFlashTimer) {
    clearTimeout(state.wrongFlashTimer);
    state.wrongFlashTimer = null;
  }
}

function updateBucketStats() {
  if (elements.wordPoolValue) {
    const poolSize = state.quizBuckets.notQuizzed.length + state.quizBuckets.incorrect.length;
    setStatValue(elements.wordPoolValue, String(poolSize));
  }
}

function setStatValue(node, value) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const nextValue = String(value);
  const previousValue = node.textContent ?? '';
  node.textContent = nextValue;
  if (previousValue === nextValue) {
    return;
  }

  pulseNode(node, {
    scale: [1, 1.06, 1],
    duration: 260,
    easing: EASE_POP
  });
}

function updateStats() {
  const totalPairs = state.round?.pairs.length ?? 0;
  const matched = state.matchedIds.size;
  const attempts = state.correctMatches + state.wrongMatches;
  const accuracy = attempts > 0 ? Math.round((state.correctMatches / attempts) * 100) : 100;
  const progressPercent = totalPairs > 0 ? Math.round((matched / totalPairs) * 100) : 0;
  const remaining = Math.max(0, totalPairs - matched);
  const anime = getAnime();

  setStatValue(elements.roundValue, String(Math.max(1, state.roundIndex)));
  if (elements.correctCountValue) {
    setStatValue(elements.correctCountValue, String(state.correctMatches));
  }
  if (elements.incorrectCountValue) {
    setStatValue(elements.incorrectCountValue, String(state.wrongMatches));
  }
  setStatValue(elements.pairValue, `${matched}/${totalPairs}`);
  if (elements.remainingCountValue) {
    setStatValue(elements.remainingCountValue, String(remaining));
  }
  setStatValue(elements.accuracyValue, `${accuracy}%`);
  setStatValue(elements.scoreValue, String(state.score));
  const nextProgressLabel = `Matched ${matched} of ${totalPairs} pairs`;
  const progressLabelChanged = elements.progressLabel.textContent !== nextProgressLabel;
  elements.progressLabel.textContent = nextProgressLabel;
  if (progressLabelChanged) {
    animateTextChange(elements.progressLabel, {
      force: true,
      duration: 340,
      stagger: 7,
      ease: EASE_TEXT
    });
  }
  if (anime && elements.progressFill && !prefersReducedMotion()) {
    anime.remove(elements.progressFill);
    anime({
      targets: elements.progressFill,
      width: [`${state.progressPercent}%`, `${progressPercent}%`],
      duration: 320,
      easing: EASE_STANDARD
    });
  } else if (elements.progressFill) {
    elements.progressFill.style.width = `${progressPercent}%`;
  }
  state.progressPercent = progressPercent;
  updateBucketStats();
}

function updateChoiceButtonState(button, kind, id) {
  const isMatched = state.matchedIds.has(id);
  const isSelected = kind === 'source' ? state.selectedSourceId === id : state.selectedTranslationId === id;
  const isWrong = kind === 'source' ? state.wrongSourceId === id : state.wrongTranslationId === id;

  button.classList.toggle('matched', isMatched);
  button.classList.toggle('selected', !isMatched && isSelected);
  button.classList.toggle('wrong', !isMatched && isWrong);
  button.disabled = isMatched;

  if (isMatched) {
    const reflectionState = choiceReflectionStateByNode.get(button);
    if (reflectionState) {
      reflectionState.active = false;
      reflectionState.targetX = 50;
      reflectionState.targetY = 50;
      queueChoiceReflectionFrame(button, reflectionState);
    }
    button.style.setProperty('--reflect-opacity', '0');
  }
}

function animateChoicePair(pairId, mode) {
  const anime = getAnime();
  if (!anime || prefersReducedMotion()) {
    return;
  }

  const targets = Array.from(document.querySelectorAll('.choice')).filter(
    (node) => node instanceof HTMLElement && node.dataset.id === pairId
  );
  if (targets.length === 0) {
    return;
  }

  anime.remove(targets);
  if (mode === 'matched') {
    anime({
      targets,
      scale: [1, 1.08, 1],
      duration: 340,
      easing: EASE_POP
    });
    return;
  }

  anime({
    targets,
    translateX: [0, -5, 5, -4, 4, 0],
    duration: 280,
    easing: EASE_GENTLE
  });
}

function buildChoiceButton({ kind, id, label, index }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.dataset.kind = kind;
  button.dataset.id = id;
  button.style.setProperty('--reflect-x', '50%');
  button.style.setProperty('--reflect-y', '50%');
  button.style.setProperty('--reflect-opacity', '0');
  const labelNode = document.createElement('span');
  labelNode.className = 'choice-label';
  labelNode.textContent = label;
  button.append(labelNode);
  button.dataset.enterIndex = String(index);

  if (shouldAnimateChoiceReflection()) {
    button.addEventListener('pointerenter', handleChoicePointerEnter);
    button.addEventListener('pointermove', handleChoicePointerMove);
    button.addEventListener('pointerleave', handleChoicePointerLeave);
    button.addEventListener('pointercancel', handleChoicePointerLeave);
  }

  updateChoiceButtonState(button, kind, id);

  return button;
}

function syncChoiceColumn(container, order, kind) {
  if (!state.round || !(container instanceof HTMLElement)) {
    return;
  }

  const existingButtonsById = new Map();
  for (const node of Array.from(container.children)) {
    if (!(node instanceof HTMLButtonElement) || !node.classList.contains('choice')) {
      continue;
    }
    if (!node.dataset.id) {
      continue;
    }
    existingButtonsById.set(node.dataset.id, node);
  }

  const nextButtons = [];
  order.forEach((id, index) => {
    const pair = state.round.pairById.get(id);
    if (!pair) {
      return;
    }

    const label = kind === 'source' ? pair.source : pair.translation;
    const existingButton = existingButtonsById.get(pair.id);
    if (existingButton) {
      existingButton.dataset.kind = kind;
      const existingLabelNode = existingButton.querySelector('.choice-label');
      if (existingLabelNode) {
        existingLabelNode.textContent = label;
      } else {
        existingButton.textContent = label;
      }
      updateChoiceButtonState(existingButton, kind, pair.id);
      nextButtons.push(existingButton);
      existingButtonsById.delete(pair.id);
      return;
    }

    nextButtons.push(buildChoiceButton({ kind, id: pair.id, label, index }));
  });

  for (const staleButton of existingButtonsById.values()) {
    cleanupChoiceReflection(staleButton);
    staleButton.remove();
  }

  for (const button of nextButtons) {
    container.appendChild(button);
    const enterIndex = Number.parseInt(button.dataset.enterIndex || '-1', 10);
    if (!Number.isFinite(enterIndex) || enterIndex < 0) {
      continue;
    }

    delete button.dataset.enterIndex;
    const anime = getAnime();
    if (anime && !prefersReducedMotion()) {
      anime({
        targets: button,
        opacity: [0, 1],
        translateY: [8, 0],
        scale: [0.985, 1],
        duration: 320,
        delay: enterIndex * 28,
        easing: EASE_STANDARD
      });
      continue;
    }

    button.style.animationDelay = `${enterIndex * 34}ms`;
    button.classList.add('choice-enter');
    button.addEventListener('animationend', () => {
      button.classList.remove('choice-enter');
    }, { once: true });
  }
}

function renderChoices() {
  if (!state.round) {
    return;
  }

  syncChoiceColumn(elements.sourceChoices, state.round.sourceOrder, 'source');
  syncChoiceColumn(elements.translationChoices, state.round.translationOrder, 'translation');
}

function renderRound() {
  renderChoices();
  updateStats();
}

function clearSelections() {
  state.selectedSourceId = null;
  state.selectedTranslationId = null;
}

function markRoundOutcomeIncorrect(pairId) {
  if (!pairId || !state.round?.pairById.has(pairId)) {
    return;
  }

  state.roundOutcomeById.set(pairId, 'incorrect');
}

async function persistRoundBucketOutcomes() {
  if (!state.round || state.roundPersisted) {
    return;
  }
  state.roundPersisted = true;

  const notQuizzedMap = new Map(
    state.quizBuckets.notQuizzed.map((entry) => [createVocabularyKey(entry), entry])
  );
  const correctMap = new Map(
    state.quizBuckets.correct.map((entry) => [createVocabularyKey(entry), entry])
  );
  const incorrectMap = new Map(
    state.quizBuckets.incorrect.map((entry) => [createVocabularyKey(entry), entry])
  );

  const now = Date.now();

  for (const pair of state.round.pairs) {
    const key = createVocabularyKey(pair);
    const roundResult = state.roundOutcomeById.get(pair.id) === 'incorrect' ? 'incorrect' : 'correct';
    const normalizedPair = normalizeQuizBucketEntry({
      ...pair,
      wrongCount: 0,
      lastQuizAt: now
    });

    if (!normalizedPair) {
      continue;
    }

    notQuizzedMap.delete(key);

    if (roundResult === 'correct') {
      incorrectMap.delete(key);
      const existingCorrect = correctMap.get(key);
      const mergedCorrect = existingCorrect
        ? mergeQuizBucketEntries(existingCorrect, normalizedPair)
        : normalizedPair;
      mergedCorrect.wrongCount = 0;
      mergedCorrect.lastQuizAt = now;
      correctMap.set(key, mergedCorrect);
      continue;
    }

    if (correctMap.has(key)) {
      notQuizzedMap.delete(key);
      incorrectMap.delete(key);
      continue;
    }

    const existingIncorrect = incorrectMap.get(key);
    const mergedIncorrect = existingIncorrect
      ? mergeQuizBucketEntries(existingIncorrect, normalizedPair)
      : normalizedPair;
    mergedIncorrect.wrongCount = (existingIncorrect?.wrongCount ?? 0) + 1;
    mergedIncorrect.lastQuizAt = now;
    incorrectMap.set(key, mergedIncorrect);
  }

  for (const key of correctMap.keys()) {
    notQuizzedMap.delete(key);
    incorrectMap.delete(key);
  }

  for (const key of incorrectMap.keys()) {
    notQuizzedMap.delete(key);
  }

  state.quizBuckets = {
    notQuizzed: sortEntriesByRecency(Array.from(notQuizzedMap.values())),
    correct: sortEntriesByRecency(Array.from(correctMap.values())),
    incorrect: sortEntriesByRecency(Array.from(incorrectMap.values()))
  };
  updateBucketStats();

  await setLocalStorage({ [VOCABULARY_QUIZ_BUCKETS_KEY]: state.quizBuckets });
}

function onRoundCompleted() {
  elements.nextRoundButton.disabled = false;
  pulseNode(elements.nextRoundButton, {
    scale: [1, 1.06, 1],
    duration: 360,
    easing: EASE_POP
  });
  void persistRoundBucketOutcomes();
}

function evaluateCurrentSelection() {
  if (!state.selectedSourceId || !state.selectedTranslationId || !state.round) {
    return;
  }

  const sourceId = state.selectedSourceId;
  const translationId = state.selectedTranslationId;

  if (sourceId === translationId) {
    state.matchedIds.add(sourceId);
    state.correctMatches += 1;
    state.score += SCORE_PER_CORRECT;

    if (state.roundOutcomeById.get(sourceId) !== 'incorrect') {
      state.roundOutcomeById.set(sourceId, 'correct');
    }

    clearSelections();
    clearWrongFeedbackTimer();
    state.wrongSourceId = null;
    state.wrongTranslationId = null;
    animateChoicePair(sourceId, 'matched');

    if (state.matchedIds.size === state.round.pairs.length) {
      onRoundCompleted();
    }

    renderRound();
    return;
  }

  state.wrongMatches += 1;
  state.score = Math.max(0, state.score - SCORE_PENALTY_PER_WRONG);
  state.wrongSourceId = sourceId;
  state.wrongTranslationId = translationId;
  markRoundOutcomeIncorrect(sourceId);
  markRoundOutcomeIncorrect(translationId);
  animateChoicePair(sourceId, 'wrong');
  animateChoicePair(translationId, 'wrong');
  renderRound();

  clearWrongFeedbackTimer();
  state.wrongFlashTimer = setTimeout(() => {
    state.wrongSourceId = null;
    state.wrongTranslationId = null;
    clearSelections();
    state.wrongFlashTimer = null;
    renderRound();
  }, WRONG_FLASH_MS);
}

function handleChoiceClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest('.choice');
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const id = button.dataset.id;
  const kind = button.dataset.kind;
  if (!id || !kind || state.matchedIds.has(id)) {
    return;
  }

  clearWrongFeedbackTimer();
  state.wrongSourceId = null;
  state.wrongTranslationId = null;

  if (kind === 'source') {
    state.selectedSourceId = state.selectedSourceId === id ? null : id;
  } else if (kind === 'translation') {
    if (!state.selectedSourceId) {
      return;
    }
    state.selectedTranslationId = state.selectedTranslationId === id ? null : id;
  }

  renderChoices();
  evaluateCurrentSelection();
}

function showEmptyState(message) {
  elements.emptyState.classList.remove('hidden');
  elements.quizPanel.classList.add('hidden');

  const paragraph = elements.emptyState.querySelector('p');
  if (paragraph) {
    paragraph.textContent = message;
  }
}

function showQuizPanel() {
  elements.emptyState.classList.add('hidden');
  elements.quizPanel.classList.remove('hidden');
}

function buildAndStartRound() {
  const candidates = buildQuizCandidateEntries(state.quizBuckets);
  const round = buildMatchingRound(candidates);
  if (!round) {
    showEmptyState(`Need ${PAIRS_PER_ROUND}+ words in New or Retry.`);
    return false;
  }

  state.round = round;
  state.roundIndex += 1;
  state.roundPersisted = false;
  state.matchedIds = new Set();
  state.roundOutcomeById = new Map();
  state.wrongSourceId = null;
  state.wrongTranslationId = null;
  clearSelections();
  clearWrongFeedbackTimer();
  elements.nextRoundButton.disabled = true;
  showQuizPanel();
  renderRound();
  return true;
}

function resetScoreState() {
  state.round = null;
  state.roundIndex = 0;
  state.roundPersisted = false;
  state.selectedSourceId = null;
  state.selectedTranslationId = null;
  state.wrongSourceId = null;
  state.wrongTranslationId = null;
  state.matchedIds = new Set();
  state.roundOutcomeById = new Map();
  state.correctMatches = 0;
  state.wrongMatches = 0;
  state.score = 0;
  state.progressPercent = 0;
  clearWrongFeedbackTimer();
}

async function refreshWordsAndStart() {
  elements.nextRoundButton.disabled = true;

  state.quizBuckets = await getQuizBucketsFromStorage();
  const started = buildAndStartRound();
  if (!started) {
    updateStats();
  }
}

function startNewRound() {
  const candidates = buildQuizCandidateEntries(state.quizBuckets);
  if (!Array.isArray(candidates) || candidates.length < MIN_PAIRS_PER_ROUND) {
    showEmptyState(`Need ${PAIRS_PER_ROUND}+ words in New or Retry.`);
    return;
  }

  buildAndStartRound();
}

function attachEventHandlers() {
  elements.sourceChoices.addEventListener('click', handleChoiceClick);
  elements.translationChoices.addEventListener('click', handleChoiceClick);
  elements.nextRoundButton.addEventListener('click', startNewRound);
  elements.startQuizButton?.addEventListener('click', closeFirstQuizModal);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' && event.key !== 'Enter') {
      return;
    }

    if (!elements.firstQuizModal || elements.firstQuizModal.classList.contains('hidden')) {
      return;
    }

    event.preventDefault();
    closeFirstQuizModal();
  });
}

export async function initQuizPage() {
  cacheElements();
  attachRevealAnimation();
  attachFloatingPlusField();
  attachBackgroundParallax();
  attachTextEntranceMotion();
  attachEventHandlers();
  resetScoreState();
  updateBucketStats();
  await refreshWordsAndStart();
  showFirstQuizModalIfNeeded();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    void initQuizPage();
  });
}
