const DEFAULT_DEBOUNCE_MS = 200;
const CAPTION_SEGMENT_SELECTOR = '.ytp-caption-segment, .captions-text .caption-visual-line span';

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

function createCaptionMutationHandler({
  getSettings,
  transformSubtitle,
  debounceMs = DEFAULT_DEBOUNCE_MS
}) {
  const pendingSegments = new Set();
  const lastProcessedByNode = new WeakMap();
  const lastRenderedByNode = new WeakMap();
  let timer = null;
  let isProcessing = false;
  let rerunRequested = false;

  async function processQueue() {
    if (isProcessing) {
      rerunRequested = true;
      return;
    }

    isProcessing = true;
    void window.log?.('Subtitle processing started');
    const { enabled, replacementPercentage } = await getSettings();

    if (!enabled) {
      void window.log?.('Skipped processing: immersion mode disabled');
      pendingSegments.clear();
      isProcessing = false;
      return;
    }

    const batch = Array.from(pendingSegments);
    pendingSegments.clear();

    for (const node of batch) {
      const originalText = node.textContent?.trim();
      if (!originalText) {
        void window.log?.('Skipped processing: no subtitles/empty subtitle text');
        continue;
      }

      const originalHash = hashText(originalText);
      if (lastProcessedByNode.get(node) === originalHash) {
        void window.log?.('Skipped processing: already processed subtitle node');
        continue;
      }

      if (lastRenderedByNode.get(node) === originalHash) {
        lastProcessedByNode.set(node, originalHash);
        void window.log?.('Skipped processing: self-rendered subtitle mutation');
        continue;
      }

      void window.log?.(`Processing subtitle: "${originalText}"`);
      const transformed = await transformSubtitle(originalText, replacementPercentage);
      const renderedSubtitle = transformed || originalText;

      if (renderedSubtitle !== originalText) {
        node.textContent = renderedSubtitle;
        lastRenderedByNode.set(node, hashText(renderedSubtitle));
        void window.log?.(`Subtitle updated in place: "${renderedSubtitle}"`);
      }

      lastProcessedByNode.set(node, hashText(node.textContent?.trim() || renderedSubtitle));
    }

    isProcessing = false;

    if (rerunRequested || pendingSegments.size > 0) {
      rerunRequested = false;
      schedule();
    }
  }

  function schedule() {
    if (isProcessing) {
      rerunRequested = true;
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    void window.log?.(`Debounce triggered (${debounceMs}ms)`);

    timer = setTimeout(() => {
      timer = null;
      void processQueue();
    }, debounceMs);
  }

  function handleMutations(mutations) {
    const segments = collectCaptionSegments(mutations);
    if (segments.size === 0) {
      return;
    }

    for (const segment of segments) {
      pendingSegments.add(segment);
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

  return {
    handleMutations,
    primeFromCurrentCaptions
  };
}

window.hashText = hashText;
window.createCaptionMutationHandler = createCaptionMutationHandler;
