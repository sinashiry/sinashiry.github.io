import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {composeContent,cmsSections,contentJson,cmsJson,loadModel,run,checkDownloads,validHttps,validEmail,CONTENT_FILE,DOWNLOADS_FILE} from '../compose-content.mjs';
import {deriveBindings,splitContent,sanitize,sectionFields,projectDoc} from '../split-content.mjs';

const model=loadModel('.');
const repoFiles=()=>{const files=new Map();for(const s of cmsSections(model.structure,model.contract))files.set(s.file,fs.readFileSync(s.file,'utf8'));return files;};
const compose=(files,m=model)=>composeContent({...m,readFile:f=>files.has(f)?files.get(f):null,listDir:d=>[...files.keys()].filter(f=>path.dirname(f)===d).map(f=>path.basename(f))});
const edit=(files,file,change)=>{const next=new Map(files),doc=JSON.parse(next.get(file)||'{}');change(doc);next.set(file,cmsJson(doc));return next;};
const messages=result=>result.errors.map(e=>e.message).join('\n');
const bindingsFromContract=contract=>({bound:new Set(Object.keys(contract.editable)),urlPaths:new Set(Object.entries(contract.editable).filter(([,r])=>r.type==='url').map(([p])=>p))});
// The full projection of the editable text, with empty strings kept (what a careless writer could produce).
const unsanitized=value=>{const files=new Map();for(const s of cmsSections(model.structure,model.contract)){const fields=sectionFields(s),doc=s.wrap==='items'?{items:s.node.map((n,i)=>projectDoc(fields[0].fields,n,value[s.key][i]))}:projectDoc(fields,s.node,s.path.split('.').reduce((v,k)=>v[k],value));files.set(s.file,JSON.stringify(doc,null,2));}return files;};

test('committed CMS files compose cleanly and re-split to the same content', () => {
  const first=compose(repoFiles());
  assert.deepEqual(first.errors,[]);
  const text=contentJson(first.value);
  assert.ok(text.endsWith('}\n')&&text.startsWith('{\n  "profile": {'));
  const again=splitContent(first.value,bindingsFromContract(model.contract));
  assert.equal(contentJson(compose(again.files,{structure:again.structure,contract:again.contract,labels:{}}).value),text);
  assert.deepEqual(again.structure,model.structure);
  assert.deepEqual(Object.keys(again.contract.editable),Object.keys(model.contract.editable));
  assert.deepEqual(again.contract,model.contract,'content/contract.json is exactly what split-content derives');
});

test('every project reference link is optional, as its help text says', () => {
  const files=repoFiles(),projects=[...files.keys()].filter(f=>f.startsWith('content/cms/projects/'));
  assert.equal(projects.length,model.structure.projects.length);
  for(const file of projects){
    assert.deepEqual(model.contract.editable[`projects.${model.structure.projects.findIndex(p=>file.endsWith('/'+p.slug+'.json'))}.referenceUrl`],{type:'url',maxLength:2048,required:false,allowEmpty:true},file);
    assert.equal(messages(compose(edit(files,file,doc=>{delete doc.referenceUrl;}))),'',file);
  }
});

test('composed content matches the working copy byte for byte when it exists', {skip:!fs.existsSync(CONTENT_FILE)&&'no generated content.json'}, () => {
  assert.equal(contentJson(compose(repoFiles()).value),fs.readFileSync(CONTENT_FILE,'utf8'));
});

test('a simulated Pages CMS save (empty values and containers stripped) composes identically', () => {
  const value=compose(repoFiles()).value,full=unsanitized(value);
  assert.deepEqual(compose(full).errors,[]);
  const saved=new Map([...full].map(([f,t])=>[f,cmsJson(sanitize(JSON.parse(t)))]));
  let stripped=0;for(const [f,t] of full)stripped+=JSON.stringify(JSON.parse(t)).length-JSON.stringify(sanitize(JSON.parse(t))).length;
  assert.ok(stripped>0,'the simulation removed empty values');
  const result=compose(saved);
  assert.deepEqual(result.errors,[]);
  assert.equal(contentJson(result.value),contentJson(value));
});

