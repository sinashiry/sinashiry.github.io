// Editorial completeness only. These checks never validate claims or infer measurements.
// Content-only port of the retired owner-studio checks: no analytics, engagement or collection API.
import fs from 'node:fs/promises';
import path from 'node:path';
const text = value => typeof value === 'string' && value.trim().length > 0;
const list = value => Array.isArray(value) ? value : [];
const na = value => typeof value === 'string' && /^(n\/?a|not applicable)$/i.test(value.trim());
const https = value => typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value.trim());
const check = (id, label, present, path, detail = '', view) => ({ id, label, status: present === null ? 'unknown' : present ? 'complete' : 'missing', path, detail, view });
export function recommendationState(entry = {}) {
  // Relationship labels are prepared templates, not evidence of a submitted recommendation.
  const filled = ['quote', 'name', 'status', 'context', 'organization', 'date', 'url'].some(key => text(entry[key]));
  if (!filled) return 'unused';
  if (![entry.quote, entry.name, entry.status].every(text)) return 'incomplete';
  return entry.approved === 'yes' ? 'approved' : 'permission-needed';
}
export function originalMedia(item = {}) {
  return typeof item.src === 'string' && item.src.startsWith('/assets/projects/') &&
    !/\/(?:concept-cover|generated[^/]*|ai-illustration[^/]*)\.[a-z0-9]+$/i.test(item.src) && item.visualKind !== 'concept' && item.generated !== true &&
    !/AI[- ]generated|generated with AI/i.test(`${item.alt || ''} ${item.caption || ''}`);
}
export function projectHealth(project = {}, index = 0) {
  const base = `projects.${index}.`, images = list(project.galleries).filter(originalMedia);
  const collaborators = list(project.collaborators).some(entry => text(entry.name) && text(entry.role)) || text(project.credit);
  const checks = [
    check('contribution', 'Contribution', text(project.contribution), base + 'contribution'),
    check('problem', 'Problem', text(project.problem), base + 'problem'),
    check('architecture', 'Architecture', list(project.system).some(item => text(item.label) && text(item.description)), base + 'system.0.description'),
    check('decision', 'Engineering decision', text(project.decisionNotes), base + 'decisionNotes'),
    check('validation', 'Validation context', text(project.validationNotes), base + 'validationNotes'),
    check('media', 'Original project images', images.length > 0, base + 'galleries.0.caption', 'Original photographs, interfaces or design records; generated concepts excluded.', 'media'),
    check('video', 'Demonstration video', list(project.videos).some(originalMedia), base + 'videos.0.caption', 'A recording is not proof of measured performance.', 'media'),
    check('collaborators', 'Collaborator credit', collaborators, null, 'Contributor identities and applicability require a maintainer source review. Supply names, roles and permission; attribution is locked to prevent accidental removal.', 'settings'),
    check('measured', 'Measured outcome', text(project.measuredOutcome), base + 'measuredOutcome', 'Supply the measured result, conditions and evidence. Numbers elsewhere are not used.'),
    check('reference', 'Code / external reference', [project.referenceUrl, project.codeUrl, project.externalUrl, ...list(project.links).map(item => item.url)].some(https), base + 'referenceUrl', 'Supply a shareable project-specific HTTPS reference; no repository is inferred.')
  ];
  if (na(project.credit) || na(project.collaborators)) checks.find(item => item.id === 'collaborators').status = 'not-applicable';
  const complete = checks.filter(item => item.status === 'complete').length, notApplicable = checks.filter(item => item.status === 'not-applicable').length;
  return { title: project.title || `Project ${index + 1}`, index, checks, complete, notApplicable, applicable: checks.length - notApplicable };
}
/** resources.cvs: [{target: 'engineering'|'masters', bytes, src}]; resources.papers: published paper entries. Absent means unknown. */
export function portfolioHealth(content = {}, resources = {}) {
  const projects = list(content.projects).map(projectHealth), papers = Array.isArray(resources.papers) ? resources.papers : null;
  const recommendations = list(content.recommendations?.entries).map((entry, index) => ({ index, entry, state: recommendationState(entry) }));
  const approved = recommendations.filter(item => item.state === 'approved');
  const research = content.currentWork?.researchDetails || {}, rbase = 'currentWork.researchDetails.';
  const researchChecks = ['question', 'motivation', 'contribution', 'method', 'platforms', 'results', 'artifactUrl'].map(key => check(key, ({question:'Research question', motivation:'Motivation', contribution:'Research contribution', method:'Methodology', platforms:'Research platform', results:'Supported results', artifactUrl:'Research artifact'})[key], key === 'artifactUrl' ? https(research[key]) : text(research[key]), rbase + key));
  const cvs = Array.isArray(resources.cvs) ? resources.cvs : null;
  const cv = target => cvs === null ? null : cvs.some(item => item.target === target && Number(item.bytes) > 0 && text(item.src));
  const projectCount = id => projects.filter(project => project.checks.find(item => item.id === id)?.status === 'complete').length;
  const all = id => projects.length > 0 && projectCount(id) === projects.length;
  const academic = [
    check('cv', 'Academic CV available', cv('masters'), null, 'Availability does not establish freshness.', 'media'),
    check('education', 'Education', list(content.education).some(item => text(item.degree) && text(item.institution)), 'education.0.degree'),
    check('thesis', 'Thesis', list(content.education).some(item => text(item.thesis)), 'education.0.thesis'),
    check('research', 'Current research details', researchChecks.every(item => item.status === 'complete'), rbase + 'question'),
    check('method', 'Research methodology', text(research.method), rbase + 'method'),
    check('results', 'Research results', text(research.results), rbase + 'results'),
    check('figure', 'Research figure / artifact', https(research.artifactUrl), rbase + 'artifactUrl', 'A supplied artifact link is not a verified research figure.'),
    check('publication', 'Published research paper', papers === null ? null : papers.length > 0, null, 'Separate from the historical technical books.', 'papers'),
    check('profile', 'Academic profile link', list(content.academic?.profiles).some(item => text(item.label) && https(item.url)), 'academic.profiles.0.url'),
    check('recommendation', 'Approved academic recommendation', approved.some(item => /professor|researcher|academic/i.test(item.entry.relationship || '')), 'recommendations.entries.1.quote'),
    check('direction', 'Future research direction', text(content.research?.summary) && list(content.profile?.researchInterests).some(text), 'research.summary')
  ];
  const engineering = [
    check('cv', 'Engineering CV available', cv('engineering'), null, 'Availability does not establish freshness.', 'media'),
    check('experience', 'Professional experience', list(content.experience).some(item => text(item.role) && text(item.organization) && text(item.summary)), 'experience.0.summary'),
    check('flagship', 'Flagship project descriptions', list(content.projects).some(item => item.featured && text(item.problem) && text(item.contribution)), 'projects.0.contribution'),
    ...[['contribution', 'Contribution clarity'], ['architecture', 'Architecture descriptions'], ['media', 'Original project images'], ['measured', 'Measured outcomes'], ['reference', 'Code / external references']].map(([id, label]) => check(id, label, all(id), projects.find(p => p.checks.find(c => c.id === id).status === 'missing')?.checks.find(c => c.id === id).path, `${projectCount(id)} / ${projects.length} projects supplied.`, id === 'media' ? 'media' : undefined)),
    check('recommendation', 'Approved external recommendation', approved.length > 0, 'recommendations.entries.0.quote')
  ];
  const missingDescriptions = list(content.projects).flatMap((p, i) => list(p.galleries).flatMap((image, j) => !text(image.alt) || !text(image.caption) ? [{ title: p.title, path: `projects.${i}.galleries.${j}.${!text(image.alt) ? 'alt' : 'caption'}` }] : []));
  return { projects, academic, engineering, recommendations, researchChecks, projectCount, missingDescriptions, publishedPapers: papers ? papers.length : null, papersMissingLinks: papers ? papers.filter(p => !text(p.doi) && !text(p.link)) : [], researchComplete: researchChecks.every(c => c.status === 'complete') };
}

