#!/usr/bin/env node
// Rebuild src/data/content.json from the reviewed structure, the field contract and the
// owner-editable Pages CMS files. Every rule of the former owner API is enforced here.
//   node scripts/compose-content.mjs            validate and write src/data/content.json
//   node scripts/compose-content.mjs --check    validate only; fail if content.json is stale
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const CONTENT_FILE='src/data/content.json',STRUCTURE_FILE='content/structure.json',CONTRACT_FILE='content/contract.json',LABELS_FILE='content/labels.json',CMS_DIR='content/cms',DOWNLOADS_FILE='content/cms/downloads.json',CV_DIR='content/uploads/cv';
export const DOWNLOAD_KEYS=['engineeringCv','academicCv'];
const CONTROL=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const phpTrim=s=>s.replace(/^[ \t\n\r\0\x0b]+|[ \t\n\r\0\x0b]+$/g,'');

/** Content files keep the existing 2-space JSON format with a trailing newline. */
export const contentJson=value=>JSON.stringify(value,null,2)+'\n';
/** Pages CMS writes JSON with 2-space indentation, no trailing newline, and an empty file for {}. */
export const cmsJson=value=>isObject(value)&&!Object.keys(value).length?'':JSON.stringify(value,null,2);

export function validHttps(value){try{const u=new URL(value);return /^[hH][tT][tT][pP][sS]:\/\//.test(value)&&!/[\s\\\x00-\x1f\x7f]/.test(value)&&u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password&&!/^https:\/\/[^/]*@/i.test(value);}catch{return false;}}
export function validEmail(value){
  if(typeof value!=='string'||value.length>254||/[?#%&\s]/.test(value))return false;
  const at=value.lastIndexOf('@'),local=value.slice(0,at),domain=value.slice(at+1);
  return at>0&&local.length<=64&&/^[A-Za-z0-9!$'*+/=^_`{|}~-]+(?:\.[A-Za-z0-9!$'*+/=^_`{|}~-]+)*$/.test(local)
    &&/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(domain);
}

export const shapeOf=p=>p.split('.').map(k=>/^\d+$/.test(k)?'*':k).join('.');
export const humanize=k=>{const s=String(k).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[-_]+/g,' ').toLowerCase();return s.charAt(0).toUpperCase()+s.slice(1);};
export const hasEditable=node=>node===null||(Array.isArray(node)?node.some(hasEditable):isObject(node)&&Object.values(node).some(hasEditable));

export function loadModel(root='.'){
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const labels=fs.existsSync(path.join(root,LABELS_FILE))?read(LABELS_FILE):{};
  return {structure:read(STRUCTURE_FILE),contract:read(CONTRACT_FILE),labels};
}

/** One CMS file per top-level section; split arrays (projects) get one file per item. */
export function cmsSections(structure,contract){
  const out=[];
  for(const [key,node] of Object.entries(structure)){
    const by=contract.split?.[key];
    if(by&&Array.isArray(node)){node.forEach((item,index)=>{if(hasEditable(item))out.push({key,index,id:item[by],file:`${CMS_DIR}/${key}/${item[by]}.json`,wrap:'object',node:item,path:`${key}.${index}`});});continue;}
    if(hasEditable(node))out.push({key,file:`${CMS_DIR}/${key}.json`,wrap:Array.isArray(node)?'items':'object',node,path:key});
  }
  return out;
}

export function sectionLabel(labels,section){
  const base=labels.sections?.[section.key]?.label||humanize(section.key);
  return section.index===undefined?base:`${base} › ${labels.projects?.[section.id]||humanize(section.id)}`;
}
export function fieldLabel(labels,p){
  const shape=shapeOf(p),key=shape.split('.').at(-1);
  return labels.fields?.[shape]||labels.fields?.[key]||humanize(key);
}

/** Merge one section's CMS document into its structure node. */
function mergeSection(section,doc,contract,labels,errors){
  const anchors=new Set(contract.anchors||[]),rules=contract.editable||{};
  const where=section.file,title=sectionLabel(labels,section);
  const fail=(trail,p,message)=>errors.push({file:where,path:p,message:`${[title,...trail].join(' › ')}: ${message}`});
  const visible=(node,key)=>hasEditable(node[key])||(anchors.has(key)&&typeof node[key]==='string')||(Array.isArray(node[key])&&!node[key].length);
  function walk(s,v,p,trail,quiet){
    if(s===null){
      const value=v===undefined?'':v;
      if(typeof value!=='string'){if(!quiet)fail(trail,p,'must be plain text.');return '';}
      if(!quiet)checkText(value,rules[p]||{},message=>fail(trail,p,message));
      return value;
    }
    if(Array.isArray(s)){
      let items=v;
      if(v!==undefined&&!Array.isArray(v)){if(!quiet)fail(trail,p,'must be a list.');items=undefined;quiet=true;}
      if(Array.isArray(items)&&items.length!==s.length){
        if(!quiet)fail(trail,p,`has ${items.length} ${items.length===1?'entry':'entries'}, but the website needs exactly ${s.length}. Entries cannot be added or removed here, and an emptied entry is dropped when saved: restore its text, or ask the maintainer to change the layout.`);
        items=undefined;quiet=true;
      }
      return s.map((x,i)=>walk(x,items?.[i],`${p}.${i}`,[...trail,`#${i+1}`],quiet));
    }
    if(isObject(s)){
      let obj=v;
      if(v!==undefined&&!isObject(v)){if(!quiet)fail(trail,p,'must be a group of fields.');obj=undefined;quiet=true;}
      obj=obj||{};
      if(!quiet)for(const k of Object.keys(obj))if(!(k in s)||!visible(s,k))fail([...trail,fieldLabel(labels,`${p}.${k}`)],`${p}.${k}`,k in s?'is fixed by the website layout and cannot be edited here.':`is not a field the website uses ("${k}").`);
      const out={};
      for(const [k,x] of Object.entries(s)){
        const q=`${p}.${k}`,label=[...trail,fieldLabel(labels,q)];
        if(hasEditable(x)){out[k]=walk(x,obj[k],q,label,quiet);continue;}
        if(!quiet&&Array.isArray(x)&&!x.length&&obj[k]!==undefined)walk(x,obj[k],q,label,quiet);
        if(!quiet&&anchors.has(k)&&typeof x==='string'&&(obj[k]??'')!==x)fail(label,q,obj[k]===undefined?'is missing; this fixed identifier must stay in place.':`was changed or moved (expected "${x}"). Items cannot be reordered or reassigned here; undo the change.`);
        out[k]=x;
      }
      return out;
    }
    return s;
  }
  return walk(section.node,doc,section.path,[],false);
}

/** Port of the former owner API's text checks. Lengths count UTF-16 units, like the CMS form. */
export function checkText(value,rule,fail){
  const max=Math.min(20000,Math.max(1,Math.trunc(rule.maxLength??5000)));
  if(value.length>max)fail(`is ${value.length} characters long; the limit is ${max}.`);
  if(CONTROL.test(value))fail('contains an invisible control character; retype the text.');
  if(!value.isWellFormed())fail('contains invalid characters; retype the text.');
  if(rule.required&&phpTrim(value)==='')fail('is required.');
  if(rule.type==='approval'&&!['yes','no'].includes(value))fail('choose "yes" or "no".');
  if(rule.options&&rule.type!=='approval'&&!rule.options.includes(value))fail(`choose one of: ${rule.options.join(', ')}.`);
  const emptyAllowed=rule.allowEmpty===true&&value==='';
  if(rule.type==='email'&&!emptyAllowed&&!validEmail(value))fail('enter a valid email address.');
  if(rule.type==='url'&&!emptyAllowed&&!validHttps(value))fail('enter a public address starting with https://.');
}

/** Parse a CMS file (text or raw bytes). Pages CMS writes an empty file for an empty document. */
export function parseCms(input){
  if(input===null||input===undefined)return {missing:true};
  let text=input;
  if(typeof input!=='string')try{text=new TextDecoder('utf-8',{fatal:true}).decode(input);}catch{return {error:'is not valid UTF-8 text.'};}
  if(!text.trim())return {doc:{}};
  try{const doc=JSON.parse(text);return isObject(doc)?{doc}:{error:'does not contain a group of fields.'};}catch(e){return {error:`could not be read (${e.message}).`};}
}

/**
 * Compose content from structure + contract + CMS files.
 * readFile(relativePath) returns the file text or bytes, or null when absent; listDir(relativeDir) lists file names.
 */
export function composeContent({structure,contract,labels={},readFile,listDir=()=>[]}){
  const errors=[],sections=cmsSections(structure,contract),docs=new Map();
  for(const section of sections){
    const parsed=parseCms(readFile(section.file));
    if(parsed.missing){errors.push({file:section.file,path:section.path,message:`${sectionLabel(labels,section)}: the file ${section.file} is missing.`});continue;}
    if(parsed.error){errors.push({file:section.file,path:section.path,message:`${sectionLabel(labels,section)}: ${section.file} ${parsed.error}`});continue;}
    let doc=parsed.doc;
    if(section.wrap==='items'){
      for(const k of Object.keys(doc))if(k!=='items')errors.push({file:section.file,path:section.path,message:`${sectionLabel(labels,section)}: "${k}" is not a field the website uses.`});
      doc=doc.items;
    }
    docs.set(section,doc);
  }
  for(const [key,by] of Object.entries(contract.split||{})){
    const known=new Set(sections.filter(s=>s.key===key).map(s=>`${s.id}.json`));
    for(const name of listDir(`${CMS_DIR}/${key}`))if(name.endsWith('.json')&&!known.has(name))errors.push({file:`${CMS_DIR}/${key}/${name}`,path:key,message:`${labels.sections?.[key]?.label||humanize(key)}: ${CMS_DIR}/${key}/${name} does not match any ${by} in the website structure.`});
  }
  const value={};
  for(const [key,node] of Object.entries(structure)){
    const parts=sections.filter(s=>s.key===key);
    if(!parts.length){value[key]=node;continue;}
    if(parts[0].index!==undefined){value[key]=node.map((item,i)=>{const s=parts.find(x=>x.index===i);return s&&docs.has(s)?mergeSection(s,docs.get(s),contract,labels,errors):fill(item);});continue;}
    value[key]=docs.has(parts[0])?mergeSection(parts[0],docs.get(parts[0]),contract,labels,errors):fill(node);
  }
  const bytes=Buffer.byteLength(JSON.stringify(value));
  if(bytes>(contract.maxBytes||262144))errors.push({file:CONTENT_FILE,path:'',message:`The website text is ${bytes} bytes; the limit is ${contract.maxBytes||262144}. Shorten some long fields.`});
  return {value,errors};
}
const fill=node=>node===null?'':Array.isArray(node)?node.map(fill):isObject(node)?Object.fromEntries(Object.entries(node).map(([k,v])=>[k,fill(v)])):node;

/** The CV selection must point at an uploaded PDF inside content/uploads/cv/. */
export function checkDownloads({readFile,exists,readHead}){
  const errors=[],label='Downloadable CVs',text=readFile(DOWNLOADS_FILE);
  const fail=m=>errors.push({file:DOWNLOADS_FILE,path:'downloads',message:`${label}: ${m}`});
  const parsed=parseCms(text);
  if(parsed.missing){fail(`the file ${DOWNLOADS_FILE} is missing.`);return errors;}
  if(parsed.error){fail(`${DOWNLOADS_FILE} ${parsed.error}`);return errors;}
  for(const k of Object.keys(parsed.doc))if(!DOWNLOAD_KEYS.includes(k))fail(`"${k}" is not a field the website uses.`);
  for(const k of DOWNLOAD_KEYS){
    const v=parsed.doc[k],name=k==='engineeringCv'?'Engineering CV':'Academic CV';
    if(typeof v!=='string'||!v){fail(`${name}: choose a PDF.`);continue;}
    if(!/^content\/uploads\/cv\/[a-z0-9][a-z0-9._-]*\.pdf$/.test(v)||v.includes('..')){fail(`${name}: choose a PDF uploaded to the CV folder (got "${v}").`);continue;}
    if(!exists(v)){fail(`${name}: ${v} does not exist. Upload it under Media › CV PDF versions first.`);continue;}
    if(!/^%PDF-[12]\.\d/.test(readHead(v)))fail(`${name}: ${v} is not a PDF file.`);
  }
  return errors;
}

export function formatErrors(errors){return errors.map(e=>`- ${e.message} (${e.file}${e.path?`, ${e.path}`:''})`).join('\n');}

function summary(errors){
  const file=process.env.GITHUB_STEP_SUMMARY;if(!file||!errors.length)return;
  fs.appendFileSync(file,`### Website content check failed\n\nThe live website has not changed. Open Pages CMS, correct the fields named below and save again.\n\n${formatErrors(errors)}\n\n`);
}

export function run(argv=process.argv.slice(2),root=process.cwd()){
  const check=argv.includes('--check');
  const at=f=>path.join(root,f);
  const {structure,contract,labels}=loadModel(root);
  const readFile=f=>fs.existsSync(at(f))?fs.readFileSync(at(f)):null;
  const listDir=d=>fs.existsSync(at(d))?fs.readdirSync(at(d)):[];
  const {value,errors}=composeContent({structure,contract,labels,readFile,listDir});
  errors.push(...checkDownloads({readFile,exists:f=>fs.statSync(at(f),{throwIfNoEntry:false})?.isFile()??false,readHead:f=>{const fd=fs.openSync(at(f),'r');try{const b=Buffer.alloc(16);fs.readSync(fd,b,0,16,0);return b.toString('latin1');}finally{fs.closeSync(fd);}}}));
  if(errors.length){summary(errors);console.error(`Website content check failed (${errors.length}):\n${formatErrors(errors)}`);return 1;}
  const text=contentJson(value),current=readFile(CONTENT_FILE)?.toString('utf8')??null;
  if(check){
    if(current!==null&&current!==text){console.error(`${CONTENT_FILE} is out of date. Run: node scripts/compose-content.mjs`);return 1;}
    console.log(`Content check passed: ${Object.keys(contract.editable).length} editable fields.`);return 0;
  }
  if(current!==text){fs.mkdirSync(path.dirname(at(CONTENT_FILE)),{recursive:true});fs.writeFileSync(at(CONTENT_FILE),text);}
  console.log(`Composed ${CONTENT_FILE} (${Buffer.byteLength(text)} bytes, ${Object.keys(contract.editable).length} editable fields).`);
  return 0;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=run();
