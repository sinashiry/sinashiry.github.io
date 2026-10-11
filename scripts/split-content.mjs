#!/usr/bin/env node
// Maintainer tool: split a reviewed src/data/content.json into content/structure.json,
// content/contract.json and the Pages CMS files under content/cms/.
//   node scripts/split-content.mjs [--dist dist] [--content file] [--previous file] [--no-carry] [--dry-run]
// Editable fields are derived exactly as the former publisher did: string leaves bound in the
// built HTML (data-cv*, title, meta, href, URL, alt and JSON-LD bindings) plus approval fields,
// excluding credits and categories; everything else is locked. A published dist/ omits empty
// private slots, so editable paths of the previous contract (default content/contract.json)
// that still exist are carried forward; pass --no-carry with a raw Astro build to re-derive all.
// Reviewed shape change (new field, project or list item):
//   1. node scripts/compose-content.mjs                 latest owner text into content.json
//   2. edit src/data/content.json and the templates
//   3. BUILD_OUT_DIR=dist-raw npx astro build           raw build, no compose or post-processing
//   4. node scripts/split-content.mjs --dist dist-raw
//   5. label new fields in content/labels.json, then node scripts/generate-pages-config.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTENT_FILE,STRUCTURE_FILE,CONTRACT_FILE,LABELS_FILE,CMS_DIR,contentJson,cmsJson,cmsSections,composeContent,validHttps,hasEditable,shapeOf} from './compose-content.mjs';

export const ANCHORS=['slug','src','location','type'];
export const SPLIT={projects:'slug'};
const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const get=(data,p)=>p.split('.').reduce((v,k)=>v?.[k],data);

/** Collect binding paths from built HTML pages (port of the former PHP-host build step). */
export function deriveBindings(pages,data){
  const bound=new Set(),urlPaths=new Set();
  const bind=p=>{if(typeof get(data,p)!=='string')throw Error('Invalid binding '+p);bound.add(p);};
  for(const html of pages){
    for(const [tag] of html.matchAll(/<(?:article|div)\b[^>]*data-academic-(?:entry|fallback)="(?:profile|reference|profiles|references)"[^>]*>/g)){const p=tag.match(/\bdata-academic-path="(academic\.(?:profiles|references)(?:\.\d+)?)"/)?.[1];if(!p)throw Error('Invalid academic state binding');bound.add(p);}
    for(const [,p] of html.matchAll(/<[a-z][a-z0-9]*\b[^>]*data-cv-visible="([a-zA-Z0-9.]+)"[^>]*>/g))bound.add(p);
    for(const [,kind] of html.matchAll(/<[a-z][a-z0-9]*\b[^>]*data-cv-group="([a-z-]+)"[^>]*>/g))bound.add(kind==='current-research'?'currentWork':kind==='recommendations'?'recommendations':'academic');
    for(const [,i] of html.matchAll(/<figure\b[^>]*data-recommendation-slot="(\d+)"[^>]*>/g))bound.add('recommendations.entries.'+i);
    for(const [tag,kind] of html.matchAll(/<script\b[^>]*data-cv-schema="(profile|books|breadcrumb)"[^>]*>[\s\S]*?<\/script>/g)){
      const object=JSON.parse(tag.slice(tag.indexOf('>')+1,tag.lastIndexOf('</script>')));
      if(kind==='books')object['@graph'].forEach((book,i)=>{for(const k of ['title','year','description','publisher','authors'])bound.add(`publications.${i}.${k}`);});
      if(kind==='profile')for(const obj of object['@graph']||[])if(obj['@type']==='Person')for(const k of ['name','github','linkedin'])bound.add('profile.'+k);
      if(kind==='breadcrumb'){const i=tag.match(/data-cv-project="(\d+)"/)?.[1];if(i===undefined)throw Error('Missing project breadcrumb index');bound.add(`projects.${i}.title`);}
    }
    for(const [,p] of html.matchAll(/<span data-cv="([a-zA-Z0-9.]+)">[\s\S]*?<\/span>/g))bind(p);
    for(const [,p] of html.matchAll(/<title data-cv-title="([a-zA-Z0-9.]+)">[\s\S]*?<\/title>/g))bind(p);
    for(const [,p] of html.matchAll(/<meta\b[^>]*data-cv-content="([a-zA-Z0-9.]+)"[^>]*>/g))bind(p);
    for(const [,p] of html.matchAll(/<a\b[^>]*data-cv-href="([a-zA-Z0-9.]+)"[^>]*>/g))bind(p);
    for(const [,p] of html.matchAll(/<a\b[^>]*data-cv-url="([a-zA-Z0-9.]+)"[^>]*>/g)){urlPaths.add(p);bind(p);}
    for(const [,p] of html.matchAll(/<img\b[^>]*data-cv-alt="([a-zA-Z0-9.]+)"[^>]*>/g))bind(p);
  }
  return {bound,urlPaths};
}

