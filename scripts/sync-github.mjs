/** Scheduled public GitHub metadata refresh. Writes only the source snapshot; the Pages build renders it. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateRepositoryOverrides, reviewedRepository} from '../src/scripts/repository-overrides.ts';

export const ACCOUNT='sinashiry', SITE_REPOSITORY_ID=1414720350, SITE_REPOSITORY_NAME='sinashiry.github.io';
const API='https://api.github.com', API_VERSION='2026-03-10', USER_AGENT='sina-shiri-portfolio-public-cache';
const BODY_LIMIT=2097152, FILE_LIMIT=4194304, MAX_PAGES=10, MAX_REQUESTS=30, LANGUAGE_REQUESTS=20;
const DEADLINE_MS=120000, REQUEST_MS=10000, WEEK_MS=7*86400000;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const defaultPaths={snapshot:path.join(root,'src/data/github-repositories.json'),overrides:path.join(root,'src/data/repository-overrides.json')};
const endpointPattern=/^\/(?:users\/sinashiry\/repos\?per_page=100&type=owner&sort=full_name&direction=asc&page=[1-9][0-9]*|repos\/sinashiry\/[A-Za-z0-9_.-]+\/languages)$/;

const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const asciiLower=value=>value.replace(/[A-Z]/g,c=>c.toLowerCase());
const describe=error=>String(error?.cause?.code||error?.name||'network error').slice(0,60);
function text(value,limit,nullable=false){
  if(nullable&&value===null)return null;
  if(typeof value!=='string'||Buffer.byteLength(value)>limit||!value.isWellFormed())throw Error('Invalid GitHub text field.');
  return value;
}
function date(value,nullable=false){
  if(nullable&&value===null)return null;
  // Round-tripping rejects calendar overflow such as 31 February, which Date.parse would roll forward.
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)+'Z'!==value)throw Error('Invalid GitHub date.');
  return value;
}
function integer(value){
  if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid GitHub number.');
  return value;
}

export const githubEndpointAllowed=endpoint=>typeof endpoint==='string'&&endpointPattern.test(endpoint)&&!/\/\.{1,2}\//.test(endpoint);

async function readBody(response){
  if(Number(response.headers.get('content-length')||0)>BODY_LIMIT)throw Error('GitHub response exceeded its size limit.');
  if(!response.body)return '';
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>BODY_LIMIT){await reader.cancel().catch(()=>{});throw Error('GitHub response exceeded its size limit.');}
      chunks.push(value);
    }
  }catch(error){throw error?.message==='GitHub response exceeded its size limit.'?error:Error(`GitHub response could not be read (${describe(error)}).`);}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw Error('GitHub response was not valid UTF-8.');}
}

/** Serial HTTPS GET to a fixed endpoint: no redirects, bounded time and size. The token is only a rate-limit credential. */
export async function githubRequest(endpoint,{fetch=globalThis.fetch,token,deadline=Date.now()+REQUEST_MS}={}){
  if(!githubEndpointAllowed(endpoint))throw Error('GitHub endpoint not allowed.');
  const remaining=deadline-Date.now();
  if(remaining<=0)throw Error('GitHub refresh exceeded its time budget.');
  const headers={accept:'application/vnd.github+json','user-agent':USER_AGENT,'x-github-api-version':API_VERSION};
  if(token)headers.authorization=`Bearer ${token}`;
  let response;
  try{response=await fetch(API+endpoint,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(Math.min(REQUEST_MS,remaining))});}
  catch(error){throw Error(`GitHub HTTPS request failed (${describe(error)}); kept the previous snapshot.`);}
  if(response.status!==200){
    await response.body?.cancel().catch(()=>{});
    const hint=[401,403,429].includes(response.status)?' (rate limit or access refusal)':'';
    throw Error(`GitHub returned HTTP ${Number(response.status)}${hint}; kept the previous snapshot. Retry at the next scheduled run.`);
  }
  const body=await readBody(response);
  try{return {link:response.headers.get('link')??'',data:JSON.parse(body)};}catch{throw Error('GitHub returned malformed JSON.');}
}

const reusableLanguages=repo=>Array.isArray(repo.languages)&&repo.languages.length<=100
  &&repo.languages.every(language=>isObject(language)&&typeof language.name==='string'&&Buffer.byteLength(language.name)<=100&&Number.isSafeInteger(language.bytes)&&language.bytes>=0)
  &&(repo.languages_checked_at==null||typeof repo.languages_checked_at==='string'&&Number.isFinite(Date.parse(repo.languages_checked_at)));

