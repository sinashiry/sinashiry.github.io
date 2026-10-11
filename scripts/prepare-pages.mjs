/** Post-build step for GitHub Pages: run after `astro build`. Rewrites only the build output (BUILD_OUT_DIR, default dist). */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {publicPage, publicRepositories, withLegacyQueryHook, legacyStub, isLegacyStub, withSecurityMeta, securityMetaError, collectionErrors, guardErrors, isTextFile, pdfProblem, CV_PATH, inlineScriptHashes} from './public-transforms.mjs';
import {legacyStubs, legacyCvPath} from './legacy-redirects.mjs';

export const CV_TARGETS={engineeringCv:['downloads/Sina_Shiri_Engineering_CV.pdf',legacyCvPath],academicCv:['downloads/Sina_Shiri_Masters_CV.pdf']};
export const REQUIRED=['index.html','404.html','robots.txt','sitemap.xml','sitemap-collections.xml','data/github-repositories.json',...Object.values(CV_TARGETS).flat()];

async function walk(dir,base=''){
  const files=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const rel=base?base+'/'+entry.name:entry.name,full=path.join(dir,entry.name);
    if(entry.isSymbolicLink())files.push({rel,size:0,symlink:true});
    else if(entry.isDirectory())files.push(...await walk(full,rel));
    else if(entry.isFile())files.push({rel,size:(await fs.stat(full)).size});
  }
  return files;
}

