import { describe, expect, it, vi } from 'vitest';

globalThis.window = globalThis;
await import('../extension/captionObserver.js');

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

  it('skips processing when immersion mode is disabled', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (x)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: false, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 200
    });

    handler.handleMutations(mutationForNode(createCaptionNode('Disabled subtitle')));
    await vi.advanceTimersByTimeAsync(210);

    expect(transformSubtitle).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });

  it('ignores mutations without caption segments', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => text);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 200
    });

    handler.handleMutations([{ type: 'attributes', addedNodes: [] }]);
    await vi.advanceTimersByTimeAsync(210);

    expect(transformSubtitle).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });


  it('skips empty subtitle text nodes', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (done)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 200
    });

    handler.handleMutations(mutationForNode(createCaptionNode('   ')));
    await vi.advanceTimersByTimeAsync(210);

    expect(transformSubtitle).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });


  it('requests a rerun when new mutations arrive during active processing', async () => {
    vi.useFakeTimers();

    let resolveFirst;
    const firstPending = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let callCount = 0;
    const transformSubtitle = vi.fn(async (text) => {
      callCount += 1;
      if (callCount === 1) {
        return firstPending;
      }

      return `${text} (rerun)`;
    });

    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    handler.handleMutations(mutationForNode(createCaptionNode('first line')));
    await vi.advanceTimersByTimeAsync(2);

    handler.handleMutations(mutationForNode(createCaptionNode('second line')));
    await vi.advanceTimersByTimeAsync(2);

    resolveFirst('first line (done)');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });


  it('ignores non-element nodes in mutation records', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => text);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    handler.handleMutations([{ type: 'childList', addedNodes: [{ nodeType: 3 }] }]);
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });

  it('processes nested caption segments discovered by querySelectorAll', async () => {
    vi.useFakeTimers();

    const nestedSegment = createCaptionNode('nested line');
    const wrapperNode = {
      nodeType: 1,
      textContent: '',
      matches: () => false,
      querySelectorAll: () => [nestedSegment]
    };

    const transformSubtitle = vi.fn(async (text) => `${text} (ok)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    handler.handleMutations([{ type: 'childList', addedNodes: [wrapperNode] }]);
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(1);
    expect(nestedSegment.textContent).toContain('(ok)');
    vi.useRealTimers();
  });

});
