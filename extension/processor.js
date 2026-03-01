const WORD_TOKEN_PATTERN = /^\p{L}[\p{L}\p{M}'-]*$/u;
const TOKEN_SPLIT_PATTERN = /\p{L}[\p{L}\p{M}'-]*|\s+|[^\s\p{L}\p{M}]+/gu;

function calculateReplacementCount(totalCandidates, replacementPercentage = 5) {
  if (totalCandidates <= 0 || replacementPercentage <= 0) {
    return 0;
  }

  const count = Math.floor((totalCandidates * replacementPercentage) / 100);
  return Math.min(totalCandidates, Math.max(1, count));
}

function pickUniqueWordInfos(candidates, replacementPercentage = 5) {
  const replacementCount = calculateReplacementCount(candidates.length, replacementPercentage);
  if (replacementCount === 0) {
    return [];
  }

  const pool = [...candidates];
  const chosen = [];

  while (chosen.length < replacementCount && pool.length > 0) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(randomIndex, 1)[0]);
  }

  return chosen;
}

function tokenizeSubtitle(text) {
  const tokens = [];
  let wordIndex = 0;

  for (const value of text.match(TOKEN_SPLIT_PATTERN) ?? []) {
    const isWord = WORD_TOKEN_PATTERN.test(value);
    tokens.push({
      value,
      isWord,
      wordIndex: isWord ? wordIndex++ : -1
    });
  }

  return tokens;
}

function collectCandidateWordInfos(tokens) {
  const seen = new Set();
  const candidates = [];

  for (const token of tokens) {
    if (!token.isWord) {
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

async function buildImmersiveSubtitle(text, translateWords, replacementPercentage = 5) {
  if (!text || !text.trim()) {
    void window.log?.('Skipped processing: no subtitles');
    return text;
  }

  if (!Number.isFinite(replacementPercentage) || replacementPercentage <= 0) {
    void window.log?.('Skipped processing: empty settings (replacement percentage <= 0)');
    return text;
  }

  const tokens = tokenizeSubtitle(text);
  const candidateWordInfos = collectCandidateWordInfos(tokens);
  const selected = pickUniqueWordInfos(candidateWordInfos, replacementPercentage);

  if (selected.length === 0) {
    void window.log?.('Skipped processing: no eligible words selected');
    return text;
  }

  const selectedWords = selected.map(({ token }) => token);
  void window.log?.(`Words selected: ${JSON.stringify(selectedWords)}`);

  const translatedByNormalized = await translateWords(selectedWords);

  return tokens
    .map((token) => {
      if (!token.isWord) {
        return token.value;
      }

      const normalized = token.value.toLowerCase();
      const translated = translatedByNormalized[normalized];
      if (!translated) {
        return token.value;
      }

      return `${token.value} (${translated})`;
    })
    .join('');
}

window.calculateReplacementCount = calculateReplacementCount;
window.pickUniqueWordInfos = pickUniqueWordInfos;
window.buildImmersiveSubtitle = buildImmersiveSubtitle;
