import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectHealth, portfolioHealth, recommendationState, originalMedia, healthMarkdown, contentResources } from '../portfolio-health.mjs';

test('measurements use the explicit outcome field, not numbers in other claims', () => {
  const project = { problem: '40 channels at 100 MHz', result: '99% reliability', measuredOutcome: '' };
  assert.equal(projectHealth(project).checks.find(c => c.id === 'measured').status, 'missing');
  project.measuredOutcome = 'A supplied benchmark, with conditions and evidence';
  assert.equal(projectHealth(project).checks.find(c => c.id === 'measured').status, 'complete');
});
test('missing collaborators differ from an explicit N/A declaration', () => {
  const absent = projectHealth({ collaborators: [], credit: '' });
  const declared = projectHealth({ collaborators: [], credit: 'N/A' });
  assert.equal(absent.checks.find(c => c.id === 'collaborators').status, 'missing');
  assert.equal(declared.checks.find(c => c.id === 'collaborators').status, 'not-applicable');
  assert.equal(declared.applicable, 9);
  assert.equal(projectHealth({ collaborators: [{ name: 'Real name', role: 'Hardware' }] }).checks.find(c => c.id === 'collaborators').status, 'complete');
});
test('only original project assets count, never generated concept covers', () => {
  assert.equal(originalMedia({ src: '/assets/projects/case/concept-cover.webp' }), false);
  assert.equal(originalMedia({ src: '/assets/illustrations/case.webp' }), false);
  assert.equal(originalMedia({ src: '/assets/projects/case/photo.jpg', caption: 'Generated with AI' }), false);
  assert.equal(originalMedia({ src: '/assets/projects/case/board.jpg' }), true);
  assert.equal(originalMedia({ src: '/assets/projects/case/main-concept.png', caption: 'Original system concept diagram' }), true);
  assert.equal(projectHealth({ galleries: [{ src: '/assets/projects/case/concept-cover.webp' }] }).checks.find(c => c.id === 'media').status, 'missing');
});
test('template relationships alone are unused, approval is explicit and complete attribution is required', () => {
  assert.equal(recommendationState({ relationship: 'Professor', approved: 'no' }), 'unused');
  assert.equal(recommendationState({ quote: 'A supplied quote', approved: 'yes' }), 'incomplete');
  const entry = { quote: 'A supplied quote', name: 'A real person', status: 'Researcher' };
  assert.equal(recommendationState(entry), 'permission-needed');
  assert.equal(recommendationState({ ...entry, approved: 'yes' }), 'approved');
  assert.equal(recommendationState({ ...entry, approved: true }), 'permission-needed');
});
test('published papers count, never the historical books', () => {
  const content = { publications: [{ title: 'Historical book' }] };
  const health = portfolioHealth(content, { papers: [{ title: 'Paper', doi: '10.1000/y' }, { title: 'Preprint' }] });
  assert.equal(health.publishedPapers, 2);
  assert.equal(health.papersMissingLinks.length, 1);
  assert.equal(health.academic.find(c => c.id === 'publication').status, 'complete');
  assert.equal(portfolioHealth(content, { papers: [] }).academic.find(c => c.id === 'publication').status, 'missing');
});
test('unretrieved CV and paper state stays unknown, not fabricated zero', () => {
  const health = portfolioHealth({});
  assert.equal(health.publishedPapers, null);
  assert.equal(health.academic.find(c => c.id === 'cv').status, 'unknown');
  assert.equal(health.academic.find(c => c.id === 'publication').status, 'unknown');
  const loaded = portfolioHealth({}, { cvs: [{ target: 'masters', bytes: 32, src: 'content/uploads/cv/masters.pdf' }, { target: 'engineering', bytes: 0, src: 'content/uploads/cv/missing.pdf' }], papers: [] });
  assert.equal(loaded.academic.find(c => c.id === 'cv').status, 'complete');
  assert.equal(loaded.engineering.find(c => c.id === 'cv').status, 'missing');
});
test('independent research status alone is not complete research', () => {
  const health = portfolioHealth({ currentWork: { researchDetails: { status: 'Independent research' } } });
  assert.equal(health.researchComplete, false);
  assert.equal(health.researchChecks.filter(c => c.status === 'complete').length, 0);
});
test('project-specific reference must be supplied; generic profile GitHub is insufficient', () => {
  const health = portfolioHealth({ profile: { github: 'https://github.com/user' }, projects: [{}] });
  assert.equal(health.projectCount('reference'), 0);
  assert.equal(projectHealth({ referenceUrl: 'https://github.com/user/repo' }).checks.find(c => c.id === 'reference').status, 'complete');
});
test('repository resources come from the selected CVs and published paper files only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-health-'));
  try {
    assert.deepEqual(await contentResources(root), { cvs: null, papers: [] });
    await fs.mkdir(path.join(root, 'content/cms'), { recursive: true });
    await fs.mkdir(path.join(root, 'content/uploads/cv'), { recursive: true });
    await fs.mkdir(path.join(root, 'src/content/papers'), { recursive: true });
    await fs.writeFile(path.join(root, 'content/uploads/cv/eng.pdf'), '%PDF-1.5 test');
    await fs.writeFile(path.join(root, 'content/cms/downloads.json'), JSON.stringify({ engineeringCv: 'content/uploads/cv/eng.pdf', academicCv: 'content/uploads/cv/absent.pdf' }));
    await fs.writeFile(path.join(root, 'src/content/papers/2026-a.json'), JSON.stringify({ title: 'A', visibility: 'published' }));
    await fs.writeFile(path.join(root, 'src/content/papers/2026-b.json'), JSON.stringify({ title: 'B', visibility: 'draft' }));
    const resources = await contentResources(root);
    assert.deepEqual(resources.cvs.map(cv => [cv.target, cv.bytes > 0]), [['engineering', true], ['masters', false]]);
    assert.deepEqual(resources.papers.map(p => p.title), ['A']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('the job summary escapes owner text and never lists recommendation names', () => {
  const content = { projects: [{ title: 'A | <b>B</b>' }], recommendations: { entries: [{ quote: 'Q', name: 'Private Referee', status: 'S' }] } };
  const markdown = healthMarkdown(portfolioHealth(content));
  assert.match(markdown, /\| A \\\| &lt;b&gt;B&lt;\/b&gt; \| 0 \/ 10 \|/);
  assert.doesNotMatch(markdown, /Private Referee/);
  assert.match(markdown, /1 permission needed/);
});
