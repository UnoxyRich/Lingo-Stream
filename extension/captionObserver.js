const DEFAULT_DEBOUNCE_MS = 200;
const OVERLAY_CONTAINER_ID = 'immersion-caption-overlay';
const OVERLAY_STYLE_ID = 'immersion-caption-overlay-style';

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
  return isElementNode(node) && typeof node.matches === 'function' && node.matches('.ytp-caption-segment');
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
    return parentElement.closest('.ytp-caption-segment');
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
        const nested = addedNode.querySelectorAll('.ytp-caption-segment');
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

  return new Set(document.querySelectorAll('.ytp-caption-segment'));
}

function createCaptionMutationHandler({
  getSettings,
  transformSubtitle,
  debounceMs = DEFAULT_DEBOUNCE_MS
}) {
  const pendingSegments = new Set();
  const lastProcessedByNode = new WeakMap();
  let timer = null;
  let isProcessing = false;
  let rerunRequested = false;
  let lastProcessedCaptionHash = null;
  let lastRenderedOverlayText = '';

  function ensureOverlayStyle() {
    if (document.getElementById(OVERLAY_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = OVERLAY_STYLE_ID;
    style.textContent = `
      .ytp-caption-window-container {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      #${OVERLAY_CONTAINER_ID} {
        position: absolute;
        left: 50%;
        bottom: 8%;
        transform: translateX(-50%);
        width: min(90%, 960px);
        color: #fff;
        text-align: center;
        font-size: clamp(20px, 2.8vw, 34px);
        line-height: 1.35;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000,
          0 0 8px rgba(0, 0, 0, 0.8);
        z-index: 60;
        pointer-events: none;
        font-family: "YouTube Noto", Roboto, Arial, Helvetica, sans-serif;
        white-space: pre-wrap;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureOverlayNode() {
    ensureOverlayStyle();

    const existing = document.getElementById(OVERLAY_CONTAINER_ID);
    if (existing) {
      return existing;
    }

    const player = document.querySelector('.html5-video-player') || document.body;
    if (!player) {
      return null;
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_CONTAINER_ID;
    player.appendChild(overlay);
    return overlay;
  }

  function renderOverlay(text) {
    const overlay = ensureOverlayNode();
    if (!overlay) {
      return;
    }

    if (text === lastRenderedOverlayText) {
      return;
    }

    overlay.innerText = text;
    lastRenderedOverlayText = text;
  }

  async function processQueue() {
    if (isProcessing) {
      rerunRequested = true;
      void window.log?.('Processing already running; rerun requested');
      return;
    }

    isProcessing = true;
    void window.log?.('Subtitle processing started');
    const { enabled, replacementPercentage } = await getSettings();

    if (!enabled) {
      console.log('Immersion mode disabled. Skipping caption processing.');
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

      console.log('Caption detected.', originalText);
      void window.log?.(`Subtitle node detected: "${originalText}"`);

      const originalHash = hashText(originalText);
      if (lastProcessedByNode.get(node) === originalHash) {
        void window.log?.('Skipped processing: already processed subtitle node');
        continue;
      }

      if (lastProcessedCaptionHash === originalHash) {
        lastProcessedByNode.set(node, originalHash);
        void window.log?.('Skipped processing: duplicate subtitle hash');
        continue;
      }

      console.log('Processing subtitle text.', originalText);
      void window.log?.(`Processing subtitle: "${originalText}"`);
      const transformed = await transformSubtitle(originalText, replacementPercentage);
      const renderedSubtitle = transformed || originalText;
      renderOverlay(renderedSubtitle);
      void window.log?.(`Overlay subtitle updated: "${renderedSubtitle}"`);

      lastProcessedByNode.set(node, originalHash);
      lastProcessedCaptionHash = originalHash;
    }

    isProcessing = false;

    if (rerunRequested || pendingSegments.size > 0) {
      rerunRequested = false;
      schedule();
    }
  }

  function schedule() {
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
