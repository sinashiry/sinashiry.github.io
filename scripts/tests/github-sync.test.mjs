import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {syncGitHub,collectRepositories,githubRequest,githubEndpointAllowed,writeReason,defaultPaths,SITE_REPOSITORY_ID,SITE_REPOSITORY_NAME} from '../sync-github.mjs';
import {reviewedRepository,validateRepositoryOverrides} from '../../src/scripts/repository-overrides.ts';

const now='2026-10-07T14:00:00Z',DAY=86400000;
const at=(ms,from=now)=>new Date(Date.parse(from)+ms).toISOString().replace(/\.\d{3}Z$/,'Z');
const keys=['id','name','url','description','primary_language','languages','languages_complete','languages_checked_at','topics','stars','forks','fork','archived','disabled','updated_at','pushed_at','license'];
const repository=(id,extra={})=>({id,name:'repository-'+id,owner:{login:'sinashiry'},private:false,html_url:'https://github.com/sinashiry/repository-'+id,
  description:null,language:'Python',topics:['embedded'],stargazers_count:2,forks_count:1,fork:false,archived:false,disabled:false,
  license:{spdx_id:'MIT'},updated_at:'2026-10-07T12:00:00Z',pushed_at:'2026-10-01T12:00:00Z',size:120,...extra});
const site=(extra={})=>repository(SITE_REPOSITORY_ID,{name:SITE_REPOSITORY_NAME,html_url:'https://github.com/sinashiry/'+SITE_REPOSITORY_NAME,language:'Astro',...extra});

/** Mocked GitHub API: a page list plus per-repository language objects. */
function api(pages,{languages=()=>({Python:400,C:20}),override}={}){
  const calls=[];
  const fetch=async(url,init)=>{
    assert.ok(url.startsWith('https://api.github.com/'));
    const endpoint=url.slice('https://api.github.com'.length);calls.push({endpoint,init});
    const custom=override?.(endpoint,calls.length);
    if(custom instanceof Response)return custom;
    const language=endpoint.match(/^\/repos\/sinashiry\/([^/]+)\/languages$/);
    if(language)return Response.json(languages(language[1]));
    const page=Number(endpoint.match(/&page=(\d+)$/)[1]);
    const link=page<pages.length?`<https://api.github.com/user/1/repos?page=${page+1}>; rel="next", <https://api.github.com/user/1/repos?page=${pages.length}>; rel="last"`:'';
    return Response.json(pages[page-1]??[],{headers:link?{link}:{}});
  };
  return {fetch,calls,languageCalls:()=>calls.filter(call=>call.endpoint.endsWith('/languages')).length};
}

async function workspace(t,previous){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'github-sync-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const snapshotPath=path.join(dir,'github-repositories.json');
  if(previous!==undefined)await fs.writeFile(snapshotPath,typeof previous==='string'?previous:JSON.stringify(previous,null,2)+'\n');
  return {dir,snapshotPath,read:()=>fs.readFile(snapshotPath,'utf8'),json:async()=>JSON.parse(await fs.readFile(snapshotPath,'utf8'))};
}
const run=(ws,fetch,options={})=>syncGitHub({snapshotPath:ws.snapshotPath,overridesPath:defaultPaths.overrides,fetch,token:'',now,summaryPath:'',...options});

/** Previous snapshot written by a successful run, for the no-write cases. */
async function seeded(t,pages,options={}){
  const ws=await workspace(t);
  await run(ws,api(pages).fetch,options);
  return ws;
}

