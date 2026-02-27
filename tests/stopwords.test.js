import { describe, expect, it } from 'vitest';
import { getUniqueTranslatableWordInfos, shouldTranslateWord } from '../extension/stopwords.js';

describe('stop-word filtering', () => {
  it('filters stop words, short words, and numbers', () => {
    expect(shouldTranslateWord('the', 0)).toBe(false);
    expect(shouldTranslateWord('is', 2)).toBe(false);
    expect(shouldTranslateWord('42', 1)).toBe(false);
    expect(shouldTranslateWord('go', 1)).toBe(false);
    expect(shouldTranslateWord('learning', 1)).toBe(true);
  });

  it('skips proper nouns mid-sentence and duplicate words', () => {
    const tokens = ['Today', 'Alice', 'likes', 'apples', 'apples'];
    const result = getUniqueTranslatableWordInfos(tokens);
    expect(result.map((entry) => entry.token)).toEqual(['Today', 'likes', 'apples']);
  });
});
