import { getUniqueTranslatableWordInfos } from './stopwords.js';

export function calculateReplacementCount(totalCandidates, replacementPercentage = 5) {
  if (totalCandidates <= 0 || replacementPercentage <= 0) {
    return 0;
  }

  const count = Math.floor((totalCandidates * replacementPercentage) / 100);
  return Math.min(totalCandidates, Math.max(1, count));
}

export function pickUniqueWordInfos(candidates, replacementPercentage = 5) {
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

export async function buildImmersiveSubtitle(text, translateWords, replacementPercentage = 5) {
  const tokens = text.split(/(\s+)/);
  const wordOnlyTokens = tokens.filter((token) => token.trim().length > 0);
  const candidateWordInfos = getUniqueTranslatableWordInfos(wordOnlyTokens);
  const selected = pickUniqueWordInfos(candidateWordInfos, replacementPercentage);

  if (selected.length === 0) {
    return text;
  }

  const selectedWords = selected.map(({ token }) => token);
  const translatedByNormalized = await translateWords(selectedWords);

  return tokens
    .map((token) => {
      const trimmed = token.trim();
      if (!trimmed) {
        return token;
      }

      const normalized = trimmed.toLowerCase();
      const translated = translatedByNormalized[normalized];
      if (!translated) {
        return token;
      }

      return `${trimmed} (${translated})`;
    })
    .join('');
}
