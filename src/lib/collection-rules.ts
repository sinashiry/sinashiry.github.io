/** Build-time rules for owner-managed posts and papers; ported from the retired PHP collection module. */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'astro/zod';

export const SITE = 'https://sina-shiri.com';
export const PUBLIC_ROOT = 'public';
/** Blog navigation/indexing needs three published posts; Publications needs one published paper. */
export const THRESHOLD = { post: 3, paper: 1 } as const;
export const ENTRY_LIMIT = 200;
export const BODY_LIMIT = 60000;
export const RESERVED_SLUGS = ['admin','api','assets','blog','publications','index','index-html','page','pages','feed','rss','sitemap','sitemap-xml','tags','categories','new','edit','preview','draft','templates'];
export const VISIBILITY = ['draft','published','archived'] as const;
export type Visibility = typeof VISIBILITY[number];
export type Size = { width: number; height: number };
export type PostData = { title: string; date: string; updated: string; summary: string; visibility: Visibility; heroImage: string; heroAlt: string; relatedProject: string };
export type PaperData = { title: string; authors: string; year: string; type: string; status: string; visibility: Visibility; venue: string; doi: string; link: string; code: string; pdf: string; abstract: string; contribution: string; citation: string; relatedProject: string; featured: boolean };
export type Post = PostData & { slug: string; body: string; heroWidth: number; heroHeight: number };
export type Paper = PaperData & { id: string };
export type Entry<T> = { id: string; data: T; body?: string; filePath?: string };

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ESCAPES[char]);
export const phpTrim = (value: string) => value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
export const byteLength = (value: string) => new TextEncoder().encode(value).length;
export const plainText = (value: string) => value.isWellFormed() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
export const cleanText = (value: string) => phpTrim(value.replace(/\r\n?/g, '\n'));
export const meaningfulAlt = (value: string) => byteLength(phpTrim(value)) >= 3 && /[\p{L}\p{N}]/u.test(value);
export const validSlug = (slug: string) => slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !RESERVED_SLUGS.includes(slug);
export const validYear = (value: string) => /^[0-9]{4}$/.test(value) && +value >= 1900 && +value <= 2100;
export const validDoi = (value: string) => /^10\.[0-9]{4,9}\/[^ <>"\x00-\x1f]+$/.test(value);
export function validDate(value: string) {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [+match[1], +match[2], +match[3]], date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
/** HTTPS only, printable ASCII, no credentials or backslashes (sina_collection_url). */
export function validHttps(value: string) {
  if (!value || value.length > 2048 || !/^[\x21-\x7e]+$/.test(value) || value.includes('\\') || !/^https:\/\//i.test(value)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !!url.hostname; } catch { return false; }
}
/** YAML may turn an unquoted 2026-10-11 into a Date; keep its calendar day. */
export const ymd = (value: Date) => Number.isNaN(value.getTime()) ? 'invalid date' : value.toISOString().slice(0, 10);

/** An ordinary public file below /assets or /downloads with no symlinked component (sina_media_file). */
export function mediaFile(root: string, url: string) {
  if (!/^\/(?:assets|downloads)\/[A-Za-z0-9_./-]+$/.test(url) || /(^|\/)\.{1,2}(\/|$)|\/\//.test(url)) return null;
  let base: string;
  try { base = fs.realpathSync(root); } catch { return null; }
  let file = base;
  try {
    for (const part of url.slice(1).split('/')) { file = path.join(file, part); if (fs.lstatSync(file).isSymbolicLink()) return null; }
    return fs.statSync(file).isFile() && !path.relative(base, file).startsWith('..') ? file : null;
  } catch { return null; }
}
/** Dimensions from PNG, WebP or JPEG content; the file name is never trusted. */
export function imageSize(bytes: Uint8Array): Size | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 24 && ascii(0, 8) === '\x89PNG\r\n\x1a\n' && ascii(12, 16) === 'IHDR') return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const chunk = ascii(12, 16);
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) { const bits = view.getUint32(21, true); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8X') return { width: 1 + (bytes[24] | bytes[25] << 8 | bytes[26] << 16), height: 1 + (bytes[27] | bytes[28] << 8 | bytes[29] << 16) };
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return null;
}
/** A committed JPEG, PNG or WebP under /assets/ within the media size limits; returns its dimensions. */
export function rasterImage(root: string, url: string): Size | null {
  if (!/^\/assets\/[^?#]+\.(?:webp|png|jpe?g)$/i.test(url)) return null;
  const file = mediaFile(root, url);
  if (!file) return null;
  const bytes = fs.readFileSync(file), size = bytes.length >= 12 ? imageSize(bytes) : null;
  return size && size.width >= 1 && size.height >= 1 && size.width <= 12000 && size.height <= 12000 && size.width * size.height <= 48000000 ? size : null;
}
/** A committed PDF under /downloads/ or /assets/owner-media/ with a PDF header and trailer. */
export function localPdf(root: string, url: string) {
  if (!/^\/(?:downloads|assets\/owner-media)\/[^?#]+\.pdf$/i.test(url)) return false;
  const file = mediaFile(root, url);
  if (!file) return false;
  const bytes = fs.readFileSync(file);
  return bytes.length >= 12 && /^%PDF-[12]\.[0-9]/.test(bytes.subarray(0, 1024).toString('latin1')) && bytes.subarray(Math.max(0, bytes.length - 2048)).toString('latin1').includes('%%EOF');
}

const scalar = (value: unknown) => value == null ? '' : typeof value === 'number' ? String(value) : value;
/** Pages CMS omits empty fields, so every text field tolerates a missing key and normalises to ''. */
const text = (max: number) => z.preprocess(scalar, z.string().max(max, `Use at most ${max} characters.`).refine(plainText, 'Remove control characters.').transform(cleanText));
const day = z.preprocess(value => value instanceof Date ? ymd(value) : scalar(value), z.string().transform(cleanText).refine(value => !value || validDate(value), 'Enter a valid YYYY-MM-DD date between 1900 and 2100.'));
const visibility = z.preprocess(value => value ?? 'draft', z.enum(VISIBILITY));
const required = (keys: string[]) => (data: Record<string, unknown>, ctx: z.RefinementCtx) => {
  if (data.visibility === 'published') for (const key of keys) if (!data[key]) ctx.addIssue({ code: 'custom', path: [key], message: `Enter ${key} before publishing.` });
};

/**
 * Zod schemas for the posts and papers collections; `projects` are the reviewed project slugs.
 * Every entry is parsed, whatever its visibility, so field-level rules are only those Pages CMS enforces on save (type,
 * length, control characters). Content rules (media, links, DOI, year, project, image description) apply to published
 * entries only: an unfinished draft saved in the CMS never blocks a deploy.
 */
export function collectionSchemas({ projects, publicRoot = PUBLIC_ROOT }: { projects: string[]; publicRoot?: string }) {
  const check = (data: Record<string, unknown>, ctx: z.RefinementCtx, key: string, ok: (value: string) => boolean, message: string) => {
    const value = data[key] as string;
    if (value && !ok(value)) ctx.addIssue({ code: 'custom', path: [key], message });
  };
  const project = (data: Record<string, unknown>, ctx: z.RefinementCtx) => check(data, ctx, 'relatedProject', value => validSlug(value) && projects.includes(value), 'Choose a reviewed project from the portfolio.');
  const post = z.object({
    title: text(220), date: day, updated: day, summary: text(600), visibility,
    heroImage: text(2048), heroAlt: text(400), relatedProject: text(80),
  }).superRefine((data, ctx) => {
    if (data.visibility !== 'published') return;
    project(data, ctx);
    check(data, ctx, 'heroImage', value => rasterImage(publicRoot, value) !== null, 'Choose a JPEG, PNG or WebP image stored under /assets/.');
    if (data.heroImage && !meaningfulAlt(data.heroAlt)) ctx.addIssue({ code: 'custom', path: ['heroAlt'], message: 'Describe the selected image with meaningful alternative text.' });
    required(['title', 'date', 'summary'])(data, ctx);
  });
  const paper = z.object({
    title: text(300), authors: text(1000), year: text(4),
    type: text(80), status: text(80), visibility, venue: text(300),
    doi: text(200), link: text(2048), code: text(2048), pdf: text(2048),
    abstract: text(10000), contribution: text(3000), citation: text(5000), relatedProject: text(80),
    featured: z.preprocess(value => value === 'yes' ? true : value === 'no' || value == null ? false : value, z.boolean()),
  }).superRefine((data, ctx) => {
    if (data.visibility !== 'published') return;
    check(data, ctx, 'year', validYear, 'Enter a four-digit publication year.');
    check(data, ctx, 'doi', validDoi, 'Enter the DOI identifier, beginning with 10., without a URL prefix.');
    check(data, ctx, 'link', validHttps, 'Use an HTTPS publication link without account credentials.');
    check(data, ctx, 'code', validHttps, 'Use an HTTPS code link without credentials.');
    check(data, ctx, 'pdf', value => validHttps(value) || localPdf(publicRoot, value), 'Use an HTTPS PDF link or a PDF stored under /downloads/ or /assets/owner-media/.');
    project(data, ctx);
    required(['title', 'authors', 'year', 'type', 'status'])(data, ctx);
  });
  return { post, paper };
}

const strcmp = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const comparePosts = (a: Post, b: Post) => strcmp(b.date, a.date) || strcmp(a.title, b.title) || strcmp(a.slug, b.slug);
export const comparePapers = (a: Paper, b: Paper) => Number(b.featured) - Number(a.featured) || strcmp(b.year, a.year) || strcmp(a.title, b.title) || strcmp(a.id, b.id);

/**
 * Validate whole collections and keep published entries only; drafts and archived files never render.
 * Media and project references are checked again here because Astro caches parsed entries by file content.
 */
export function buildCollections(posts: Entry<PostData>[], papers: Entry<PaperData>[], { publicRoot = PUBLIC_ROOT, projects }: { publicRoot?: string; projects?: string[] } = {}) {
  const errors: string[] = [], warnings: string[] = [], total = posts.length + papers.length;
  if (total > ENTRY_LIMIT) errors.push(`Blog posts and papers are limited to ${ENTRY_LIMIT} files together, including archived entries; found ${total}.`);
  const project = (file: string, slug: string) => { if (slug && projects && !projects.includes(slug)) errors.push(`${file}: the related project "${slug}" is no longer in the portfolio.`); };
  const shown: Post[] = [], listed: Paper[] = [];
  for (const { id, data, body: raw = '', filePath } of posts) {
    const file = filePath || `${id}.md`, body = cleanText(raw), problems = data.visibility === 'published' ? errors : warnings;
    // Characters (UTF-16 code units), as the Pages CMS maxlength counts them.
    if (body.length > BODY_LIMIT) problems.push(`${file}: the article is longer than ${BODY_LIMIT} characters.`);
    if (!plainText(raw)) problems.push(`${file}: remove control characters from the article.`);
    if (!validSlug(id)) problems.push(`${file}: "${id}" cannot be a public address. Use lowercase letters, numbers and single hyphens (at most 80 characters, not a reserved word); create a new post to publish under another address.`);
    if (data.visibility !== 'published') continue;
    if (!body) errors.push(`${file}: enter the article before publishing.`);
    const hero = data.heroImage ? rasterImage(publicRoot, data.heroImage) : null;
    if (data.heroImage && !hero) errors.push(`${file}: the image ${data.heroImage} is missing or is not a JPEG, PNG or WebP file.`);
    project(file, data.relatedProject);
    shown.push({ ...data, slug: id, body, heroWidth: hero?.width ?? 0, heroHeight: hero?.height ?? 0 });
  }
  for (const { id, data, filePath } of papers) {
    if (data.visibility !== 'published') continue;
    const file = filePath || `${id}.json`;
    if (data.pdf && !validHttps(data.pdf) && !localPdf(publicRoot, data.pdf)) errors.push(`${file}: the PDF ${data.pdf} is missing or is not a PDF file.`);
    project(file, data.relatedProject);
    listed.push({ ...data, id });
  }
  return { posts: shown.sort(comparePosts), papers: listed.sort(comparePapers), errors, warnings };
}

export const postRoute = (post: Pick<Post, 'slug'>) => `/blog/${post.slug}/`;
export const blogRobots = (posts: number) => posts < THRESHOLD.post ? 'noindex,follow' : undefined;
export const papersRobots = (papers: number) => papers < THRESHOLD.paper ? 'noindex,follow' : undefined;
/** sitemap-collections.xml: indexes only above threshold; every published article with its last change. */
export function collectionSitemap(posts: Post[], paperCount: number) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  if (posts.length >= THRESHOLD.post) xml += `<url><loc>${SITE}/blog/</loc></url>`;
  if (paperCount >= THRESHOLD.paper) xml += `<url><loc>${SITE}/publications/</loc></url>`;
  for (const post of posts) xml += `<url><loc>${escapeHtml(SITE + postRoute(post))}</loc><lastmod>${escapeHtml(post.updated || post.date)}</lastmod></url>`;
  return xml + '</urlset>';
}

/** JSON for an inline ld+json block: no markup-significant characters survive (PHP JSON_HEX_*). */
export const jsonLd = (value: unknown) => JSON.stringify(value).replace(/[<>&']/g, char => '\\u' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
export const rawurlencode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
export const nl2br = (html: string) => html.replace(/\n/g, '<br>\n');
export function postSchema(post: Post) {
  const url = SITE + postRoute(post);
  return { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.summary, datePublished: post.date, dateModified: post.updated || post.date, url, author: { '@type': 'Person', name: 'Sina Shiri', url: SITE + '/' }, ...(post.heroImage ? { image: SITE + post.heroImage } : {}) };
}
export function paperSchema(paper: Paper) {
  return { '@context': 'https://schema.org', '@type': 'CreativeWork', name: paper.title, author: paper.authors, creativeWorkStatus: paper.status,
    ...(paper.status.trim().toLowerCase() === 'published' ? { datePublished: paper.year } : {}), ...(paper.abstract ? { abstract: paper.abstract } : {}), ...(paper.link ? { url: paper.link } : {}) };
}
const GROUP_NAMES = { published: 'Published & accepted work', working: 'Preprints & manuscripts', other: 'Other listed work' };
/** Status/type grouping from the retired PHP collection module: preprints never appear as peer-reviewed work. */
export function paperGroups(papers: Paper[]) {
  const groups: Record<keyof typeof GROUP_NAMES, Paper[]> = { published: [], working: [], other: [] };
  for (const paper of papers) {
    const type = paper.type.trim().toLowerCase(), status = paper.status.trim().toLowerCase();
    groups[['preprint', 'manuscript'].includes(type) || ['preprint', 'manuscript', 'draft', 'submitted', 'under review'].includes(status) ? 'working' : ['published', 'accepted'].includes(status) ? 'published' : 'other'].push(paper);
  }
  return (Object.keys(GROUP_NAMES) as (keyof typeof GROUP_NAMES)[]).filter(key => groups[key].length).map(key => ({ key, name: GROUP_NAMES[key], papers: groups[key] }));
}
export function paperLinks(paper: Paper) {
  const links: { href: string; label: string; related?: boolean }[] = [];
  if (paper.doi) links.push({ href: 'https://doi.org/' + rawurlencode(paper.doi).replace(/%2F/g, '/'), label: 'DOI: ' + paper.doi });
  if (paper.link) links.push({ href: paper.link, label: 'Publication link ↗' });
  if (paper.code) links.push({ href: paper.code, label: 'Code ↗' });
  if (paper.pdf) links.push({ href: paper.pdf, label: 'PDF ↗' });
  if (paper.relatedProject) links.push({ href: `/projects/${paper.relatedProject}/`, label: 'Related engineering case ↗', related: true });
  return links;
}