test('collects every page, keeps forks and archives, and writes the existing schema-1 format', async t => {
  const ws=await workspace(t);
  const first=repository(1,{fork:true,archived:true,description:'<script>alert("metadata is text")</script>'});
  const second=repository(2,{updated_at:'2026-10-08T09:00:00Z',license:null,topics:undefined});
  const mock=api([[first],[second]]);
  const result=await run(ws,mock.fetch);
  assert.equal(result.written,true);assert.equal(result.reason,'new snapshot');
  assert.equal(result.requests,4);assert.equal(mock.languageCalls(),2);
  const text=await ws.read(),data=JSON.parse(text);
  assert.equal(text,JSON.stringify(data,null,2)+'\n');
  assert.deepEqual(Object.keys(data),['schema_version','account','profile_url','source_url','fetched_at','repository_count','repositories']);
  assert.deepEqual([data.schema_version,data.account,data.fetched_at,data.repository_count],[1,'sinashiry',now,2]);
  assert.deepEqual(data.repositories.map(repo=>repo.id),[2,1],'newest updated_at first');
  data.repositories.forEach(repo=>assert.deepEqual(Object.keys(repo),keys));
  const [newer,older]=data.repositories;
  assert.deepEqual([older.fork,older.archived,older.description,older.license],[true,true,first.description,'MIT']);
  assert.deepEqual([newer.topics,newer.license,newer.url],[[],null,'https://github.com/sinashiry/repository-2']);
  assert.deepEqual(older.languages,[{name:'Python',bytes:400},{name:'C',bytes:20}]);
  assert.deepEqual([older.languages_complete,older.languages_checked_at],[true,now]);
  const init=mock.calls[0].init;
  assert.deepEqual([init.method,init.redirect,init.headers.authorization,init.headers['x-github-api-version']],['GET','error',undefined,'2026-03-10']);
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(mock.calls[0].endpoint,'/users/sinashiry/repos?per_page=100&type=owner&sort=full_name&direction=asc&page=1');
});

test('incomplete pagination never replaces the previous snapshot', async t => {
  const ws=await seeded(t,[[repository(1)]]);const before=await ws.read();
  const endless=api([],{override:endpoint=>{
    const page=endpoint.match(/&page=(\d+)$/);
    return page&&Response.json([repository(Number(page[1]))],{headers:{link:'<https://api.github.com/x?page=99>; rel="next"'}});
  }});
  await assert.rejects(run(ws,endless.fetch),/page limit/);
  assert.equal(endless.calls.length,10,'stops at the page ceiling');
  const failedSecondPage=api([[repository(1)],[repository(2)]],{override:endpoint=>endpoint.endsWith('page=2')?new Response('{}',{status:500}):undefined});
  await assert.rejects(run(ws,failedSecondPage.fetch),/HTTP 500/);
  await assert.rejects(run(ws,api([[repository(1)],[repository(1)]]).fetch),/pagination changed/);
  await assert.rejects(run(ws,api([[{}]]).fetch),/Invalid GitHub number/);
  await assert.rejects(run(ws,api([[],[]],{override:endpoint=>endpoint.endsWith('page=1')?Response.json({message:'not a list'}):undefined}).fetch),/Invalid GitHub repository page/);
  assert.equal(await ws.read(),before);
});

test('owner, visibility, URL, state, topic and date validation refuse the whole refresh', async t => {
  const ws=await seeded(t,[[repository(1)]]);const before=await ws.read();
  const invalid={
    'owner mismatch':{owner:{login:'another-account'}},'missing owner':{owner:undefined},
    'private repository':{private:true},'missing visibility':{private:undefined},
    'script URL':{html_url:'javascript:alert(1)'},'other account URL':{html_url:'https://github.com/another-account/repository-1'},
    'more than 50 topics':{topics:Array.from({length:51},(_,i)=>'topic-'+i)},'non-text topic':{topics:[7]},
    'non-boolean fork':{fork:'false'},'invalid date':{updated_at:'2026-02-31T00:00:00Z'},'dot name':{name:'..',html_url:'https://github.com/sinashiry/..'},
    'negative stars':{stargazers_count:-1},'oversized description':{description:'x'.repeat(10001)},
  };
  for(const [name,extra] of Object.entries(invalid)){
    const mock=api([[repository(1),repository(2,extra)]]);
    await assert.rejects(run(ws,mock.fetch),/Unexpected|Invalid/,name);
    assert.equal(mock.languageCalls(),0,name+' fails before language requests');
  }
  assert.equal(await ws.read(),before);
  const caseOnly=await run(ws,api([[repository(1,{html_url:'https://GitHub.com/SinaShiry/repository-1',owner:{login:'SinaShiry'},topics:Array.from({length:50},(_,i)=>'t'+i)})]]).fetch,{now:at(DAY)});
  assert.equal(caseOnly.snapshot.repositories[0].url,'https://github.com/sinashiry/repository-1','URL is rebuilt, never copied');
  assert.equal(caseOnly.snapshot.repositories[0].topics.length,50);
});

