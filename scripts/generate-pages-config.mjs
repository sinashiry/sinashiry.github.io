#!/usr/bin/env node
// Generate the Pages CMS configuration (.pages.yml) from content/structure.json,
// content/contract.json and content/labels.json. Output depends only on reviewed files,
// never on owner-edited text, so owner saves cannot make it stale.
//   node scripts/generate-pages-config.mjs           write .pages.yml
//   node scripts/generate-pages-config.mjs --check   fail when .pages.yml is stale
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadModel,cmsSections,humanize,DOWNLOADS_FILE,CV_DIR} from './compose-content.mjs';
import {sectionFields} from './split-content.mjs';
import {BODY_LIMIT,RESERVED_SLUGS} from '../src/lib/collection-rules.ts';

export const CONFIG_FILE='.pages.yml';
export const HTTPS_PATTERN='^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$';
/** Blog and paper links: as HTTPS_PATTERN, and printable ASCII only, as the collection build requires. */
export const COLLECTION_HTTPS_PATTERN='^(?=[\\x21-\\x7e]*$)'+HTTPS_PATTERN.slice(1);
/** A post address: lowercase words joined by single hyphens, at most 80 characters (maxlength), never a reserved route. */
export const SLUG_PATTERN=`^(?!(?:${RESERVED_SLUGS.join('|')})$)[a-z0-9]+(?:-[a-z0-9]+)*$`;
export const YEAR_PATTERN='^(?:19[0-9]{2}|20[0-9]{2}|2100)$';
export const EMAIL_PATTERN='^[^\\s@?#%&]+@[^\\s@?#%&]+\\.[^\\s@?#%&]+$';
const PUBLIC_NOTE='Everything saved here, including drafts, is public in the GitHub repository and its history.';
const FIXED_ITEMS='Items are fixed: edit them in place. Adding, removing or reordering items needs the maintainer.';
const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

function field(labels,contract,d,missing){
  const label=d.wrapper?labels.sections?.[d.shape]?.items||'Entries':labels.fields?.[d.shape]||labels.fields?.[d.key]||(missing.add(d.shape),humanize(d.key));
  const help=[labels.help?.[d.shape]].filter(Boolean);
  const out={name:d.key,label};
  const withHelp=(f,...extra)=>{const text=[...help,...extra].filter(Boolean).join(' ');return text?{name:f.name,label:f.label,description:text,...Object.fromEntries(Object.entries(f).filter(([k])=>!['name','label'].includes(k)))}:f;};
  if(d.kind==='anchor')return withHelp({...out,type:'string',readonly:true},help.length?'':'Fixed identifier; it cannot be changed here.');
  if(d.kind==='object')return withHelp({...out,type:'object',fields:d.fields.map(x=>field(labels,contract,x,missing))});
  if(d.kind==='objects'){
    const uniform=d.lengths.every(n=>n===d.lengths[0])&&d.lengths[0]>=1;
    const first=d.fields.find(x=>x.kind==='leaf'||x.kind==='anchor');
    const summary=labels.summaries?.[d.shape]||`{index}. {${first?.key||'index'}}`;
    const list=uniform?{min:d.lengths[0],max:d.lengths[0],collapsible:{collapsed:true,summary}}:{collapsible:{collapsed:true,summary}};
    return withHelp({...out,type:'object',list,fields:d.fields.map(x=>field(labels,contract,x,missing))},FIXED_ITEMS);
  }
  const rules=d.paths.map(p=>contract.editable[p]).filter(Boolean);
  if(!rules.length)throw Error(`No contract rule for ${d.shape}`);
  if(rules.some(r=>r.type==='approval'))return withHelp({...out,type:'select',required:true,options:{values:['yes','no']}});
  const maxLength=Math.min(...rules.map(r=>r.maxLength??5000)),kind=rules.find(r=>r.type)?.type;
  const emptyOk=rules.some(r=>r.allowEmpty||!r.required);
  const f={...out,type:maxLength>500&&!kind?'text':'string'};
  let note='';
  if(d.kind==='list'){
    const uniform=d.lengths.every(n=>n===d.lengths[0])&&d.lengths[0]>=1;
    if(rules.every(r=>r.required)&&d.lengths.every(n=>n>=1))f.required=true;
    f.list=uniform?{min:d.lengths[0],max:d.lengths[0],collapsible:false}:true;
    note=uniform?`The website shows exactly ${d.lengths[0]} ${d.lengths[0]===1?'entry':'entries'} here.`:'Keep the current number of entries; ask the maintainer to add or remove one.';
  }else if(rules.every(r=>r.required))f.required=true;
  if(kind==='url')f.pattern={regex:(emptyOk?'^$|':'')+HTTPS_PATTERN,message:'Use a public address starting with https://'};
  if(kind==='email')f.pattern={regex:(emptyOk?'^$|':'')+EMAIL_PATTERN,message:'Enter a valid email address'};
  f.options={maxlength:maxLength};
  return withHelp(f,note);
}

