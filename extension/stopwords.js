const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'to', 'of', 'in', 'on', 'at',
  'for', 'from', 'by', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do',
  'does', 'did', 'have', 'has', 'had', 'can', 'could', 'should', 'would', 'may', 'might', 'must',
  'will', 'shall', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'this',
  'that', 'these', 'those', 'am', 'about', 'above', 'across', 'after', 'again', 'against', 'all',
  'almost', 'along', 'already', 'also', 'although', 'always', 'among', 'another', 'any', 'anyone',
  'anything', 'anywhere', 'around', 'away', 'because', 'before', 'behind', 'below', 'beside',
  'besides', 'between', 'both', 'during', 'each', 'either', 'else', 'enough', 'every', 'everyone',
  'everything', 'everywhere', 'few', 'many', 'more', 'most', 'much', 'neither', 'other', 'others',
  'some', 'someone', 'something', 'somewhere', 'such', 'through', 'throughout', 'together', 'under',
  'until', 'upon', 'very', 'via', 'within', 'without', 'just', 'only', 'even', 'still', 'well',
  'really', 'quite', 'rather', 'maybe', 'perhaps', 'probably', 'definitely', 'actually', 'basically',
  'literally', 'simply', 'kindof', 'sortof', 'kinda', 'sorta', 'wanna', 'gonna', 'gotta', 'lemme',
  'dunno', 'okay', 'ok', 'yeah', 'yes', 'no', 'nah', 'yep', 'nope', 'uh', 'um', 'hmm', 'huh',
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'aka', 'ie', 'eg', 'dept',
  'misc', 'approx', 'btw', 'imo', 'imho', 'idk', 'tbh', 'omg', 'lol', 'lmao', 'fyi', 'asap',
  'brb', 'irl', 'thx', 'pls', 'plz', "i'm", "i've", "i'll", "i'd", "you're", "you've", "you'll",
  "you'd", "he's", "he'll", "he'd", "she's", "she'll", "she'd", "it's", "it'll", "it'd", "we're",
  "we've", "we'll", "we'd", "they're", "they've", "they'll", "they'd", "that's", "there's", "what's",
  "who's", "where's", "when's", "why's", "how's", "let's", "don't", "doesn't", "didn't", "isn't",
  "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", "won't", "wouldn't", "can't",
  'cannot', "couldn't", "shouldn't", "mustn't", "mightn't", "needn't", "shan't", "ain't"
]);

function isNumberToken(token) {
  return /^\d+(?:[.,]\d+)?$/.test(token);
}

function isPunctuationToken(token) {
  return /^[^\p{L}\p{N}]+$/u.test(token);
}

function isProperNounMidSentence(token, index) {
  if (index === 0) {
    return false;
  }

  return /^[A-Z][a-z]+$/.test(token);
}

function shouldTranslateWord(token, index) {
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

function getUniqueTranslatableWordInfos(tokens) {
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

window.isNumberToken = isNumberToken;
window.isPunctuationToken = isPunctuationToken;
window.isProperNounMidSentence = isProperNounMidSentence;
window.shouldTranslateWord = shouldTranslateWord;
window.getUniqueTranslatableWordInfos = getUniqueTranslatableWordInfos;
