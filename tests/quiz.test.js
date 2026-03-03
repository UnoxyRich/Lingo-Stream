import { buildMatchingRound, filterRecentEntries, RECENT_WINDOW_MS } from '../extension/quiz.js';
import { describe, expect, it } from 'vitest';

describe('quiz helpers', () => {
  it('filters to entries from the past hour and deduplicates by source and translation', () => {
    const now = Date.UTC(2026, 2, 3, 0, 0, 0);
    const recentTimestamp = now - 10 * 60 * 1000;
    const oldTimestamp = now - RECENT_WINDOW_MS - 1;

    const entries = [
      {
        source: 'hello',
        translation: 'hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        firstSeenAt: recentTimestamp,
        lastSeenAt: recentTimestamp
      },
      {
        source: 'HELLO',
        translation: 'hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        firstSeenAt: recentTimestamp + 10,
        lastSeenAt: recentTimestamp + 10
      },
      {
        source: 'world',
        translation: 'mundo',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        firstSeenAt: oldTimestamp,
        lastSeenAt: oldTimestamp
      }
    ];

    const filtered = filterRecentEntries(entries, now);
    expect(filtered.length).toBe(1);
    expect(filtered[0]).toEqual(
      expect.objectContaining({
        source: 'HELLO',
        translation: 'hola'
      })
    );
  });

  it('builds a round with unique source and translation choices', () => {
    const entries = [
      { source: 'hello', translation: 'hola', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'world', translation: 'mundo', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'friend', translation: 'amigo', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'light', translation: 'luz', sourceLanguage: 'en', targetLanguage: 'es' }
    ];

    const round = buildMatchingRound(entries, { random: () => 0.21, maxPairs: 3 });

    expect(round).not.toBeNull();
    expect(round.pairs.length).toBe(3);
    expect(round.sourceOrder.length).toBe(3);
    expect(round.translationOrder.length).toBe(3);
    expect(new Set(round.pairs.map((pair) => pair.source.toLowerCase())).size).toBe(3);
    expect(new Set(round.pairs.map((pair) => pair.translation.toLowerCase())).size).toBe(3);
  });

  it('returns null when there are not enough unique matching pairs', () => {
    const entries = [
      { source: 'hello', translation: 'hola', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'HELLO', translation: 'hola', sourceLanguage: 'en', targetLanguage: 'es' }
    ];

    const round = buildMatchingRound(entries, { random: () => 0.2 });
    expect(round).toBeNull();
  });
});
