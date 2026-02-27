const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'to', 'of', 'in', 'on', 'at',
  'for', 'from', 'by', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do',
  'does', 'did', 'have', 'has', 'had', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
  'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these',
  'those', 'am'
]);

export function isNumberToken(token) {
  return /^\d+(?:[.,]\d+)?$/.test(token);
}

export function isPunctuationToken(token) {
  return /^[^\p{L}\p{N}]+$/u.test(token);
}

export function isProperNounMidSentence(token, index) {
  if (index === 0) {
    return false;
  }

  return /^[A-Z][a-z]+$/.test(token);
}

export function shouldTranslateWord(token, index) {
  if (!token || token.length < 3) {
    return false;
  }

  if (isNumberToken(token) || isPunctuationToken(token)) {
    return false;
  }

  if (isProperNounMidSentence(token, index)) {
    return false;
  }

  return !STOP_WORDS.has(token.toLowerCase());
}

export function getUniqueTranslatableWordInfos(tokens) {
  const seen = new Set();
  const candidates = [];

  tokens.forEach((token, index) => {
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) {
      return;
    }

    if (shouldTranslateWord(token, index)) {
      seen.add(normalized);
      candidates.push({ index, token });
    }
  });

  return candidates;
}
