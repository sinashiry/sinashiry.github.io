/** Balanced removal for trusted template wrappers; no browser or external parser needed. */
export function omitOptional(html){
  const start=/<([a-z][a-z0-9]*)\b[^>]*data-cv-(?:visible|group)-state="empty"[^>]*>/i;
  let match;
  while((match=start.exec(html))){
    const tags=new RegExp('</?'+match[1]+'\\b[^>]*>','gi');tags.lastIndex=match.index+match[0].length;
    let depth=1,end,tag;
    while((tag=tags.exec(html))){depth+=tag[0].startsWith('</')?-1:tag[0].endsWith('/>')?0:1;if(!depth){end=tags.lastIndex;break;}}
    if(end===undefined)throw Error('Unbalanced optional content');
    html=html.slice(0,match.index)+html.slice(end);
  }
  return html;
}

export function groupReady(content, kind) {
  const complete=(entry, fields)=>entry && fields.every(k=>typeof entry[k]==='string' && entry[k].trim());
  if(kind==='academic-profiles') return (content.academic?.profiles||[]).some(e=>complete(e,['label','url']) && /^https:\/\//i.test(e.url));
  if(kind==='academic-references') return (content.academic?.references||[]).some(e=>e.approved==='yes' && complete(e,['name','status','relationship']));
  if(kind==='recommendations') return (content.recommendations?.entries||[]).some(e=>e.approved==='yes' && complete(e,['quote','name','status']));
  if(kind==='current-research') return complete(content.currentWork?.researchDetails,['question','contribution']);
  throw Error('Unknown content group '+kind);
}
