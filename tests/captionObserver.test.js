import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function loadScript(path) {
  const source = fs.readFileSync(path, 'utf8');
  vm.runInThisContext(source, { filename: path });
}

function createCaptionNode(text) {
  return {
    nodeType: 1,
    textContent: text,
    matches: (selector) => selector === '.ytp-caption-segment',
    querySelectorAll: () => []
  };
}

function mutationForNode(node) {
  return [
    {
      type: 'childList',
      addedNodes: [node]
    }
  ];
}

describe('caption observer hardening', () => {
  globalThis.window = globalThis;
  loadScript('extension/captionObserver.js');

  it('prevents reprocessing for unchanged node text hash', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => text);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 200
    });

    const node = createCaptionNode('Hello world');

    handler.handleMutations(mutationForNode(node));
    await vi.advanceTimersByTimeAsync(210);

    handler.handleMutations(mutationForNode(node));
    await vi.advanceTimersByTimeAsync(210);

    expect(transformSubtitle).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('skips identical text re-rendered in a new node', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (x)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 200
    });

    handler.handleMutations(mutationForNode(createCaptionNode('Same subtitle')));
    await vi.advanceTimersByTimeAsync(210);

    handler.handleMutations(mutationForNode(createCaptionNode('Same subtitle')));
    await vi.advanceTimersByTimeAsync(210);

    expect(transformSubtitle).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('debounces rapid updates and avoids stacking overlapping runs', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (done)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 200
    });

    handler.handleMutations(mutationForNode(createCaptionNode('line one')));
    handler.handleMutations(mutationForNode(createCaptionNode('line two')));
    handler.handleMutations(mutationForNode(createCaptionNode('line three')));

    await vi.advanceTimersByTimeAsync(199);
    expect(transformSubtitle).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(2);
    expect(transformSubtitle).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
