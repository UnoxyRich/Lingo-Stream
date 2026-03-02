const WORD_TOKEN_PATTERN = /^\p{L}[\p{L}\p{M}'-]*$/u;
const TOKEN_SPLIT_PATTERN = /\p{L}[\p{L}\p{M}'-]*|\s+|[^\s\p{L}\p{M}]+/gu;
const DUPLICATE_INLINE_TRANSLATION_PATTERN = /(\p{L}[\p{L}\p{M}'-]*\s*\(([^()]+)\))(?:\s*\(\2\))+/gu;

function normalizeReplacementPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(numeric)));
}

function calculateReplacementCount(totalCandidates, replacementPercentage = 5) {
  const normalizedReplacementPercentage = normalizeReplacementPercentage(replacementPercentage);
  if (totalCandidates <= 0 || normalizedReplacementPercentage <= 0) {
    return 0;
  }

  const count = Math.floor((totalCandidates * normalizedReplacementPercentage) / 100);
  return Math.min(totalCandidates, Math.max(1, count));
}

function pickUniqueWordInfos(candidates, replacementPercentage = 5) {
  const replacementCount = calculateReplacementCount(candidates.length, replacementPercentage);
  if (replacementCount === 0) {
    return [];
  }

  return pickRandomWordInfos(candidates, replacementCount);
}

function pickRandomWordInfos(candidates, count) {
  const targetCount = Math.max(0, Math.min(candidates.length, Number(count) || 0));
  if (targetCount === 0) {
    return [];
  }

  const pool = [...candidates];
  const chosen = [];

  while (chosen.length < targetCount && pool.length > 0) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(randomIndex, 1)[0]);
  }

  return chosen;
}

function tokenizeSubtitle(text) {
  const tokens = [];
  let wordIndex = 0;
  let tokenIndex = 0;

  for (const value of text.match(TOKEN_SPLIT_PATTERN) ?? []) {
    const isWord = WORD_TOKEN_PATTERN.test(value);
    tokens.push({
      value,
      isWord,
      wordIndex: isWord ? wordIndex++ : -1,
      tokenIndex: tokenIndex++
    });
  }

  return tokens;
}

function collectCandidateWordInfos(tokens, excludedTokenIndexes = new Set()) {
  const seen = new Set();
  const candidates = [];

  for (const token of tokens) {
    if (!token.isWord) {
      continue;
    }

    if (excludedTokenIndexes.has(token.tokenIndex)) {
      continue;
    }

    const normalized = token.value.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    if (!window.shouldTranslateWord(token.value, token.wordIndex)) {
      continue;
    }

    seen.add(normalized);
    candidates.push({
      token: token.value,
      normalized
    });
  }

  return candidates;
}

function isSpaceToken(token) {
  return typeof token?.value === 'string' && /^\s+$/.test(token.value);
}

function findInlineTranslationAfterWord(tokens, wordTokenIndex) {
  if (!Array.isArray(tokens) || wordTokenIndex < 0 || wordTokenIndex >= tokens.length) {
    return null;
  }

  let cursor = wordTokenIndex + 1;
  while (cursor < tokens.length && isSpaceToken(tokens[cursor])) {
    cursor += 1;
  }

  return parseParenthetical(tokens, cursor);
}

function parseParenthetical(tokens, openIndex) {
  if (!Array.isArray(tokens) || openIndex < 0 || openIndex >= tokens.length) {
    return null;
  }

  if (tokens[openIndex].value !== '(') {
    return null;
  }

  let cursor = openIndex + 1;
  while (cursor < tokens.length && tokens[cursor].value !== ')') {
    cursor += 1;
  }

  if (cursor >= tokens.length) {
    return null;
  }

  const closeIndex = cursor;
  const translationText = tokens
    .slice(openIndex + 1, closeIndex)
    .map((token) => token.value)
    .join('')
    .trim();

  if (!translationText) {
    return null;
  }

  return { openIndex, closeIndex, translationText };
}

function addTranslationContentTokenIndexes(tokens, translationRange, targetSet) {
  if (!translationRange || !targetSet) {
    return;
  }

  for (let contentIndex = translationRange.openIndex + 1; contentIndex < translationRange.closeIndex; contentIndex += 1) {
    const contentToken = tokens[contentIndex];
    if (contentToken?.isWord) {
      targetSet.add(contentToken.tokenIndex);
    }
  }
}

function analyzeInlineTranslations(tokens) {
  const translatedWordTokenIndexes = new Set();
  const translationContentTokenIndexes = new Set();
  const duplicatedTranslationTokenIndexes = new Set();
  const translatedWordsByNormalized = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token?.isWord) {
      continue;
    }

    const inlineTranslation = findInlineTranslationAfterWord(tokens, index);
    if (!inlineTranslation) {
      continue;
    }

    const normalized = token.value.toLowerCase();
    translatedWordTokenIndexes.add(token.tokenIndex);
    if (!Object.prototype.hasOwnProperty.call(translatedWordsByNormalized, normalized)) {
      translatedWordsByNormalized[normalized] = inlineTranslation.translationText;
    }
    addTranslationContentTokenIndexes(tokens, inlineTranslation, translationContentTokenIndexes);

    let cursor = inlineTranslation.closeIndex + 1;
    while (cursor < tokens.length) {
      const duplicateStart = cursor;
      while (cursor < tokens.length && isSpaceToken(tokens[cursor])) {
        cursor += 1;
      }

      const followingTranslation = parseParenthetical(tokens, cursor);
      if (!followingTranslation) {
        break;
      }

      addTranslationContentTokenIndexes(tokens, followingTranslation, translationContentTokenIndexes);

      if (followingTranslation.translationText === inlineTranslation.translationText) {
        for (let duplicateIndex = duplicateStart; duplicateIndex <= followingTranslation.closeIndex; duplicateIndex += 1) {
          duplicatedTranslationTokenIndexes.add(tokens[duplicateIndex].tokenIndex);
        }
      }

      cursor = followingTranslation.closeIndex + 1;
    }
  }

  return {
    translatedWordTokenIndexes,
    translationContentTokenIndexes,
    duplicatedTranslationTokenIndexes,
    translatedWordsByNormalized
  };
}

