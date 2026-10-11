/** Quiet illustrative texture, independent of visitor data and page content. */
function initializeBinaryBackground() {
  document.querySelectorAll<HTMLElement>('[data-binary-background]').forEach(root => {
    if (root.dataset.binaryReady) return;
    root.dataset.binaryReady = 'true';
    const lifecycle = new AbortController();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tokens = Array.from(root.querySelectorAll<HTMLElement>('[data-binary-token]'));
    let timer: number | undefined;
    let fadeTimer: number | undefined;
    let activeToken: HTMLElement | undefined;

    function canAnimate() {
      return !document.hidden && !reducedMotion.matches && root.isConnected;
    }

    function pause() {
      if (timer !== undefined) window.clearTimeout(timer);
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
      timer = fadeTimer = undefined;
      root.dataset.paused = 'true';
      activeToken?.removeAttribute('data-changing');
      activeToken = undefined;
    }

    function schedule() {
      if (!canAnimate()) { pause(); return; }
      delete root.dataset.paused;
      // One short row gently fades out, changes one bit, then fades back in.
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!canAnimate()) { pause(); return; }
        const visibleTokens = tokens.filter(token => token.offsetParent !== null);
        activeToken = visibleTokens[Math.floor(Math.random() * visibleTokens.length)];
        if (!activeToken) return;
        activeToken.dataset.changing = 'true';
        fadeTimer = window.setTimeout(() => {
          fadeTimer = undefined;
          if (!canAnimate()) { pause(); return; }
          if (activeToken) {
            const characters = (activeToken.textContent || '').split('');
            const positions = characters.flatMap((character, index) => character === '0' || character === '1' ? [index] : []);
            const position = positions[Math.floor(Math.random() * positions.length)];
            if (position !== undefined) {
              characters[position] = characters[position] === '0' ? '1' : '0';
              activeToken.textContent = characters.join('');
            }
            activeToken.removeAttribute('data-changing');
            activeToken = undefined;
          }
          schedule();
        }, 900);
      }, 3200);
    }

    function syncActivity() {
      pause();
      if (canAnimate()) schedule();
    }

    document.addEventListener('visibilitychange', syncActivity, { signal: lifecycle.signal });
    reducedMotion.addEventListener('change', syncActivity, { signal: lifecycle.signal });
    document.addEventListener('astro:before-swap', () => { pause(); lifecycle.abort(); }, { once: true, signal: lifecycle.signal });
    syncActivity();
  });
}

initializeBinaryBackground();
document.addEventListener('astro:page-load', initializeBinaryBackground);