test('HTTP failures, redirects, malformed and oversized bodies are refused without leaking the token', async t => {
  const ws=await seeded(t,[[repository(1)]]);const before=await ws.read();
  const token='test-token-never-printed';
  for(const status of [401,403,429,500,302,304]){
    const mock=api([[repository(1)]],{override:()=>new Response(null,{status})});
    const error=await run(ws,mock.fetch,{token}).catch(error=>error);
    assert.match(error.message,new RegExp('HTTP '+status));assert.ok(!error.message.includes(token));
    assert.equal(mock.calls[0].init.headers.authorization,'Bearer '+token);
  }
  const redirect=await run(ws,async()=>{throw new TypeError('fetch failed',{cause:Object.assign(new Error('unexpected redirect'),{code:'UND_ERR_REDIRECT'})});},{token}).catch(error=>error);
  assert.match(redirect.message,/request failed \(UND_ERR_REDIRECT\)/);assert.ok(!redirect.message.includes(token));
  await assert.rejects(run(ws,api([],{override:()=>new Response('{')}).fetch),/malformed JSON/);
  await assert.rejects(run(ws,api([],{override:()=>new Response(' '.repeat(2097153))}).fetch),/size limit/);
  await assert.rejects(run(ws,api([],{override:()=>new Response('[]',{headers:{'content-length':'2097153'}})}).fetch),/size limit/);
  await assert.rejects(run(ws,api([],{override:()=>new Response(new Uint8Array([0x5b,0xff,0x5d]))}).fetch),/UTF-8/);
  await assert.rejects(run(ws,api([[repository(1,{pushed_at:'2026-10-02T00:00:00Z'})]],{languages:()=>['Python']}).fetch),/Invalid language list/);
  assert.equal(await ws.read(),before);
});

test('only the two fixed GitHub endpoints can be requested', async () => {
  for(const endpoint of ['/users/sinashiry/repos?per_page=100&type=owner&sort=full_name&direction=asc&page=3','/repos/sinashiry/sinashiry.github.io/languages'])assert.ok(githubEndpointAllowed(endpoint),endpoint);
  let called=0;const fetch=async()=>{called++;return Response.json({});};
  for(const endpoint of ['/repos/sinashiry/../../other/languages','/repos/sinashiry/../languages','/repos/sinashiry/./languages','/users/other/repos?per_page=100&type=owner&sort=full_name&direction=asc&page=1',
    '/repos/sinashiry/x/languages?x=1','/repos/sinashiry/x/languages\n','/users/sinashiry/repos?per_page=100&type=owner&sort=full_name&direction=asc&page=0','https://example.org/repos/sinashiry/x/languages']){
    assert.equal(githubEndpointAllowed(endpoint),false,endpoint);
    await assert.rejects(githubRequest(endpoint,{fetch}),/not allowed/);
  }
  assert.equal(called,0);
});