function dedupeInlineTranslationSuffixes(text) {
  if (typeof text !== 'string' || !text) {
    return text;
  }

  return text.replace(DUPLICATE_INLINE_TRANSLATION_PATTERN, '$1');
}

function normalizePinnedTranslations(pinnedTranslations) {
  if (!pinnedTranslations) {
    return {};
  }

  const normalized = {};
  const addEntry = (key, value) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      return;
    }

    const normalizedKey = key.toLowerCase().trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) {
      return;
    }

    normalized[normalizedKey] = normalizedValue;
  };

  if (pinnedTranslations instanceof Map) {
    for (const [key, value] of pinnedTranslations.entries()) {
      addEntry(key, value);
    }
    return normalized;
  }

  if (typeof pinnedTranslations === 'object') {
    for (const [key, value] of Object.entries(pinnedTranslations)) {
      addEntry(key, value);
    }
  }

  return normalized;
}

async function buildImmersiveSubtitle(
  text,
  translateWords,
  replacementPercentage = 5,
  pinnedTranslations = {}
) {
  if (!text || !text.trim()) {
    void window.log?.('Skipped processing: no subtitles');
    return text;
  }

  const normalizedReplacementPercentage = normalizeReplacementPercentage(replacementPercentage);
  if (normalizedReplacementPercentage <= 0) {
    void window.log?.('Skipped processing: empty settings (replacement percentage <= 0)');
    return text;
  }

  const tokens = tokenizeSubtitle(text);
  const inlineAnalysis = analyzeInlineTranslations(tokens);
  const excludedTokenIndexes = new Set([
    ...inlineAnalysis.translatedWordTokenIndexes,
    ...inlineAnalysis.translationContentTokenIndexes
  ]);
  const candidateWordInfos = collectCandidateWordInfos(tokens, excludedTokenIndexes);
  const replacementCount = calculateReplacementCount(candidateWordInfos.length, normalizedReplacementPercentage);
  const pinnedByNormalized = normalizePinnedTranslations(pinnedTranslations);

  const pinnedCandidates = candidateWordInfos.filter(({ normalized }) =>
    Object.prototype.hasOwnProperty.call(pinnedByNormalized, normalized)
  );
  const unpinnedCandidates = candidateWordInfos.filter(
    ({ normalized }) => !Object.prototype.hasOwnProperty.call(pinnedByNormalized, normalized)
  );
  const remainingCount = Math.max(0, replacementCount - pinnedCandidates.length);
  const selected = pickRandomWordInfos(unpinnedCandidates, remainingCount);

  if (selected.length === 0 && pinnedCandidates.length === 0) {
    void window.log?.('Skipped processing: no eligible words selected');
    return dedupeInlineTranslationSuffixes(text);
  }

  const selectedWords = selected.map(({ token }) => token);
  if (pinnedCandidates.length > 0) {
    const pinnedWords = pinnedCandidates.map(({ token }) => token);
    void window.log?.(`Pinned words kept: ${JSON.stringify(pinnedWords)}`);
  }
  if (selectedWords.length > 0) {
    void window.log?.(`Words selected: ${JSON.stringify(selectedWords)}`);
  }

  const translatedByNormalized = selectedWords.length > 0 ? await translateWords(selectedWords) : {};
  const effectiveTranslations = {
    ...translatedByNormalized,
    ...pinnedByNormalized,
    ...inlineAnalysis.translatedWordsByNormalized
  };
  const remainingInsertionsByNormalized = new Map();
  for (const normalized of Object.keys(effectiveTranslations)) {
    if (!normalized) {
      continue;
    }
    remainingInsertionsByNormalized.set(normalized, 1);
  }
  for (const normalized of Object.keys(inlineAnalysis.translatedWordsByNormalized)) {
    remainingInsertionsByNormalized.set(normalized, 0);
  }

  const rendered = tokens
    .map((token) => {
      if (inlineAnalysis.duplicatedTranslationTokenIndexes.has(token.tokenIndex)) {
        return '';
      }

      if (!token.isWord) {
        return token.value;
      }

      if (inlineAnalysis.translationContentTokenIndexes.has(token.tokenIndex)) {
        return token.value;
      }

      const normalized = token.value.toLowerCase();
      const translated = effectiveTranslations[normalized];
      if (!translated) {
        return token.value;
      }

      if (inlineAnalysis.translatedWordTokenIndexes.has(token.tokenIndex)) {
        remainingInsertionsByNormalized.set(normalized, 0);
        return token.value;
      }

      const remaining = remainingInsertionsByNormalized.get(normalized) ?? 0;
      if (remaining <= 0) {
        return token.value;
      }

      remainingInsertionsByNormalized.set(normalized, remaining - 1);
      return `${token.value} (${translated})`;
    })
    .join('');

  return dedupeInlineTranslationSuffixes(rendered);
}

window.calculateReplacementCount = calculateReplacementCount;
window.pickUniqueWordInfos = pickUniqueWordInfos;
window.buildImmersiveSubtitle = buildImmersiveSubtitle;
