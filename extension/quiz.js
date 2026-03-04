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
  wrongFlashTimer: null,
  roundPersisted: false
};

const elements = {
  quizPanel: null,
  emptyState: null,
  sourceChoices: null,
  translationChoices: null,
  statusLine: null,
  instructionLine: null,
  progressLabel: null,
  progressFill: null,
  selectedSourceValue: null,
  selectedTranslationValue: null,
  roundValue: null,
  pairValue: null,
  accuracyValue: null,
  scoreValue: null,
  notQuizzedValue: null,
  answeredCorrectValue: null,
  answeredIncorrectValue: null,
  nextRoundButton: null,
  refreshButton: null
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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
  elements.statusLine = document.getElementById('statusLine');
  elements.instructionLine = document.getElementById('instructionLine');
  elements.progressLabel = document.getElementById('progressLabel');
  elements.progressFill = document.getElementById('progressFill');
  elements.selectedSourceValue = document.getElementById('selectedSourceValue');
  elements.selectedTranslationValue = document.getElementById('selectedTranslationValue');
  elements.roundValue = document.getElementById('roundValue');
  elements.pairValue = document.getElementById('pairValue');
  elements.accuracyValue = document.getElementById('accuracyValue');
  elements.scoreValue = document.getElementById('scoreValue');
  elements.notQuizzedValue = document.getElementById('notQuizzedValue');
  elements.answeredCorrectValue = document.getElementById('answeredCorrectValue');
  elements.answeredIncorrectValue = document.getElementById('answeredIncorrectValue');
  elements.nextRoundButton = document.getElementById('nextRoundButton');
  elements.refreshButton = document.getElementById('refreshButton');
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

function setStatus(message, tone = 'neutral') {
  if (!elements.statusLine) {
    return;
  }

  elements.statusLine.textContent = message;
  elements.statusLine.classList.remove('good', 'warn');
  if (tone === 'good') {
    elements.statusLine.classList.add('good');
  } else if (tone === 'warn') {
    elements.statusLine.classList.add('warn');
  }
}

function updateBucketStats() {
  if (elements.notQuizzedValue) {
    elements.notQuizzedValue.textContent = String(state.quizBuckets.notQuizzed.length);
  }
  if (elements.answeredCorrectValue) {
    elements.answeredCorrectValue.textContent = String(state.quizBuckets.correct.length);
  }
  if (elements.answeredIncorrectValue) {
    elements.answeredIncorrectValue.textContent = String(state.quizBuckets.incorrect.length);
  }
}

function updateStats() {
  const totalPairs = state.round?.pairs.length ?? 0;
  const matched = state.matchedIds.size;
  const attempts = state.correctMatches + state.wrongMatches;
  const accuracy = attempts > 0 ? Math.round((state.correctMatches / attempts) * 100) : 100;
  const progressPercent = totalPairs > 0 ? Math.round((matched / totalPairs) * 100) : 0;

  elements.roundValue.textContent = String(Math.max(1, state.roundIndex));
  elements.pairValue.textContent = `${matched}/${totalPairs}`;
  elements.accuracyValue.textContent = `${accuracy}%`;
  elements.scoreValue.textContent = String(state.score);
  elements.progressLabel.textContent = `Matched ${matched} of ${totalPairs} pairs`;
  elements.progressFill.style.width = `${progressPercent}%`;
  updateBucketStats();
}

function updateInstructionLine() {
  if (!elements.instructionLine) {
    return;
  }

  const totalPairs = state.round?.pairs.length ?? 0;
  const matched = state.matchedIds.size;
  if (!state.round || totalPairs === 0) {
    elements.instructionLine.textContent = '';
    return;
  }

  if (matched >= totalPairs) {
    elements.instructionLine.textContent = 'Round complete. Tap "Next 5 Words" to continue.';
    return;
  }

  if (!state.selectedSourceId && !state.selectedTranslationId) {
    elements.instructionLine.textContent = 'Step 1: Choose a source word.';
    return;
  }

  if (state.selectedSourceId && !state.selectedTranslationId) {
    elements.instructionLine.textContent = 'Step 2: Choose the matching translation.';
    return;
  }

  if (!state.selectedSourceId && state.selectedTranslationId) {
    elements.instructionLine.textContent = 'Step 1: Choose a source word first.';
    return;
  }

  elements.instructionLine.textContent = 'Checking your match...';
}

function updateSelectionPreview() {
  const sourceLabel = state.round?.pairById.get(state.selectedSourceId)?.source ?? '-';
  const translationLabel = state.round?.pairById.get(state.selectedTranslationId)?.translation ?? '-';

  if (elements.selectedSourceValue) {
    elements.selectedSourceValue.textContent = `Source: ${sourceLabel}`;
  }

  if (elements.selectedTranslationValue) {
    elements.selectedTranslationValue.textContent = `Translation: ${translationLabel}`;
  }
}

function updateChoiceButtonState(button, kind, id) {
  const isMatched = state.matchedIds.has(id);
  const isSelected = kind === 'source' ? state.selectedSourceId === id : state.selectedTranslationId === id;
  const isWrong = kind === 'source' ? state.wrongSourceId === id : state.wrongTranslationId === id;

  button.classList.toggle('matched', isMatched);
  button.classList.toggle('selected', !isMatched && isSelected);
  button.classList.toggle('wrong', !isMatched && isWrong);
  button.disabled = isMatched;
}

function buildChoiceButton({ kind, id, label, index }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.dataset.kind = kind;
  button.dataset.id = id;
  button.textContent = label;
  button.style.animationDelay = `${index * 34}ms`;
  button.classList.add('choice-enter');
  button.addEventListener('animationend', () => {
    button.classList.remove('choice-enter');
  }, { once: true });

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
      existingButton.textContent = label;
      existingButton.style.animationDelay = `${index * 34}ms`;
      updateChoiceButtonState(existingButton, kind, pair.id);
      nextButtons.push(existingButton);
      existingButtonsById.delete(pair.id);
      return;
    }

    nextButtons.push(buildChoiceButton({ kind, id: pair.id, label, index }));
  });

  for (const staleButton of existingButtonsById.values()) {
    staleButton.remove();
  }

  for (const button of nextButtons) {
    container.appendChild(button);
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
  updateInstructionLine();
  updateSelectionPreview();
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
  setStatus(`Great run. You matched all ${PAIRS_PER_ROUND} words.`, 'good');
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

    const matchedCount = state.matchedIds.size;
    clearSelections();
    clearWrongFeedbackTimer();
    state.wrongSourceId = null;
    state.wrongTranslationId = null;
    setStatus(`Correct. ${matchedCount}/${state.round.pairs.length} matched.`, 'good');

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
  setStatus('Not a match. Keep the source word selected and try another translation.', 'warn');
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
      setStatus('Pick a source word first, then choose its translation.', 'warn');
      updateInstructionLine();
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
  setStatus('', 'neutral');
  if (elements.instructionLine) {
    elements.instructionLine.textContent = '';
  }
  if (elements.selectedSourceValue) {
    elements.selectedSourceValue.textContent = 'Source: -';
  }
  if (elements.selectedTranslationValue) {
    elements.selectedTranslationValue.textContent = 'Translation: -';
  }

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
    showEmptyState(`You need at least ${PAIRS_PER_ROUND} words from Not Quizzed or Answered Incorrectly.`);
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
  setStatus('Match all 5 words. Source first, translation second.', 'neutral');
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
  clearWrongFeedbackTimer();
}