const cell = value => String(value).replace(/[|<>]/g, c => ({ '|': '\\|', '<': '&lt;', '>': '&gt;' })[c]).replace(/\s+/g, ' ');
const score = checks => `${checks.filter(c => c.status === 'complete').length} / ${checks.filter(c => c.status !== 'not-applicable').length}`;
/** Markdown for the Actions job summary. Counts and content paths only; no recommendation or referee names. */
export function healthMarkdown(health) {
  const gaps = [['Engineering', health.engineering], ['Academic', health.academic]].flatMap(([audience, checks]) => checks.filter(c => c.status !== 'complete').map(c => `- ${audience}: ${c.label} (${c.status})${c.detail ? ` — ${cell(c.detail)}` : ''}${c.path ? ` \`${c.path}\`` : ''}`));
  const states = ['approved', 'permission-needed', 'incomplete', 'unused'].map(state => `${health.recommendations.filter(r => r.state === state).length} ${state.replace('-', ' ')}`);
  return ['### Portfolio health (content only)', '', 'Editorial completeness from the repository content. These checks never validate claims.', '',
    '| Audience | Complete |', '| --- | ---: |', `| Engineering | ${score(health.engineering)} |`, `| Academic | ${score(health.academic)} |`, '',
    ...(gaps.length ? ['<details><summary>Open items</summary>', '', ...gaps, '', '</details>', ''] : []),
    '| Project | Complete |', '| --- | ---: |', ...health.projects.map(p => `| ${cell(p.title)} | ${p.complete} / ${p.applicable} |`), '',
    `Recommendations: ${states.join(', ')}.`, `Published papers: ${health.publishedPapers ?? 'unknown'}${health.papersMissingLinks.length ? ` (${health.papersMissingLinks.length} without a DOI or link)` : ''}.`,
    `Gallery items missing alt text or a caption: ${health.missingDescriptions.length}.`, ''].join('\n');
}

/** Repository resources: the selected CV files and published paper entries (src/content/papers/*.json). */
export async function contentResources(root = process.cwd()) {
  const downloads = await fs.readFile(path.join(root, 'content/cms/downloads.json'), 'utf8').then(JSON.parse, () => null);
  const cvs = downloads && await Promise.all([['engineering', downloads.engineeringCv], ['masters', downloads.academicCv]].map(async ([target, src]) => ({ target, src, bytes: typeof src === 'string' ? await fs.stat(path.join(root, src)).then(s => s.isFile() ? s.size : 0, () => 0) : 0 })));
  const dir = path.join(root, 'src/content/papers'), names = await fs.readdir(dir).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  const papers = (await Promise.all(names.filter(n => n.endsWith('.json')).map(async n => JSON.parse(await fs.readFile(path.join(dir, n), 'utf8'))))).filter(p => p?.visibility === 'published');
  return { cvs, papers };
}

if (import.meta.main) {
  const [flag, mode = 'content-only'] = process.argv.slice(2);
  if ((flag && flag !== '--summary') || mode !== 'content-only') { console.error('Usage: node scripts/portfolio-health.mjs [--summary content-only]'); process.exit(2); }
  const content = JSON.parse(await fs.readFile('src/data/content.json', 'utf8'));
  const markdown = healthMarkdown(portfolioHealth(content, await contentResources()));
  console.log(markdown);
  if (flag && process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}
