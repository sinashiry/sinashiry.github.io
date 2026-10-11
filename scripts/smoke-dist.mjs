/** Browser smoke test of the built site: serves dist/ like GitHub Pages and drives every page in headless Chromium.
 * Usage: npm run build && npm run smoke [-- <dir>]. Needs the devDependency @playwright/test and its Chromium. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { legacyStubs, legacyIds, retiredIds } from './legacy-redirects.mjs';

const root = path.resolve(process.argv[2] || process.env.BUILD_OUT_DIR || 'dist');
const MIME = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8', tex: 'text/x-tex; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', woff2: 'font/woff2', webmanifest: 'application/manifest+json' };
const type = file => MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';

/** GitHub Pages behaviour that matters here: directory index, /dir -> /dir/ redirect, 404.html with status 404. */
export function serve(dir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { rel = '/'; }
    const file = path.join(dir, rel), send = (status, f, headers = {}) => { res.writeHead(status, { 'Content-Type': type(f), ...headers }); req.method === 'HEAD' ? res.end() : fs.createReadStream(f).pipe(res); };
    if (!file.startsWith(dir + path.sep) && file !== dir) return send(404, path.join(dir, '404.html'));
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      if (!rel.endsWith('/')) { res.writeHead(301, { Location: rel + '/' + url.search }); return res.end(); }
      if (fs.existsSync(path.join(file, 'index.html'))) return send(200, path.join(file, 'index.html'));
    } else if (stat?.isFile()) return send(200, file, { 'Content-Length': stat.size });
    send(404, path.join(dir, '404.html'));
  });
}

const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), base + e.name + '/') : [base + e.name]);
const routeOf = rel => '/' + rel.replace(/(^|\/)index\.html$/, '$1');