/** Returns a complete, validated schema-1 snapshot or throws; a truncated page set is never returned. */
export async function collectRepositories(previous,request,now){
  date(now);
  const deadline=Date.now()+DEADLINE_MS;let requests=0;
  const get=async endpoint=>{
    if(++requests>MAX_REQUESTS||Date.now()>=deadline)throw Error('GitHub refresh exceeded its request budget.');
    return request(endpoint,deadline);
  };
  const raw=new Map();let finished=false;
  for(let page=1;page<=MAX_PAGES;page++){
    const {data,link}=await get(`/users/${ACCOUNT}/repos?per_page=100&type=owner&sort=full_name&direction=asc&page=${page}`);
    if(!Array.isArray(data)||data.length>100)throw Error('Invalid GitHub repository page.');
    for(const repo of data){
      if(!isObject(repo))throw Error('Invalid GitHub repository.');
      const id=integer(repo.id);
      if(raw.has(id))throw Error('Repository pagination changed during refresh; retry at the next run.');
      raw.set(id,repo);
    }
    // Link only says whether another page exists. Its URL is never requested.
    if(!/(?:^|,)\s*<[^>]+>\s*;\s*rel="next"/.test(typeof link==='string'?link:'')){finished=true;break;}
  }
  if(!finished)throw Error('Repository page limit reached; kept the previous complete snapshot.');
  const previousById=new Map((previous?.repositories??[]).filter(isObject).map(repo=>[repo.id,repo]));
  const repositories=[...raw].map(([id,repo])=>{
    const name=text(repo.name??null,100);
    if(!/^[A-Za-z0-9_.-]+$/.test(name)||name==='.'||name==='..'||typeof repo.owner?.login!=='string'||asciiLower(repo.owner.login)!==ACCOUNT||repo.private!==false)throw Error('Unexpected repository owner or visibility.');
    const url=`https://github.com/${ACCOUNT}/${name}`;
    if(typeof repo.html_url!=='string'||asciiLower(repo.html_url)!==asciiLower(url))throw Error('Unexpected repository URL.');
    for(const field of ['fork','archived','disabled'])if(typeof repo[field]!=='boolean')throw Error('Invalid repository state.');
    const topics=repo.topics??[];
    if(!Array.isArray(topics)||topics.length>50)throw Error('Invalid repository topics.');
    topics.forEach(topic=>text(topic,100));
    const pushed=date(repo.pushed_at??null,true),old=previousById.get(id);
    const same=!!old&&old.pushed_at===pushed&&reusableLanguages(old);
    return {id,name,url,description:text(repo.description??null,10000,true),primary_language:text(repo.language??null,100,true),
      languages:same?old.languages.map(({name,bytes})=>({name,bytes})):[],languages_complete:same&&old.languages_complete===true,
      languages_checked_at:same?old.languages_checked_at??null:null,topics:[...topics],stars:integer(repo.stargazers_count??null),
      forks:integer(repo.forks_count??null),fork:repo.fork,archived:repo.archived,disabled:repo.disabled,
      updated_at:date(repo.updated_at??null),pushed_at:pushed,license:text(isObject(repo.license)?repo.license.spdx_id??null:null,100,true)};
  });
  // Missing or stale language lists refresh first; large accounts converge over successive runs.
  const order=repositories.map((_,index)=>index).sort((a,b)=>cmp(repositories[a].languages_checked_at??'',repositories[b].languages_checked_at??''));
  let languageRequests=0;const staleBefore=Date.parse(now)-WEEK_MS;
  for(const index of order){
    const repo=repositories[index];
    const stale=!repo.languages_complete||Date.parse(repo.languages_checked_at??'1970-01-01T00:00:00Z')<staleBefore;
    if(!stale||languageRequests>=LANGUAGE_REQUESTS)continue;
    languageRequests++;
    let {data}=await get(`/repos/${ACCOUNT}/${repo.name}/languages`);
    if(Array.isArray(data)&&!data.length)data={};
    if(!isObject(data)||Object.keys(data).length>100)throw Error('Invalid language list.');
    repo.languages=Object.entries(data).map(([language,bytes])=>({name:text(language,100),bytes:integer(bytes)})).sort((a,b)=>b.bytes-a.bytes);
    repo.languages_complete=true;repo.languages_checked_at=now;
  }
  repositories.sort((a,b)=>cmp(b.updated_at,a.updated_at)||cmp(asciiLower(a.name),asciiLower(b.name)));
  return {snapshot:{schema_version:1,account:ACCOUNT,profile_url:`https://github.com/${ACCOUNT}`,source_url:`${API}/users/${ACCOUNT}/repos`,
    fetched_at:now,repository_count:repositories.length,repositories},requests};
}

/** Check times never count as a change. The site repository moves with every site commit, so its activity fields are
 *  recorded on write but ignored here; otherwise each bot commit would cause the next one. */
const comparable=snapshot=>JSON.stringify({...snapshot,fetched_at:undefined,repositories:[...snapshot.repositories].sort((a,b)=>a.id-b.id)
  .map(({languages_checked_at,...repo})=>repo.id===SITE_REPOSITORY_ID?{...repo,pushed_at:undefined,updated_at:undefined,size:undefined,languages:undefined,languages_complete:undefined}:repo)});

/** Weekly heartbeat: a write at least every 7 days keeps the dated snapshot honest and the schedule active. */
export function writeReason(previous,next,now){
  if(!previous)return 'new snapshot';
  if(comparable(previous)!==comparable(next))return 'repository data changed';
  if(!(Date.parse(previous.fetched_at)>=Date.parse(now)-WEEK_MS))return 'weekly heartbeat';
  return null;
}