export function buildConfig({structure,contract,labels}){
  const missing=new Set(),sections=cmsSections(structure,contract),entries=new Map();
  for(const s of sections){
    const name=s.index===undefined?s.key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()):`project-${s.id}`;
    const label=s.index===undefined?(labels.sections?.[s.key]?.label||humanize(s.key)):(labels.projects?.[s.id]||humanize(s.id));
    entries.set(s,{name,label,type:'file',path:s.file,format:'json',operations:{delete:false},fields:sectionFields(s).map(d=>field(labels,contract,d,missing))});
  }
  const content=[],used=new Set();
  for(const g of labels.groups||[]){
    const items=sections.filter(s=>g.sections.includes(s.key)).sort((a,b)=>g.sections.indexOf(a.key)-g.sections.indexOf(b.key)||(a.index??0)-(b.index??0));
    items.forEach(s=>used.add(s));
    if(items.length)content.push({name:g.name,label:g.label,type:'group',items:items.map(s=>entries.get(s))});
  }
  for(const s of sections)if(!used.has(s))content.push(entries.get(s));
  const slugs=(structure.projects||[]).map(p=>({name:p.slug,label:labels.projects?.[p.slug]||humanize(p.slug)}));
  const visibility=archived=>({name:'visibility',label:'Website visibility',description:`Draft: not shown on the website. Published: shown after the next deploy. Archived: ${archived} ${PUBLIC_NOTE}`,type:'select',required:true,default:'draft',options:{values:['draft','published','archived']}});
  const https=(name,label,description)=>({name,label,description,type:'string',pattern:{regex:'^$|'+COLLECTION_HTTPS_PATTERN,message:'Use a public address starting with https:// (letters, digits and ASCII punctuation only)'},options:{maxlength:2048}});
  const related={name:'relatedProject',label:'Related engineering project',description:'Optional.',type:'select',options:{values:slugs}};
  content.push({name:'downloads',label:'Downloadable CVs',type:'file',path:DOWNLOADS_FILE,format:'json',operations:{delete:false},fields:[
    {name:'engineeringCv',label:'Engineering CV (PDF)',description:'Upload a new version under Media › CV PDF versions, then select it here. It replaces /downloads/Sina_Shiri_Engineering_CV.pdf after the next deploy. The LaTeX source is not updated.',type:'file',required:true,options:{media:'cv',extensions:['pdf']}},
    {name:'academicCv',label:'Academic CV (PDF)',description:'Upload a new version under Media › CV PDF versions, then select it here. It replaces /downloads/Sina_Shiri_Masters_CV.pdf after the next deploy. The LaTeX source is not updated.',type:'file',required:true,options:{media:'cv',extensions:['pdf']}}]});
  content.push({name:'posts',label:'Blog posts',type:'collection',path:'src/content/blog',format:'yaml-frontmatter',subfolders:false,filename:'{fields.slug}.md',operations:{rename:false,delete:false},
    view:{primary:'title',fields:['title','date','visibility'],sort:['date','title'],default:{sort:'date',order:'desc'}},fields:[
    {name:'title',label:'Title',description:'Shown as the heading of the post and in the post list. The web address is set separately below.',type:'string',required:true,options:{maxlength:220}},
    {name:'slug',label:'Web address',description:'The post is published at /blog/<web address>/, for example /blog/raspberry-pi-camera-notes/. Use lowercase letters, digits and single hyphens, at most 80 characters, and not a reserved word such as admin, index, blog, feed or sitemap. The address is fixed when the post is first saved: changing this field later does not move the post.',type:'string',required:true,pattern:{regex:SLUG_PATTERN,message:'Use lowercase letters, digits and single hyphens, not a reserved word such as admin, index, blog, feed or sitemap'},options:{maxlength:80}},
    {name:'date',label:'Date',type:'date',required:true,options:{format:'yyyy-MM-dd'}},
    {name:'summary',label:'Summary',description:'Shown in the post list and in search results.',type:'text',required:true,options:{maxlength:600}},
    visibility('removed from the website; the post address stays reserved.'),
    {name:'heroImage',label:'Header image',description:'Optional. Upload under Media › Article & paper images. Uploaded images are public in the repository immediately.',type:'image',options:{media:'images'}},
    {name:'heroAlt',label:'Header image description',description:'Required before publishing when a header image is chosen: describe the image for people who cannot see it.',type:'string',options:{maxlength:400}},
    related,
    {name:'updated',label:'Last updated',description:'Optional. Set when a published post changes substantially.',type:'date',default:'',options:{format:'yyyy-MM-dd'}},
    {name:'body',label:'Article',description:'Separate paragraphs with a blank line. Supported: ## and ### headings, - lists, **bold**, `code`, fenced code blocks, [text](https://…) links and ![description](/assets/…) images. HTML is not allowed.',type:'text',required:true,options:{maxlength:BODY_LIMIT}}]});
  content.push({name:'papers',label:'Publications (papers)',type:'collection',path:'src/content/papers',format:'json',subfolders:false,filename:'{fields.year}-{primary}.json',operations:{rename:false},
    view:{primary:'title',fields:['title','year','status','visibility'],sort:['year','title'],default:{sort:'year',order:'desc'}},fields:[
    {name:'title',label:'Title',type:'string',required:true,options:{maxlength:300}},
    {name:'authors',label:'Authors',description:'As they appear on the paper, for example "S. Shiri, A. Author".',type:'text',required:true,options:{maxlength:1000}},
    {name:'year',label:'Year',type:'string',required:true,pattern:{regex:YEAR_PATTERN,message:'Enter a year between 1900 and 2100'}},
    {name:'type',label:'Type',description:'For example: Journal article, Conference paper, Thesis.',type:'string',required:true,options:{maxlength:80}},
    {name:'status',label:'Publication status',description:'Used to group papers on the Publications page.',type:'select',required:true,options:{values:['Published','Accepted','Under review','Submitted','Preprint','Manuscript','Other']}},
    visibility('removed from the website.'),
    {name:'venue',label:'Journal, conference or publisher',type:'string',options:{maxlength:300}},
    {name:'doi',label:'DOI',description:'Only the DOI itself, for example 10.1000/xyz123, without https://doi.org/.',type:'string',pattern:{regex:'^$|^10\\.[0-9]{4,9}/[^\\s<>"]+$',message:'Enter a DOI such as 10.1000/xyz123'},options:{maxlength:200}},
    https('link','Publication link','Optional public address starting with https://.'),
    https('code','Code link','Optional public address of the code starting with https://.'),
    {name:'pdf',label:'PDF',description:'Optional. Upload under Media › Paper PDFs, then select it here. Uploaded PDFs are public in the repository immediately.',type:'file',options:{media:'papers',extensions:['pdf']}},
    {name:'abstract',label:'Abstract',type:'text',options:{maxlength:10000}},
    {name:'contribution',label:'Contribution',description:'Optional. What Sina contributed to this paper.',type:'text',options:{maxlength:3000}},
    {name:'citation',label:'Citation',description:'Optional. Formatted citation shown under the paper.',type:'text',options:{maxlength:5000}},
    related,
    {name:'featured',label:'Featured',description:'Featured papers are listed first.',type:'boolean',default:false}]});
  const config={
    settings:{hide:true,content:{merge:false},commit:{identity:'app',templates:{create:'Create {path} via Pages CMS {userName}',update:'Update {path} via Pages CMS {userName}',delete:'Delete {path} via Pages CMS {userName}',rename:'Rename {oldPath} to {newPath} via Pages CMS {userName}'}}},
    media:[
      {name:'images',label:'Article & paper images (public)',input:'public/assets/owner-media',output:'/assets/owner-media',extensions:['jpg','jpeg','png','webp'],rename:'random'},
      {name:'papers',label:'Paper PDFs (public)',input:'public/assets/owner-media/papers',output:'/assets/owner-media/papers',extensions:['pdf'],rename:'safe'},
      {name:'cv',label:'CV PDF versions (public in the repository; the website uses the selected ones)',input:CV_DIR,output:CV_DIR,extensions:['pdf'],rename:'safe'}],
    actions:[{name:'refresh-github',label:'Refresh GitHub repositories',workflow:'github-repositories.yml',ref:'main',confirm:{title:'Refresh the GitHub repository list?',message:'Reads the public repositories on GitHub and updates the Code page. The website changes a few minutes after the run finishes, and only if something changed.',button:'Refresh'}}],
    content};
  return {config,missing:[...missing]};
}