/** Field rules exactly as the former PHP-host build step derived them for the owner editor. */
export function deriveContract(data,bound,urlPaths){
  const editable={},locked=[];
  (function walk(value,prefix=''){
    if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))walk(v,prefix?prefix+'.'+k:k);return;}
    if(!(typeof value==='string'&&(bound.has(prefix)||/^(?:recommendations\.entries|academic\.references)\.\d+\.approved$/.test(prefix))&&!prefix.endsWith('.credit')&&!prefix.endsWith('.category'))){locked.push(prefix);return;}
    let rule={maxLength:/summary|description|problem|outcome|thesis|Intro|\.body\./.test(prefix)?3000:500,required:!!value.trim()};
    if(prefix.startsWith('recommendations.entries.'))rule={maxLength:prefix.endsWith('.quote')?1500:200,required:false};
    if(prefix.endsWith('.email'))rule={type:'email',maxLength:254,required:true};
    if(prefix.startsWith('academic.')){
      const field=prefix.split('.').at(-1);rule={maxLength:field==='label'?80:field==='name'?160:240,required:false};
      if(field==='url')rule={type:'url',maxLength:2048,required:false,allowEmpty:true};
      if(field==='email')rule={type:'email',maxLength:254,required:false,allowEmpty:true};
    }
    // Project reference links are optional everywhere: every template hides the link when it is empty.
    if(urlPaths.has(prefix)){const optional=prefix.startsWith('academic.')||/^projects\.\d+\.referenceUrl$/.test(prefix)||!value.trim();rule={type:'url',maxLength:2048,required:!optional,allowEmpty:optional};}
    if(prefix.endsWith('.approved'))rule={type:'approval',options:['yes','no'],maxLength:3,required:true};
    if(/(?:decisionNotes|validationNotes|contribution|result|measuredOutcome|question|motivation|method|platforms|collaborators)$/.test(prefix))rule={maxLength:3000,required:false};
    if(rule.type==='url'&&value!==''&&!validHttps(value))throw Error('Invalid HTTPS URL at '+prefix);
    editable[prefix]=rule;
  })(data);
  return {editable,locked};
}

/** Editable paths of an earlier contract (or of a former owner-editor manifest). */
export function previousEditable(previous){
  if(!previous)return new Map();
  if(isObject(previous.editable))return new Map(Object.entries(previous.editable));
  if(Array.isArray(previous.editablePaths))return new Map(previous.editablePaths.map(p=>[p,previous.fieldRules?.[p]||{}]));
  throw Error('Unrecognised previous contract format');
}

export function structureOf(data,editable){
  return (function walk(v,p){
    if(Array.isArray(v))return v.map((x,i)=>walk(x,p?`${p}.${i}`:String(i)));
    if(isObject(v))return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,p?`${p}.${k}`:k)]));
    if(v===null)throw Error(`content has a null value at ${p}; use an empty string`);
    return p in editable?null:v;
  })(data,'');
}

/**
 * Describe the CMS fields of one or more structure objects (several when they are list items).
 * Shared with generate-pages-config.mjs so file key order matches what Pages CMS writes.
 */
