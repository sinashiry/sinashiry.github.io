import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {legacyPaths, legacyIds, retiredIds, retiredSlugs, legacyStubs, legacyCvPath, SITE} from '../legacy-redirects.mjs';
import {publicPage, legacyQueryScript, legacyStub, inlineScriptHashes, cspPolicy, withSecurityMeta, securityMetaError, collectionErrors, guardErrors, pdfProblem, injectHead} from '../public-transforms.mjs';
import {preparePages, readCv, CV_TARGETS} from '../prepare-pages.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const sha = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const pdf = (version = '1.7') => Buffer.from(`%PDF-${version}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
const run = (script, url) => { const u = new URL(url, SITE); let target = null; vm.runInNewContext(script, {URLSearchParams, location: {pathname: u.pathname, search: u.search, hash: u.hash, replace: t => { target = t; }}}); return target; };
const inlineScripts = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

/** Real routes from the page sources plus the project slugs (structure.json is committed; content.json is generated). */
async function realRoutes() {
  const content = JSON.parse(await fs.readFile(path.join(repo, 'content/structure.json'), 'utf8').catch(() => fs.readFile(path.join(repo, 'src/data/content.json'), 'utf8')));
  const slugs = content.projects.map(p => p.slug), routes = new Map();
  for (const file of (await fs.readdir(path.join(repo, 'src/pages'), {recursive: true})).filter(f => f.endsWith('.astro'))) {
    const route = '/' + file.split(path.sep).join('/').replace(/\.astro$/, '').replace(/(?:^|\/)index$/, '').replace(/([^/])$/, '$1/');
    if (route.includes('[slug]')) for (const slug of route.startsWith('/projects/') ? slugs : []) routes.set(route.replace('[slug]', slug), file);
    else if (!route.includes('[')) routes.set(route, file);
  }
  return routes;
}

const page = (body, head = '') => `<!DOCTYPE html><html lang="en" class="no-js"><head><meta charset="UTF-8"><title>T</title>${head}<script type="application/ld+json">{"@type":"Person"}</script></head><body><nav id="main-nav"><a href="/publications/" data-collection-nav="paper" hidden>Publications</a><a href="/blog/" data-collection-nav="post" hidden>Blog</a></nav><main>${body}</main><script type="module">document.documentElement.classList.remove(\`no-js\`);</script><script type="module" src="/_astro/site.js"></script></body></html>`;
const robots = '<meta name="robots" content="noindex,follow" data-collection-robots>';
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prepare-pages-'));
  const files = {
    'src/data/content.json': JSON.stringify({profile: {note: ''}, recommendations: {entries: []}, academic: {profiles: [], references: []}, currentWork: {researchDetails: {}}}),
    'src/data/github-repositories.json': JSON.stringify({schema_version: 1, account: 'sinashiry', repositories: [{id: 1, full_name: 'sinashiry/example'}]}),
    'content/cms/downloads.json': JSON.stringify({engineeringCv: 'content/uploads/cv/engineering-2026.pdf', academicCv: 'content/uploads/cv/masters_2026.pdf'}),
    'content/uploads/cv/engineering-2026.pdf': pdf(), 'content/uploads/cv/masters_2026.pdf': pdf('1.5'),
    'dist/index.html': page('<p data-cv-visible="profile.note">private</p><section data-cv-group="recommendations"><h2>Recommendations</h2></section><p>Public</p>'),
    'dist/404.html': page('<h1>Not found</h1>', '<meta name="robots" content="noindex, nofollow">'),
    'dist/blog/index.html': page('<h1>Writing</h1>', robots), 'dist/publications/index.html': page('<h1>Publications</h1>', robots),
    'dist/projects/industrial-data-graph/index.html': page('<h1>DataGraph</h1>'),
    'dist/robots.txt': 'User-agent: *\nAllow: /\n', 'dist/sitemap.xml': `<urlset><url><loc>${SITE}/</loc></url></urlset>`,
    'dist/sitemap-collections.xml': '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    'dist/downloads/Sina_Shiri_Engineering_CV.pdf': pdf('1.4'),
  };
  for (const [rel, body] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(root, rel)), {recursive: true}); await fs.writeFile(path.join(root, rel), body); }
  return root;
}
async function snapshot(dir) { const out = {}; for (const f of (await fs.readdir(dir, {recursive: true})).sort()) { const full = path.join(dir, f); if ((await fs.stat(full)).isFile()) out[f] = (await fs.readFile(full)).toString('base64'); } return out; }
const quiet = {log: () => {}, summary: null};

