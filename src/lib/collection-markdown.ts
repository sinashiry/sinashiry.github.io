/** Minimal, deliberately non-extensible Markdown (port of the retired PHP collection renderer): plain HTML is always escaped. */
import { escapeHtml as e, meaningfulAlt, phpTrim, validHttps } from './collection-rules.ts';

/** Accepts a local /assets/ raster path only when the caller has verified the committed file. */
export type ImageCheck = (src: string) => boolean;
const never: ImageCheck = () => false;
const S = '\\t\\n\\v\\f\\r '; // PCRE \s without Unicode properties
const TOKEN = new RegExp(`(!\\[[^\\]\\n]*\\]\\([^${S})]+\\)|\`[^\`\\n]+\`|\\*\\*[^*\\n]+\\*\\*|\\[[^\\]\\n]+\\]\\(https://[^${S})]+\\))`, 'u');
const IMAGE = new RegExp(`^!\\[([^\\]]*)\\]\\(([^${S})]+)\\)$`), LINK = new RegExp(`^\\[([^\\]]+)\\]\\((https://[^${S})]+)\\)$`);
const FENCE = new RegExp(`^\`\`\`[A-Za-z0-9_+-]*[${S}]*$`), HEADING = new RegExp(`^(#{1,3})[${S}]+([^\\n]+)$`), ITEM = new RegExp(`^[-*][${S}]+([^\\n]+)$`);

export function renderInline(value: string, image: ImageCheck = never) {
  let out = '', m: RegExpExecArray | null;
  for (const token of value.split(TOKEN)) {
    if ((m = IMAGE.exec(token)) && meaningfulAlt(m[1]) && /^\/assets\/[^?#]+\.(?:webp|png|jpe?g)$/i.test(m[2]) && image(m[2])) out += `<img class="collection-inline-image" src="${e(m[2])}" alt="${e(m[1])}" loading="lazy" decoding="async" />`;
    else if ((m = /^`([^`]+)`$/.exec(token))) out += `<code>${e(m[1])}</code>`;
    else if ((m = /^\*\*([^*]+)\*\*$/.exec(token))) out += `<strong>${e(m[1])}</strong>`;
    else if ((m = LINK.exec(token)) && validHttps(m[2])) out += `<a href="${e(m[2])}" rel="noopener noreferrer">${e(m[1])}</a>`;
    else out += e(token);
  }
  return out;
}

export function renderMarkdown(value: string, image: ImageCheck = never) {
  let out = '', paragraph: string[] = [], code: string[] = [], inCode = false, list = false;
  const flush = () => { if (paragraph.length) { out += `<p>${renderInline(paragraph.join(' '), image)}</p>`; paragraph = []; } if (list) { out += '</ul>'; list = false; } };
  for (const line of value.split('\n')) {
    let m: RegExpExecArray | null;
    if (FENCE.test(line)) { flush(); if (inCode) { out += `<pre><code>${e(code.join('\n'))}</code></pre>`; code = []; } inCode = !inCode; continue; }
    if (inCode) { code.push(line); continue; }
    if (phpTrim(line) === '') { flush(); continue; }
    if ((m = HEADING.exec(line))) { flush(); const level = Math.min(4, m[1].length + 1); out += `<h${level}>${renderInline(m[2], image)}</h${level}>`; continue; }
    if ((m = ITEM.exec(line))) { if (paragraph.length) { out += `<p>${renderInline(paragraph.join(' '), image)}</p>`; paragraph = []; } if (!list) { out += '<ul>'; list = true; } out += `<li>${renderInline(m[1], image)}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    paragraph.push(line);
  }
  flush();
  if (inCode) out += `<pre><code>${e(code.join('\n'))}</code></pre>`;
  return out;
}