test('an empty CMS file (Pages CMS writes {} as nothing) is read as all-empty text', () => {
  const files=edit(repoFiles(),'content/cms/currentWork.json',doc=>{delete doc.researchDetails;});
  assert.equal(files.get('content/cms/currentWork.json'),'');
  const result=compose(files);
  assert.deepEqual(result.errors.map(e=>e.message),['Current research › Current research details › Status: is required.']);
  assert.equal(result.value.currentWork.researchDetails.question,'');
});

test('split derives editable fields from HTML bindings and reproduces content exactly', () => {
  const data={profile:{name:'Sina',title:'Locked',email:'a@example.com',site:''},items:[{slug:'one',title:'One',category:'x',tags:['a','b'],gallery:[{src:'/a.webp',alt:'A'}]}],projects:[{slug:'p-one',title:'P',summary:'',credit:'c'}],recommendations:{entries:[{quote:'',approved:'no'}]}};
  const html=['<title data-cv-title="profile.name">x</title><a href="mailto:" data-cv-href="profile.email"></a><a href="" data-cv-url="profile.site"></a>',
    '<span data-cv="items.0.title">One</span><span data-cv="items.0.category">x</span><span data-cv="items.0.tags.0">a</span><span data-cv="items.0.tags.1">b</span><img alt="A" data-cv-alt="items.0.gallery.0.alt"><span data-cv="projects.0.title">P</span><p data-cv-visible="projects.0.summary"></p><span data-cv="projects.0.credit">c</span><span data-cv="recommendations.entries.0.quote"></span>'];
  const result=splitContent(data,deriveBindings(html,data));
  assert.deepEqual(Object.keys(result.contract.editable),['profile.name','profile.email','profile.site','items.0.title','items.0.tags.0','items.0.tags.1','items.0.gallery.0.alt','projects.0.title','projects.0.summary','recommendations.entries.0.quote','recommendations.entries.0.approved']);
  assert.deepEqual(result.contract.editable['profile.site'],{type:'url',maxLength:2048,required:false,allowEmpty:true});
  assert.deepEqual(result.contract.editable['profile.email'],{type:'email',maxLength:254,required:true});
  assert.deepEqual(result.contract.editable['recommendations.entries.0.approved'],{type:'approval',options:['yes','no'],maxLength:3,required:true});
  assert.ok(result.locked.includes('items.0.category')&&result.locked.includes('projects.0.credit'));
  assert.equal(result.structure.items[0].gallery[0].src,'/a.webp');
  assert.deepEqual(JSON.parse(result.files.get('content/cms/items.json')),{items:[{slug:'one',title:'One',tags:['a','b'],gallery:[{src:'/a.webp',alt:'A'}]}]});
  assert.deepEqual(JSON.parse(result.files.get('content/cms/projects/p-one.json')),{slug:'p-one',title:'P'});
  assert.throws(()=>deriveBindings(['<span data-cv="items.0.tags">x</span>'],data),/Invalid binding/);
  const gap=structuredClone(data);gap.items[0].tags[1]='';
  assert.throws(()=>splitContent(gap,deriveBindings(html,gap)),/items.0.tags has an empty list item/);
  const blank=structuredClone(data);blank.items[0].tags=['',''];
  assert.equal(splitContent(blank,deriveBindings(html,blank)).files.get('content/cms/items.json').includes('tags'),false,'an all-empty list is stored as absent and refilled');
  const carried=splitContent(data,deriveBindings(html.slice(0,1),data),{previous:result.contract});
  assert.deepEqual(carried.contract,result.contract,'bindings hidden in a published build are carried forward');
});

