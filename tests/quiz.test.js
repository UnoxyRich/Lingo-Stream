import {
  buildMatchingRound,
  buildQuizCandidateEntries,
  createVocabularyKey,
  filterRecentEntries,
  normalizeQuizBuckets,
  PAIRS_PER_ROUND,
  RECENT_WINDOW_MS
} from '../extension/quiz.js';
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

  it('builds a round with exactly five unique pairs by default', () => {
    const entries = [
      { source: 'hello', translation: 'hola', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'world', translation: 'mundo', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'friend', translation: 'amigo', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'light', translation: 'luz', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'house', translation: 'casa', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'water', translation: 'agua', sourceLanguage: 'en', targetLanguage: 'es' }
    ];

    const round = buildMatchingRound(entries, { random: () => 0.21 });

    expect(round).not.toBeNull();
    expect(round.pairs.length).toBe(PAIRS_PER_ROUND);
    expect(round.sourceOrder.length).toBe(PAIRS_PER_ROUND);
    expect(round.translationOrder.length).toBe(PAIRS_PER_ROUND);
    expect(new Set(round.pairs.map((pair) => pair.source.toLowerCase())).size).toBe(PAIRS_PER_ROUND);
    expect(new Set(round.pairs.map((pair) => pair.translation.toLowerCase())).size).toBe(PAIRS_PER_ROUND);
  });

  it('returns null when there are fewer than five unique matching pairs', () => {
    const entries = [
      { source: 'hello', translation: 'hola', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'world', translation: 'mundo', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'friend', translation: 'amigo', sourceLanguage: 'en', targetLanguage: 'es' },
      { source: 'light', translation: 'luz', sourceLanguage: 'en', targetLanguage: 'es' }
    ];

    const round = buildMatchingRound(entries, { random: () => 0.2 });
    expect(round).toBeNull();
  });

  it('keeps words in only one quiz bucket and removes notQuizzed entries that are already correct', () => {
    const duplicate = {
      source: 'hello',
      translation: 'hola',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    };
    const buckets = normalizeQuizBuckets(
      {
        notQuizzed: [duplicate],
        correct: [duplicate],
        incorrect: []
      },
      [duplicate]
    );

    expect(buckets.correct.length).toBe(1);
    expect(buckets.notQuizzed.length).toBe(0);
    expect(buckets.incorrect.length).toBe(0);
  });

  it('builds candidate entries only from notQuizzed and incorrect buckets', () => {
    const correctEntry = {
      source: 'water',
      translation: 'agua',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    };
    const buckets = normalizeQuizBuckets({
      notQuizzed: [
        { source: 'hello', translation: 'hola', sourceLanguage: 'en', targetLanguage: 'es' }
      ],
      correct: [correctEntry],
      incorrect: [
        { source: 'friend', translation: 'amigo', sourceLanguage: 'en', targetLanguage: 'es', wrongCount: 2 }
      ]
    });

    const candidates = buildQuizCandidateEntries(buckets);
    const keys = new Set(candidates.map((entry) => createVocabularyKey(entry)));

    expect(candidates.length).toBe(2);
    expect(keys.has(createVocabularyKey(correctEntry))).toBe(false);
  });
});
