import { buildImmersiveSubtitle } from './processor.js';
import { translateWord } from './translation.js';

const PROCESSED_FLAG = 'immersionProcessed';
const DEFAULT_REPLACEMENT_PERCENTAGE = 5;

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['enabled', 'replacementPercentage'], (items) => {
      resolve({
        enabled: items.enabled ?? true,
        replacementPercentage: items.replacementPercentage ?? DEFAULT_REPLACEMENT_PERCENTAGE
      });
    });
  });
}

async function processCaptionNode(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (node.dataset[PROCESSED_FLAG] === 'true') {
    return;
  }

  const originalText = node.textContent?.trim();
  if (!originalText) {
    return;
  }

  node.dataset[PROCESSED_FLAG] = 'true';

  const { enabled, replacementPercentage } = await getSettings();
  if (!enabled) {
    return;
  }

  const updatedText = await buildImmersiveSubtitle(
    originalText,
    translateWord,
    replacementPercentage
  );

  if (updatedText && updatedText !== originalText) {
    node.textContent = updatedText;
  }
}

async function processMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const addedNode of mutation.addedNodes) {
        if (!(addedNode instanceof HTMLElement)) {
          continue;
        }

        if (addedNode.matches('.ytp-caption-segment')) {
          await processCaptionNode(addedNode);
        }

        const nestedSegments = addedNode.querySelectorAll('.ytp-caption-segment');
        for (const segment of nestedSegments) {
          await processCaptionNode(segment);
        }
      }
    }
  }
}

const observer = new MutationObserver((mutations) => {
  processMutations(mutations);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
