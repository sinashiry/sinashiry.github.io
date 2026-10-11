/** Pure transforms for the public GitHub Pages build. HTML in, HTML out; no filesystem access. */
import {createHash} from 'node:crypto';
import {omitOptional, groupReady} from './content-visibility.mjs';
import {reviewedRepository} from '../src/scripts/repository-overrides.ts';
import {SITE, legacyIds} from './legacy-redirects.mjs';

const read=(data,p)=>p.split('.').reduce((v,k)=>v?.[k],data);

// Public-state ports of the former PHP-host build step (placeholders=false); output bytes must stay identical.
export function validHttps(value){try{const u=new URL(value);return /^[hH][tT][tT][pP][sS]:\/\//.test(value)&&!/[\s\\\x00-\x1f\x7f]/.test(value)&&u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password&&!/^https:\/\/[^/]*@/i.test(value);}catch{return false;}}
export function academicReady(value,kind){
  if(kind==='profiles'||kind==='references')return Array.isArray(value)&&value.some(entry=>academicReady(entry,kind==='profiles'?'profile':'reference'));
  if(!['profile','reference'].includes(kind))throw Error('Invalid academic state kind');
  const fields=kind==='profile'?['label','url']:['name','status','relationship'];
  return value&&fields.every(field=>typeof value[field]==='string'&&value[field].trim())&&(kind==='profile'?validHttps(value.url):value.approved==='yes');
}
export function optionalStates(html,data){return html.replace(/<[a-z][a-z0-9]*\b[^>]*data-cv-visible="([a-zA-Z0-9.]+)"[^>]*>/g,(tag,p)=>{const state=String(read(data,p)||'').trim()?'ready':'empty';tag=tag.replace(/\sdata-cv-visible-state="[^"]*"/,'');return tag.replace(/>$/,` data-cv-visible-state="${state}">`);});}
export function groupStates(html,data){return html.replace(/<[a-z][a-z0-9]*\b[^>]*data-cv-group="([a-z-]+)"[^>]*>/g,(tag,kind)=>{const state=groupReady(data,kind)?'ready':'empty';return tag.replace(/\sdata-cv-group-state="[^"]*"/,'').replace(/>$/,` data-cv-group-state="${state}">`);});}
export function academicStates(html,data){return html.replace(/<(?:article|div)\b[^>]*data-academic-(?:entry|fallback)="(profile|reference|profiles|references)"[^>]*>/g,(tag,kind)=>{
  const p=tag.match(/\bdata-academic-path="(academic\.(?:profiles|references)(?:\.\d+)?)"/)?.[1];if(!p)throw Error('Invalid academic state binding');
  const state=academicReady(read(data,p),kind)?'ready':'empty';
  return tag.replace(/data-academic-state="[^"]*"/,`data-academic-state="${state}"`);
});}
export function omitPrivateSlots(html){return omitOptional(html)
  .replace(/<figure\b[^>]*data-recommendation-state="empty"[^>]*>[\s\S]*?<\/figure>/g,'')
  .replace(/<article\b(?=[^>]*\bdata-academic-entry=)(?=[^>]*\bdata-academic-state="empty")[^>]*>[\s\S]*?<\/article>/g,'')
  .replace(/<div\b(?=[^>]*\bdata-academic-fallback=)(?=[^>]*\bdata-academic-state="ready")[^>]*>[\s\S]*?<\/div>/g,'')
  .replace(/<a\b(?=[^>]*\bdata-cv-(?:url|href)=)(?=[^>]*\bhref="(?:mailto:)?")[^>]*>[\s\S]*?<\/a>/g,'');}
/** Empty optional, academic and recommendation slots are omitted from public HTML, not merely hidden. */
export const publicPage=(html,data)=>omitPrivateSlots(groupStates(optionalStates(academicStates(html,data),data),data));

/** Schema-2 /data/github-repositories.json: GitHub facts plus source-reviewed copy. */
export function publicRepositories(raw){return {...raw,schema_version:2,repositories:raw.repositories.map(repo=>({...repo,...reviewedRepository(repo)}))};}

/** Insert markup at the very start of <head>, directly after <meta charset> when present. */
export function injectHead(html,snippet){
  const head=/<head\b[^>]*>/i.exec(html);if(!head)throw Error('Page has no <head>');
  const start=head.index+head[0].length,end=html.slice(start).search(/<\/head>/i);
  const charset=/^\s*<meta\s+charset=["']?[\w-]+["']?\s*\/?>/i.exec(html.slice(start,end<0?undefined:start+end));
  const at=charset?start+charset[0].length:start;
  return html.slice(0,at)+snippet+html.slice(at);
}

/** Homepage and 404 hook: WordPress ?p=, ?page_id= and ?attachment_id= links; retired IDs fall through. */
export function legacyQueryScript(ids=legacyIds){
  return `(()=>{if(!/^\\/(?:index\\.(?:php|html))?$/.test(location.pathname))return;const m=${JSON.stringify(ids)},v=[];for(const[k,x]of new URLSearchParams(location.search))if(/^(?:p|page_id|attachment_id)$/i.test(k))v.push(x);const i=Object.keys(m).find(i=>v.includes(i));if(i)location.replace(m[i].includes('#')?m[i]:m[i]+location.hash)})()`;
}
export function withLegacyQueryHook(html){return injectHead(html.replace(/<script data-legacy-redirect>[\s\S]*?<\/script>/g,''),`<script data-legacy-redirect>${legacyQueryScript()}</script>`);}

/** Redirect stub for one legacy path. Stubs carry data-legacy-redirect so reruns can recognise them. */
export function legacyStub(to,site=SITE){
  if(!/^\/[a-z0-9/_.#-]*$/i.test(to))throw Error('Invalid legacy target '+to);
  const canonical=new URL(to.split('#')[0],site).href,script=`location.replace(${JSON.stringify(to)}${to.includes('#')?'':'+location.hash'})`;
  return `<!doctype html><html lang="en" data-legacy-redirect><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Page moved — Sina Shiri</title><meta name="robots" content="noindex"><link rel="canonical" href="${canonical}"><meta http-equiv="refresh" content="0; url=${to}"><script>${script}</script></head><body><p>This page has moved to <a href="${to}">${canonical.replace(/^https:\/\//,'')}</a>.</p></body></html>`;
}
export const isLegacyStub=html=>/^<!doctype html><html lang="en" data-legacy-redirect>/i.test(html);

/**
 * Real tags in document order. Quoted attribute values are consumed whole, so owner text such as alt="<script>" never
 * opens a tag; script, style, textarea and title contents are raw text (`body`), and comments are skipped.
 */
const RAW_TEXT=['script','style','textarea','title'];
export function htmlTags(html){
  const tags=[],tag=/<!--[\s\S]*?-->|<!(?:[^>"']|"[^"]*"|'[^']*')*>|<([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for(let m;(m=tag.exec(html));){
    if(!m[1])continue;
    const item={name:m[1].toLowerCase(),attrs:m[2],start:m.index,source:m[0]};tags.push(item);
    if(!RAW_TEXT.includes(item.name))continue;
    const end=new RegExp(`</${item.name}[\\s/>]`,'ig');end.lastIndex=tag.lastIndex;const close=end.exec(html);
    item.body=html.slice(tag.lastIndex,close?close.index:html.length);tag.lastIndex=close?close.index:html.length;
  }
  return tags;
}
/** Attribute values of one tag from htmlTags (first occurrence wins, as in browsers). */
export function tagAttributes(attrs){
  const out={};
  for(const m of attrs.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)){const key=m[1].toLowerCase();if(!(key in out))out[key]=m[2]??m[3]??m[4]??'';}
  return out;
}
const executableScript=t=>t.name==='script'&&!/\bsrc\s*=/i.test(t.attrs)&&!/application\/ld\+json/i.test(t.attrs);

/** SHA-256 sources for executable inline scripts, hashed as the browser does (after newline normalisation). */
export function inlineScriptHashes(html){
  const hashes=new Set();
  for(const t of htmlTags(html))if(executableScript(t))hashes.add(`'sha256-${createHash('sha256').update(t.body.replace(/\r\n?/g,'\n')).digest('base64')}'`);
  return [...hashes];
}
/** The former .htaccess policy minus header-only directives (frame-ancestors is ignored in a meta element). */
export const cspPolicy=hashes=>["default-src 'self'",['script-src',"'self'",...hashes].join(' '),"style-src 'self' 'unsafe-inline'","img-src 'self' data:","media-src 'self'","font-src 'self'","connect-src 'self'","object-src 'none'","base-uri 'self'","form-action 'self'"].join('; ');
export const REFERRER='strict-origin-when-cross-origin';
/** Run last: hashes are computed over the final markup, and the meta precedes every script. */
export function withSecurityMeta(html){
  html=html.replace(/<meta\b[^>]*\bhttp-equiv=["']?content-security-policy["']?[^>]*>/gi,'').replace(/<meta\b[^>]*\bname=["']?referrer["']?[^>]*>/gi,'');
  return injectHead(html,`<meta http-equiv="Content-Security-Policy" content="${cspPolicy(inlineScriptHashes(html))}"><meta name="referrer" content="${REFERRER}">`);
}
export function securityMetaError(html){
  const csp=html.search(/<meta http-equiv="Content-Security-Policy"/),script=htmlTags(html).find(t=>t.name==='script')?.start??-1;
  if(csp<0)return 'has no Content-Security-Policy meta';
  if(script>=0&&script<csp)return 'has a script before its Content-Security-Policy meta';
  const policy=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  const missing=inlineScriptHashes(html).filter(hash=>!policy.includes(hash));
  return missing.length?`has ${missing.length} inline script(s) missing from its policy`:'';
}

/** Collection thresholds as Astro published them: sitemap-collections.xml lists an index only when it is ready. */
export function collectionReadiness(sitemap,site=SITE){
  const locs=[...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m=>m[1]);
  return {post:locs.includes(site+'/blog/'),paper:locs.includes(site+'/publications/'),posts:locs.filter(loc=>loc.startsWith(site+'/blog/')&&loc!==site+'/blog/').length};
}
export function collectionErrors(pages,sitemap){
  const ready=collectionReadiness(sitemap),errors=[],kinds={blog:'post',publications:'paper'};let navLinks=0;
  if(ready.post!==(ready.posts>=3))errors.push(`sitemap-collections.xml ${ready.post?'lists':'omits'} /blog/ with ${ready.posts} published post(s); the threshold is 3`);
  for(const [rel,html]of pages){
    const navs=[...html.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)].map(m=>m[0]).join('');
    const tags=new Set([...navs.matchAll(/<a\b[^>]*\bhref="\/(?:blog|publications)\/"[^>]*>/g),...html.matchAll(/<a\b[^>]*\bdata-collection-nav=[^>]*>/g)].map(m=>m[0]));
    for(const tag of tags){
      const kind=tag.match(/\bhref="\/(blog|publications)\/"/)?.[1],key=kinds[kind];navLinks++;
      if(!key||!tag.includes(`data-collection-nav="${key}"`)){errors.push(`${rel}: navigation link ${tag} lacks the matching data-collection-nav`);continue;}
      const hidden=/\shidden(?=[\s=/>])/i.test(tag);
      if(hidden===ready[key])errors.push(`${rel}: ${kind} navigation is ${hidden?'hidden although the collection is published':'visible below the publication threshold'}`);
    }
  }
  if(!navLinks)errors.push('no Blog or Publications navigation links were found');
  for(const [rel,key]of [['blog/index.html','post'],['publications/index.html','paper']]){
    const html=pages.get(rel);if(html===undefined){errors.push(`${rel} is missing`);continue;}
    const noindex=/<meta\b(?=[^>]*\bname="robots")(?=[^>]*\bcontent="[^"]*noindex)[^>]*>/i.test(html);
    if(noindex===ready[key])errors.push(`${rel} is ${noindex?'noindex although listed in sitemap-collections.xml':'indexable below the publication threshold'}`);
  }
  return errors;
}

/** CV uploads chosen in content/cms/downloads.json (port of the hosting media inspection). */
export const CV_PATH=/^content\/uploads\/cv\/[a-z0-9._-]+\.pdf$/,CV_MAX=12*1024*1024;
export function pdfProblem(bytes){
  if(bytes.length<12||bytes.length>CV_MAX)return `is ${bytes.length} bytes; a CV must be a non-empty PDF of at most 12 MiB`;
  if(!/^%PDF-[12]\.[0-9]/.test(bytes.subarray(0,16).toString('latin1')))return 'does not start with a %PDF-1.x or %PDF-2.x header';
  if(!bytes.subarray(Math.max(0,bytes.length-2048)).toString('latin1').includes('%%EOF'))return 'has no %%EOF marker in its last 2048 bytes (incomplete upload?)';
  return '';
}

/** Deploy guards: GitHub limits, leaked private or retired-backend text, and files that must exist. */
export const LIMITS={file:95*1024*1024,total:900*1024*1024};
export const FORBIDDEN_TEXT=['/api/','.php','__CV_','/home/'];
// Optional maintainer word list (SHA-256 of lowercase words); prepare-pages loads it from the git-ignored .private/guard-words.txt.
export const PRIVATE_TOKENS=new Set();
const TEXT_FILE=/\.(?:html?|css|js|mjs|json|xml|txt|svg|tex|md|webmanifest|map|csv)$/i;
const FORBIDDEN_FILE=/(?:^|\/)\.|\.(?:php\d?|phtml|sqlite3?|db|sql|env|ini|log|bak|zip|toml|lock)$/i;
// Markers that never occur in owner text; HTML pages are searched for them in full.
const ALWAYS_FORBIDDEN=['__CV_'];
// "/home/" only as a filesystem path, never as a URL segment such as /blog/home/.
const forbiddenIn=(text,needles=FORBIDDEN_TEXT)=>{const lower=text.toLowerCase();return needles.filter(n=>n==='/home/'?/(?<![\w.~%-])\/home\//.test(lower):lower.includes(n.toLowerCase()));};
// Embedded resources from another origin: no CDNs, fonts or trackers, and the meta policy would block them anyway.
const EXTERNAL_URL=/^\s*(?:https?:)?\/\//i;
const ASSET_TAGS=['script','img','source','video','audio','iframe','embed','object','track'],ASSET_ATTRS=['src','srcset','poster','data'];
const ASSET_LINK=/(?:^|\s)(?:stylesheet|preload|modulepreload|prefetch|icon|manifest|apple-touch-icon)(?:\s|$)/i;
const CSS_EXTERNAL=/url\(\s*["']?\s*(?:https?:)?\/\/|@import\s+["']?(?:https?:)?\/\//i;
const URL_ATTRS=['src','srcset','href','action','formaction','poster','data'];
const urlValues=(key,value)=>key==='srcset'?value.split(',').map(c=>c.trim().split(/\s+/)[0]).filter(Boolean):[value];
const sameOrigin=url=>!/^\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)||url.trim().toLowerCase().startsWith(SITE+'/');
const excerpt=(text,index=0)=>text.slice(index,index+140).replace(/\s+/g,' ');
/**
 * HTML pages carry owner prose, code samples and links (a /home/pi/ path, an index.php journal address, url(https://…) in a
 * code block). Retired-backend markers and third-party assets are therefore matched only in maintainer markup: executable
 * inline scripts, <style> blocks, style attributes and same-origin URL attributes, plus resource-loading tags.
 */
function htmlProblems(html){
  const found=new Set(forbiddenIn(html,ALWAYS_FORBIDDEN));let external=null;
  for(const t of htmlTags(html)){
    const attrs=tagAttributes(t.attrs);
    if(t.name==='style'||executableScript(t))for(const n of forbiddenIn(t.body??''))found.add(n);
    if(attrs.style!==undefined)for(const n of forbiddenIn(attrs.style))found.add(n);
    for(const key of URL_ATTRS)if(key in attrs)for(const url of urlValues(key,attrs[key]))if(sameOrigin(url))for(const n of forbiddenIn(url))found.add(n);
    if(external)continue;
    if(ASSET_TAGS.includes(t.name)&&ASSET_ATTRS.some(key=>key in attrs&&urlValues(key,attrs[key]).some(url=>EXTERNAL_URL.test(url))))external=excerpt(t.source);
    else if(t.name==='link'&&ASSET_LINK.test(attrs.rel||'')&&EXTERNAL_URL.test(attrs.href||''))external=excerpt(t.source);
    else if(t.name==='style'&&CSS_EXTERNAL.test(t.body??''))external=excerpt(t.body,CSS_EXTERNAL.exec(t.body).index);
    else if(attrs.style!==undefined&&CSS_EXTERNAL.test(attrs.style))external=excerpt(t.source);
  }
  return {forbidden:[...found],external};
}
const privateWords=(text,tokens)=>[...new Set(text.toLowerCase().split(/[^a-z0-9]+/))].filter(word=>word&&tokens.has(createHash('sha256').update(word).digest('hex'))).length;
export function guardErrors(files,{required=[],tokens=PRIVATE_TOKENS}={}){
  const errors=[],names=new Set(files.map(f=>f.rel));let total=0;
  for(const f of files){
    total+=f.size||0;
    if(f.symlink)errors.push(`${f.rel} is a symbolic link`);
    if(FORBIDDEN_FILE.test(f.rel))errors.push(`${f.rel} must not be published (dotfile, server script or private data type)`);
    if(f.size>LIMITS.file)errors.push(`${f.rel} is ${(f.size/2**20).toFixed(1)} MiB; the limit is 95 MiB per file`);
    if(f.text!==undefined){
      const html=/\.html?$/i.test(f.rel),css=/\.css$/i.test(f.rel),problems=html?htmlProblems(f.text):{forbidden:forbiddenIn(f.text),external:null};
      if(css){const m=CSS_EXTERNAL.exec(f.text);if(m)problems.external=excerpt(f.text,m.index);}
      for(const needle of problems.forbidden)errors.push(`${f.rel} contains "${needle}"${html&&!ALWAYS_FORBIDDEN.includes(needle)?' in an inline script, a style or a same-origin address':''}`);
      if(problems.external)errors.push(`${f.rel} loads a third-party asset (${problems.external}…); only same-origin assets are allowed`);
    }
    if(privateWords(f.rel+'\n'+(f.text||''),tokens))errors.push(`${f.rel} contains a private workstation or hosting identifier`);
  }
  if(total>LIMITS.total)errors.push(`the site is ${(total/2**20).toFixed(1)} MiB; the limit is 900 MiB`);
  for(const rel of required)if(!names.has(rel))errors.push(`${rel} is missing`);
  return errors;
}
export const isTextFile=rel=>TEXT_FILE.test(rel);
