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
      return;
    }

    isProcessing = true;
    const { enabled, replacementPercentage } = await getSettings();

    if (!enabled) {
      console.log('Immersion mode disabled. Skipping caption processing.');
      pendingSegments.clear();
      isProcessing = false;
      return;
    }

    const batch = Array.from(pendingSegments);
    pendingSegments.clear();

    for (const node of batch) {
      const originalText = node.textContent?.trim();
      if (!originalText) {
        continue;
      }

      console.log('Caption detected.', originalText);

      const originalHash = hashText(originalText);
      if (lastProcessedByNode.get(node) === originalHash) {
        continue;
      }

      if (lastProcessedCaptionHash === originalHash) {
        lastProcessedByNode.set(node, originalHash);
        continue;
      }

      console.log('Processing subtitle text.', originalText);
      const transformed = await transformSubtitle(originalText, replacementPercentage);
      if (transformed && transformed !== originalText) {
        node.textContent = transformed;
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
