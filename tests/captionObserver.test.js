import { describe, expect, it, vi } from 'vitest';

function createMockElement(tagName) {
  return {
    tagName,
    id: '',
    nodeType: 1,
    textContent: '',
    innerText: '',
    children: [],
    isConnected: true,
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  };
}

function createMockDocument() {
  const elementsById = new Map();

  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      if (node.id) {
        elementsById.set(node.id, node);
      }
      return node;
    }
  };

  const body = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      if (node.id) {
        elementsById.set(node.id, node);
      }
      return node;
    }
  };

  return {
    head,
    body,
    querySelectorAll(selector) {
      if (selector.includes('.ytp-caption-segment')) {
        return [];
      }
      return [];
    },
    createElement(tagName) {
      return createMockElement(tagName);
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelector() {
      return null;
    }
  };
}

globalThis.window = globalThis;
globalThis.document = createMockDocument();
await import('../extension/captionObserver.js');

function createCaptionNode(text) {
  return {
    nodeType: 1,
    textContent: text,
    isConnected: true,
    matches: (selector) => selector.includes('.ytp-caption-segment'),
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

  it('reuses transformed text when identical text re-renders in a new node', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (x)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 200
    });

    const first = createCaptionNode('Same subtitle');
    handler.handleMutations(mutationForNode(first));
    await vi.advanceTimersByTimeAsync(210);

    const second = createCaptionNode('Same subtitle');
    handler.handleMutations(mutationForNode(second));
    await vi.advanceTimersByTimeAsync(210);

    expect(first.textContent).toBe('Same subtitle (x)');
    expect(second.textContent).toBe('Same subtitle (x)');
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

  it('skips processing when Lingo Stream is disabled and restores original text', async () => {
    vi.useFakeTimers();

    let enabled = true;
    const transformSubtitle = vi.fn(async (text) => `${text} (x)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    const node = createCaptionNode('Disabled subtitle');

    handler.handleMutations(mutationForNode(node));
    await vi.advanceTimersByTimeAsync(2);
    expect(node.textContent).toBe('Disabled subtitle (x)');

    enabled = false;
    handler.handleMutations(mutationForNode(node));
    await vi.advanceTimersByTimeAsync(2);

    expect(node.textContent).toBe('Disabled subtitle');
    expect(transformSubtitle).toHaveBeenCalledTimes(1);
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

  it('processes childList mutations when the caption segment is the mutation target', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (line) => `${line} (target)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    const subtitleNode = createCaptionNode('target line');
    handler.handleMutations([{ type: 'childList', target: subtitleNode, addedNodes: [] }]);
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(1);
    expect(transformSubtitle).toHaveBeenCalledWith('target line', 5, expect.any(Object));

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
    expect(nestedSegment.textContent).toBe('nested line (ok)');
    vi.useRealTimers();
  });

  it('renders transformed subtitle directly in native caption segments', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (native)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    const subtitleNode = createCaptionNode('native line');
    handler.handleMutations(mutationForNode(subtitleNode));
    await vi.advanceTimersByTimeAsync(2);

    expect(subtitleNode.textContent).toBe('native line (native)');
    expect(document.getElementById('immersion-caption-overlay')).toBeNull();

    vi.useRealTimers();
  });

  it('reapplies translation immediately when YouTube rewrites the same subtitle back to original text', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (stable)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    const subtitleNode = createCaptionNode('same line');
    handler.handleMutations(mutationForNode(subtitleNode));
    await vi.advanceTimersByTimeAsync(2);
    expect(subtitleNode.textContent).toBe('same line (stable)');

    // Simulate YouTube rewriting the DOM back to original text for the same cue.
    subtitleNode.textContent = 'same line';
    handler.handleMutations(mutationForNode(subtitleNode));
    await vi.advanceTimersByTimeAsync(2);

    expect(subtitleNode.textContent).toBe('same line (stable)');
    expect(transformSubtitle).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('reapplies known transformed text synchronously before debounce delay', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (fast)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 500
    });

    const subtitleNode = createCaptionNode('quick line');
    handler.handleMutations(mutationForNode(subtitleNode));
    await vi.advanceTimersByTimeAsync(510);
    expect(subtitleNode.textContent).toBe('quick line (fast)');

    subtitleNode.textContent = 'quick line';
    handler.handleMutations(mutationForNode(subtitleNode));

    expect(subtitleNode.textContent).toBe('quick line (fast)');
    expect(transformSubtitle).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('passes pinned translations across progressive updates for the same segment', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text, _replacementPercentage, pinnedTranslations) => {
      if (text === 'I enjoy coding') {
        return 'I enjoy (gusto) coding';
      }

      if (text === 'I enjoy coding daily') {
        expect(pinnedTranslations).toMatchObject({ enjoy: 'gusto' });
        return 'I enjoy (gusto) coding daily';
      }

      return text;
    });

    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 50 }),
      transformSubtitle,
      debounceMs: 1
    });

    const subtitleNode = createCaptionNode('I enjoy coding');
    handler.handleMutations(mutationForNode(subtitleNode));
    await vi.advanceTimersByTimeAsync(2);
    expect(subtitleNode.textContent).toBe('I enjoy (gusto) coding');

    subtitleNode.textContent = 'I enjoy coding daily';
    handler.handleMutations(mutationForNode(subtitleNode));
    await vi.advanceTimersByTimeAsync(2);

    expect(subtitleNode.textContent).toBe('I enjoy (gusto) coding daily');
    expect(transformSubtitle).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('processes characterData mutations inside caption segments', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (characterData)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    const subtitleNode = createCaptionNode('char data line');
    const textNode = {
      nodeType: 3,
      parentElement: subtitleNode
    };

    handler.handleMutations([{ type: 'characterData', target: textNode }]);
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(1);
    expect(transformSubtitle).toHaveBeenCalledWith('char data line', 5, expect.any(Object));

    vi.useRealTimers();
  });

  it('primes processing from existing caption segments', async () => {
    vi.useFakeTimers();

    const existingCaption = createCaptionNode('existing subtitle');
    document.querySelectorAll = (selector) => (selector.includes('.ytp-caption-segment') ? [existingCaption] : []);

    const transformSubtitle = vi.fn(async (text) => `${text} (primed)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    handler.primeFromCurrentCaptions();
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(1);
    expect(transformSubtitle).toHaveBeenCalledWith('existing subtitle', 5, expect.any(Object));

    vi.useRealTimers();
  });

  it('handles empty priming and explicit flush without caption nodes', async () => {
    vi.useFakeTimers();

    document.querySelectorAll = () => [];

    const transformSubtitle = vi.fn(async (text) => text);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    handler.primeFromCurrentCaptions();
    handler.flushNow();
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });
});