export function describe(instances,anchors=ANCHORS){
  const keys=[];
  for(const {s} of instances)for(const k of Object.keys(s))if(!keys.includes(k))keys.push(k);
  const out=[];
  for(const key of keys){
    const subs=instances.filter(i=>key in i.s).map(i=>({s:i.s[key],p:`${i.p}.${key}`})),shape=shapeOf(subs[0].p);
    if(!subs.some(x=>hasEditable(x.s))){
      if(anchors.includes(key)&&subs.every(x=>typeof x.s==='string'))out.push({key,shape,kind:'anchor',paths:subs.map(x=>x.p)});
      continue;
    }
    if(subs.every(x=>x.s===null||typeof x.s==='string'||typeof x.s==='boolean'||typeof x.s==='number')){out.push({key,shape,kind:'leaf',paths:subs.filter(x=>x.s===null).map(x=>x.p),mixed:subs.some(x=>x.s!==null)});continue;}
    if(subs.every(x=>Array.isArray(x.s))){
      const items=subs.flatMap(x=>x.s.map((y,i)=>({s:y,p:`${x.p}.${i}`}))),lengths=subs.map(x=>x.s.length);
      if(items.every(x=>x.s===null))out.push({key,shape,kind:'list',paths:items.map(x=>x.p),lengths});
      else if(items.every(x=>isObject(x.s)))out.push({key,shape,kind:'objects',lengths,fields:describe(items,anchors),paths:subs.map(x=>x.p)});
      else throw Error(`Unsupported list shape at ${subs[0].p}: mix editable and fixed items or object and text items`);
      continue;
    }
    if(subs.every(x=>isObject(x.s))){out.push({key,shape,kind:'object',fields:describe(subs,anchors),paths:subs.map(x=>x.p)});continue;}
    throw Error(`Unsupported shape at ${subs[0].p}: the same field is text in some items and a group or list in others`);
  }
  return out;
}

/** The fields of one CMS section, with the top-level list wrapped as {items}. */
export function sectionFields(section,anchors=ANCHORS){
  if(section.wrap==='items')return [{key:'items',shape:section.key,kind:'objects',lengths:[section.node.length],fields:describe(section.node.map((s,i)=>({s,p:`${section.path}.${i}`})),anchors),paths:[section.path],wrapper:true}];
  return describe([{s:section.node,p:section.path}],anchors);
}

/** Project content onto the described fields, in field order. */
export function projectDoc(fields,s,v){
  const out={};
  for(const f of fields){
    if(!(f.key in s))continue;
    const sv=s[f.key],vv=v[f.key];
    if(f.kind==='anchor')out[f.key]=vv;
    else if(f.kind==='leaf'){if(sv===null)out[f.key]=vv;}
    else if(f.kind==='list')out[f.key]=[...vv];
    else if(f.kind==='objects')out[f.key]=sv.map((x,i)=>projectDoc(f.fields,x,vv[i]));
    else out[f.key]=projectDoc(f.fields,sv,vv);
  }
  return out;
}

/** Port of Pages CMS sanitizeObject (lib/schema.ts): drop "" values, empty lists and empty objects. */
export function sanitize(object){
  const isEmpty=v=>v==null||v==='';
  if(Array.isArray(object))return object.map(v=>v&&typeof v==='object'?sanitize(v):v).filter(v=>!isEmpty(v));
  if(isObject(object)){
    const copy={...object};
    for(const key of Object.keys(copy)){
      if(copy[key]&&typeof copy[key]==='object')copy[key]=sanitize(copy[key]);
      const v=copy[key];
      if((Array.isArray(v)&&v.every(isEmpty))||(isObject(v)&&!Object.keys(v).length)||isEmpty(v))delete copy[key];
    }
    return copy;
  }
  return object;
}