async function refreshWordsAndStart() {
  elements.refreshButton.disabled = true;
  elements.nextRoundButton.disabled = true;
  setStatus('Loading stored quiz words...', 'neutral');

  state.quizBuckets = await getQuizBucketsFromStorage();
  const started = buildAndStartRound();
  if (!started) {
    updateStats();
  }

  elements.refreshButton.disabled = false;
}

function startNewRound() {
  const candidates = buildQuizCandidateEntries(state.quizBuckets);
  if (!Array.isArray(candidates) || candidates.length < MIN_PAIRS_PER_ROUND) {
    showEmptyState(`You need at least ${PAIRS_PER_ROUND} words in Not Quizzed or Answered Incorrectly.`);
    return;
  }

  buildAndStartRound();
}

function attachEventHandlers() {
  elements.sourceChoices.addEventListener('click', handleChoiceClick);
  elements.translationChoices.addEventListener('click', handleChoiceClick);
  elements.nextRoundButton.addEventListener('click', startNewRound);
  elements.refreshButton.addEventListener('click', () => {
    resetScoreState();
    void refreshWordsAndStart();
  });
}

export async function initQuizPage() {
  cacheElements();
  attachRevealAnimation();
  attachFloatingPlusField();
  attachBackgroundParallax();
  attachEventHandlers();
  resetScoreState();
  updateBucketStats();
  await refreshWordsAndStart();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    void initQuizPage();
  });
}