test('languages are reused while pushed_at is unchanged and refreshed after a push or after 7 days', async t => {
  const ws=await seeded(t,[[repository(1),repository(2)]]);
  const same=api([[repository(1),repository(2)]]);
  const unchanged=await run(ws,same.fetch,{now:at(2*DAY)});
  assert.deepEqual([unchanged.written,unchanged.requests,same.languageCalls()],[false,1,0]);
  const pushed=api([[repository(1,{pushed_at:'2026-10-08T00:00:00Z'}),repository(2)]],{languages:name=>name==='repository-1'?{Python:500}:{Python:400,C:20}});
  const afterPush=await run(ws,pushed.fetch,{now:at(2*DAY)});
  assert.deepEqual([afterPush.written,afterPush.reason,pushed.languageCalls()],[true,'repository data changed',1]);
  assert.equal(pushed.calls.find(call=>call.endpoint.endsWith('/languages')).endpoint,'/repos/sinashiry/repository-1/languages');
  const stored=await ws.json(),pushedRepo=stored.repositories.find(repo=>repo.id===1),otherRepo=stored.repositories.find(repo=>repo.id===2);
  assert.deepEqual([pushedRepo.languages,pushedRepo.languages_checked_at,otherRepo.languages_checked_at],[[{name:'Python',bytes:500}],at(2*DAY),now]);
  const stale=api([[repository(1,{pushed_at:'2026-10-08T00:00:00Z'}),repository(2)]],{languages:name=>name==='repository-1'?{Python:500}:{Python:400,C:20}});
  await run(ws,stale.fetch,{now:at(8*DAY)});
  assert.equal(stale.languageCalls(),1,'only the list checked more than 7 days ago is refreshed');
});

test('a large account converges within the language request budget', async t => {
  const ws=await workspace(t);
  const many=Array.from({length:31},(_,i)=>repository(i+1));
  const first=await run(ws,api([many]).fetch);
  assert.deepEqual([first.snapshot.repository_count,first.requests],[31,21]);
  assert.equal(first.snapshot.repositories.filter(repo=>repo.languages_complete).length,20);
  assert.ok(first.snapshot.repositories.filter(repo=>!repo.languages_complete).every(repo=>repo.languages_checked_at===null&&repo.languages.length===0));
  const second=await run(ws,api([many]).fetch,{now:at(3600000)});
  assert.deepEqual([second.written,second.requests],[true,12]);
  assert.equal(second.snapshot.repositories.filter(repo=>repo.languages_complete).length,31);
});

test('unchanged repository data is not rewritten; check times alone do not count', async t => {
  const ws=await seeded(t,[[repository(1),repository(2)]]);const before=await ws.read();
  const result=await run(ws,api([[repository(1),repository(2)]]).fetch,{now:at(6*DAY)});
  assert.deepEqual([result.written,result.reason],[false,null]);
  assert.equal(await ws.read(),before);
  const previous=JSON.parse(before);previous.fetched_at=at(DAY);previous.repositories.forEach(repo=>{repo.languages_checked_at='2026-09-01T00:00:00Z';});
  await fs.writeFile(ws.snapshotPath,JSON.stringify(previous,null,2)+'\n');const checked=await ws.read();
  const recheck=api([[repository(1),repository(2)]]);
  const rechecked=await run(ws,recheck.fetch,{now:at(2*DAY)});
  assert.deepEqual([rechecked.written,recheck.languageCalls()],[false,2],'identical language lists after a stale check are not a change');
  assert.equal(await ws.read(),checked);
  assert.equal(writeReason(previous,{...previous,fetched_at:at(2*DAY)},at(2*DAY)),null);
});

test('a weekly heartbeat rewrites an unchanged snapshot older than 7 days', async t => {
  const ws=await seeded(t,[[repository(1)]]);const before=await ws.read();
  const boundary=await run(ws,api([[repository(1)]]).fetch,{now:at(7*DAY)});
  assert.equal(boundary.written,false,'exactly 7 days is not yet older than 7 days');
  assert.equal(await ws.read(),before);
  const heartbeat=await run(ws,api([[repository(1)]]).fetch,{now:at(7*DAY+1000)});
  assert.deepEqual([heartbeat.written,heartbeat.reason],[true,'weekly heartbeat']);
  const stored=await ws.json();
  assert.equal(stored.fetched_at,at(7*DAY+1000));
  assert.equal(stored.repositories[0].languages_checked_at,at(7*DAY+1000));
});

