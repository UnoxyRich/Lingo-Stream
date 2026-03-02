const DEFAULT_DEBOUNCE_MS = 40;
const CAPTION_SEGMENT_SELECTOR = '.ytp-caption-segment, .captions-text .caption-visual-line span';
const WORD_CAPTURE_PATTERN = /\p{L}[\p{L}\p{M}'-]*/gu;
const RECENT_TRANSFORM_TTL_MS = 10_000;
const MAX_RECENT_TRANSFORMS = 200;

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}

function isElementNode(node) {
  return Boolean(node) && node.nodeType === 1;
}

function isCaptionSegment(node) {
  return isElementNode(node) && typeof node.matches === 'function' && node.matches(CAPTION_SEGMENT_SELECTOR);
}

function findCaptionSegmentFromNode(node) {
  if (!node) {
    return null;
  }

  if (isCaptionSegment(node)) {
    return node;
  }

  const parentElement = node.parentElement || node.parentNode;
  if (!isElementNode(parentElement)) {
    return null;
  }

  if (isCaptionSegment(parentElement)) {
    return parentElement;
  }

  if (typeof parentElement.closest === 'function') {
    return parentElement.closest(CAPTION_SEGMENT_SELECTOR);
  }

  return null;
}

function collectCaptionSegments(mutations) {
  const segments = new Set();

  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      const segment = findCaptionSegmentFromNode(mutation.target);
      if (segment) {
        segments.add(segment);
      }
      continue;
    }

    if (mutation.type !== 'childList') {
      continue;
    }

    const targetSegment = findCaptionSegmentFromNode(mutation.target);
    if (targetSegment) {
      segments.add(targetSegment);
    }

    for (const addedNode of mutation.addedNodes) {
      const segmentFromNode = findCaptionSegmentFromNode(addedNode);
      if (segmentFromNode) {
        segments.add(segmentFromNode);
      }

      if (!isElementNode(addedNode)) {
        continue;
      }

      if (isCaptionSegment(addedNode)) {
        segments.add(addedNode);
      }

      if (typeof addedNode.querySelectorAll === 'function') {
        const nested = addedNode.querySelectorAll(CAPTION_SEGMENT_SELECTOR);
        for (const segment of nested) {
          segments.add(segment);
        }
      }
    }
  }

  return segments;
}

function collectCurrentCaptionSegments() {
  if (typeof document.querySelectorAll !== 'function') {
    return new Set();
  }

  return new Set(document.querySelectorAll(CAPTION_SEGMENT_SELECTOR));
}

function normalizeSubtitleText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPinnedTranslations(originalText, transformedText) {
  if (typeof originalText !== 'string' || typeof transformedText !== 'string') {
    return {};
  }

  const wordsByNormalized = new Map();
  for (const word of originalText.match(WORD_CAPTURE_PATTERN) ?? []) {
    const normalized = word.toLowerCase();
    if (!wordsByNormalized.has(normalized)) {
      wordsByNormalized.set(normalized, word);
    }
  }

  const pinned = {};
  for (const [normalized, originalWord] of wordsByNormalized.entries()) {
    const pattern = new RegExp(`${escapeRegExp(originalWord)} \\(([^)]+)\\)`, 'u');
    const matched = transformedText.match(pattern);
    const translated = matched?.[1]?.trim();
    if (translated) {
      pinned[normalized] = translated;
    }
  }

  return pinned;
}

function hashPinnedTranslations(pinnedTranslations) {
  if (!pinnedTranslations || typeof pinnedTranslations !== 'object') {
    return 'none';
  }

  const normalizedEntries = Object.entries(pinnedTranslations)
    .filter(([normalized, translated]) => typeof normalized === 'string' && typeof translated === 'string')
    .map(([normalized, translated]) => [normalized.toLowerCase(), translated.trim()])
    .filter(([normalized, translated]) => normalized.length > 0 && translated.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  if (normalizedEntries.length === 0) {
    return 'none';
  }

  const serialized = normalizedEntries
    .map(([normalized, translated]) => `${normalized}:${translated}`)
    .join('|');
  return hashText(serialized);
}

function normalizeReplacementPercentage(replacementPercentage) {
  if (!Number.isFinite(replacementPercentage)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(replacementPercentage)));
}

