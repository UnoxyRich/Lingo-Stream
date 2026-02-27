import { describe, expect, it, vi } from 'vitest';

function createMockElement(tagName) {
  return {
    tagName,
    id: '',
    textContent: '',
    innerText: '',
    children: [],
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

  const player = {
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
    player,
    querySelectorAll(selector) {
      if (selector === '.ytp-caption-segment') {
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
    querySelector(selector) {
      if (selector === '.html5-video-player') {
        return player;
      }
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
    expect(nestedSegment.textContent).toBe('nested line');
    vi.useRealTimers();
  });

  it('renders transformed subtitle in overlay instead of mutating caption node', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (overlay)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    const subtitleNode = createCaptionNode('overlay line');
    handler.handleMutations(mutationForNode(subtitleNode));
    await vi.advanceTimersByTimeAsync(2);

    const overlay = document.getElementById('immersion-caption-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.innerText).toBe('overlay line (overlay)');
    expect(subtitleNode.textContent).toBe('overlay line');

    vi.useRealTimers();
  });

  it('injects overlay style only once', async () => {
    vi.useFakeTimers();

    const transformSubtitle = vi.fn(async (text) => `${text} (styled)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    handler.handleMutations(mutationForNode(createCaptionNode('first')));
    await vi.advanceTimersByTimeAsync(2);
    handler.handleMutations(mutationForNode(createCaptionNode('second')));
    await vi.advanceTimersByTimeAsync(2);

    const styleNodes = document.head.children.filter(
      (node) => node.id === 'immersion-caption-overlay-style'
    );
    expect(styleNodes).toHaveLength(1);

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
    expect(transformSubtitle).toHaveBeenCalledWith('char data line', 5);

    vi.useRealTimers();
  });

  it('primes processing from existing caption segments', async () => {
    vi.useFakeTimers();

    const existingCaption = createCaptionNode('existing subtitle');
    document.querySelectorAll = (selector) => (selector === '.ytp-caption-segment' ? [existingCaption] : []);

    const transformSubtitle = vi.fn(async (text) => `${text} (primed)`);
    const handler = window.createCaptionMutationHandler({
      getSettings: async () => ({ enabled: true, replacementPercentage: 5 }),
      transformSubtitle,
      debounceMs: 1
    });

    handler.primeFromCurrentCaptions();
    await vi.advanceTimersByTimeAsync(2);

    expect(transformSubtitle).toHaveBeenCalledTimes(1);
    expect(transformSubtitle).toHaveBeenCalledWith('existing subtitle', 5);

    vi.useRealTimers();
  });

});