test('the legacy URL set is the verified WordPress set, with retired entries excluded', () => {
  assert.deepEqual(Object.keys(legacyPaths).map(p => p.split('/').at(-2)).sort(), ['about-e', 'about-me', 'contact-me', 'contacts-e', 'detection-and-tracking-of-moving-objects', 'fire-and-smoke-detector-using-image-processing', 'food-reservation-system', 'haypermarket-callerid', 'home-e', 'honors-e', 'industrial-data-graph', 'my-resume', 'online-voting-system', 'qr-code-reader-and-production-monitoring', 'resume-e', 'standalone-and-network-based-alarm-monitoring', 'standalone-roll-call-system']);
  assert.deepEqual(Object.keys(legacyIds).map(Number), [41, 46, 53, 151, 372, 482, 492, 635, 691, 747, 780, 805, 845, 847, 934, 1433]);
  assert.equal(retiredIds.length, 8); assert.equal(retiredSlugs.length, 8);
  for (const id of retiredIds) assert.equal(legacyIds[id], undefined);
  const stubs = legacyStubs();
  assert.equal(stubs.length, 15);
  assert.equal(stubs.filter(s => s.from.startsWith('/projects/')).length, 7);
  for (const slug of retiredSlugs) assert(!Object.keys(legacyPaths).some(p => p.includes('/' + slug + '/')), slug);
  for (const target of [...Object.values(legacyPaths), ...Object.values(legacyIds)]) assert.match(target, /^\/[a-z0-9/_.#-]*$/i);
});

test('every legacy redirect lands on an existing route and anchor', async () => {
  const routes = await realRoutes(), downloads = new Set(Object.values(CV_TARGETS).flat().map(t => '/' + t));
  for (const target of new Set([...Object.values(legacyPaths), ...Object.values(legacyIds)])) {
    const [route, fragment] = target.split('#');
    assert(routes.has(route) || downloads.has(route), `${target} is not a built route`);
    if (fragment) assert.match(await fs.readFile(path.join(repo, 'src/pages', routes.get(route)), 'utf8'), new RegExp(`id="${fragment}"`), target);
  }
});

test('legacy stubs never collide with real routes', async () => {
  const routes = await realRoutes();
  for (const {from} of legacyStubs()) assert(!routes.has(from), `${from} is a real route`);
  assert(routes.has('/projects/industrial-data-graph/') && !legacyStubs().some(s => s.from === '/projects/industrial-data-graph/'));
});

test('the query hook maps ?p=, ?page_id= and ?attachment_id= and ignores retired or unrelated IDs', () => {
  const script = legacyQueryScript();
  assert.equal(run(script, '/?p=41'), '/resume/');
  assert.equal(run(script, '/?page_id=46#ignored'), '/resume/#honors');
  assert.equal(run(script, '/?utm=x&P=847#gallery'), '/projects/fire-smoke-vision/#gallery');
  assert.equal(run(script, '/index.php?attachment_id=1433'), '/downloads/Sina_Shiri_Engineering_CV.pdf');
  assert.equal(run(script, '/?page_id=934&p=41'), '/resume/');
  for (const url of ['/', '/?p=2', '/?page_id=1527', '/?p=410', '/?q=41', '/projects/?p=41', '/missing/?p=41']) assert.equal(run(script, url), null, url);
});

test('a legacy stub refreshes, canonicalises and script-redirects to its target', () => {
  const html = legacyStub('/resume/#honors');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\/resume\/#honors">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/sina-shiri\.com\/resume\/">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.equal(run(inlineScripts(html)[0], '/honors-e/#x'), '/resume/#honors');
  assert.equal(run(inlineScripts(legacyStub('/contact/'))[0], '/contacts-e/#write'), '/contact/#write');
  assert.throws(() => legacyStub('javascript:alert(1)'), /Invalid legacy target/);
});

test('CSP hashes match the policy the live server enforced and skip external and JSON-LD scripts', () => {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><script type="application/ld+json">{"a":1}</script></head><body><script type="module">document.documentElement.classList.remove(`no-js`);</script><script type="module" src="/_astro/a.js"></script><script>x()\r\n</script></body></html>';
  assert.deepEqual(inlineScriptHashes(html), ["'sha256-+zQHC2YkiB7Weut0yrcePn0tOJ20+Qdkj9sx62V1Ot0='", sha('x()\n')]);
  const secured = withSecurityMeta(html);
  assert(secured.startsWith(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${cspPolicy(inlineScriptHashes(html))}"><meta name="referrer" content="strict-origin-when-cross-origin"><script type="application/ld+json">`));
  assert.equal(securityMetaError(secured), '');
  assert.equal(withSecurityMeta(secured), secured);
  assert.equal(cspPolicy([]), "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  assert.doesNotMatch(cspPolicy([]), /frame-ancestors|report-uri|sandbox/);
  assert.match(securityMetaError(secured.replace('x()', 'y()')), /missing from its policy/);
  assert.match(securityMetaError(html), /no Content-Security-Policy/);
  assert.equal(injectHead('<html><head><title>t</title></head></html>', '<i>'), '<html><head><i><title>t</title></head></html>');
});

test('CSP hashing ignores tag-like text inside attribute values', () => {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta property="og:image:alt" content="<script>x</script>"></head><body><img alt="Diagram of <script> loading order"><script type="module">document.documentElement.classList.remove(`no-js`);</script><!-- <script>commented()</script> --></body></html>';
  assert.deepEqual(inlineScriptHashes(html), ["'sha256-+zQHC2YkiB7Weut0yrcePn0tOJ20+Qdkj9sx62V1Ot0='"]);
  assert.equal(securityMetaError(withSecurityMeta(html)), '');
});

test('public transforms remove empty optional, academic, recommendation and link slots', () => {
  const data = {profile: {headline: 'Ready', note: '  ', github: ''}, academic: {profiles: [{label: 'Scholar', url: 'https://example.org/s'}], references: [{name: 'R', status: 'S', relationship: 'X', approved: 'no'}]}, recommendations: {entries: []}, currentWork: {researchDetails: {}}};
  const html = '<p data-cv-visible="profile.headline" data-cv-visible-state="empty">A</p><div data-cv-visible="profile.note"><b>B</b></div>'
    + '<article data-academic-entry="profile" data-academic-path="academic.profiles.0" data-academic-state="empty">P</article><article data-academic-entry="reference" data-academic-path="academic.references.0" data-academic-state="ready">R</article>'
    + '<div data-academic-fallback="profiles" data-academic-path="academic.profiles" data-academic-state="empty">fallback</div><section data-cv-group="recommendations">G</section>'
    + '<figure data-recommendation-slot="0" data-recommendation-state="empty">Q</figure><a data-cv-url="profile.github" href="">GitHub</a><a href="/x/">keep</a>';
  assert.equal(publicPage(html, data), '<p data-cv-visible="profile.headline" data-cv-visible-state="ready">A</p><article data-academic-entry="profile" data-academic-path="academic.profiles.0" data-academic-state="ready">P</article><a href="/x/">keep</a>');
  assert.throws(() => publicPage('<article data-academic-entry="profile">x</article>', data), /Invalid academic state binding/);
});

test('collection assertions follow sitemap-collections.xml', () => {
  const nav = hidden => `<nav><a href="/publications/" data-collection-nav="paper"${hidden ? ' hidden' : ''}>P</a><a href="/blog/" class="selected" data-collection-nav="post" hidden>B</a></nav>`;
  const empty = '<urlset></urlset>', papers = `<urlset><url><loc>${SITE}/publications/</loc></url></urlset>`;
  const pages = hidden => new Map([['index.html', nav(hidden)], ['blog/index.html', robots + nav(hidden)], ['publications/index.html', (hidden ? robots : '') + nav(hidden)]]);
  assert.deepEqual(collectionErrors(pages(true), empty), []);
  assert.deepEqual(collectionErrors(pages(false), papers), []);
  assert.equal(collectionErrors(pages(false), empty).length, 4);
  assert.match(collectionErrors(new Map([['index.html', '<nav><a href="/blog/">B</a></nav>']]), empty).join(), /lacks the matching data-collection-nav/);
  assert.match(collectionErrors(pages(true), `<urlset><url><loc>${SITE}/blog/a/</loc></url><url><loc>${SITE}/blog/b/</loc></url><url><loc>${SITE}/blog/c/</loc></url></urlset>`).join(), /omits \/blog\/ with 3 published post/);
  assert.match(collectionErrors(new Map(), empty).join(), /no Blog or Publications navigation links/);
});

test('guards enforce size limits, retired-backend text, private identifiers and required files', () => {
  const tokens = new Set([createHash('sha256').update('privateword').digest('hex')]);
  const errors = guardErrors([
    {rel: 'a.html', size: 10, text: '<script>fetch("/API/visit")</script>'}, {rel: 'b.js', size: 10, text: 'x.php'}, {rel: 'c.txt', size: 10, text: 'path /home/someone'},
    {rel: 'd.json', size: 10, text: '"__CV_profile_name__"'}, {rel: 'e.html', size: 10, text: 'see Privateword_backup'}, {rel: 'big.mp4', size: 96 * 2 ** 20},
    {rel: 'admin/index.php', size: 1}, {rel: '.private/x', size: 1}, {rel: 'link', size: 0, symlink: true}, {rel: 'f.html', size: 10, text: 'privatewords are fine'},
    {rel: 'g.html', size: 1, text: '<img alt="x" src="https://cdn.example.org/x.png">'}, {rel: 'h.css', size: 1, text: '@font-face{src:url(//fonts.example.org/x.woff2)}'},
    {rel: 'i.html', size: 1, text: '<link rel="stylesheet" href="https://fonts.example.org/css">'},
    {rel: 'j.html', size: 1, text: '<a href="https://github.com/x">x</a><link rel="canonical" href="https://sina-shiri.com/"><meta property="og:image" content="https://sina-shiri.com/a.webp"><img src="/a.webp" srcset="/a.webp 1x">'},
  ], {required: ['404.html'], tokens});
  for (const expected of [/a\.html contains "\/api\/"/, /b\.js contains "\.php"/, /c\.txt contains "\/home\/"/, /d\.json contains "__CV_"/, /e\.html contains a private/, /big\.mp4 is 96\.0 MiB/, /admin\/index\.php must not be published/, /\.private\/x must not be published/, /link is a symbolic link/, /404\.html is missing/, /g\.html loads a third-party asset \(<img alt="x" src="https:\/\/cdn\.example\.org/, /h\.css loads a third-party/, /i\.html loads a third-party/])
    assert(errors.some(e => expected.test(e)), `${expected} in ${errors.join(' | ')}`);
  assert(!errors.some(e => e.startsWith('f.html') || e.startsWith('j.html')));
  assert.match(guardErrors([{rel: 'a', size: 901 * 2 ** 20}]).join(), /limit is 900 MiB/);
});

test('guards ignore owner text and links but still catch maintainer markup', () => {
  const tokens = new Set([createHash('sha256').update('privateword').digest('hex')]);
  const owner = '<p>Copy it with <code>scp camera.service pi@raspberrypi:/home/pi/</code> and call <code>GET /api/v1/readings</code> from report.php.</p>'
    + '<pre><code>.hero { background: url(https://cdn.example.com/hero.png) }\n@import url(https://fonts.example.org/x.css);</code></pre>'
    + '<a href="https://tches.iacr.org/index.php/TCHES/article/view/12345" rel="noopener noreferrer">Publication link</a><a href="https://jsdp.example.ac.ir/browse.php?a_id=1234">Paper</a>'
    + '<img src="/assets/x.webp" alt="Diagram of <img src=https://cdn.example.org/x.png> and /home/pi/"><a href="/blog/home/">Home notes</a>'
    + '<script type="application/ld+json">{"url":"https://tches.iacr.org/index.php/TCHES/article/view/12345","text":"/home/pi/ and /api/"}</script>';
  assert.deepEqual(guardErrors([{rel: 'blog/pi-notes/index.html', size: 1, text: owner}, {rel: 'publications/index.html', size: 1, text: owner}, {rel: 'sitemap-collections.xml', size: 1, text: '<loc>https://sina-shiri.com/blog/home/</loc>'}], {tokens}), []);
  const cases = [
    ['a.html', '<script src="/api/x"></script>', /a\.html contains "\/api\/"/], ['b.html', '<form action="/contact.php" method="post"></form>', /b\.html contains "\.php"/],
    ['c.html', '<script type="module">fetch("/api/visit")</script>', /c\.html contains "\/api\/"/], ['d.html', '<a href="https://sina-shiri.com/api/visit">x</a>', /d\.html contains "\/api\/"/],
    ['e.html', '<script>const root="/home/runner/work/x";</script>', /e\.html contains "\/home\/"/], ['f.html', '<p>__CV_profile_name__</p>', /f\.html contains "__CV_"/],
    ['g.html', '<p>Logs to /home/pi/x</p><img alt="x" src="https://cdn.example.org/x.png">', /g\.html loads a third-party asset \(<img alt="x" src="https:\/\/cdn\.example\.org/],
    ['h.html', '<style>@import url(https://fonts.example.org/x.css);</style>', /h\.html loads a third-party/], ['i.html', '<div style="background:url(//cdn.example.org/x.png)"></div>', /i\.html loads a third-party/],
    ['j.html', '<link rel="shortcut icon" href="https://cdn.example.org/x.ico">', /j\.html loads a third-party/], ['k.html', '<img src="/a.webp" srcset="/a.webp 1x, https://cdn.example.org/a.webp 2x">', /k\.html loads a third-party/],
    ['_astro/site.js', 'fetch("/api/visit")', /_astro\/site\.js contains "\/api\/"/], ['l.css', '@font-face{src:url(//fonts.example.org/x.woff2)}', /l\.css loads a third-party/],
    ['m.html', '<p>see Privateword_backup</p>', /m\.html contains a private/],
  ];
  for (const [rel, text, expected] of cases) assert.match(guardErrors([{rel, size: 1, text}], {tokens}).join(' | '), expected, rel);
  assert.deepEqual(guardErrors([{rel: 'g.html', size: 1, text: '<p>Logs to /home/pi/x</p><img alt="x" src="https://cdn.example.org/x.png">'}], {tokens}).length, 1);
});

test('CV PDFs must be complete PDFs at a safe path under content/uploads/cv', async t => {
  assert.equal(pdfProblem(pdf()), ''); assert.equal(pdfProblem(pdf('2.0')), '');
  assert.match(pdfProblem(Buffer.from('<html>%%EOF</html>')), /PDF-1\.x/);
  assert.match(pdfProblem(Buffer.concat([pdf(), Buffer.alloc(4096)])), /%%EOF/);
  assert.match(pdfProblem(Buffer.alloc(12 * 2 ** 20 + 1)), /12 MiB/);
  const root = await fixture(); t.after(() => fs.rm(root, {recursive: true, force: true}));
  assert.equal((await readCv(root, 'content/uploads/cv/engineering-2026.pdf', 'engineeringCv')).sha256, createHash('sha256').update(pdf()).digest('hex'));
  for (const bad of ['content/uploads/cv/Engineering.pdf', 'content/uploads/cv/../../dist/x.pdf', '/content/uploads/cv/engineering-2026.pdf', 'public/downloads/a.pdf', 'content/uploads/cv/a.pdf.exe', 42])
    await assert.rejects(readCv(root, bad, 'engineeringCv'), /choose a PDF stored in content\/uploads\/cv/);
  await assert.rejects(readCv(root, 'content/uploads/cv/missing.pdf', 'academicCv'), /missing or is not an ordinary file/);
  await fs.symlink(path.join(root, 'content/uploads/cv/engineering-2026.pdf'), path.join(root, 'content/uploads/cv/link.pdf'));
  await assert.rejects(readCv(root, 'content/uploads/cv/link.pdf', 'academicCv'), /not an ordinary file/);
  await fs.writeFile(path.join(root, 'content/uploads/cv/fake.pdf'), '<html>not a pdf</html>');
  await assert.rejects(readCv(root, 'content/uploads/cv/fake.pdf', 'academicCv'), /does not start with a %PDF/);
});

test('preparePages produces a complete, secured and idempotent Pages build', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const summary = path.join(root, 'summary.md'), result = await preparePages({root, ...quiet, summary});
  const read = rel => fs.readFile(path.join(root, 'dist', rel), 'utf8');
  const repos = JSON.parse(await read('data/github-repositories.json'));
  assert.equal(repos.schema_version, 2); assert.equal(repos.repositories[0].reviewed, false);
  const index = await read('index.html');
  assert(!index.includes('private') && !index.includes('Recommendations') && index.includes('<p>Public</p>'));
  assert.match(index, /^<!DOCTYPE html><html lang="en" class="no-js"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="[^"]+"><meta name="referrer" content="strict-origin-when-cross-origin"><script data-legacy-redirect>/);
  assert((await read('404.html')).includes(`<script data-legacy-redirect>${legacyQueryScript()}</script>`));
  assert(!(await read('blog/index.html')).includes('data-legacy-redirect'));
  assert.equal(result.stubs.length, 15); assert.deepEqual(result.skipped, []);
  for (const {from, to} of legacyStubs()) {
    const html = await read(from.slice(1) + 'index.html');
    assert(html.includes(`url=${to}"`), from); assert.equal(securityMetaError(html), '', from);
  }
  assert.match(await read('projects/industrial-data-graph/index.html'), /<h1>DataGraph<\/h1>/);
  for (const [key, targets] of Object.entries(CV_TARGETS)) for (const target of targets)
    assert.deepEqual(await fs.readFile(path.join(root, 'dist', target)), await fs.readFile(path.join(root, JSON.parse(await fs.readFile(path.join(root, 'content/cms/downloads.json'), 'utf8'))[key])));
  assert(CV_TARGETS.engineeringCv.includes(legacyCvPath));
  const report = await fs.readFile(summary, 'utf8');
  assert(report.includes(createHash('sha256').update(pdf()).digest('hex')) && report.includes(createHash('sha256').update(pdf('1.5')).digest('hex')));
  for (const [rel, html] of Object.entries(await snapshot(path.join(root, 'dist')))) if (rel.endsWith('.html')) assert.equal(securityMetaError(Buffer.from(html, 'base64').toString()), '', rel);
  const first = await snapshot(path.join(root, 'dist'));
  await preparePages({root, ...quiet});
  assert.deepEqual(await snapshot(path.join(root, 'dist')), first);
  await assert.rejects(fs.access(path.join(root, 'dist/CNAME')));
});

test('empty Pages CMS folder placeholders are dropped, other dotfiles still fail', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'dist/assets/owner-media/2026'), {recursive: true});
  await fs.writeFile(path.join(root, 'dist/assets/owner-media/2026/.gitkeep'), '');
  await fs.mkdir(path.join(root, 'dist/assets/owner-media/papers/drafts'), {recursive: true});
  await fs.writeFile(path.join(root, 'dist/assets/owner-media/papers/drafts/.gitkeep'), '');
  await preparePages({root, ...quiet});
  for (const rel of ['assets/owner-media/2026/.gitkeep', 'assets/owner-media/papers/drafts/.gitkeep']) await assert.rejects(fs.access(path.join(root, 'dist', rel)));
  for (const [rel, body] of [['assets/owner-media/2026/.gitkeep', 'not empty'], ['assets/owner-media/.htaccess', '']]) {
    const other = await fixture(); t.after(() => fs.rm(other, {recursive: true, force: true}));
    await fs.mkdir(path.dirname(path.join(other, 'dist', rel)), {recursive: true});
    await fs.writeFile(path.join(other, 'dist', rel), body);
    await assert.rejects(preparePages({root: other, ...quiet}), new RegExp(rel.replace(/[./]/g, '\\$&') + ' must not be published'));
  }
});

test('an existing page is never replaced by a legacy stub', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'dist/about-me'), {recursive: true});
  await fs.writeFile(path.join(root, 'dist/about-me/index.html'), page('<h1>Real page</h1>'));
  const result = await preparePages({root, ...quiet});
  assert.deepEqual(result.skipped, ['/about-me/']);
  assert.match(await fs.readFile(path.join(root, 'dist/about-me/index.html'), 'utf8'), /<h1>Real page<\/h1>/);
});

test('preparePages fails closed on guards, collection drift, missing inputs and unsafe output folders', async t => {
  const cases = [
    [async root => fs.writeFile(path.join(root, 'dist/leak.js'), 'fetch("/api/visit")'), /leak\.js contains "\/api\/"/],
    [async root => fs.rm(path.join(root, 'dist/sitemap-collections.xml')), /sitemap-collections\.xml is missing/],
    [async root => fs.rm(path.join(root, 'dist/404.html')), /404\.html/],
    [async root => fs.writeFile(path.join(root, 'dist/blog/index.html'), page('<h1>Writing</h1>')), /blog\/index\.html is indexable below the publication threshold/],
    [async root => fs.writeFile(path.join(root, 'content/cms/downloads.json'), '{"engineeringCv":"content/uploads/cv/engineering-2026.pdf"}'), /academicCv: choose a PDF/],
    [async root => fs.rm(path.join(root, 'src/data/content.json')), /src\/data\/content\.json is required/],
    [async root => fs.writeFile(path.join(root, 'dist/.nojekyll'), ''), /\.nojekyll must not be published/],
  ];
  for (const [mutate, expected] of cases) {
    const root = await fixture(); t.after(() => fs.rm(root, {recursive: true, force: true}));
    await mutate(root);
    await assert.rejects(preparePages({root, ...quiet}), expected);
  }
  const root = await fixture(); t.after(() => fs.rm(root, {recursive: true, force: true}));
  await assert.rejects(preparePages({root, outDir: '.private/stage', ...quiet}), /Refusing/);
  await assert.rejects(preparePages({root, outDir: '.', ...quiet}), /Refusing/);
});
