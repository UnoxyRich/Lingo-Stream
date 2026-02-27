const DEFAULT_REPLACEMENT_PERCENTAGE = 5;

console.log('YouTube Immersion Mode loaded');
void window.log?.('content.js loaded');

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['enabled', 'replacementPercentage'], (items) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to read content settings from storage.', chrome.runtime.lastError);
        resolve({
          enabled: true,
          replacementPercentage: DEFAULT_REPLACEMENT_PERCENTAGE
        });
        return;
      }

      const resolved = {
        enabled: items.enabled ?? true,
        replacementPercentage: items.replacementPercentage ?? DEFAULT_REPLACEMENT_PERCENTAGE
      };

      console.log('Content settings loaded.', resolved);
      void window.log?.(`Content settings loaded: enabled=${resolved.enabled}, replacement=${resolved.replacementPercentage}`);
      resolve(resolved);
    });
  });
}

const handler = window.createCaptionMutationHandler({
  getSettings,
  transformSubtitle: (subtitleText, replacementPercentage) =>
    window.buildImmersiveSubtitle(subtitleText, window.translateWords, replacementPercentage),
  debounceMs: 200
});

const observer = new MutationObserver((mutations) => {
  handler.handleMutations(mutations);
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  });
  console.log('YouTube Immersion Mode observer attached to document.body');
  handler.primeFromCurrentCaptions();
} else {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
      console.log('YouTube Immersion Mode observer attached after DOMContentLoaded');
      void window.log?.('MutationObserver attached after DOMContentLoaded');
      handler.primeFromCurrentCaptions();
    },
    { once: true }
  );
}

if (document.body) {
  void window.log?.('MutationObserver attached to document.body');
}
