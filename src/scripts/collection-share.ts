function setupSharing() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy-article]').forEach(button => {
    if (button.dataset.ready) return;
    button.dataset.ready = 'true';
    button.addEventListener('click', async () => {
      const url = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href;
      const status = button.parentElement?.querySelector<HTMLElement>('[role="status"]');
      try {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = 'Article link copied.';
      } catch {
        if (status) status.textContent = 'Copy this article link: ' + url;
      }
    });
  });
}
setupSharing();
document.addEventListener('astro:page-load', setupSharing);
