function inferRepoUrl() {
  const host = window.location.hostname;
  const path = window.location.pathname.split('/').filter(Boolean);

  if (!host.endsWith('.github.io') || path.length === 0) {
    return 'https://github.com/your-username/Lingo-Stream';
  }

  const owner = host.split('.')[0];
  const repo = path[0];
  return `https://github.com/${owner}/${repo}`;
}

function bindRepoLinks(repoUrl) {
  const nodes = document.querySelectorAll('[data-repo-link]');
  for (const node of nodes) {
    node.href = repoUrl;
  }

  const cloneNode = document.getElementById('clone-command');
  if (cloneNode) {
    cloneNode.textContent = `git clone ${repoUrl}.git`;
  }
}

function bindCopyClone() {
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

function bindReveal() {
  const nodes = document.querySelectorAll('.reveal');
  if (nodes.length === 0) {
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

  for (const node of nodes) {
    observer.observe(node);
  }
}

function bindYear() {
  const yearNode = document.getElementById('year');
  if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
  }
}

function bootstrap() {
  const repoUrl = inferRepoUrl();
  bindRepoLinks(repoUrl);
  bindCopyClone();
  bindReveal();
  bindYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
