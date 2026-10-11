import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {renderMarkdown, renderInline} from '../../src/lib/collection-markdown.ts';
import {BODY_LIMIT, ENTRY_LIMIT, RESERVED_SLUGS, blogRobots, buildCollections, collectionSchemas, collectionSitemap, escapeHtml, imageSize, jsonLd, localPdf, papersRobots, paperGroups, paperLinks, paperSchema, postSchema, rasterImage, validHttps, validSlug} from '../../src/lib/collection-rules.ts';

// Isolated public root mirroring the former PHP collection fixtures.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collections-test-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYZYAAAAASUVORK5CYII=', 'base64');
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
for (const dir of ['assets/owner-media/papers', 'downloads']) fs.mkdirSync(path.join(root, dir), {recursive: true});
fs.writeFileSync(path.join(root, 'assets/reviewed.png'), png);
fs.writeFileSync(path.join(root, 'assets/fake.png'), svg);
fs.writeFileSync(path.join(root, 'assets/unsafe.svg'), svg);
fs.symlinkSync(path.join(root, 'assets/reviewed.png'), path.join(root, 'assets/symlink.png'));
fs.writeFileSync(path.join(root, 'downloads/reviewed.pdf'), '%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
fs.writeFileSync(path.join(root, 'assets/owner-media/papers/uploaded-paper.pdf'), '%PDF-1.4\n%%EOF\n');
fs.writeFileSync(path.join(root, 'downloads/not-a.pdf'), 'plain text pretending to be a PDF document');
test.after(() => fs.rmSync(root, {recursive: true, force: true}));

const allowed = src => rasterImage(root, src) !== null;
const {post: postSchemaZod, paper: paperSchemaZod} = collectionSchemas({projects: ['reviewed-case'], publicRoot: root});
const post = {title: '<script>not executable</script> & engineering', date: '2026-10-07', summary: 'A "quoted" summary <tag>', visibility: 'published'};
const paper = {title: 'Verified test paper', authors: 'A. Example; B. Example', year: '2026', venue: 'Test venue', type: 'Preprint', doi: '10.1234/test.1', link: 'https://example.org/paper', status: 'Preprint', visibility: 'published'};
const parsePost = data => postSchemaZod.safeParse(data);
const parsePaper = data => paperSchemaZod.safeParse(data);
const fields = result => result.success ? [] : result.error.issues.map(issue => issue.path.join('.'));
const entry = (id, data, body = 'Body text.') => ({id, data: parsePost(data).data, body});
const posts = n => Array.from({length: n}, (_, i) => entry(`note-${i}`, {...post, title: `Note ${i}`, date: `2026-10-${String(i % 28 + 1).padStart(2, '0')}`}));

test('Markdown escapes HTML and renders only the supported subset', () => {
  const html = renderMarkdown('Literal __COLLECTION_CONTENT__ token.\n\n# A heading\n\n**Bold** and `a < b`.\n\n- One\n- Two\n\n```python\nprint("<script>")\n```\n\n<img src=x onerror=alert(1)>\n\n[Safe](https://example.org/a?b=1&c=2) [Unsafe](javascript:alert(1))');
  assert.ok(html.includes('<p>Literal __COLLECTION_CONTENT__ token.</p>'));
  assert.ok(html.includes('<pre><code>print(&quot;&lt;script&gt;&quot;)</code></pre>'));
  assert.ok(html.includes('<h2>A heading</h2>') && html.includes('<strong>Bold</strong>') && html.includes('<code>a &lt; b</code>'));
  assert.ok(html.includes('<ul><li>One</li><li>Two</li></ul>'));
  assert.ok(!html.includes('<img src=x') && html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('href="javascript:') && html.includes('<a href="https://example.org/a?b=1&amp;c=2" rel="noopener noreferrer">Safe</a>'));
  assert.ok(html.includes('[Unsafe](javascript:alert(1))'));
});

test('Markdown block rules match the PHP renderer', () => {
  assert.equal(renderMarkdown('# One\n## Two\n### Three\n#### Four'), '<h2>One</h2><h3>Two</h3><h4>Three</h4><p>#### Four</p>');
  assert.equal(renderMarkdown('First line\nsecond line\n- item\n* other\nafter'), '<p>First line second line</p><ul><li>item</li><li>other</li></ul><p>after</p>');
  assert.equal(renderMarkdown('```\n<b>open'), '<pre><code>&lt;b&gt;open</code></pre>');
  assert.equal(renderMarkdown('```js\n\n  indented\n```\n**x'), '<pre><code>\n  indented</code></pre><p>**x</p>');
  assert.equal(renderMarkdown("It's \"quoted\" & <b>"), '<p>It&#039;s &quot;quoted&quot; &amp; &lt;b&gt;</p>');
  assert.equal(renderInline('[x](https://user:pass@example.org) [y](https://example.org/a b)'), '[x](https://user:pass@example.org) [y](https://example.org/a b)');
});

test('inline images need a committed raster under /assets/ and meaningful alternative text', () => {
  const html = renderMarkdown('![A reviewed diagram](/assets/reviewed.png)\n\n![Remote image](https://evil.invalid/remote.png)\n\n![Fake image](/assets/fake.png)\n\n![SVG image](/assets/unsafe.svg)\n\n![Symlink](/assets/symlink.png)\n\n![](/assets/reviewed.png)\n\n![..](/assets/reviewed.png)\n\n![Missing file](/assets/missing.png)', allowed);
  assert.equal(html.match(/<img /g).length, 1);
  assert.ok(html.includes('<img class="collection-inline-image" src="/assets/reviewed.png" alt="A reviewed diagram" loading="lazy" decoding="async" />'));
  for (const src of ['https://evil.invalid', '/assets/fake.png"', '/assets/unsafe.svg"', '/assets/symlink.png"']) assert.ok(!html.includes('src="' + src));
});

test('Markdown without a media check never renders images', () => {
  const html = renderMarkdown('![Illustrated diagram](/assets/reviewed.png) ![External](https://evil.invalid/remote.png) ![Unsafe](javascript:alert(1))');
  assert.ok(!html.includes('<img') && html.includes('![Illustrated diagram]'));
});

test('slugs use lowercase words, at most 80 characters, and never reserved routes', () => {
  for (const slug of ['bench-notes', 'a1', 'x'.repeat(80)]) assert.ok(validSlug(slug), slug);
  for (const slug of ['../escape', 'Admin', 'index', 'bad--slug', 'a/b', '', '-lead', 'trail-', 'x'.repeat(81), 'notes.md', ...RESERVED_SLUGS]) assert.ok(!validSlug(slug), slug);
});

test('HTTPS rules reject unsafe, credentialed and malformed links', () => {
  assert.ok(validHttps('https://example.org/a?b=1&c=2') && validHttps('HTTPS://example.org/'));
  for (const url of ['javascript:alert(1)', 'http://example.org', 'https://user:pass@example.org', 'https://user@example.org', 'https:example.org', 'https://exa mple.org', 'https://example.org\\x', 'https://exämple.org', '']) assert.ok(!validHttps(url), url);
});

test('post fields tolerate missing keys and YAML dates, and validate like the PHP module', () => {
  const draft = parsePost({});
  assert.ok(draft.success);
  assert.deepEqual(draft.data, {title: '', date: '', updated: '', summary: '', visibility: 'draft', heroImage: '', heroAlt: '', relatedProject: ''});
  assert.equal(parsePost({...post, date: new Date('2026-10-11'), updated: '2026-10-12'}).data.date, '2026-10-11');
  assert.deepEqual(parsePost({...post, title: '  Trimmed\r\ntitle  '}).data.title, 'Trimmed\ntitle');
  assert.deepEqual(fields(parsePost({visibility: 'published'})), ['title', 'date', 'summary']);
  assert.deepEqual(fields(parsePost({...post, date: '2026-02-30'})), ['date']);
  assert.deepEqual(fields(parsePost({...post, date: '1899-12-31'})), ['date']);
  assert.deepEqual(fields(parsePost({...post, title: 'x'.repeat(221)})), ['title']);
  assert.deepEqual(fields(parsePost({...post, summary: 'bell\x07'})), ['summary']);
  assert.deepEqual(fields(parsePost({...post, visibility: 'public'})), ['visibility']);
  for (const project of ['not-reviewed', '../escape']) assert.deepEqual(fields(parsePost({...post, relatedProject: project})), ['relatedProject']);
  assert.ok(parsePost({...post, relatedProject: 'reviewed-case', heroImage: '/assets/reviewed.png', heroAlt: 'A reviewed diagram'}).success);
  for (const image of ['/assets/fake.png', '/assets/symlink.png', 'https://evil.invalid/remote.png', '/assets/missing.png', '/assets/unsafe.svg', '/assets/../private.png', 'data:image/png;base64,ABC', 'javascript:alert(1)', '/assets/test.png?x=1', '/downloads/reviewed.pdf'])
    assert.deepEqual(fields(parsePost({...post, heroImage: image, heroAlt: 'An actual diagram'})), ['heroImage'], image);
  assert.deepEqual(fields(parsePost({...post, heroImage: '/assets/reviewed.png'})), ['heroAlt']);
  assert.deepEqual(fields(parsePost({...post, heroImage: '/assets/reviewed.png', heroAlt: '...'})), ['heroAlt']);
});

test('paper fields validate links, DOI, PDFs and featured state', () => {
  const parsed = parsePaper({...paper, year: 2026, featured: 'yes'});
  assert.ok(parsed.success);
  assert.equal(parsed.data.year, '2026');
  assert.equal(parsed.data.featured, true);
  assert.equal(parsePaper(paper).data.featured, false);
  assert.deepEqual(fields(parsePaper({visibility: 'published'})), ['title', 'authors', 'year', 'type', 'status']);
  assert.ok(parsePaper({}).success);
  assert.deepEqual(fields(parsePaper({...paper, link: 'javascript:alert(1)'})), ['link']);
  assert.deepEqual(fields(parsePaper({...paper, link: 'https://user:pass@example.org'})), ['link']);
  assert.deepEqual(fields(parsePaper({...paper, code: 'http://example.org/source'})), ['code']);
  assert.deepEqual(fields(parsePaper({...paper, doi: 'bad'})), ['doi']);
  assert.deepEqual(fields(parsePaper({...paper, doi: 'https://doi.org/10.1234/x'})), ['doi']);
  assert.deepEqual(fields(parsePaper({...paper, year: '26'})), ['year']);
  assert.deepEqual(fields(parsePaper({...paper, featured: 'true'})), ['featured']);
  for (const pdf of ['javascript:alert(1)', 'https://user:pass@example.org/p.pdf', '/downloads/arbitrary.pdf', '/downloads/../private.pdf', '/assets/unsafe.svg', '/downloads/not-a.pdf', '/assets/reviewed.png'])
    assert.deepEqual(fields(parsePaper({...paper, pdf})), ['pdf'], pdf);
  for (const pdf of ['/downloads/reviewed.pdf', '/assets/owner-media/papers/uploaded-paper.pdf', 'https://example.org/paper.pdf']) assert.ok(parsePaper({...paper, pdf}).success, pdf);
  assert.ok(localPdf(root, '/downloads/reviewed.pdf') && !localPdf(root, '/downloads/not-a.pdf'));
});

test('drafts and archived entries saved in the CMS never fail validation on content rules', () => {
  const unfinishedPost = {heroImage: '/assets/reviewed.png', heroAlt: '', relatedProject: 'retired-case'};
  for (const visibility of ['draft', 'archived']) {
    assert.ok(parsePost({...post, ...unfinishedPost, visibility}).success, visibility);
    assert.ok(parsePost({...post, heroImage: '/assets/missing.png', heroAlt: 'A diagram', visibility}).success, visibility);
  }
  assert.deepEqual(fields(parsePost({...post, ...unfinishedPost})), ['relatedProject', 'heroAlt']);
  const unfinishedPaper = {year: '2150', doi: 'bad', link: 'https://example.org/papers/café', code: 'http://example.org/source', pdf: '/downloads/missing.pdf', relatedProject: 'retired-case'};
  assert.ok(parsePaper({...paper, ...unfinishedPaper, visibility: 'draft'}).success);
  assert.ok(parsePaper({...paper, ...unfinishedPaper, visibility: 'archived'}).success);
  assert.deepEqual(fields(parsePaper({...paper, ...unfinishedPaper})), ['year', 'doi', 'link', 'code', 'pdf', 'relatedProject']);
  // Lengths and control characters are checked for every entry, as the CMS does on save.
  assert.deepEqual(fields(parsePaper({...paper, doi: '10.1234/' + 'x'.repeat(200), visibility: 'draft'})), ['doi']);
  assert.deepEqual(fields(parsePost({...post, summary: 'bell\x07', visibility: 'draft'})), ['summary']);
});

test('only published files render; invalid addresses, long bodies and the entry cap stop the build', () => {
  const result = buildCollections([entry('older', {...post, date: '2026-01-01'}), entry('newer', post), entry('draft-note', {...post, visibility: 'draft'}), entry('archived-note', {...post, visibility: 'archived'})], []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.posts.map(p => p.slug), ['newer', 'older']);
  assert.ok(buildCollections([entry('Admin', {...post, visibility: 'draft'})], []).warnings.length === 1);
  for (const id of ['admin', 'Bench-Notes', 'bad--slug']) assert.equal(buildCollections([entry(id, post)], []).errors.length, 1, id);
  assert.equal(buildCollections([entry('empty', post, '')], []).errors.length, 1);
  assert.equal(buildCollections([entry('long', post, 'x'.repeat(BODY_LIMIT + 1))], []).errors.length, 1);
  const longDraft = buildCollections([entry('long', {...post, visibility: 'draft'}, 'x'.repeat(BODY_LIMIT + 1) + '\x07')], []);
  assert.deepEqual([longDraft.errors.length, longDraft.warnings.length], [0, 2], 'an over-long draft only warns');
  // The limit counts characters, as the Pages CMS maxlength does: a full-length Persian or accented article fits.
  for (const char of ['é', 'س', '\u200c']) assert.equal(buildCollections([entry('fits', post, char.repeat(BODY_LIMIT))], []).errors.length, 0, char);
  assert.equal(buildCollections(posts(ENTRY_LIMIT), []).errors.length, 0);
  assert.match(buildCollections(posts(ENTRY_LIMIT), [{id: 'extra', data: parsePaper(paper).data}]).errors[0], /limited to 200/);
  const hero = buildCollections([entry('visual', {...post, heroImage: '/assets/reviewed.png', heroAlt: 'A diagram'})], [], {publicRoot: root}).posts[0];
  assert.deepEqual([hero.heroWidth, hero.heroHeight], [1, 1]);
});

test('published references are re-checked on every build, even when Astro reuses cached entries', () => {
  const cachedPost = {...parsePost(post).data, heroImage: '/assets/removed.png', heroAlt: 'A diagram', relatedProject: 'retired-case'};
  const cachedPaper = {...parsePaper(paper).data, pdf: '/downloads/removed.pdf', relatedProject: 'retired-case'};
  const result = buildCollections([{id: 'stale', data: cachedPost, body: 'Body.'}], [{id: 'paper', data: cachedPaper}], {publicRoot: root, projects: ['reviewed-case']});
  assert.equal(result.errors.length, 4);
  assert.deepEqual(buildCollections([{id: 'stale', data: {...cachedPost, visibility: 'draft'}, body: 'Body.'}], [{id: 'paper', data: {...cachedPaper, visibility: 'archived'}}], {publicRoot: root, projects: ['reviewed-case']}).errors, []);
});

test('blog and publications thresholds at 2/3 posts and 0/1 papers', () => {
  const two = buildCollections(posts(2), []).posts, three = buildCollections(posts(3), []).posts;
  assert.equal(blogRobots(two.length), 'noindex,follow');
  assert.equal(blogRobots(three.length), undefined);
  assert.equal(papersRobots(0), 'noindex,follow');
  assert.equal(papersRobots(1), undefined);
  assert.ok(!collectionSitemap(two, 0).includes('/blog/</loc>'));
  assert.ok(collectionSitemap(three, 0).includes('<url><loc>https://sina-shiri.com/blog/</loc></url>'));
  assert.ok(!collectionSitemap(two, 0).includes('/publications/'));
  assert.ok(collectionSitemap(two, 1).includes('<url><loc>https://sina-shiri.com/publications/</loc></url>'));
  const papers = buildCollections([], [{id: 'p', data: parsePaper(paper).data}, {id: 'd', data: parsePaper({...paper, visibility: 'draft'}).data}]).papers;
  assert.equal(papers.length, 1);
});

test('collection sitemap matches the live empty file and lists every published article', () => {
  assert.equal(collectionSitemap([], 0), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  const listed = buildCollections([entry('bench-notes', {...post, updated: '2026-10-09'}), entry('first-note', post), entry('hidden', {...post, visibility: 'archived'})], []).posts;
  const xml = collectionSitemap(listed, 0);
  assert.ok(xml.includes('<url><loc>https://sina-shiri.com/blog/bench-notes/</loc><lastmod>2026-10-09</lastmod></url>'));
  assert.ok(xml.includes('<url><loc>https://sina-shiri.com/blog/first-note/</loc><lastmod>2026-10-07</lastmod></url>'));
  assert.ok(!xml.includes('hidden') && !xml.includes('/blog/</loc>'));
});

test('structured data is inert and preprints never claim publication', () => {
  const article = buildCollections([entry('bench-notes', {...post, heroImage: '/assets/reviewed.png', heroAlt: 'A diagram'})], [], {publicRoot: root}).posts[0];
  const json = jsonLd(postSchema(article));
  assert.ok(json.includes('"@type":"BlogPosting"') && json.includes('\\u003Cscript\\u003E') && !json.includes('<'));
  assert.ok(json.includes('"dateModified":"2026-10-07"') && json.includes('"image":"https://sina-shiri.com/assets/reviewed.png"'));
  assert.deepEqual(JSON.parse(json).headline, post.title);
  const preprint = {...parsePaper(paper).data, id: 'p'};
  assert.ok(!('datePublished' in paperSchema(preprint)));
  assert.equal(paperSchema({...preprint, status: ' Published '}).datePublished, '2026');
  assert.equal(escapeHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#039;&amp;');
});

test('papers group and sort like the PHP renderer', () => {
  const make = (id, data) => ({id, data: parsePaper({...paper, ...data}).data});
  const {papers} = buildCollections([], [make('old', {title: 'B', year: '2020', status: 'Published', type: 'Journal'}), make('new', {title: 'C', year: '2025', status: 'Accepted', type: 'Journal'}), make('pre', {title: 'A', type: 'Preprint'}), make('star', {title: 'Z', year: '2019', status: 'Other', type: 'Talk', featured: true}), make('review', {title: 'D', status: 'Under review', type: 'Journal'})]);
  assert.deepEqual(papers.map(p => p.id), ['star', 'pre', 'review', 'new', 'old']);
  assert.deepEqual(paperGroups(papers).map(g => [g.name, g.papers.map(p => p.id)]), [['Published & accepted work', ['new', 'old']], ['Preprints & manuscripts', ['pre', 'review']], ['Other listed work', ['star']]]);
  const links = paperLinks({...papers[0], doi: '10.1234/a b(c)', code: 'https://example.org/source', pdf: '/downloads/reviewed.pdf', relatedProject: 'reviewed-case'});
  assert.deepEqual(links.map(l => l.href), ['https://doi.org/10.1234/a%20b%28c%29', 'https://example.org/paper', 'https://example.org/source', '/downloads/reviewed.pdf', '/projects/reviewed-case/']);
  assert.ok(links.at(-1).related);
});

test('image dimensions come from content for PNG, JPEG and WebP', () => {
  assert.deepEqual(imageSize(png), {width: 1, height: 1});
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc4, 0, 2, 0xff, 0xc0, 0, 11, 8, 0x02, 0x1c, 0x03, 0x20, 1, 1, 0x11, 0, 0xff, 0xd9]);
  assert.deepEqual(imageSize(jpeg), {width: 800, height: 540});
  const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8X'), Buffer.from([10, 0, 0, 0, 0, 0, 0, 0, 0x7f, 0x02, 0, 0x67, 0x01, 0])]);
  assert.deepEqual(imageSize(webp), {width: 640, height: 360});
  assert.equal(imageSize(Buffer.from(svg)), null);
});
