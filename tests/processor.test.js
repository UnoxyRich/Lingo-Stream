import { describe, expect, it, vi } from 'vitest';

globalThis.window = globalThis;
await import('../extension/stopwords.js');
await import('../extension/processor.js');

describe('percentage replacement logic', () => {
  it('calculates replacement count safely', () => {
    expect(window.calculateReplacementCount(0, 5)).toBe(0);
    expect(window.calculateReplacementCount(2, 5)).toBe(1);
    expect(window.calculateReplacementCount(10, 20)).toBe(2);
  });

  it('picks unique words based on percentage', () => {
    const candidates = [
      { index: 0, token: 'learning' },
      { index: 1, token: 'skills' },
      { index: 2, token: 'daily' }
    ];

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const selected = window.pickUniqueWordInfos(candidates, 66);
    expect(selected.length).toBe(1);
    expect(selected[0].token).toBe('learning');
    vi.restoreAllMocks();
  });



  it('returns original text when subtitle is empty', async () => {
    const output = await window.buildImmersiveSubtitle('   ', async () => ({}), 50);
    expect(output).toBe('   ');
  });

  it('returns original text when replacement percentage is invalid', async () => {
    const output = await window.buildImmersiveSubtitle('hello world', async () => ({}), 0);
    expect(output).toBe('hello world');
  });

  it('accepts numeric-string replacement percentage values', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const translateWordsMock = vi.fn(async () => ({ enjoy: 'gusto' }));

    const output = await window.buildImmersiveSubtitle(
      'I enjoy coding daily',
      translateWordsMock,
      '50'
    );

    expect(output).toContain('enjoy (gusto)');
    expect(translateWordsMock).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('builds subtitle with translated suffix format from batched translations', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const translateWordsMock = vi.fn(async (words) => {
      const output = {};
      for (const word of words) {
        output[word.toLowerCase()] = `${word}-es`;
      }

      return output;
    });

    const output = await window.buildImmersiveSubtitle(
      'I enjoy learning skills daily',
      translateWordsMock,
      50
    );

    expect(translateWordsMock).toHaveBeenCalledTimes(1);
    expect(output).toContain('enjoy (enjoy-es)');
    vi.restoreAllMocks();
  });

  it('keeps pinned translations even when no new random picks are needed', async () => {
    const translateWordsMock = vi.fn(async () => ({}));

    const output = await window.buildImmersiveSubtitle(
      'I enjoy learning skills',
      translateWordsMock,
      25,
      { enjoy: 'gusto' }
    );

    expect(output).toContain('enjoy (gusto)');
    expect(translateWordsMock).toHaveBeenCalledTimes(0);
  });

  it('does not append duplicate inline translation suffixes', async () => {
    const translateWordsMock = vi.fn(async () => ({}));

    const output = await window.buildImmersiveSubtitle(
      'apple(apple-zh)(apple-zh)',
      translateWordsMock,
      25,
      { apple: 'apple-zh' }
    );

    expect(output).toBe('apple(apple-zh)');
    expect(translateWordsMock).toHaveBeenCalledTimes(0);
  });

  it('translates only one occurrence when the same word repeats in a sentence', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const translateWordsMock = vi.fn(async () => ({ apple: 'apple-zh' }));

    const output = await window.buildImmersiveSubtitle(
      'apple apple apple',
      translateWordsMock,
      100
    );

    expect(output).toBe('apple (apple-zh) apple apple');
    expect(translateWordsMock).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('keeps inline translation text and removes duplicate inline suffixes', async () => {
    const translateWordsMock = vi.fn(async () => ({ apple: 'otra' }));

    const output = await window.buildImmersiveSubtitle(
      'apple (manzana) (manzana)',
      translateWordsMock,
      100
    );

    expect(output).toBe('apple (manzana)');
    expect(translateWordsMock).toHaveBeenCalledTimes(0);
  });

  it('supports pinned translations provided as a Map', async () => {
    const translateWordsMock = vi.fn(async () => ({}));
    const pinned = new Map([['ENJOY', 'gusto']]);

    const output = await window.buildImmersiveSubtitle(
      'I enjoy coding',
      translateWordsMock,
      25,
      pinned
    );

    expect(output).toContain('enjoy (gusto)');
    expect(translateWordsMock).toHaveBeenCalledTimes(0);
  });
});
