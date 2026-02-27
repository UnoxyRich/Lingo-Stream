import { log } from './logger.js';

const DEFAULT_DEBOUNCE_MS = 200;

export function hashText(text) {
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

function collectCaptionSegments(mutations) {
  const segments = new Set();

  for (const mutation of mutations) {
    if (mutation.type !== 'childList') {
      continue;
    }

    for (const addedNode of mutation.addedNodes) {
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

export function createCaptionMutationHandler({
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

  async function processQueue() {
    if (isProcessing) {
      rerunRequested = true;
      void log('Processing already running; rerun requested');
      return;
    }

    isProcessing = true;
    void log('Subtitle processing started');
    const { enabled, replacementPercentage } = await getSettings();

    if (!enabled) {
      console.log('Immersion mode disabled. Skipping caption processing.');
      void log('Skipped processing: immersion mode disabled');
      pendingSegments.clear();
      isProcessing = false;
      return;
    }

    const batch = Array.from(pendingSegments);
    pendingSegments.clear();

    for (const node of batch) {
      const originalText = node.textContent?.trim();
      if (!originalText) {
        void log('Skipped processing: no subtitles/empty subtitle text');
        continue;
      }

      console.log('Caption detected.', originalText);
      void log(`Subtitle node detected: "${originalText}"`);

      const originalHash = hashText(originalText);
      if (lastProcessedByNode.get(node) === originalHash) {
        void log('Skipped processing: already processed subtitle node');
        continue;
      }

      if (lastProcessedCaptionHash === originalHash) {
        lastProcessedByNode.set(node, originalHash);
        void log('Skipped processing: duplicate subtitle hash');
        continue;
      }

      console.log('Processing subtitle text.', originalText);
      void log(`Processing subtitle: "${originalText}"`);
      const transformed = await transformSubtitle(originalText, replacementPercentage);
      if (transformed && transformed !== originalText) {
        node.textContent = transformed;
        void log(`Subtitle updated: "${transformed}"`);
      }

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

    void log(`Debounce triggered (${debounceMs}ms)`);

    timer = setTimeout(() => {
      timer = null;
      void processQueue();
    }, debounceMs);
  }

  function handleMutations(mutations) {
    const segments = collectCaptionSegments(mutations);
    if (segments.size === 0) {
      void log('Skipped processing: no subtitle nodes detected in mutation batch');
      return;
    }

    console.log(`Caption observer found ${segments.size} segment(s).`);

    for (const segment of segments) {
      pendingSegments.add(segment);
    }

    schedule();
  }

  return {
    handleMutations,
    _internal: {
      getPendingCount: () => pendingSegments.size
    }
  };
}
