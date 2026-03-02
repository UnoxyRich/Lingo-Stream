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
  updateCopyrightYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSite, { once: true });
} else {
  initializeSite();
}