/** Validate one CV selected in content/cms/downloads.json and return its bytes. */
export async function readCv(root,source,label){
  if(typeof source!=='string'||!CV_PATH.test(source)||source.includes('..'))throw Error(`${label}: choose a PDF stored in content/uploads/cv/ whose name uses only lowercase letters, digits, dots, hyphens and underscores (got ${JSON.stringify(source)}).`);
  const file=path.join(root,source),stat=await fs.lstat(file).catch(()=>null);
  if(!stat?.isFile())throw Error(`${label}: ${source} is missing or is not an ordinary file.`);
  if(path.dirname(await fs.realpath(file))!==await fs.realpath(path.join(root,'content/uploads/cv')))throw Error(`${label}: ${source} resolves outside content/uploads/cv/.`);
  const bytes=await fs.readFile(file),problem=pdfProblem(bytes);
  if(problem)throw Error(`${label}: ${source} ${problem}.`);
  return {source,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export async function preparePages({root=process.cwd(),outDir=process.env.BUILD_OUT_DIR||'dist',summary=process.env.GITHUB_STEP_SUMMARY,log=console.log}={}){
  const out=path.resolve(root,outDir),inside=path.relative(root,out);
  if(!inside||inside.split(path.sep)[0]==='.private')throw Error(`Refusing to prepare ${outDir}: use a dedicated build directory.`);
  const read=rel=>fs.readFile(path.join(out,rel),'utf8'),write=async(rel,body)=>{await fs.mkdir(path.dirname(path.join(out,rel)),{recursive:true});await fs.writeFile(path.join(out,rel),body);};
  const json=async rel=>{let text;try{text=await fs.readFile(path.join(root,rel),'utf8');}catch(error){throw Error(`${rel} is required: ${error.code==='ENOENT'?'file not found':error.message}`);}try{return JSON.parse(text);}catch(error){throw Error(`${rel} is not valid JSON: ${error.message}`);}};
  const content=await json('src/data/content.json');

  // GitHub directory cache, the same schema-2 projection the PHP host published.
  await write('data/github-repositories.json',JSON.stringify(publicRepositories(await json('src/data/github-repositories.json'))));

  // Empty private and optional slots are removed from every Astro page.
  const astroPages=(await walk(out)).map(f=>f.rel).filter(rel=>rel.endsWith('.html'));
  for(const rel of astroPages){const html=await read(rel);if(isLegacyStub(html))continue;await write(rel,publicPage(html,content));}

  // CV PDFs selected by the owner, copied to the stable download URLs and the legacy WordPress upload URL.
  const downloads=await json('content/cms/downloads.json'),cvs=[];
  for(const [key,targets]of Object.entries(CV_TARGETS)){const cv=await readCv(root,downloads?.[key],key);for(const target of targets)await write(target,cv.bytes);cvs.push({key,targets,...cv});}

  // Static stubs for legacy WordPress paths; an existing page always wins.
  const stubs=[],skipped=[];
  for(const {from,to}of legacyStubs()){
    const rel=from.slice(1)+'index.html',existing=await read(rel).catch(()=>null);
    if(existing!==null&&!isLegacyStub(existing)){skipped.push(from);continue;}
    await write(rel,legacyStub(to));stubs.push(from);
  }
  for(const rel of ['index.html','404.html'])await write(rel,withLegacyQueryHook(await read(rel)));

  // Security meta last, so script hashes cover the final markup.
  const pages=new Map(),hashes=new Set(),errors=[];
  for(const {rel}of (await walk(out)).filter(f=>f.rel.endsWith('.html'))){
    const html=withSecurityMeta(await read(rel));await write(rel,html);pages.set(rel,html);
    for(const hash of inlineScriptHashes(html))hashes.add(hash);
    const problem=securityMetaError(html);if(problem)errors.push(`${rel} ${problem}`);
  }

  // Collection visibility now comes from Astro; verify it rather than rewrite it.
  const sitemap=await read('sitemap-collections.xml').catch(()=>null);
  if(sitemap!==null)errors.push(...collectionErrors(pages,sitemap));
  // Pages CMS "Create folder" commits an empty <folder>/.gitkeep under the media inputs in public/, which Astro copies.
  // It is not site content; any other dotfile, or a .gitkeep with content, still fails the guard.
  for(const f of await walk(out))if(!f.symlink&&f.size===0&&/(?:^|\/)\.gitkeep$/.test(f.rel))await fs.rm(path.join(out,f.rel));
  const files=await walk(out);
  for(const f of files)if(isTextFile(f.rel)&&!f.symlink)f.text=pages.get(f.rel)??await read(f.rel);
  const words=await fs.readFile(path.join(root,'.private/guard-words.txt'),'utf8').catch(()=>'');
  const tokens=new Set(words.split(/\s+/).filter(Boolean).map(w=>createHash('sha256').update(w.toLowerCase()).digest('hex')));
  errors.push(...guardErrors(files,{required:REQUIRED,tokens}));
  if(errors.length)throw Error(`The Pages build failed ${errors.length} check(s):\n- ${errors.join('\n- ')}`);

  const bytes=files.reduce((sum,f)=>sum+f.size,0);
  const report=[`### GitHub Pages build`,'',`- ${pages.size} HTML pages with a per-page Content-Security-Policy (${hashes.size} distinct inline-script hashes)`,`- ${stubs.length} legacy redirect stubs${skipped.length?`; skipped because a page exists: ${skipped.join(', ')}`:''}`,`- ${files.length} files, ${(bytes/2**20).toFixed(1)} MiB`,'','| Published CV | Source | Bytes | SHA-256 |','| --- | --- | ---: | --- |',...cvs.map(cv=>`| ${cv.targets.map(t=>'/'+t).join('<br>')} | ${cv.source} | ${cv.bytes.length} | \`${cv.sha256}\` |`),''].join('\n');
  log(report);
  if(summary)await fs.appendFile(summary,report+'\n');
  return {pages:pages.size,stubs,skipped,cvs,files:files.length,bytes};
}

if(import.meta.main){
  try{await preparePages();}
  catch(error){
    console.error(error instanceof TypeError||error instanceof ReferenceError?error.stack:error.message);process.exitCode=1;
    if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`### GitHub Pages build stopped\n\nThe live site was not changed.\n\n\`\`\`\n${error.message}\n\`\`\`\n`);
  }
}