test('site repository activity alone never triggers a write, other changes still do', async t => {
  const ws=await seeded(t,[[repository(1),site()]]);const before=await ws.read();
  const activity=site({pushed_at:'2026-10-08T10:00:00Z',updated_at:'2026-10-08T10:00:05Z',size:999});
  const mock=api([[repository(1),activity]],{languages:name=>name===SITE_REPOSITORY_NAME?{Astro:9000,TypeScript:4000}:{Python:400,C:20}});
  const quiet=await run(ws,mock.fetch,{now:at(DAY)});
  assert.deepEqual([quiet.written,mock.languageCalls()],[false,1]);
  assert.equal(await ws.read(),before);
  const again=await run(ws,api([[repository(1),site({pushed_at:'2026-10-09T10:00:00Z',updated_at:'2026-10-09T10:00:00Z'})]]).fetch,{now:at(2*DAY)});
  assert.equal(again.written,false,'repeated site commits stay quiet');
  const otherActivity=await run(ws,api([[repository(1,{updated_at:'2026-10-08T10:00:00Z'}),site()]]).fetch,{now:at(DAY)});
  assert.deepEqual([otherActivity.written,otherActivity.reason],[true,'repository data changed'],'other repositories keep activity changes');
  const starred=await run(ws,api([[repository(1,{updated_at:'2026-10-08T10:00:00Z'}),site({stargazers_count:3,pushed_at:'2026-10-10T00:00:00Z',updated_at:'2026-10-10T00:00:00Z'})]]).fetch,{now:at(3*DAY)});
  assert.equal(starred.written,true,'site repository facts other than activity still count');
  const stored=(await ws.json()).repositories.find(repo=>repo.id===SITE_REPOSITORY_ID);
  assert.deepEqual([stored.stars,stored.pushed_at,stored.updated_at],[3,'2026-10-10T00:00:00Z','2026-10-10T00:00:00Z'],'current activity is recorded when written');
  const impostor=(extra={})=>repository(77,{name:SITE_REPOSITORY_NAME,html_url:'https://github.com/sinashiry/'+SITE_REPOSITORY_NAME,...extra});
  const other=await seeded(t,[[impostor()]]);
  const renamed=await run(other,api([[impostor({pushed_at:'2026-10-08T10:00:00Z',updated_at:'2026-10-08T10:00:00Z'})]]).fetch,{now:at(DAY)});
  assert.equal(renamed.written,true,'the exemption is keyed by the immutable ID, not the name');
});

test('invalid reviews fail before any request and nothing is written', async t => {
  const ws=await seeded(t,[[repository(1)]]);const before=await ws.read();
  const reviews=JSON.parse(await fs.readFile(defaultPaths.overrides,'utf8'));
  const broken=[
    {...reviews,schema_version:2},
    {...reviews,repositories:[...reviews.repositories,{...reviews.repositories[0]}]},
    {...reviews,repositories:[{...reviews.repositories[0],relatedProject:{path:'/projects/not-reviewed/',label:'Unknown'}}]},
    {...reviews,repositories:[{...reviews.repositories[0],description:'  '}]},
  ];
  for(const [index,value] of broken.entries()){
    const overridesPath=path.join(ws.dir,`reviews-${index}.json`);await fs.writeFile(overridesPath,JSON.stringify(value));
    const mock=api([[repository(1)]]);
    await assert.rejects(run(ws,mock.fetch,{overridesPath,now:at(8*DAY)}),/Repository reviews are invalid/);
    assert.equal(mock.calls.length,0);
  }
  await assert.rejects(run(ws,api([[repository(1)]]).fetch,{overridesPath:path.join(ws.dir,'missing.json')}),/Repository reviews are invalid/);
  assert.equal(await ws.read(),before);
});