/** Build every generated file for a content document. */
export function splitContent(data,bindings,{previous=null,carry=true}={}){
  const bound=new Set(bindings.bound),urlPaths=new Set(bindings.urlPaths),carried=[];
  if(carry){
    for(const [p,rule] of previousEditable(previous)){
      if(bound.has(p)||typeof get(data,p)!=='string')continue;
      carried.push(p);bound.add(p);if(rule.type==='url')urlPaths.add(p);
    }
  }
  const {editable,locked}=deriveContract(data,bound,urlPaths);
  const contract={version:1,maxBytes:262144,anchors:ANCHORS,split:SPLIT,editable};
  const structure=structureOf(data,editable);
  for(const [key,by] of Object.entries(SPLIT))for(const [i,item] of (structure[key]||[]).entries())if(typeof item[by]!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item[by]))throw Error(`${key}.${i}.${by} must be a fixed lowercase slug`);
  const files=new Map();
  for(const section of cmsSections(structure,contract)){
    const fields=sectionFields(section);
    const doc=section.wrap==='items'?{items:section.node.map((s,i)=>projectDoc(fields[0].fields,s,data[section.key][i]))}:projectDoc(fields,section.node,get(data,section.path));
    (function emptyItems(list,v,p){for(const f of list){if(!(f.key in v))continue;if(f.kind==='list'&&v[f.key].some(x=>x==='')&&!v[f.key].every(x=>x===''))throw Error(`${p}.${f.key} has an empty list item; Pages CMS drops empty list items, so remove it or give it text`);if(f.kind==='objects')v[f.key].forEach((x,i)=>emptyItems(f.fields,x,`${p}.${f.key}.${i}`));if(f.kind==='object')emptyItems(f.fields,v[f.key],`${p}.${f.key}`);}})(fields,doc,section.path);
    files.set(section.file,cmsJson(sanitize(doc)));
  }
  const {value,errors}=composeContent({structure,contract,readFile:f=>files.get(f)??null,listDir:d=>[...files.keys()].filter(f=>path.dirname(f)===d).map(f=>path.basename(f))});
  if(errors.length)throw Error('Generated files do not compose:\n'+errors.map(e=>e.message).join('\n'));
  if(contentJson(value)!==contentJson(data))throw Error('Generated files do not reproduce the content exactly');
  return {structure,contract,files,locked,carried};
}

function listHtml(dir){return fs.readdirSync(dir,{recursive:true}).filter(f=>f.endsWith('.html')).sort().map(f=>fs.readFileSync(path.join(dir,f),'utf8'));}

export function run(argv=process.argv.slice(2),root=process.cwd()){
  const opt=(name,fallback)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:fallback;};
  const at=f=>path.resolve(root,f);
  const dist=opt('--dist','dist'),contentFile=opt('--content',CONTENT_FILE),carry=!argv.includes('--no-carry'),dry=argv.includes('--dry-run');
  const previousFile=opt('--previous',fs.existsSync(at(CONTRACT_FILE))?CONTRACT_FILE:null);
  if(!fs.existsSync(at(dist)))throw Error(`Built pages not found at ${dist}; build the site first or pass --dist`);
  const data=JSON.parse(fs.readFileSync(at(contentFile),'utf8'));
  const bindings=deriveBindings(listHtml(at(dist)),data),fromDist=bindings.bound.size;
  const previous=carry&&previousFile?JSON.parse(fs.readFileSync(at(previousFile),'utf8')):null;
  const {structure,contract,files,locked,carried}=splitContent(data,bindings,{previous,carry});
  const editable=Object.keys(contract.editable).length;
  console.log(`Editable ${editable}, locked ${locked.length}; ${fromDist} bindings from ${dist}, ${carried.length} carried forward${previousFile&&carry?` from ${previousFile}`:''}; ${files.size} CMS files.`);
  if(dry)return 0;
  fs.writeFileSync(at(STRUCTURE_FILE),contentJson(structure));
  fs.writeFileSync(at(CONTRACT_FILE),contentJson(contract));
  for(const [file,text] of files){fs.mkdirSync(path.dirname(at(file)),{recursive:true});if(!fs.existsSync(at(file))||fs.readFileSync(at(file),'utf8')!==text)fs.writeFileSync(at(file),text);}
  for(const key of Object.keys(SPLIT)){const dir=`${CMS_DIR}/${key}`;if(fs.existsSync(at(dir)))for(const name of fs.readdirSync(at(dir)))if(name.endsWith('.json')&&!files.has(`${dir}/${name}`))console.warn(`Stale CMS file: ${dir}/${name} (remove it; it no longer matches the structure).`);}
  if(!fs.existsSync(at(LABELS_FILE)))console.warn(`${LABELS_FILE} is missing; field labels fall back to field names.`);
  console.log('Next: node scripts/generate-pages-config.mjs && node scripts/compose-content.mjs --check');
  return 0;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.exitCode=run();}catch(e){console.error(e.message);process.exitCode=1;}}