async function readFileLimited(file){
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.size>FILE_LIMIT)throw Error(`Refusing ${path.basename(file)}: not a regular file within the size limit.`);
  return fs.readFile(file,'utf8');
}

async function readSnapshot(file){
  let source;
  try{source=await readFileLimited(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  let data;try{data=JSON.parse(source);}catch{data=null;}
  if(!isObject(data)||data.schema_version!==1||data.account!==ACCOUNT||!Array.isArray(data.repositories)||!data.repositories.every(repo=>isObject(repo)&&Number.isSafeInteger(repo.id)))
    throw Error('Invalid previous repository snapshot; fix or remove it before syncing.');
  return data;
}

async function writeAtomic(file,bytes){
  if(Buffer.byteLength(bytes)>FILE_LIMIT)throw Error('Repository snapshot exceeded its size limit.');
  const existing=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(existing&&!existing.isFile())throw Error('Refusing a non-regular snapshot target.');
  const temporary=path.join(path.dirname(file),`.${path.basename(file)}.${randomUUID()}.tmp`);
  try{await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,file);}
  finally{await fs.rm(temporary,{force:true});}
}

const code=value=>'`'+String(value).replace(/`/g,'')+'`';
export function summaryMarkdown({snapshot,requests,reason,previousFetchedAt,unreviewed,orphaned,authenticated}){
  const forks=snapshot.repositories.filter(repo=>repo.fork).length,archived=snapshot.repositories.filter(repo=>repo.archived).length;
  const lines=['### GitHub repository directory','',
    `- Public repositories: ${snapshot.repository_count} (${forks} ${forks===1?'fork':'forks'}, ${archived} archived)`,
    `- API requests: ${requests} (${authenticated?'authenticated':'unauthenticated'})`,
    `- Snapshot: ${reason?`written (${reason}), fetched_at ${snapshot.fetched_at}`:`unchanged, last written ${previousFetchedAt}`}`,''];
  if(unreviewed.length){
    lines.push(`**Unreviewed repositories (${unreviewed.length})** show neutral copy until a review is added to ${code('src/data/repository-overrides.json')}:`,'');
    unreviewed.forEach(repo=>lines.push(`- ${code(repo.id)} ${code(repo.name)}`));
  }else lines.push('All repositories have reviewed summaries.');
  if(orphaned.length){
    lines.push('',`Reviews without a current public repository (${orphaned.length}):`,'');
    orphaned.forEach(review=>lines.push(`- ${code(review.id)} ${code(review.full_name)}`));
  }
  return lines.join('\n')+'\n';
}

export async function syncGitHub({snapshotPath=defaultPaths.snapshot,overridesPath=defaultPaths.overrides,fetch=globalThis.fetch,token=process.env.GH_TOKEN,now=new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),summaryPath=process.env.GITHUB_STEP_SUMMARY}={}){
  // Invalid reviews fail before any request, so the last committed snapshot stays.
  let overrides;
  try{overrides=validateRepositoryOverrides(JSON.parse(await readFileLimited(overridesPath)));}
  catch(error){throw Error(`Repository reviews are invalid (${error.message}); nothing was written.`);}
  const previous=await readSnapshot(snapshotPath);
  const {snapshot,requests}=await collectRepositories(previous,(endpoint,deadline)=>githubRequest(endpoint,{fetch,token,deadline}),now);
  const reason=writeReason(previous,snapshot,now);
  if(reason)await writeAtomic(snapshotPath,JSON.stringify(snapshot,null,2)+'\n');
  const ids=new Set(snapshot.repositories.map(repo=>repo.id));
  const result={written:!!reason,reason,requests,snapshot,previousFetchedAt:previous?.fetched_at??null,authenticated:!!token,
    unreviewed:snapshot.repositories.filter(repo=>!reviewedRepository(repo,overrides).reviewed).map(({id,name})=>({id,name})),
    orphaned:overrides.repositories.filter(review=>!ids.has(review.id)).map(({id,full_name})=>({id,full_name}))};
  if(summaryPath)await fs.appendFile(summaryPath,summaryMarkdown(result));
  return result;
}

if(import.meta.main??(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))){
  try{
    const result=await syncGitHub(process.argv[2]?{snapshotPath:path.resolve(process.argv[2])}:{});
    console.log(`GitHub snapshot ${result.reason?`written (${result.reason})`:'unchanged'}: ${result.snapshot.repository_count} public repositories, ${result.requests} API ${result.requests===1?'request':'requests'}.`);
    for(const repo of result.unreviewed)console.log(`Unreviewed repository: ${repo.id} ${repo.name}`);
  }catch(error){
    console.error(`GitHub sync failed: ${error.message}`);
    if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`### GitHub repository directory\n\nRefresh failed: ${error.message}\nThe previous snapshot was kept.\n`).catch(()=>{});
    process.exitCode=1;
  }
}