// Minimal deterministic YAML emitter: plain scalars only when unambiguous, otherwise JSON-quoted.
const RESERVED=/^(?:y|n|yes|no|true|false|on|off|null)$/i;
const scalar=v=>typeof v==='string'?(/^[A-Za-z_][A-Za-z0-9_./-]*$/.test(v)&&!RESERVED.test(v)?v:JSON.stringify(v)):String(v);
function lines(value,indent){
  const pad=' '.repeat(indent),out=[];
  if(Array.isArray(value)){
    for(const item of value){
      if(isObject(item)){const inner=lines(item,indent+2);out.push(pad+'- '+inner[0].slice(indent+2),...inner.slice(1));}
      else out.push(pad+'- '+scalar(item));
    }
    return out;
  }
  for(const [k,v] of Object.entries(value)){
    const flow=isObject(v)&&Object.values(v).every(x=>!x||typeof x!=='object')&&`{ ${Object.entries(v).map(([a,b])=>`${a}: ${scalar(b)}`).join(', ')} }`;
    if(flow&&pad.length+k.length+flow.length<=110){out.push(`${pad}${k}: ${flow}`);continue;}
    if(Array.isArray(v)&&v.every(x=>!x||typeof x!=='object'))out.push(`${pad}${k}: [${v.map(scalar).join(', ')}]`);
    else if(isObject(v)&&!Object.keys(v).length)out.push(`${pad}${k}: {}`);
    else if(v&&typeof v==='object')out.push(`${pad}${k}:`,...lines(v,indent+2));
    else out.push(`${pad}${k}: ${scalar(v)}`);
  }
  return out;
}
export const HEADER='# Generated by scripts/generate-pages-config.mjs from content/structure.json,\n# content/contract.json and content/labels.json. Do not edit by hand.\n';
export const toYaml=config=>HEADER+lines(config,0).join('\n')+'\n';

export function run(argv=process.argv.slice(2),root=process.cwd()){
  const {config,missing}=buildConfig(loadModel(root));
  if(missing.length)console.warn(`No label in content/labels.json for: ${missing.join(', ')}`);
  const text=toYaml(config),target=path.join(root,CONFIG_FILE),current=fs.existsSync(target)?fs.readFileSync(target,'utf8'):null;
  if(argv.includes('--check')){
    if(current!==text){console.error(`${CONFIG_FILE} is out of date. Run: node scripts/generate-pages-config.mjs`);return 1;}
    console.log(`${CONFIG_FILE} is up to date.`);return 0;
  }
  if(current!==text)fs.writeFileSync(target,text);
  console.log(`Wrote ${CONFIG_FILE} (${text.split('\n').length-1} lines).`);
  return 0;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=run();