function buildRenderConfigKey(replacementPercentage) {
  return `replacement:${normalizeReplacementPercentage(replacementPercentage)}`;
}

function createCaptionMutationHandler({
  getSettings,
  transformSubtitle,
  debounceMs = DEFAULT_DEBOUNCE_MS
}) {
  const pendingSegments = new Set();
  const lastProcessedByNode = new WeakMap();
  const nodeRenderState = new WeakMap();
  const trackedSegments = new Set();
  const recentTransformsByKey = new Map();

  let activeRequestId = 0;
  let timer = null;
  let isProcessing = false;
  let rerunRequested = false;
  let lastKnownRenderConfigKey = null;

  function readSegmentText(segment) {
    if (!segment || typeof segment.textContent !== 'string') {
      return '';
    }

    return segment.textContent;
  }

  function forgetSegment(segment) {
    if (!segment) {
      return;
    }

    trackedSegments.delete(segment);
    lastProcessedByNode.delete(segment);
    nodeRenderState.delete(segment);
  }

  function pruneDisconnectedSegments() {
    for (const segment of Array.from(trackedSegments)) {
      if (!segment?.isConnected) {
        forgetSegment(segment);
      }
    }
  }

  function cleanupRecentTransforms(now = Date.now()) {
    for (const [cacheKey, entry] of Array.from(recentTransformsByKey.entries())) {
      if (now - entry.timestamp > RECENT_TRANSFORM_TTL_MS) {
        recentTransformsByKey.delete(cacheKey);
      }
    }

    while (recentTransformsByKey.size > MAX_RECENT_TRANSFORMS) {
      const oldestKey = recentTransformsByKey.keys().next().value;
      if (!oldestKey) {
        break;
      }
      recentTransformsByKey.delete(oldestKey);
    }
  }

  function getRecentTransform(cacheKey, now = Date.now()) {
    const entry = recentTransformsByKey.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (now - entry.timestamp > RECENT_TRANSFORM_TTL_MS) {
      recentTransformsByKey.delete(cacheKey);
      return null;
    }

    return entry.transformedText;
  }

  function setRecentTransform(cacheKey, transformedText, now = Date.now()) {
    recentTransformsByKey.set(cacheKey, {
      transformedText,
      timestamp: now
    });
    cleanupRecentTransforms(now);
  }

  function resolveOriginalText(segment) {
    const currentText = readSegmentText(segment);
    const state = nodeRenderState.get(segment);
    if (!state) {
      return currentText;
    }

    if (currentText === state.transformedText) {
      return state.originalText;
    }

    return currentText;
  }

  function isSegmentCurrentlyTransformed(segment, originalHash, renderConfigKey) {
    const state = nodeRenderState.get(segment);
    if (!state) {
      return false;
    }

    if (state.renderConfigKey !== renderConfigKey) {
      return false;
    }

    if (readSegmentText(segment) !== state.transformedText) {
      return false;
    }

    const stateOriginalHash = typeof state.originalHash === 'string'
      ? state.originalHash
      : hashText(normalizeSubtitleText(state.originalText || ''));
    return stateOriginalHash === originalHash;
  }

  function getPinnedTranslationsForSegment(segment) {
    const state = nodeRenderState.get(segment);
    if (!state || typeof state.pinnedTranslations !== 'object' || !state.pinnedTranslations) {
      return {};
    }

    return { ...state.pinnedTranslations };
  }

  function rememberRenderedState(
    segment,
    originalText,
    transformedText,
    pinnedTranslations = {},
    renderConfigKey
  ) {
    const normalizedOriginal = normalizeSubtitleText(originalText);
    const originalHash = hashText(normalizedOriginal);
    nodeRenderState.set(segment, {
      originalText,
      originalHash,
      transformedText,
      pinnedTranslations: { ...pinnedTranslations },
      renderConfigKey
    });
    trackedSegments.add(segment);
  }

  function wasSegmentProcessed(segment, originalHash, renderConfigKey) {
    const previous = lastProcessedByNode.get(segment);
    if (!previous || typeof previous !== 'object') {
      return false;
    }

    return previous.originalHash === originalHash && previous.renderConfigKey === renderConfigKey;
  }

  function markSegmentProcessed(segment, originalHash, renderConfigKey) {
    lastProcessedByNode.set(segment, {
      originalHash,
      renderConfigKey
    });
  }

  function restoreSegment(segment) {
    const state = nodeRenderState.get(segment);
    if (!state) {
      forgetSegment(segment);
      return;
    }

    if (readSegmentText(segment) === state.transformedText && state.originalText !== state.transformedText) {
      segment.textContent = state.originalText;
    }

    forgetSegment(segment);
  }

  function restoreAllSegments() {
    pruneDisconnectedSegments();

    for (const segment of Array.from(trackedSegments)) {
      restoreSegment(segment);
    }
  }

  function tryFastReapplyFromState(segment) {
    const state = nodeRenderState.get(segment);
    if (!state || typeof state.transformedText !== 'string') {
      return false;
    }

    if (lastKnownRenderConfigKey && state.renderConfigKey !== lastKnownRenderConfigKey) {
      return false;
    }

    const currentText = readSegmentText(segment);
    if (!currentText || currentText === state.transformedText) {
      return false;
    }

    const normalizedCurrent = normalizeSubtitleText(currentText);
    const normalizedOriginal = normalizeSubtitleText(state.originalText || '');
    if (!normalizedCurrent || normalizedCurrent !== normalizedOriginal) {
      return false;
    }

    segment.textContent = state.transformedText;
    const originalHash = typeof state.originalHash === 'string'
      ? state.originalHash
      : hashText(normalizedOriginal);
    markSegmentProcessed(segment, originalHash, state.renderConfigKey);
    return true;
  }

  async function getTransformedText(
    originalText,
    replacementPercentage,
    cacheKey,
    pinnedTranslations = {}
  ) {
    const now = Date.now();
    const cached = getRecentTransform(cacheKey, now);
    if (cached !== null) {
      return cached;
    }

    const transformed = await transformSubtitle(originalText, replacementPercentage, pinnedTranslations);
    const finalText = typeof transformed === 'string' && transformed.length > 0 ? transformed : originalText;
    setRecentTransform(cacheKey, finalText, now);
    return finalText;
  }

  async function processQueue() {
    if (isProcessing) {
      rerunRequested = true;
      return;
    }

    isProcessing = true;
    void window.log?.('Subtitle processing started');
    const settings = await getSettings();
    const enabled = settings?.enabled !== false;
    const replacementPercentage = normalizeReplacementPercentage(Number(settings?.replacementPercentage));
    const renderConfigKey = typeof settings?.renderConfigKey === 'string' && settings.renderConfigKey
      ? settings.renderConfigKey
      : buildRenderConfigKey(replacementPercentage);
    lastKnownRenderConfigKey = renderConfigKey;

    if (!enabled) {
      void window.log?.('Skipped processing: Lingo Stream disabled');
      pendingSegments.clear();
      restoreAllSegments();
      isProcessing = false;
      return;
    }

    pruneDisconnectedSegments();
    cleanupRecentTransforms();

    const batch = Array.from(pendingSegments);
    pendingSegments.clear();

    if (batch.length === 0) {
      isProcessing = false;
      return;
    }

    const jobs = [];

    for (const segment of batch) {
      if (!segment || !segment.isConnected) {
        forgetSegment(segment);
        continue;
      }

      const originalText = resolveOriginalText(segment);
      const normalizedOriginal = normalizeSubtitleText(originalText);
      if (!normalizedOriginal) {
        restoreSegment(segment);
        continue;
      }

      const originalHash = hashText(normalizedOriginal);
      if (
        wasSegmentProcessed(segment, originalHash, renderConfigKey) &&
        isSegmentCurrentlyTransformed(segment, originalHash, renderConfigKey)
      ) {
        continue;
      }

      const renderedState = nodeRenderState.get(segment);
      if (
        renderedState &&
        renderedState.renderConfigKey === renderConfigKey &&
        (
          renderedState.originalHash === originalHash ||
          hashText(normalizeSubtitleText(renderedState.originalText || '')) === originalHash
        )
      ) {
        if (readSegmentText(segment) !== renderedState.transformedText) {
          segment.textContent = renderedState.transformedText;
        }

        markSegmentProcessed(segment, originalHash, renderConfigKey);
        continue;
      }

      const pinnedTranslations = getPinnedTranslationsForSegment(segment);
      const pinnedHash = hashPinnedTranslations(pinnedTranslations);
      const transformKey = `${originalHash}:${renderConfigKey}:${pinnedHash}`;

      const cachedTransformedText = getRecentTransform(transformKey);
      if (cachedTransformedText !== null) {
        if (readSegmentText(segment) !== cachedTransformedText) {
          segment.textContent = cachedTransformedText;
        }

        const cachedPinnedTranslations = extractPinnedTranslations(originalText, cachedTransformedText);
        rememberRenderedState(
          segment,
          originalText,
          cachedTransformedText,
          cachedPinnedTranslations,
          renderConfigKey
        );
        markSegmentProcessed(segment, originalHash, renderConfigKey);
        continue;
      }

      jobs.push({
        segment,
        originalText,
        originalHash,
        pinnedTranslations,
        transformKey
      });
    }

    if (jobs.length === 0) {
      isProcessing = false;
      if (rerunRequested || pendingSegments.size > 0) {
        rerunRequested = false;
        schedule(0);
      }
      return;
    }

    const requestId = ++activeRequestId;
    const promisesByHash = new Map();

    for (const job of jobs) {
      const existingPromise = promisesByHash.get(job.transformKey);
      if (existingPromise) {
        job.promise = existingPromise;
        continue;
      }

      const promise = getTransformedText(
        job.originalText,
        replacementPercentage,
        job.transformKey,
        job.pinnedTranslations
      )
        .catch((error) => {
          console.error('Failed to transform subtitle segment.', error);
          return job.originalText;
        });

      promisesByHash.set(job.transformKey, promise);
      job.promise = promise;
    }

    const transformedResults = await Promise.all(jobs.map((job) => job.promise));

    if (requestId !== activeRequestId) {
      isProcessing = false;
      if (rerunRequested || pendingSegments.size > 0) {
        rerunRequested = false;
        schedule(0);
      }
      return;
    }

    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      const segment = job.segment;
      if (!segment || !segment.isConnected) {
        forgetSegment(segment);
        continue;
      }

      const latestOriginalText = resolveOriginalText(segment);
      const latestOriginalHash = hashText(normalizeSubtitleText(latestOriginalText));
      if (!normalizeSubtitleText(latestOriginalText)) {
        restoreSegment(segment);
        continue;
      }

      if (latestOriginalHash !== job.originalHash) {
        pendingSegments.add(segment);
        continue;
      }

      const transformedText = typeof transformedResults[index] === 'string' && transformedResults[index].length > 0
        ? transformedResults[index]
        : job.originalText;

      if (readSegmentText(segment) !== transformedText) {
        segment.textContent = transformedText;
      }

      const pinnedTranslations = extractPinnedTranslations(latestOriginalText, transformedText);
      rememberRenderedState(
        segment,
        latestOriginalText,
        transformedText,
        pinnedTranslations,
        renderConfigKey
      );
      markSegmentProcessed(segment, job.originalHash, renderConfigKey);
    }

    isProcessing = false;

    if (rerunRequested || pendingSegments.size > 0) {
      rerunRequested = false;
      schedule(0);
    }
  }

  function schedule(delay = debounceMs) {
    if (isProcessing) {
      rerunRequested = true;
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    const delayMs = Math.max(0, Number(delay) || 0);
    void window.log?.(`Debounce triggered (${delayMs}ms)`);

    timer = setTimeout(() => {
      timer = null;
      void processQueue();
    }, delayMs);
  }

  function handleMutations(mutations) {
    const segments = collectCaptionSegments(mutations);
    if (segments.size === 0) {
      return;
    }

    let queuedCount = 0;
    for (const segment of segments) {
      if (tryFastReapplyFromState(segment)) {
        continue;
      }

      pendingSegments.add(segment);
      queuedCount += 1;
    }

    if (queuedCount === 0) {
      return;
    }

    schedule();
  }

  function primeFromCurrentCaptions() {
    const segments = collectCurrentCaptionSegments();
    if (segments.size === 0) {
      return;
    }

    for (const segment of segments) {
      pendingSegments.add(segment);
    }

    schedule();
  }

  function flushNow() {
    schedule(0);
  }

  return {
    handleMutations,
    primeFromCurrentCaptions,
    flushNow
  };
}

window.hashText = hashText;
window.createCaptionMutationHandler = createCaptionMutationHandler;
