/** Optional tab navigation: without JavaScript, both evidence sections remain visible. */
function initializeOpportunityGuides() {
  document.querySelectorAll<HTMLElement>('[data-opportunity-guide]').forEach(root => {
    if (root.dataset.opportunityReady) return;
    const tablist = root.querySelector<HTMLElement>('[data-opportunity-tabs]');
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-opportunity-tab]'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-opportunity-panel]'));
    if (!tablist || tabs.length !== panels.length || !tabs.length) return;
    if (tabs.some(tab => !panels.some(panel => panel.id === tab.getAttribute('aria-controls')))) return;

    function selectTab(index: number, focus = false) {
      tabs.forEach((tab, tabIndex) => {
        const selected = tabIndex === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        const panel = panels.find(candidate => candidate.id === tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      if (focus) tabs[index]?.focus();
    }

    tabs.forEach((tab, index) => {
      const panel = panels.find(candidate => candidate.id === tab.getAttribute('aria-controls'))!;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      tab.addEventListener('click', () => selectTab(index));
      tab.addEventListener('keydown', event => {
        let nextIndex: number;
        switch (event.key) {
          case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break;
          case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break;
          case 'Home': nextIndex = 0; break;
          case 'End': nextIndex = tabs.length - 1; break;
          default: return;
        }
        event.preventDefault();
        selectTab(nextIndex, true);
      });
    });
    selectTab(0);
    root.dataset.opportunityReady = 'true';
    tablist.hidden = false;
  });
}

initializeOpportunityGuides();
document.addEventListener('astro:page-load', initializeOpportunityGuides);
