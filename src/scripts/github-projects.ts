/** The browser reads only the site's cache. GitHub requests belong to the scheduled repository sync (scripts/sync-github.mjs). */
import { reviewedRepository } from './repository-overrides';
type GitHubRepository = {
  id: number; name: string; url: string; description: string | null;
  primary_language: string | null; languages: { name: string; bytes: number }[];
  languages_complete: boolean; languages_checked_at: string | null;
  topics: string[]; stars: number; forks: number; fork: boolean;
  archived: boolean; disabled: boolean; updated_at: string; pushed_at: string | null;
  license: string | null;
  purpose?: string; relatedProject?: { path: string; label: string } | null; reviewed?: boolean;
};
type GitHubSnapshot = { schema_version: number; account: string; fetched_at: string; repository_count: number; repositories: GitHubRepository[] };
const githubDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const validText = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit;
const validNumber = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value));

function validSnapshot(value: unknown): value is GitHubSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as GitHubSnapshot;
  if (![1, 2].includes(data.schema_version) || data.account !== 'sinashiry' || !validDate(data.fetched_at) || !Array.isArray(data.repositories) || data.repositories.length > 1000 || data.repository_count !== data.repositories.length) return false;
  const ids = new Set<number>();
  return data.repositories.every(repo => {
    if (!repo || typeof repo !== 'object' || !validNumber(repo.id) || ids.has(repo.id)) return false;
    ids.add(repo.id);
    // Old caches are accepted for list facts only; public copy always comes from reviews.
    const review = reviewedRepository(repo);
    if ((data.schema_version === 2 || repo.purpose !== undefined || repo.relatedProject !== undefined || repo.reviewed !== undefined)
      && (repo.description !== review.description || repo.purpose !== review.purpose || repo.reviewed !== review.reviewed || JSON.stringify(repo.relatedProject) !== JSON.stringify(review.relatedProject))) return false;
    return validText(repo.name, 100) && /^[A-Za-z0-9_.-]+$/.test(repo.name) && repo.name !== '.' && repo.name !== '..'
      && repo.url === `https://github.com/sinashiry/${repo.name}`
      && (repo.description === null || validText(repo.description, 10000))
      && (repo.primary_language === null || validText(repo.primary_language, 100))
      && Array.isArray(repo.languages) && repo.languages.length <= 100 && repo.languages.every(language => language && validText(language.name, 100) && validNumber(language.bytes))
      && typeof repo.languages_complete === 'boolean' && (repo.languages_checked_at === null || validDate(repo.languages_checked_at))
      && Array.isArray(repo.topics) && repo.topics.length <= 50 && repo.topics.every(topic => validText(topic, 100))
      && validNumber(repo.stars) && validNumber(repo.forks) && typeof repo.fork === 'boolean'
      && typeof repo.archived === 'boolean' && typeof repo.disabled === 'boolean'
      && validDate(repo.updated_at) && (repo.pushed_at === null || validDate(repo.pushed_at))
      && (repo.license === null || validText(repo.license, 100));
  });
}

function githubElement<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderRepository(repo: GitHubRepository, headingTag: 'h2' | 'h3'): HTMLLIElement {
  const item = githubElement('li', 'github-repository');
  Object.assign(item.dataset, { githubRepository: '', repoName: repo.name, repoFork: String(repo.fork), repoArchived: String(repo.archived), repoStars: String(repo.stars), repoUpdated: repo.updated_at });
  const article = githubElement('article');
  const top = githubElement('div', 'github-repository-top');
  const icon = githubElement('span', 'github-repository-icon', '{ }');icon.setAttribute('aria-hidden', 'true');
  const badges = githubElement('div', 'github-repository-badges');
  ['Public', ...(repo.fork ? ['Fork'] : []), ...(repo.archived ? ['Archived'] : []), ...(repo.disabled ? ['Disabled'] : [])].forEach(label => badges.append(githubElement('span', '', label)));
  top.append(icon, badges);
  const heading = githubElement(headingTag);
  const link = githubElement('a', '', repo.name);link.href = repo.url;link.target = '_blank';link.rel = 'noopener noreferrer';
  const arrow = githubElement('span', 'github-repository-arrow', '↗');arrow.setAttribute('aria-hidden', 'true');
  link.append(arrow);heading.append(link);
  const review = reviewedRepository(repo);
  const description = githubElement('p', 'github-repository-description', review.description);
  const details = githubElement('dl', 'github-repository-details');
  const purpose = githubElement('div');purpose.append(githubElement('dt', '', 'Main purpose'), githubElement('dd', '', review.purpose));details.append(purpose);
  const languages = repo.languages.length ? repo.languages.map(language => language.name) : repo.primary_language ? [repo.primary_language] : [];
  const languageRow = githubElement('div');
  const languageText = githubElement('dd', '', languages.join(' · ') || 'Not specified');languageText.dataset.repoLanguages = '';
  languageRow.append(githubElement('dt', '', repo.languages_complete ? 'Languages' : 'Primary language'), languageText);details.append(languageRow);
  if (repo.license && repo.license !== 'NOASSERTION') {
    const row = githubElement('div');row.append(githubElement('dt', '', 'License'), githubElement('dd', '', repo.license));details.append(row);
  }
  if (review.relatedProject) {
    const row = githubElement('div'), value = githubElement('dd'), project = githubElement('a', '', review.relatedProject.label);
    project.href = review.relatedProject.path;value.append(project);row.append(githubElement('dt', '', 'Case study'), value);details.append(row);
  }
  article.append(top, heading, description, details);
  if (repo.topics.length) {
    const topics = githubElement('ul', 'github-repository-topics');topics.setAttribute('aria-label', 'Repository topics');
    repo.topics.forEach(topic => topics.append(githubElement('li', '', topic)));article.append(topics);
  }
  const footer = githubElement('footer', 'github-repository-footer');
  const counts = githubElement('div');
  const stars = githubElement('span', '', `★ ${repo.stars}`);stars.setAttribute('aria-label', `${repo.stars} stars`);
  counts.append(stars, githubElement('span', '', `${repo.forks} ${repo.forks === 1 ? 'fork' : 'forks'}`));
  const updated = githubElement('span', '', 'Updated ');
  const time = githubElement('time', '', githubDate.format(new Date(repo.updated_at)));time.dateTime = repo.updated_at;updated.append(time);
  footer.append(counts, updated);article.append(footer);item.append(article);
  return item;
}