test('an invalid or symlinked previous snapshot is refused', async t => {
  const ws=await workspace(t,'{');
  await assert.rejects(run(ws,api([[repository(1)]]).fetch),/Invalid previous repository snapshot/);
  assert.equal(await ws.read(),'{');
  await fs.writeFile(ws.snapshotPath,JSON.stringify({schema_version:2,account:'sinashiry',repositories:[]}));
  await assert.rejects(run(ws,api([[repository(1)]]).fetch),/Invalid previous repository snapshot/);
  const target=path.join(ws.dir,'target.json'),link=path.join(ws.dir,'link.json');
  await fs.writeFile(target,'{}');await fs.symlink(target,link);
  await assert.rejects(syncGitHub({snapshotPath:link,overridesPath:defaultPaths.overrides,fetch:api([[repository(1)]]).fetch,token:'',now,summaryPath:''}),/not a regular file/);
  assert.equal(await fs.readFile(target,'utf8'),'{}');
});

test('the step summary reports counts and unreviewed repositories', async t => {
  const ws=await workspace(t);const summaryPath=path.join(ws.dir,'summary.md');
  const token='summary-token-never-printed';
  const result=await run(ws,api([[repository(5,{fork:true}),site()]]).fetch,{summaryPath,token});
  const summary=await fs.readFile(summaryPath,'utf8');
  assert.match(summary,/Public repositories: 2 \(1 fork, 0 archived\)/);
  assert.match(summary,/API requests: 3 \(authenticated\)/);
  assert.match(summary,/written \(new snapshot\)/);
  assert.match(summary,/Unreviewed repositories \(1\)/);
  assert.match(summary,/- `5` `repository-5`/);
  assert.ok(!summary.includes(SITE_REPOSITORY_NAME),'the reviewed site repository is neither unreviewed nor orphaned');
  assert.ok(!summary.includes(token));
  assert.deepEqual(result.unreviewed,[{id:5,name:'repository-5'}]);
  assert.equal(result.orphaned.length,JSON.parse(await fs.readFile(defaultPaths.overrides,'utf8')).repositories.length-1);
});

test('the committed snapshot is reproduced byte for byte and the site repository is reviewed', async () => {
  const text=await fs.readFile(defaultPaths.snapshot,'utf8'),committed=JSON.parse(text);
  const raw=committed.repositories.map(repo=>({id:repo.id,name:repo.name,owner:{login:'sinashiry'},private:false,html_url:repo.url,description:repo.description,
    language:repo.primary_language,topics:repo.topics,stargazers_count:repo.stars,forks_count:repo.forks,fork:repo.fork,archived:repo.archived,disabled:repo.disabled,
    license:repo.license===null?null:{spdx_id:repo.license},updated_at:repo.updated_at,pushed_at:repo.pushed_at})).sort((a,b)=>a.name.toLowerCase()<b.name.toLowerCase()?-1:1);
  const byName=new Map(committed.repositories.map(repo=>[repo.name,Object.fromEntries(repo.languages.map(language=>[language.name,language.bytes]))]));
  const mock=api([raw],{languages:name=>byName.get(name)});
  const {snapshot}=await collectRepositories(committed,(endpoint,deadline)=>githubRequest(endpoint,{fetch:mock.fetch,deadline}),committed.fetched_at);
  assert.equal(JSON.stringify(snapshot,null,2)+'\n',text);
  assert.equal(writeReason(committed,snapshot,committed.fetched_at),null);
  // Review coverage is not asserted here: the sync commits new repositories unreviewed (neutral copy, listed in its job
  // summary), and this test runs before every deploy, so asserting it would block owner edits until a maintainer reviews.
  const reviews=validateRepositoryOverrides(JSON.parse(await fs.readFile(defaultPaths.overrides,'utf8')));
  const siteReview=reviewedRepository({id:SITE_REPOSITORY_ID},reviews);
  assert.deepEqual([siteReview.reviewed,siteReview.relatedProject],[true,null]);
  assert.equal(reviews.repositories.find(review=>review.id===SITE_REPOSITORY_ID).full_name,'sinashiry/'+SITE_REPOSITORY_NAME);
});
