const VOCABULARY_ENTRIES_KEY = 'vocabularyEntries';
export const RECENT_WINDOW_MS = 60 * 60 * 1000;
export const MIN_PAIRS_PER_ROUND = 2;
export const MAX_PAIRS_PER_ROUND = 6;
const WRONG_FLASH_MS = 340;
const SCORE_PER_CORRECT = 12;
const SCORE_PENALTY_PER_WRONG = 3;

const state = {
  recentEntries: [],
  round: null,
  roundIndex: 0,
  selectedSourceId: null,
  selectedTranslationId: null,
  wrongSourceId: null,
  wrongTranslationId: null,
  matchedIds: new Set(),
  correctMatches: 0,
  wrongMatches: 0,
  score: 0,
  wrongFlashTimer: null
};

const elements = {
  quizPanel: null,
  emptyState: null,
  sourceChoices: null,
  translationChoices: null,
  statusLine: null,
  progressLabel: null,
  progressFill: null,
  roundValue: null,
  pairValue: null,
  accuracyValue: null,
  scoreValue: null,
  nextRoundButton: null,
  refreshButton: null
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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
  const firstSeenAt = Number.isFinite(entry.firstSeenAt) ? entry.firstSeenAt : null;
  const lastSeenAt = Number.isFinite(entry.lastSeenAt) ? entry.lastSeenAt : null;

  if (!source || !translation || !sourceLanguage || !targetLanguage) {
    return null;
  }

  return {
    source,
    translation,
    sourceLanguage,
    targetLanguage,
    firstSeenAt,
    lastSeenAt
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

    const key = `${entry.source.toLowerCase()}|${entry.translation.toLowerCase()}|${entry.sourceLanguage}|${entry.targetLanguage}`;
    const existing = deduped.get(key);
    if (!existing || seenAt > (existing.lastSeenAt ?? existing.firstSeenAt ?? 0)) {
      deduped.set(key, {
        ...entry,
        firstSeenAt: entry.firstSeenAt ?? seenAt,
        lastSeenAt: seenAt
      });
    }
  }

  return Array.from(deduped.values()).sort((left, right) => right.lastSeenAt - left.lastSeenAt);
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

  const shuffled = shuffle(entries, random);
  const selectedPairs = [];
  const usedSource = new Set();
  const usedTranslation = new Set();

  for (const entry of shuffled) {
    const sourceKey = entry.source.toLowerCase();
    const translationKey = entry.translation.toLowerCase();
    if (usedSource.has(sourceKey) || usedTranslation.has(translationKey)) {
      continue;
    }

    const pairId = `${sourceKey}|${translationKey}|${selectedPairs.length}`;
    selectedPairs.push({
      id: pairId,
      source: entry.source,
      translation: entry.translation
    });
    usedSource.add(sourceKey);
    usedTranslation.add(translationKey);

    if (selectedPairs.length >= maxPairs) {
      break;
    }
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
  elements.progressLabel = document.getElementById('progressLabel');
  elements.progressFill = document.getElementById('progressFill');
  elements.roundValue = document.getElementById('roundValue');
  elements.pairValue = document.getElementById('pairValue');
  elements.accuracyValue = document.getElementById('accuracyValue');
  elements.scoreValue = document.getElementById('scoreValue');
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

async function getRecentVocabularyEntries() {
  const items = await getLocalStorage([VOCABULARY_ENTRIES_KEY]);
  const rawEntries = Array.isArray(items[VOCABULARY_ENTRIES_KEY]) ? items[VOCABULARY_ENTRIES_KEY] : [];
  return filterRecentEntries(rawEntries);
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
}

function buildChoiceButton({ kind, id, label, index }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.dataset.kind = kind;
  button.dataset.id = id;
  button.textContent = label;
  button.style.animationDelay = `${index * 34}ms`;

  const isMatched = state.matchedIds.has(id);
  const isSelected = kind === 'source' ? state.selectedSourceId === id : state.selectedTranslationId === id;
  const isWrong = kind === 'source' ? state.wrongSourceId === id : state.wrongTranslationId === id;

  if (isMatched) {
    button.classList.add('matched');
    button.disabled = true;
    return button;
  }

  if (isSelected) {
    button.classList.add('selected');
  }
  if (isWrong) {
    button.classList.add('wrong');
  }

  return button;
}

function renderChoices() {
  if (!state.round) {
    return;
  }

  elements.sourceChoices.textContent = '';
  elements.translationChoices.textContent = '';

  state.round.sourceOrder.forEach((id, index) => {
    const pair = state.round.pairById.get(id);
    if (!pair) {
      return;
    }
    elements.sourceChoices.appendChild(
      buildChoiceButton({ kind: 'source', id: pair.id, label: pair.source, index })
    );
  });

  state.round.translationOrder.forEach((id, index) => {
    const pair = state.round.pairById.get(id);
    if (!pair) {
      return;
    }
    elements.translationChoices.appendChild(
      buildChoiceButton({ kind: 'translation', id: pair.id, label: pair.translation, index })
    );
  });
}

function renderRound() {
  renderChoices();
  updateStats();
}

function clearSelections() {
  state.selectedSourceId = null;
  state.selectedTranslationId = null;
}

function onRoundCompleted() {
  elements.nextRoundButton.disabled = false;
  setStatus('Round complete. Start a new round to continue.', 'good');
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
    clearSelections();
    clearWrongFeedbackTimer();
    state.wrongSourceId = null;
    state.wrongTranslationId = null;
    setStatus('Correct match.', 'good');

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
  setStatus('Not a match. Try again.', 'warn');
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

  if (kind === 'source') {
    state.selectedSourceId = state.selectedSourceId === id ? null : id;
  } else if (kind === 'translation') {
    state.selectedTranslationId = state.selectedTranslationId === id ? null : id;
  }

  renderChoices();
  evaluateCurrentSelection();
}

function showEmptyState(message) {
  elements.emptyState.classList.remove('hidden');
  elements.quizPanel.classList.add('hidden');
  setStatus('', 'neutral');

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
  const round = buildMatchingRound(state.recentEntries);
  if (!round) {
    showEmptyState('You need at least 2 unique source/translation pairs from the last hour.');
    return false;
  }

  state.round = round;
  state.roundIndex += 1;
  state.matchedIds = new Set();
  state.wrongSourceId = null;
  state.wrongTranslationId = null;
  clearSelections();
  clearWrongFeedbackTimer();
  elements.nextRoundButton.disabled = true;
  showQuizPanel();
  setStatus('Match each source word with its translation.', 'neutral');
  renderRound();
  return true;
}

function resetScoreState() {
  state.round = null;
  state.roundIndex = 0;
  state.selectedSourceId = null;
  state.selectedTranslationId = null;
  state.wrongSourceId = null;
  state.wrongTranslationId = null;
  state.matchedIds = new Set();
  state.correctMatches = 0;
  state.wrongMatches = 0;
  state.score = 0;
  clearWrongFeedbackTimer();
}

async function refreshWordsAndStart() {
  elements.refreshButton.disabled = true;
  elements.nextRoundButton.disabled = true;
  setStatus('Loading recent vocabulary...', 'neutral');

  state.recentEntries = await getRecentVocabularyEntries();
  const started = buildAndStartRound();
  if (!started) {
    updateStats();
  }

  elements.refreshButton.disabled = false;
}

function startNewRound() {
  if (!Array.isArray(state.recentEntries) || state.recentEntries.length < MIN_PAIRS_PER_ROUND) {
    showEmptyState('You need at least 2 recent words. Click "Refresh Words" after watching more captions.');
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
  await refreshWordsAndStart();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    void initQuizPage();
  });
}
