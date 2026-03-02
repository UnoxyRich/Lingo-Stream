import { describe, expect, it } from 'vitest';

globalThis.window = globalThis;
await import('../extension/stopwords.js');

describe('stop-word filtering', () => {
  it('filters stop words, short words, and numbers', () => {
    expect(window.shouldTranslateWord('the', 0)).toBe(false);
    expect(window.shouldTranslateWord('is', 2)).toBe(false);
    expect(window.shouldTranslateWord('42', 1)).toBe(false);
    expect(window.shouldTranslateWord('go', 1)).toBe(false);
    expect(window.shouldTranslateWord('learning', 1)).toBe(true);
  });

  it('filters common abbreviations and contractions', () => {
    expect(window.shouldTranslateWord('etc', 1)).toBe(false);
    expect(window.shouldTranslateWord('btw', 1)).toBe(false);
    expect(window.shouldTranslateWord("you're", 1)).toBe(false);
  });

  it('skips proper nouns mid-sentence and duplicate words', () => {
    const tokens = ['Today', 'Alice', 'likes', 'apples', 'apples'];
    const result = window.getUniqueTranslatableWordInfos(tokens);
    expect(result.map((entry) => entry.token)).toEqual(['Today', 'likes', 'apples']);
  });
});
