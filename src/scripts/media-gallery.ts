/** Filter the static gallery and enlarge existing media without cloning video players. */
function initializeMediaGallery() {
  document.querySelectorAll<HTMLElement>('[data-media-gallery]').forEach(root => {
    if (root.dataset.mediaReady) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-media-item]'));
    const toolbar = root.querySelector<HTMLElement>('[data-media-toolbar]');
    const typeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-media-kind]'));
    const projectSelect = root.querySelector<HTMLSelectElement>('[data-media-project]');
    const status = root.querySelector<HTMLElement>('[data-media-status]');
    const empty = root.querySelector<HTMLElement>('[data-media-empty]');
    if (!toolbar || !projectSelect || !status || !empty) return;
    root.dataset.mediaReady = 'true';
    const lifecycle = new AbortController();
    const signal = lifecycle.signal;
    let selectedKind = 'all';
    let visibleItems = items;
    const projectNames = new Map<string, string>();
    root.querySelectorAll<HTMLElement>('[data-media-project-name]').forEach(link => {
      projectNames.set(link.dataset.mediaProjectName || '', link.textContent?.trim() || 'Project');
    });
    const belongsTo = (item: HTMLElement, project: string) => project === 'all' || (item.dataset.projects || '').split(' ').includes(project);
    const matchesKind = (item: HTMLElement) => selectedKind === 'all' || item.dataset.kind === selectedKind;

    function filterItems() {
      const project = projectSelect!.value;
      visibleItems = items.filter(item => belongsTo(item, project) && matchesKind(item));
      const visible = new Set(visibleItems);
      items.forEach(item => { item.hidden = !visible.has(item); });
      typeButtons.forEach(button => {
        const type = button.dataset.mediaKind;
        button.setAttribute('aria-pressed', String(type === selectedKind));
        const count = items.filter(item => belongsTo(item, project) && (type === 'all' || item.dataset.kind === type)).length;
        const label = button.querySelector('[data-media-kind-count]');
        if (label) label.textContent = String(count);
      });
      Array.from(projectSelect!.options).forEach(option => {
        const count = items.filter(item => belongsTo(item, option.value) && matchesKind(item)).length;
        option.textContent = `${option.value === 'all' ? 'All projects' : projectNames.get(option.value) || 'Project'} (${count})`;
      });
      const projectLabel = project === 'all' ? 'all projects' : projectNames.get(project) || 'this project';
      status!.textContent = `${visibleItems.length} of ${items.length} items · ${projectLabel}`;
      empty!.hidden = visibleItems.length > 0;
    }
    typeButtons.forEach(button => button.addEventListener('click', () => {
      selectedKind = button.dataset.mediaKind || 'all';
      filterItems();
    }, { signal }));
    projectSelect.addEventListener('change', filterItems, { signal });
    root.querySelector('[data-media-reset]')?.addEventListener('click', () => {
      selectedKind = 'all';projectSelect!.value = 'all';filterItems();typeButtons[0]?.focus();
    }, { signal });
    filterItems();toolbar.hidden = false;

    const dialog = root.querySelector<HTMLDialogElement>('[data-media-dialog]');
    const bank = root.querySelector<HTMLElement>('[data-media-video-bank]');
    const stage = root.querySelector<HTMLElement>('[data-media-stage]');
    const image = root.querySelector<HTMLImageElement>('[data-media-full-image]');
    const title = root.querySelector<HTMLElement>('[data-media-dialog-title]');
    const label = root.querySelector<HTMLElement>('[data-media-dialog-label]');
    const caption = root.querySelector<HTMLElement>('[data-media-dialog-caption]');
    const projectLink = root.querySelector<HTMLAnchorElement>('[data-media-dialog-project]');
    const position = root.querySelector<HTMLElement>('[data-media-position]');
    const previous = root.querySelector<HTMLButtonElement>('[data-media-previous]');
    const next = root.querySelector<HTMLButtonElement>('[data-media-next]');
    let currentIndex = 0;
    let opener: HTMLAnchorElement | undefined;
    let activeVideo: HTMLVideoElement | undefined;
    let videoLabel: string | null = null;
    function returnVideo() {
      if (!activeVideo || !bank) return;
      activeVideo.pause();activeVideo.removeAttribute('poster');
      if (videoLabel) activeVideo.setAttribute('aria-labelledby', videoLabel);
      else activeVideo.removeAttribute('aria-labelledby');
      bank.append(activeVideo);activeVideo = undefined;
    }
    function showItem(index: number) {
      if (!dialog || !stage || !image || !title || !caption || !projectLink || !label || !position || !visibleItems.length) return;
      returnVideo();
      currentIndex = (index + visibleItems.length) % visibleItems.length;
      const item = visibleItems[currentIndex];
      const link = item.querySelector<HTMLAnchorElement>('[data-media-open]');
      if (!link) return;
      const sourceImage = item.querySelector<HTMLImageElement>('img');
      const sourceProject = item.querySelector<HTMLAnchorElement>('[data-media-project-name]');
      title.textContent = item.querySelector('[data-media-title]')?.textContent?.trim() || sourceProject?.textContent?.trim() || 'Project gallery';
      label.textContent = item.querySelector('[data-media-label]')?.textContent || 'Project image';
      caption.textContent = item.querySelector('[data-media-caption]')?.textContent || '';
      projectLink.href = sourceProject?.href || '/projects/';
      position.textContent = `${currentIndex + 1} / ${visibleItems.length}`;
      if (previous) previous.disabled = visibleItems.length < 2;
      if (next) next.disabled = visibleItems.length < 2;
      if (item.dataset.kind === 'video') {
        image.hidden = true;image.removeAttribute('src');
        const videoId = link.dataset.mediaVideoId;
        const video = videoId ? document.getElementById(videoId) : null;
        if (video instanceof HTMLVideoElement) {
          activeVideo = video;videoLabel = video.getAttribute('aria-labelledby');
          video.setAttribute('aria-labelledby', 'media-dialog-title');
          if (link.dataset.mediaPoster) video.poster = link.dataset.mediaPoster;
          stage.append(video);
        }
      } else {
        image.src = link.href;image.alt = sourceImage?.alt || '';
        image.hidden = false;
      }
    }
    if (dialog && typeof dialog.showModal === 'function' && bank && stage && image) {
      items.forEach(item => {
        const link = item.querySelector<HTMLAnchorElement>('[data-media-open]');
        link?.addEventListener('click', event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const index = visibleItems.indexOf(item);
          if (index < 0) return;
          event.preventDefault();opener = link;showItem(index);dialog.showModal();
        }, { signal });
      });
      previous?.addEventListener('click', () => showItem(currentIndex - 1), { signal });
      next?.addEventListener('click', () => showItem(currentIndex + 1), { signal });
      dialog.addEventListener('keydown', event => {
        // Leave native video seeking and volume shortcuts with its own controls.
        if (event.target instanceof HTMLVideoElement || (event.target instanceof Element && event.target.closest('video'))) return;
        if (event.key === 'ArrowLeft') { event.preventDefault();showItem(currentIndex - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault();showItem(currentIndex + 1); }
        if (event.key === 'Home') { event.preventDefault();showItem(0); }
        if (event.key === 'End') { event.preventDefault();showItem(visibleItems.length - 1); }
      }, { signal });
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }, { signal });
      dialog.addEventListener('close', () => { returnVideo();image.removeAttribute('src');image.hidden = true;opener?.focus({ preventScroll: true }); }, { signal });
    }
    document.addEventListener('astro:before-swap', () => { returnVideo();if (dialog?.open) dialog.close();lifecycle.abort(); }, { once: true, signal });
    window.addEventListener('pagehide', () => { returnVideo();if (dialog?.open) dialog.close(); }, { signal });
  });
}
initializeMediaGallery();
document.addEventListener('astro:page-load', initializeMediaGallery);
