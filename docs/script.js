function inferRepository() {
  const host = window.location.hostname;
  const pathSegments = window.location.pathname.split('/').filter(Boolean);

  if (!host.endsWith('.github.io') || pathSegments.length === 0) {
    return {
      owner: 'your-username',
      repo: 'Lingo-Stream',
      url: 'https://github.com/your-username/Lingo-Stream'
    };
  }

  const owner = host.split('.')[0];
  const repo = pathSegments[0];
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`
  };
}

function applyRepositoryLinks(repository) {
  const links = document.querySelectorAll('[data-repo-link]');
  for (const link of links) {
    link.href = repository.url;
  }

  const cloneCode = document.getElementById('clone-command');
  if (cloneCode) {
    cloneCode.textContent = `git clone ${repository.url}.git`;
  }
}

function setupCopyCloneCommand() {
  const copyButton = document.getElementById('copy-clone');
  const cloneCode = document.getElementById('clone-command');
  if (!copyButton || !cloneCode) {
    return;
  }

  copyButton.addEventListener('click', async () => {
    const text = cloneCode.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = 'Copied';
      setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1200);
    } catch (_error) {
      copyButton.textContent = 'Failed';
      setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1200);
    }
  });
}

function setupRevealAnimations() {
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
    {
      threshold: 0.2
    }
  );

  for (const node of revealNodes) {
    observer.observe(node);
  }
}

function setCurrentYear() {
  const yearNode = document.getElementById('year');
  if (!yearNode) {
    return;
  }

  yearNode.textContent = String(new Date().getFullYear());
}

function bootstrap() {
  const repository = inferRepository();
  applyRepositoryLinks(repository);
  setupCopyCloneCommand();
  setupRevealAnimations();
  setCurrentYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