async function readGitHubCache(signal: AbortSignal): Promise<GitHubSnapshot | undefined> {
  const response = await fetch('/data/github-repositories.json', { credentials: 'omit', mode: 'same-origin', cache: 'no-cache', redirect: 'error', signal });
  if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > 4194304) return;
  const reader = response.body.getReader();const chunks: Uint8Array[] = [];let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();if (done) break;
      size += value.byteLength;if (size > 4194304) { await reader.cancel();return; }chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset);offset += chunk.byteLength; });
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return validSnapshot(data) ? data : undefined;
}

function initializeGitHubProjects() {
  document.querySelectorAll<HTMLElement>('[data-github-projects]').forEach(root => {
    if (root.dataset.githubReady) return;
    const list = root.querySelector<HTMLUListElement>('[data-github-list]');
    const toolbar = root.querySelector<HTMLElement>('[data-github-toolbar]');
    const search = root.querySelector<HTMLInputElement>('[data-github-search]');
    const kind = root.querySelector<HTMLSelectElement>('[data-github-kind]');
    const sort = root.querySelector<HTMLSelectElement>('[data-github-sort]');
    const status = root.querySelector<HTMLElement>('[data-github-status]');
    const empty = root.querySelector<HTMLElement>('[data-github-empty]');
    const synced = root.querySelector<HTMLTimeElement>('[data-github-synced]');
    const fetched = root.querySelector<HTMLElement>('[data-github-fetched]');
    if (!list || !toolbar || !search || !kind || !sort || !status || !empty || !synced || !fetched) return;
    root.dataset.githubReady = 'true';
    const lifecycle = new AbortController();const request = new AbortController();
    const signal = lifecycle.signal;
    let items = Array.from(list.querySelectorAll<HTMLElement>('[data-github-repository]'));
    function filterAndSort() {
      const query = search!.value.trim().toLocaleLowerCase();
      let shown = 0;
      items.sort((left, right) => {
        if (sort!.value === 'name') return (left.dataset.repoName || '').localeCompare(right.dataset.repoName || '');
        const comparison = sort!.value === 'stars' ? Number(right.dataset.repoStars) - Number(left.dataset.repoStars) : (right.dataset.repoUpdated || '').localeCompare(left.dataset.repoUpdated || '');
        return comparison || (left.dataset.repoName || '').localeCompare(right.dataset.repoName || '');
      });
      items.forEach(item => {
        const kindMatches = kind!.value === 'all' || kind!.value === 'source' && item.dataset.repoFork === 'false' || kind!.value === 'fork' && item.dataset.repoFork === 'true' || kind!.value === 'archived' && item.dataset.repoArchived === 'true';
        item.hidden = !kindMatches || !item.textContent?.toLocaleLowerCase().includes(query);
        if (!item.hidden) shown++;
        list!.append(item);
      });
      status!.textContent = shown === items.length ? `${items.length} public repositories` : `${shown} of ${items.length} repositories`;
      empty!.hidden = shown !== 0;
    }
    search.addEventListener('input', filterAndSort, { signal });kind.addEventListener('change', filterAndSort, { signal });sort.addEventListener('change', filterAndSort, { signal });
    toolbar.hidden = false;
    let observer: IntersectionObserver | undefined;
    async function refresh() {
      observer?.disconnect();
      const timeout = window.setTimeout(() => request.abort(), 8000);
      try {
        const latest = await readGitHubCache(request.signal);
        if (!latest || !root.isConnected || latest.fetched_at <= (fetched!.dataset.githubFetched || '')) return;
        const focused = document.activeElement instanceof HTMLAnchorElement && list!.contains(document.activeElement) ? document.activeElement.href : null;
        const fragment = document.createDocumentFragment();
        latest.repositories.forEach(repo => fragment.append(renderRepository(repo, root.dataset.githubCardHeading === 'h2' ? 'h2' : 'h3')));
        list!.replaceChildren(fragment);items = Array.from(list!.querySelectorAll<HTMLElement>('[data-github-repository]'));
        fetched!.dataset.githubFetched = latest.fetched_at;synced!.dateTime = latest.fetched_at;synced!.textContent = githubDate.format(new Date(latest.fetched_at));
        filterAndSort();
        if (focused) Array.from(list!.querySelectorAll('a')).find(link => link.href === focused)?.focus({ preventScroll: true });
      } catch { /* A failed refresh leaves the complete, dated static snapshot intact. */ }
      finally { window.clearTimeout(timeout); }
    }
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void refresh(); }, { rootMargin: '300px' });observer.observe(root);
    } else void refresh();
    document.addEventListener('astro:before-swap', () => { observer?.disconnect();request.abort();lifecycle.abort(); }, { once: true, signal });
    window.addEventListener('pagehide', () => { observer?.disconnect();request.abort(); }, { signal });
  });
}
initializeGitHubProjects();
document.addEventListener('astro:page-load', initializeGitHubProjects);
