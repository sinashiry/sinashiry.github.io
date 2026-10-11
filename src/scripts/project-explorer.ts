/** Enhances already-readable project content. No framework, remote data or analytics. */
function initializeProjectExplorers() {
  document.querySelectorAll<HTMLElement>('[data-project-explorer]').forEach(root => {
    if (root.dataset.enhanced) return;

    const figures = Array.from(root.querySelectorAll<HTMLElement>('[data-explorer-figure]'));
    const thumbnails = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-explorer-thumbnail]'));
    const count = root.querySelector<HTMLElement>('[data-explorer-count]');
    const dialog = root.querySelector<HTMLDialogElement>('[data-explorer-lightbox]');
    const lifecycle = new AbortController();
    const lightboxImage = root.querySelector<HTMLImageElement>('[data-explorer-lightbox-image]');
    const lightboxCaption = root.querySelector<HTMLElement>('[data-explorer-lightbox-caption]');
    const lightboxCount = root.querySelector<HTMLElement>('[data-explorer-lightbox-count]');
    let selectedImage = 0;
    let lightboxOpener: HTMLElement | null = null;

    const wrap = (index: number, length: number) => (index + length) % length;

    // Derive enhanced labels from the server-rendered editable captions and alt text.
    figures.forEach((figure, index) => {
      const image = figure.querySelector<HTMLImageElement>('img');
      const caption = figure.querySelector('figcaption')?.textContent?.trim();
      if (image) figure.querySelector('[data-explorer-open]')?.setAttribute('aria-label', `Enlarge image: ${image.alt}`);
      thumbnails[index]?.setAttribute('aria-label', `View image ${String(index + 1).padStart(2, '0')}: ${caption || image?.alt || ''}`);
    });

    function updateLightbox() {
      const source = figures[selectedImage]?.querySelector<HTMLImageElement>('img');
      if (!source || !lightboxImage) return;
      lightboxImage.src = source.currentSrc || source.src;
      lightboxImage.alt = source.alt;
      if (lightboxCaption) lightboxCaption.textContent = figures[selectedImage].querySelector('figcaption')?.textContent || '';
      if (lightboxCount) lightboxCount.textContent = `${selectedImage + 1} / ${figures.length}`;
    }

    function selectImage(index: number, focusThumbnail = false) {
      if (!figures.length) return;
      selectedImage = wrap(index, figures.length);
      figures.forEach((figure, position) => { figure.hidden = position !== selectedImage; });
      thumbnails.forEach((thumbnail, position) => {
        if (position === selectedImage) thumbnail.setAttribute('aria-current', 'true');
        else thumbnail.removeAttribute('aria-current');
      });
      if (count) count.textContent = `${String(selectedImage + 1).padStart(2, '0')} / ${String(figures.length).padStart(2, '0')}`;
      if (focusThumbnail) thumbnails[selectedImage]?.focus();
      if (dialog?.open) updateLightbox();
    }

    // Links remain ordinary image/fragment links if scripting or dialog support is absent.
    thumbnails.forEach((thumbnail, index) => {
      thumbnail.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        selectImage(index);
      });
      thumbnail.addEventListener('keydown', event => {
        let target: number | undefined;
        if (event.key === 'ArrowRight') target = index + 1;
        if (event.key === 'ArrowLeft') target = index - 1;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = figures.length - 1;
        if (target !== undefined) { event.preventDefault(); selectImage(target, true); }
      });
    });
    root.querySelector('[data-explorer-previous]')?.addEventListener('click', () => selectImage(selectedImage - 1));
    root.querySelector('[data-explorer-next]')?.addEventListener('click', () => selectImage(selectedImage + 1));

    if (dialog && typeof dialog.showModal === 'function') {
      root.querySelectorAll<HTMLAnchorElement>('[data-explorer-open]').forEach((link, index) => {
        link.addEventListener('click', event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          selectImage(index);
          updateLightbox();
          lightboxOpener = link;
          dialog.showModal();
        });
      });
      root.querySelector('[data-explorer-lightbox-previous]')?.addEventListener('click', () => selectImage(selectedImage - 1));
      root.querySelector('[data-explorer-lightbox-next]')?.addEventListener('click', () => selectImage(selectedImage + 1));
      dialog.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); selectImage(selectedImage - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); selectImage(selectedImage + 1); }
      });
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
      });
      dialog.addEventListener('close', () => {
        // Image navigation may hide the original opener; return focus to the visible image.
        const currentLink = figures[selectedImage]?.querySelector<HTMLAnchorElement>('[data-explorer-open]');
        (currentLink || lightboxOpener)?.focus({ preventScroll: true });
        lightboxOpener = null;
      });
    }

    const systemLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-explorer-system-link]'));
    const systemPanels = Array.from(root.querySelectorAll<HTMLElement>('[data-explorer-system-panel]'));
    const descriptions = root.querySelector<HTMLElement>('[data-explorer-system-descriptions]');
    const walkthroughButton = root.querySelector<HTMLButtonElement>('[data-explorer-walkthrough]');
    const walkthroughControls = root.querySelector<HTMLElement>('[data-explorer-walkthrough-controls]');
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let selectedSystem = 0;
    let walkthroughTimer: ReturnType<typeof setInterval> | undefined;
    let systemVisible = true;

    function stopWalkthrough() {
      if (walkthroughTimer !== undefined) clearInterval(walkthroughTimer);
      walkthroughTimer = undefined;
      delete root.dataset.walkthrough;
      walkthroughButton?.setAttribute('aria-pressed', 'false');
      if (walkthroughButton) walkthroughButton.textContent = 'Play walkthrough';
      descriptions?.setAttribute('aria-live', 'polite');
    }

    function selectSystem(index: number) {
      selectedSystem = index;
      systemPanels.forEach((panel, position) => { panel.hidden = position !== index; });
      systemLinks.forEach((link, position) => {
        if (position === index) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }
    systemLinks.forEach((link, index) => {
      link.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        stopWalkthrough();
        selectSystem(index);
      });
      link.addEventListener('keydown', event => {
        let target: number | undefined;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = wrap(index + 1, systemLinks.length);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = wrap(index - 1, systemLinks.length);
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = systemLinks.length - 1;
        if (target !== undefined) {
          event.preventDefault();
          stopWalkthrough();
          selectSystem(target);
          systemLinks[target]?.focus();
        }
      });
    });

    walkthroughButton?.addEventListener('click', () => {
      if (walkthroughTimer !== undefined) { stopWalkthrough(); return; }
      if (motionPreference.matches || document.hidden || !systemVisible || systemPanels.length < 2) return;
      // Automatic steps remain silent; manual selection restores polite announcements.
      descriptions?.setAttribute('aria-live', 'off');
      root.dataset.walkthrough = 'playing';
      walkthroughButton.setAttribute('aria-pressed', 'true');
      walkthroughButton.textContent = 'Pause walkthrough';
      walkthroughTimer = setInterval(() => selectSystem(wrap(selectedSystem + 1, systemPanels.length)), 4000);
    });

    function applyMotionPreference() {
      if (motionPreference.matches) {
        stopWalkthrough();
        if (document.activeElement === walkthroughButton) systemLinks[selectedSystem]?.focus();
      }
      if (walkthroughControls) walkthroughControls.hidden = motionPreference.matches;
    }
    motionPreference.addEventListener('change', applyMotionPreference, { signal: lifecycle.signal });
    applyMotionPreference();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopWalkthrough();
    }, { signal: lifecycle.signal });
    const systemSection = root.querySelector<HTMLElement>('.explorer-system');
    const visibilityObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      systemVisible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.1);
      if (!systemVisible) stopWalkthrough();
    }, { threshold: 0.1 }) : null;
    if (systemSection) visibilityObserver?.observe(systemSection);

    // Respect direct links into the progressively enhanced sections.
    function selectFragment() {
      const fragment = window.location.hash.slice(1);
      const imageIndex = figures.findIndex(figure => figure.id === fragment);
      const systemIndex = systemPanels.findIndex(panel => panel.id === fragment);
      if (imageIndex >= 0) selectImage(imageIndex);
      if (systemIndex >= 0) { stopWalkthrough(); selectSystem(systemIndex); }
    }
    selectImage(0);
    if (systemPanels.length) selectSystem(0);
    selectFragment();
    window.addEventListener('hashchange', selectFragment, { signal: lifecycle.signal });
    root.querySelector<HTMLElement>('[data-explorer-controls]')?.removeAttribute('hidden');
    root.querySelector<HTMLElement>('[data-explorer-system-hint]')?.removeAttribute('hidden');
    if (descriptions) { descriptions.setAttribute('aria-live', 'polite'); descriptions.setAttribute('aria-atomic', 'true'); }
    root.dataset.enhanced = 'true';

    // Native details remain usable without JS; expose all technical content when printed.
    const accordions = Array.from(root.querySelectorAll<HTMLDetailsElement>('details'));
    let printState: boolean[] = [];
    window.addEventListener('beforeprint', () => {
      stopWalkthrough();
      printState = accordions.map(item => item.open);
      accordions.forEach(item => { item.open = true; });
    }, { signal: lifecycle.signal });
    window.addEventListener('afterprint', () => {
      accordions.forEach((item, index) => { item.open = printState[index] ?? item.open; });
    }, { signal: lifecycle.signal });
    document.addEventListener('astro:before-swap', () => {
      stopWalkthrough();
      visibilityObserver?.disconnect();
      lifecycle.abort();
      if (dialog?.open) dialog.close();
    }, { once: true, signal: lifecycle.signal });
  });
}

initializeProjectExplorers();
document.addEventListener('astro:page-load', initializeProjectExplorers);