const failures=[
  ['unknown key','content/cms/profile.json',d=>{d.nickname='S';},/Profile & homepage › Nickname: is not a field the website uses/],
  ['locked field added','content/cms/projects/fire-smoke-vision.json',d=>{d.category='Other';},/Fire & smoke vision › Category: is fixed by the website layout/],
  ['reordered gallery item','content/cms/projects/fire-smoke-vision.json',d=>{[d.galleries[0],d.galleries[1]]=[d.galleries[1],d.galleries[0]];},/Gallery images › #1 › Image file \(fixed\): was changed or moved/],
  ['changed anchor','content/cms/education.json',d=>{d.items[0].location='Elsewhere';},/Education › #1 › Location \(fixed\): was changed or moved/],
  ['changed slug','content/cms/projects/rfid-attendance.json',d=>{d.slug='rfid';},/Page address \(fixed\): was changed or moved/],
  ['list length change','content/cms/projects/rfid-attendance.json',d=>{d.approach.pop();},/Approach: has 2 entries, but the website needs exactly 3/],
  ['emptied list item dropped','content/cms/skillGroups.json',d=>{d.items[0].skills=sanitize({s:[d.items[0].skills[0],'',d.items[0].skills[2]]}).s;},/Technical skills › #1 › Skills: has 2 entries/],
  ['added list item','content/cms/experience.json',d=>{d.items[0].highlights=['New'];},/Experience › #1 › Highlights: has 1 entry, but the website needs exactly 0/],
  ['too long','content/cms/profile.json',d=>{d.name='x'.repeat(501);},/Profile & homepage › Name: is 501 characters long; the limit is 500/],
  ['required','content/cms/profile.json',d=>{delete d.heroIntro;},/Homepage introduction: is required/],
  ['control character','content/cms/profile.json',d=>{d.name='Sina\u0007';},/control character/],
  ['not text','content/cms/profile.json',d=>{d.name=5;},/Name: must be plain text/],
  ['bad https','content/cms/profile.json',d=>{d.github='http://github.com/sinashiry';},/GitHub profile address: enter a public address starting with https:/],
  ['userinfo url','content/cms/projects/fire-smoke-vision.json',d=>{d.referenceUrl='https://user@example.com/';},/Project source or reference link: enter a public address/],
  ['bad email','content/cms/profile.json',d=>{d.email='info@sina-shiri';},/Public email address: enter a valid email address/],
  ['bad referee email','content/cms/academic.json',d=>{d.references[0].email='x?y@example.com';},/Referee's email address: enter a valid email address/],
  ['bad approval','content/cms/recommendations.json',d=>{d.entries[0].approved='maybe';},/Approved for publication by the author: choose "yes" or "no"/],
  ['approval missing','content/cms/recommendations.json',d=>{delete d.entries[1].approved;},/#2 › Approved for publication by the author: is required/],
  ['not a list','content/cms/research.json',d=>{d.points='One';},/Research page › Key points: must be a list/],
  ['wrapper key','content/cms/honors.json',d=>{d.extra=[];d.extra.push('x');},/Honors: "extra" is not a field the website uses/],
];
for(const [name,file,change,pattern] of failures){
  test(`compose rejects: ${name}`, () => {
    const result=compose(edit(repoFiles(),file,change));
    assert.ok(result.errors.length>0,'expected an error');
    assert.match(messages(result),pattern);
    assert.ok(result.errors.every(e=>e.file&&e.path!==undefined));
  });
}

test('compose rejects a missing or unreadable file, a stray project file and oversized content', () => {
  const files=repoFiles();files.delete('content/cms/contact.json');
  assert.match(messages(compose(files)),/Contact page: the file content\/cms\/contact.json is missing/);
  assert.match(messages(compose(new Map(repoFiles()).set('content/cms/contact.json','{'))),/Contact page: content\/cms\/contact.json could not be read/);
  assert.match(messages(compose(new Map(repoFiles()).set('content/cms/contact.json',Buffer.from([0x7b,0x22,0xff,0x22,0x7d])))),/content\/cms\/contact.json is not valid UTF-8 text/);
  assert.match(messages(compose(new Map(repoFiles()).set('content/cms/projects/new-project.json','{}'))),/new-project.json does not match any slug/);
  const big=edit(repoFiles(),'content/cms/projects/fire-smoke-vision.json',d=>{d.galleries.forEach(g=>{g.caption='x'.repeat(500);g.alt='y'.repeat(500);});});
  const limit=Buffer.byteLength(JSON.stringify(compose(repoFiles()).value))+1000,small={...model,contract:{...model.contract,maxBytes:limit}};
  assert.deepEqual(compose(repoFiles(),small).errors,[]);
  assert.match(messages(compose(big,small)),new RegExp(`The website text is \\d+ bytes; the limit is ${limit}`));
});

test('URL and email rules match the former owner API', () => {
  for(const ok of ['https://github.com/sinashiry','https://example.org:8443/a?b=c#d','https://www.linkedin.com/in/sina-shiri-50b371162/'])assert.ok(validHttps(ok),ok);
  for(const bad of ['http://example.org','https://','https://a b.org','https://u:p@example.org','javascript:alert(1)','https://example.org/\\x','ftp://example.org'])assert.ok(!validHttps(bad),bad);
  for(const ok of ['info@sina-shiri.com','first.last+tag@sub.example.org'])assert.ok(validEmail(ok),ok);
  for(const bad of ['info@sina-shiri','a@b@c.org','a b@c.org','a&b@c.org','a#b@c.org','.a@c.org','a..b@c.org','a@-c.org'])assert.ok(!validEmail(bad),bad);
});

test('downloads must select existing PDFs in the CV upload folder', () => {
  const read=text=>f=>f===DOWNLOADS_FILE?text:null;
  const pdf=f=>f.endsWith('.pdf')&&!f.includes('missing');
  const check=text=>checkDownloads({readFile:read(text),exists:pdf,readHead:f=>f.includes('fake')?'<html>':'%PDF-1.5\n'}).map(e=>e.message).join('\n');
  assert.equal(check(fs.readFileSync(DOWNLOADS_FILE,'utf8')),'');
  assert.equal(checkDownloads({readFile:f=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):null,exists:f=>fs.existsSync(f),readHead:f=>fs.readFileSync(f).subarray(0,16).toString('latin1')}).length,0);
  assert.match(check('{"engineeringCv":"public/x.pdf","academicCv":"content/uploads/cv/a.pdf"}'),/Engineering CV: choose a PDF uploaded to the CV folder/);
  assert.match(check('{"engineeringCv":"content/uploads/cv/missing.pdf","academicCv":"content/uploads/cv/fake.pdf"}'),/missing.pdf does not exist[\s\S]*fake.pdf is not a PDF/);
  assert.match(check('{"academicCv":"content/uploads/cv/a.pdf","other":"x"}'),/"other" is not a field[\s\S]*Engineering CV: choose a PDF/);
  assert.match(check(null),/downloads.json is missing/);
});

test('CLI writes content.json, --check detects staleness, and failures reach the job summary', () => {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'compose-'));
  try{
    fs.cpSync('content',path.join(tmp,'content'),{recursive:true});
    const quiet=fn=>{const {log,error}=console;console.log=console.error=()=>{};try{return fn();}finally{Object.assign(console,{log,error});}};
    assert.equal(quiet(()=>run(['--check'],tmp)),0,'check passes without a generated file');
    assert.equal(quiet(()=>run([],tmp)),0);
    const out=path.join(tmp,CONTENT_FILE),text=fs.readFileSync(out,'utf8');
    assert.equal(text,contentJson(compose(repoFiles()).value));
    assert.equal(quiet(()=>run(['--check'],tmp)),0);
    fs.writeFileSync(out,text.replace('Sina Shiri','Someone else'));
    assert.equal(quiet(()=>run(['--check'],tmp)),1,'stale content.json fails --check');
    assert.equal(fs.readFileSync(out,'utf8').includes('Someone else'),true,'--check does not write');
    const profile=path.join(tmp,'content/cms/profile.json'),doc=JSON.parse(fs.readFileSync(profile,'utf8'));doc.github='http://example.org';fs.writeFileSync(profile,cmsJson(doc));
    const summary=path.join(tmp,'summary.md'),previous=process.env.GITHUB_STEP_SUMMARY;process.env.GITHUB_STEP_SUMMARY=summary;
    try{assert.equal(quiet(()=>run([],tmp)),1);}finally{if(previous===undefined)delete process.env.GITHUB_STEP_SUMMARY;else process.env.GITHUB_STEP_SUMMARY=previous;}
    assert.match(fs.readFileSync(summary,'utf8'),/### Website content check failed[\s\S]*Profile & homepage › GitHub profile address: enter a public address starting with https:\/\//);
    assert.ok(fs.readFileSync(out,'utf8').includes('Someone else'),'a failed run leaves the previous output untouched');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