async function main() {
  if (!fs.existsSync(path.join(root, 'index.html'))) throw Error(`${root} has no index.html; run npm run build first.`);
  const server = serve(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const failures = [], log = message => console.log(message), fail = (where, message) => { failures.push(`${where}: ${message}`); console.log(`  FAIL ${where}: ${message}`); };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    let current = '', currentPath = '', expect404 = false;
    const page = await context.newPage();
    await page.exposeFunction('__smokeCsp', violation => fail(current, `CSP violation ${JSON.stringify(violation)}`));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__smokeCsp({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample, line: e.lineNumber })));
    page.on('console', message => {
      const own404 = expect404 && /status of 404/.test(message.text()) && message.location().url.startsWith(origin + currentPath);
      if (message.type() === 'error' && !own404) fail(current, `console error: ${message.text()}`);
    });
    page.on('pageerror', error => fail(current, `page error: ${error.message}`));
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText || '';
      // A navigation or media stream cancelled by the next step is not a broken resource.
      if (request.url().startsWith(origin) && !(failure === 'net::ERR_ABORTED' && (request.resourceType() === 'media' || request.isNavigationRequest()))) fail(current, `request failed ${request.url().slice(origin.length)} ${failure}`);
    });
    page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400 && !(expect404 && response.status() === 404 && response.request().isNavigationRequest())) fail(current, `HTTP ${response.status()} for ${response.url().slice(origin.length)}`); });
    // Only the deliberately missing page and /index.php (served by 404.html, as on GitHub Pages) may answer 404.
    const visit = async (label, url) => { current = label; currentPath = url.split('?')[0]; expect404 = label === 'missing' || url.startsWith('/index.php'); const response = await page.goto(origin + url, { waitUntil: 'load' }); await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); return response; };
    const pathname = () => new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash;

    // Every HTML route; legacy stubs must land on their target.
    const stubs = new Map(legacyStubs().map(s => [s.from, s.to]));
    const routes = walk(root).filter(f => f.endsWith('.html') && f !== '404.html').map(routeOf).sort();
    for (const route of routes) {
      await visit(route, route);
      if (stubs.has(route)) {
        await page.waitForURL(u => u.pathname + u.hash === stubs.get(route), { timeout: 5000 }).catch(() => fail(route, `legacy stub stayed at ${pathname()} instead of ${stubs.get(route)}`));
        continue;
      }
      if (pathname() !== route) fail(route, `unexpected redirect to ${pathname()}`);
      if (await page.evaluate(() => document.documentElement.classList.contains('no-js'))) fail(route, 'scripts did not run (no-js class remains)');
      if (!(await page.locator('main').innerText()).trim()) fail(route, 'main content is empty');
    }
    log(`Visited ${routes.length} HTML routes (${stubs.size} legacy stubs).`);

    // WordPress query links on the homepage and on /index.php (served by 404.html); retired IDs stay put.
    const queries = [['/?p=41', '/resume/'], ['/?page_id=482', '/projects/'], ['/?p=46', '/resume/#honors'], ['/?page_id=847&utm_source=old', '/projects/fire-smoke-vision/'], ['/index.php?p=53', '/contact/'], ['/?attachment_id=372', '/research/#technical-books']];
    for (const [from, to] of queries) {
      await visit(`legacy ${from}`, from);
      await page.waitForURL(u => u.pathname + u.hash === to, { timeout: 5000 }).catch(() => fail(`legacy ${from}`, `stayed at ${pathname()} instead of ${to}`));
    }
    await visit(`retired /?p=${retiredIds[0]}`, `/?p=${retiredIds[0]}`);
    await page.waitForTimeout(300);
    if (new URL(page.url()).pathname !== '/') fail(`retired /?p=${retiredIds[0]}`, `redirected to ${pathname()}`);
    if (Object.keys(legacyIds).length !== 16) fail('legacy map', `expected 16 WordPress IDs, found ${Object.keys(legacyIds).length}`);
    const pdf = await context.request.get(origin + '/wp-content/uploads/2022/12/Sina-Shiri-CV.pdf');
    if (pdf.status() !== 200 || pdf.headers()['content-type'] !== 'application/pdf') fail('legacy CV', `HTTP ${pdf.status()} ${pdf.headers()['content-type']}`);
    const slash = await context.request.get(origin + '/about', { maxRedirects: 0 });
    if (slash.status() !== 301 || slash.headers().location !== '/about/') fail('server', '/about should redirect to /about/');

    // A missing address returns the 404 page with status 404.
    const missing = await visit('missing', '/no-such-page/');
    if (missing.status() !== 404 || !(await page.locator('h1').innerText()).includes('better connection')) fail('missing', `expected the 404 page, got HTTP ${missing.status()}`);
    log('Legacy links, retired IDs and the 404 page checked.');

    // Copy-email button on the contact page.
    await visit('/contact/ copy email', '/contact/');
    const copy = page.locator('[data-copy-email]');
    if (!(await copy.isVisible())) fail('/contact/', 'copy-email button stayed hidden');
    else {
      await copy.click();
      await page.locator('[data-copy-status]').filter({ hasText: /copied/ }).waitFor({ timeout: 3000 }).catch(async () => fail('/contact/', `copy status: ${JSON.stringify(await page.locator('[data-copy-status]').innerText())}`));
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      const email = (await page.locator('.contact-cards-section [data-cv-href="profile.email"]').first().getAttribute('href')).replace(/^mailto:/, '');
      if (clip !== email) fail('/contact/', `clipboard holds ${JSON.stringify(clip)}, expected ${email}`);
    }
    if (await page.locator('a[href^="mailto:"][href*="?subject="]').count() !== 4) fail('/contact/', 'expected 4 topic mailto links');

    // Gallery: type filter, image lightbox, then a video poster in the dialog.
    await visit('/gallery/ filter', '/gallery/');
    const status = page.locator('[data-media-status]'), items = page.locator('[data-media-item]');
    const total = await items.count();
    await page.locator('[data-media-kind="video"]').click();
    const videos = await page.locator('[data-media-item]:visible').count();
    if (!(videos > 0 && videos < total) || !(await status.innerText()).startsWith(`${videos} of ${total}`)) fail('/gallery/', `video filter shows ${videos} of ${total}: ${await status.innerText()}`);
    await page.locator('[data-media-item]:visible [data-media-open]').first().click();
    const dialog = page.locator('[data-media-dialog]');
    if (!(await dialog.evaluate(d => d.open))) fail('/gallery/', 'video dialog did not open');
    else if (!(await page.locator('[data-media-stage] video').count())) fail('/gallery/', 'video was not moved into the dialog');
    await page.keyboard.press('Escape');
    await page.locator('[data-media-kind="image"]').click();
    await page.locator('[data-media-item]:visible [data-media-open]').first().click();
    if (!(await dialog.evaluate(d => d.open)) || !(await page.locator('[data-media-full-image]').getAttribute('src'))) fail('/gallery/', 'image lightbox did not open');
    await page.keyboard.press('Escape');
    if (await dialog.evaluate(d => d.open)) fail('/gallery/', 'Escape did not close the lightbox');

    // Project explorer: image stepping, system panels and the lightbox.
    await visit('/projects/fire-smoke-vision/ explorer', '/projects/fire-smoke-vision/');
    const explorer = page.locator('[data-project-explorer]').first();
    const visibleIndex = () => explorer.locator('[data-explorer-figure]').evaluateAll(f => f.findIndex(x => !x.hidden));
    const before = await visibleIndex();
    await explorer.locator('[data-explorer-next]').click();
    if (await visibleIndex() !== before + 1) fail('/projects/fire-smoke-vision/', `next image did not advance (${before} -> ${await visibleIndex()})`);
    const system = explorer.locator('[data-explorer-system-link]').nth(1);
    if (await system.count()) { await system.click(); if (await explorer.locator('[data-explorer-system-panel]:visible').count() < 1) fail('/projects/fire-smoke-vision/', 'no system panel shown after selecting a block'); }
    await explorer.locator('[data-explorer-figure]:visible [data-explorer-open]').click();
    const lightbox = explorer.locator('[data-explorer-lightbox]');
    if (!(await lightbox.evaluate(d => d.open))) fail('/projects/fire-smoke-vision/', 'lightbox did not open');
    await page.keyboard.press('Escape');

    // GitHub directory: search, kind and sort.
    await visit('/code/ filter', '/code/');
    const repos = page.locator('[data-github-repository]');
    const all = await repos.count();
    await page.locator('[data-github-search]').fill('sinashiry.github.io');
    if (await page.locator('[data-github-repository]:visible').count() !== 1) fail('/code/', `search left ${await page.locator('[data-github-repository]:visible').count()} of ${all} repositories`);
    await page.locator('[data-github-search]').fill('');
    await page.locator('[data-github-kind]').selectOption('fork');
    const forks = await page.locator('[data-github-repository]:visible').count();
    if (forks !== await page.locator('[data-github-repository][data-repo-fork="true"]').count()) fail('/code/', 'fork filter mismatch');
    await page.locator('[data-github-kind]').selectOption('all');
    await page.locator('[data-github-sort]').selectOption('name');
    const names = await page.locator('[data-github-repository]:visible').evaluateAll(r => r.map(x => x.dataset.repoName));
    if (names.length !== all || names.join() !== [...names].sort((a, b) => a.localeCompare(b)).join()) fail('/code/', 'name sort failed');
    log(`Copy email, gallery (${total} items, ${videos} videos), project explorer and GitHub directory (${all} repositories) exercised.`);

    // Mobile menu at phone width.
    await page.setViewportSize({ width: 375, height: 812 });
    await visit('/ mobile menu', '/');
    const toggle = page.locator('.menu-toggle'), nav = page.locator('#main-nav');
    if (!(await toggle.isVisible())) fail('mobile', 'menu toggle is not visible at 375px');
    await toggle.click();
    if (await toggle.getAttribute('aria-expanded') !== 'true' || !(await nav.evaluate(n => n.classList.contains('open'))) || !(await nav.locator('a[href="/contact/"]').isVisible())) fail('mobile', 'menu did not open');
    await page.keyboard.press('Escape');
    if (await toggle.getAttribute('aria-expanded') !== 'false') fail('mobile', 'Escape did not close the menu');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail('mobile', 'horizontal scroll at 375px');
    await context.close();

    // Without JavaScript: content, navigation and email remain usable.
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
    const plain = await noJs.newPage();
    for (const route of ['/', '/contact/', '/gallery/']) {
      current = `no-js ${route}`;
      await plain.goto(origin + route, { waitUntil: 'load' });
      if ((await plain.locator('main').innerText()).trim().length < 200) fail(current, 'main content missing');
      if (!(await plain.locator('#main-nav a[href="/contact/"]').isVisible())) fail(current, 'navigation hidden');
    }
    await plain.goto(origin + '/contact/');
    const mailtos = await plain.locator('main a[href^="mailto:"]:visible').count();
    if (mailtos < 6) fail('no-js /contact/', `only ${mailtos} visible mailto links`);
    await plain.goto(origin + '/gallery/');
    if (await plain.locator('[data-media-item] a[href^="/assets/"]:visible').count() < 100) fail('no-js /gallery/', 'gallery links are not visible');
    await noJs.close();
    log('No-JavaScript checks done for /, /contact/ and /gallery/.');
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) { console.error(`\nSmoke test failed with ${failures.length} problem(s).`); process.exitCode = 1; }
  else log('\nSmoke test passed.');
}

if (import.meta.main) await main().catch(error => { console.error(error); process.exitCode = 1; });
