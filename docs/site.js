function inferRepositoryUrl() {
  const host = window.location.hostname;
  const pathSegments = window.location.pathname.split('/').filter(Boolean);

  if (!host.endsWith('.github.io') || pathSegments.length === 0) {
    return 'https://github.com/your-username/Lingo-Stream';
  }

  const owner = host.split('.')[0];
  const repo = pathSegments[0];
  return `https://github.com/${owner}/${repo}`;
}

const ORIGINAL_LINE = 'I really enjoy learning new skills every day.';
const PREVIEW_TOKENS = [
  { text: 'I' },
  { text: 'really' },
  { text: 'enjoy', key: 'enjoy' },
  { text: 'learning', key: 'learning' },
  { text: 'new' },
  { text: 'skills', key: 'skills' },
  { text: 'every', key: 'every' },
  { text: 'day', key: 'day', suffix: '.' }
];
const REPLACEMENT_PRIORITY = ['skills', 'enjoy', 'learning', 'every', 'day'];
const TRANSLATIONS_BY_LANGUAGE = {
  es: {
    enjoy: 'disfrutar',
    learning: 'aprender',
    skills: 'habilidades',
    every: 'cada',
    day: 'dia'
  },
  fr: {
    enjoy: 'profiter',
    learning: 'apprendre',
    skills: 'competences',
    every: 'chaque',
    day: 'jour'
  },
  de: {
    enjoy: 'geniessen',
    learning: 'lernen',
    skills: 'fertigkeiten',
    every: 'jeden',
    day: 'tag'
  },
  it: {
    enjoy: 'godere',
    learning: 'imparare',
    skills: 'abilita',
    every: 'ogni',
    day: 'giorno'
  },
  pt: {
    enjoy: 'curtir',
    learning: 'aprender',
    skills: 'habilidades',
    every: 'cada',
    day: 'dia'
  },
  ja: {
    enjoy: 'tanoshimu',
    learning: 'manabu',
    skills: 'sukiru',
    every: 'mai',
    day: 'hi'
  },
  ko: {
    enjoy: 'jeulgida',
    learning: 'baeuda',
    skills: 'gisul',
    every: 'maeil',
    day: 'nal'
  }
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function calculateReplacementCount(replacementPercentage, enabled) {
  if (!enabled) {
    return 0;
  }

  const numeric = Number.parseInt(String(replacementPercentage), 10);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  const clamped = Math.max(1, Math.min(100, numeric));
  return Math.max(1, Math.floor((REPLACEMENT_PRIORITY.length * clamped) / 100));
}

function buildTranslatedLine(language, replacementPercentage, enabled) {
  const translations = TRANSLATIONS_BY_LANGUAGE[language] ?? TRANSLATIONS_BY_LANGUAGE.es;
  const replacementCount = calculateReplacementCount(replacementPercentage, enabled);
  const selected = new Set(REPLACEMENT_PRIORITY.slice(0, replacementCount));
  const fragments = [];

  for (const token of PREVIEW_TOKENS) {
    const safeWord = escapeHtml(token.text);
    const suffix = token.suffix ? escapeHtml(token.suffix) : '';
    if (!token.key || !enabled || !selected.has(token.key)) {
      fragments.push(`${safeWord}${suffix}`);
      continue;
    }

    const translated = translations[token.key] ?? token.key;
    const safeTranslated = escapeHtml(translated);
    fragments.push(
      `<span class="word-pair">${safeWord} <span class="translation">(${safeTranslated})</span></span>${suffix}`
    );
  }

  return {
    html: fragments.join(' '),
    replacedCount: enabled ? selected.size : 0
  };
}

function animateLine(node, content) {
  if (!node) {
    return;
  }

  node.classList.remove('line-change');
  node.innerHTML = content;
  void node.offsetWidth;
  node.classList.add('line-change');
}

function attachRepositoryLinks(repositoryUrl) {
  const linkNodes = document.querySelectorAll('[data-repo-link]');
  for (const linkNode of linkNodes) {
    linkNode.href = repositoryUrl;
  }

  const cloneNode = document.getElementById('clone-command');
  if (cloneNode) {
    cloneNode.textContent = `git clone ${repositoryUrl}.git`;
  }
}

function attachCopyClone() {
  const copyButton = document.getElementById('copy-clone');
  const cloneNode = document.getElementById('clone-command');
  if (!copyButton || !cloneNode) {
    return;
  }

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cloneNode.textContent || '');
      copyButton.textContent = 'Copied';
    } catch (_error) {
      copyButton.textContent = 'Failed';
    }

    setTimeout(() => {
      copyButton.textContent = 'Copy';
    }, 1200);
  });
}

function attachRevealAnimation() {
  const revealNodes = document.querySelectorAll('.reveal');
  if (revealNodes.length === 0) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.18 }
  );

  for (const revealNode of revealNodes) {
    observer.observe(revealNode);
  }
}

function attachInteractivePreview() {
  const providerInput = document.getElementById('previewProvider');
  const languageInput = document.getElementById('previewLanguage');
  const replacementInput = document.getElementById('previewReplacement');
  const replacementValue = document.getElementById('previewReplacementValue');
  const enabledInput = document.getElementById('previewEnabled');
  const previewMeta = document.getElementById('previewMeta');
  const originalLineNode = document.getElementById('previewOriginalLine');
  const translatedLineNode = document.getElementById('previewTranslatedLine');
  const heroSubtitleLineNode = document.getElementById('heroSubtitleLine');

  if (
    !providerInput ||
    !languageInput ||
    !replacementInput ||
    !replacementValue ||
    !enabledInput ||
    !previewMeta ||
    !originalLineNode ||
    !translatedLineNode
  ) {
    return;
  }

  originalLineNode.textContent = ORIGINAL_LINE;

  const updatePreview = () => {
    const percentage = Math.max(1, Math.min(100, Number.parseInt(replacementInput.value, 10) || 1));
    replacementInput.value = String(percentage);
    replacementValue.textContent = `${percentage}%`;

    const enabled = enabledInput.checked;
    const providerLabel = providerInput.options[providerInput.selectedIndex]?.textContent || 'Auto fallback';
    const languageLabel = languageInput.options[languageInput.selectedIndex]?.textContent || 'Spanish';
    const { html, replacedCount } = buildTranslatedLine(languageInput.value, percentage, enabled);

    animateLine(translatedLineNode, enabled ? html : escapeHtml(ORIGINAL_LINE));
    if (heroSubtitleLineNode) {
      animateLine(heroSubtitleLineNode, enabled ? html : escapeHtml(ORIGINAL_LINE));
    }

    if (!enabled) {
      previewMeta.textContent = 'Lingo Stream disabled - captions stay original.';
      return;
    }

    previewMeta.textContent = `Provider: ${providerLabel} - Target: ${languageLabel} - Replaced words: ${replacedCount}`;
  };

  providerInput.addEventListener('change', updatePreview);
  languageInput.addEventListener('change', updatePreview);
  replacementInput.addEventListener('input', updatePreview);
  enabledInput.addEventListener('change', updatePreview);
  updatePreview();
}

function updateCopyrightYear() {
  const yearNode = document.getElementById('year');
  if (!yearNode) {
    return;
  }

  yearNode.textContent = String(new Date().getFullYear());
}

function initializeSite() {
  const repositoryUrl = inferRepositoryUrl();
  attachRepositoryLinks(repositoryUrl);
  attachCopyClone();
  attachRevealAnimation();
  attachInteractivePreview();
  updateCopyrightYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSite, { once: true });
} else {
  initializeSite();
}
