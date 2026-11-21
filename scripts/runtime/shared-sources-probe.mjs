import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {startProductHost} from 'sentiscope-runtime/plugin';
export const name='sentiscope-shared-source-engineering-check';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const text=m=>m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
function toolValue(m){try{return JSON.parse(text(m));}catch{return{};}}
export class Synthetic extends LlmAdapter{
 calls=[];assessments=new Map();noted=new Set();decided=new Set();intake=new Set();independent=new Set();
 async *stream(o){
  const users=o.messages.filter(m=>m.role==='user'),u=text(users.at(-1)??{}),last=o.messages.at(-1),data=last?.role==='tool'?toolValue(last):{};
  this.calls.push({at:new Date().toISOString(),sessionId:String(o.sessionId??''),latest:u.slice(0,300),messages:JSON.parse(JSON.stringify(o.messages))});
  let call;const worker=users.some(m=>text(m).includes('SENTISCOPE_WORKER'));
  if(worker&&(u.includes('SENTISCOPE_INPUTS')||u.includes('SENTISCOPE_WORKER'))){
   if(last?.role!=='tool')call=['list_sources',{}];
   else if(data.references?.length){const ref=data.references.at(-1);call=['read_source',{ref:ref.ref,hash:ref.hash}];}
   else if(data.record)call=['report_research',{state:'progress',summary:`Synthetic shared-source report: ${data.text}`,evidence:[{ref:data.record.ref,hash:data.record.hash}]}];
   else if(data.references)call=['report_research',{state:'waiting',summary:'No currently authorized synthetic evidence.',evidence:[]}];
  }else if(!worker&&u.includes('SENTISCOPE_ASSESS')){
   const c=JSON.parse(u.split('\n')[1]),evalId=c.evalId,delegationId=c.triggers[0].meta.delegationId;
   if(!this.decided.has(evalId)){
    const stage=this.assessments.get(evalId)??0;
    if(stage===0){call=['research_context',{}];this.assessments.set(evalId,1);}
    else if(stage===1&&!this.intake.has(delegationId)){
     call=['save_intake_summary',{requestId:`intake-${delegationId}`,expectedRevision:data.intake?.summary?.revision??0,reason:'Synthetic Agent consolidated the one-line goal and exposed only a localized evaluation gap.',content:{objective:data.goal,facts:['Host exposes authorized synthetic source metadata; source bodies are read through exact authorized references.'],assumptions:['Synthetic engineering transport only; no business fact is inferred.'],reusableExperiences:[],researchAuthorization:['Read only the Host-granted synthetic directory.'],businessBoundary:['No operating action, external send or computation.'],evaluation:['Evaluation waits for the synthetic target; independent source research continues.'],followUp:['Supplement existing research and open a separate question only when the source event warrants it.'],unknowns:['Synthetic evaluation target is not supplied.'],questions:[{id:'evaluation-target',question:'Which synthetic evaluation target applies?',impact:'Only the evaluation direction waits.',blockingScopes:['evaluation'],status:'pending'}]}}];
     this.intake.add(delegationId);this.assessments.set(evalId,2);
    }else{
     this.assessments.set(evalId,2);const existing=c.tickets.find(t=>!t.ended);
     if(existing&&!this.noted.has(evalId)){call=['note_ticket',{ticketId:existing.id,text:'Synthetic source event supplements the existing research ticket. '}];this.noted.add(evalId);}
     else{
      const separate=c.triggers.some(trigger=>trigger.meta?.kind==='updated')&&!this.independent.has(delegationId);
      call=['decide_event',{triggerId:c.triggers[0].id,evalId,kind:existing&&!separate?'ignore':'accept',reason:separate?'The same update also exposes an independent synthetic question.':'Synthetic event is routed without duplicate research.',title:separate?'Independent source question':'Shared source baseline',scope:separate?'independent-question':'shared-source-baseline'}];
      if(separate)this.independent.add(delegationId);this.decided.add(evalId);
     }
    }
   }
  }else if(!worker&&u.includes('SENTISCOPE_CONTINUE')){
   if(last?.role!=='tool')call=['research_context',{}];
   else if(data.tickets?.find(t=>!t.ended))call=['note_ticket',{ticketId:data.tickets.find(t=>!t.ended).id,text:'Synthetic scheduled continuation checks currently authorized evidence. '}];
  }
  if(call){yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:ToolCallId(randomUUID()),name:call[0],arguments:JSON.stringify(call[1])}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};}
  else{yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Synthetic shared-source turn; not research quality evidence.'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};}
 }
}
const wait=async(fn,label,timeout=80000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error(`Timed out: ${label}`);};
export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Normal product HTTP + official Engine/Harness/native Session/Schedule + two independently authorized synthetic directory grants',checks:[]};let host,adapter;
 try{
  adapter=new Synthetic();ctx.llm.registerAdapter(['sentiscope-shared-source-only'],adapter);
  const owner={enterpriseId:'shared-source-engineering',principalId:'operator'};
  host=await startProductHost(ctx,{dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider:'sentiscope-shared-source-only',model:'synthetic',maxTokens:128},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:5000,outputTokens:1000000,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider:'sentiscope-shared-source-only',model:'synthetic',maxTokens:128}}},{localModelRoutes:[{provider:'sentiscope-shared-source-only',model:'synthetic'}]});
  const req=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  const a=(await req('/api/delegations',{goal:'Track the first synthetic shared-source goal.',boundary:'Synthetic read only; no business action.',idempotencyKey:'shared-a'})).delegation;
  const b=(await req('/api/delegations',{goal:'Track the second independently authorized synthetic goal.',boundary:'Synthetic read only; no business action.',idempotencyKey:'shared-b'})).delegation;
  result.delegationIds=[a.id,b.id];
  const source=mkdtempSync(join(tmpdir(),'sentiscope-shared-source-official-'));result.sourceDirectory=source;writeFileSync(resolve(source,'fact.txt'),'version one');
  host.coordinator.configureSources(a.id,[{sourceId:'shared',directory:source,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true}]);
  host.coordinator.configureSources(b.id,[{sourceId:'shared',directory:source,grantRevision:1,enabled:true,cacheBody:false,allowHistorical:false}]);
  await host.coordinator.sync(a.id);await host.coordinator.sync(b.id);
  await wait(async()=>{const da=await req(`/api/delegations/${a.id}`),db=await req(`/api/delegations/${b.id}`);return da.intake.summary&&db.intake.summary&&da.research.length>=1&&db.research.length>=1&&da.artifacts.some(x=>x.summary.includes('version one'))&&db.artifacts.some(x=>x.summary.includes('version one'));},'initial shared source and intake');
  let da=await req(`/api/delegations/${a.id}`),db=await req(`/api/delegations/${b.id}`);
  assert.equal(da.intake.pendingQuestions[0].blockingScopes[0],'evaluation');assert.ok(da.research.length>=1,'localized waiting must not block independent research');
  result.checks.push('One-line HTTP delegations -> Agent intake with localized pending evaluation -> official ticket/worker -> exact version-one reports for both grants');
  writeFileSync(resolve(source,'fact.txt'),'version two');
  await wait(async()=>{const da=await req(`/api/delegations/${a.id}`),db=await req(`/api/delegations/${b.id}`);return da.research.length>=2&&db.research.length>=2&&da.artifacts.some(x=>x.summary.includes('version two'))&&db.artifacts.some(x=>x.summary.includes('version two'));},'one update supplements existing and opens independent question');
  da=await req(`/api/delegations/${a.id}`);db=await req(`/api/delegations/${b.id}`);
  const updateA=da.sourceEvents.find(e=>e.kind==='updated'),updateB=db.sourceEvents.find(e=>e.kind==='updated');
  assert.ok(updateA?.collectionId);assert.equal(updateA.collectionId,updateB.collectionId);assert.notEqual(updateA.eventId,updateB.eventId);
  assert.ok(da.research.some(t=>t.title==='Independent source question'));assert.ok(da.research.some(t=>t.title==='Shared source baseline'));
  const ticketCounts=[da.research.length,db.research.length],eventCounts=[da.sourceEvents.length,db.sourceEvents.length];await new Promise(r=>setTimeout(r,1300));
  assert.deepEqual([(await req(`/api/delegations/${a.id}`)).research.length,(await req(`/api/delegations/${b.id}`)).research.length],ticketCounts);
  assert.deepEqual([(await req(`/api/delegations/${a.id}`)).sourceEvents.length,(await req(`/api/delegations/${b.id}`)).sourceEvents.length],eventCounts);
  result.checks.push('One version-two collection ID fans out to two durable receipts; existing ticket is supplemented and an independent ticket is accepted; repeated checks add neither events nor tickets');
  renameSync(source,`${source}-offline`);await host.coordinator.sync(a.id);await host.coordinator.sync(b.id);
  await wait(async()=>{const da=await req(`/api/delegations/${a.id}`),db=await req(`/api/delegations/${b.id}`);return da.sources[0].status==='unavailable'&&db.sources[0].status==='unavailable';},'shared source loss');
  renameSync(`${source}-offline`,source);writeFileSync(resolve(source,'fact.txt'),'version three');await host.coordinator.sync(a.id);await host.coordinator.sync(b.id);
  await wait(async()=>{const da=await req(`/api/delegations/${a.id}`),db=await req(`/api/delegations/${b.id}`);return da.sources[0].status==='ready'&&db.sources[0].status==='ready'&&da.sourceEvents.some(e=>e.kind==='restored')&&db.sourceEvents.some(e=>e.kind==='restored')&&db.artifacts.some(x=>x.summary.includes('version three'));},'restore and catch up');
  da=await req(`/api/delegations/${a.id}`);db=await req(`/api/delegations/${b.id}`);
  assert.ok(da.sources[0].lastCheckedAt&&db.sources[0].lastCheckedAt);assert.ok(['current','recheck_required'].includes(da.intake.status));
  result.checks.push('Loss is visible on both workbenches; restoration emits a bounded event and the changed page is caught up with exact source/fetch timestamps while old intake bodies stay qualified or explicitly recheck-required');
  host.coordinator.configureSources(a.id,[]);await wait(async()=>(await req(`/api/delegations/${a.id}`)).sources[0].status==='revoked','single delegation revocation');await host.coordinator.sync(a.id);await host.coordinator.sync(b.id);
  const revokeMarker=new Date().toISOString(),aSessions=new Set(host.store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=?').all(a.id).map(row=>JSON.parse(row.value).sessionId));
  writeFileSync(resolve(source,'fact.txt'),'version four');await host.coordinator.sync(b.id);
  await wait(async()=>{const db=await req(`/api/delegations/${b.id}`);return db.artifacts.some(x=>x.summary.includes('version four'));},'remaining grant continues after peer revocation');
  da=await req(`/api/delegations/${a.id}`);db=await req(`/api/delegations/${b.id}`);
  assert.equal(da.sources[0].status,'revoked');assert.equal(db.sources[0].status,'ready');assert.equal(da.sourceEvents.filter(e=>e.kind==='updated').length,2);assert.equal(db.sourceEvents.filter(e=>e.kind==='updated').length,3);
  const leaked=adapter.calls.filter(call=>call.at>=revokeMarker&&aSessions.has(call.sessionId)&&JSON.stringify(call.messages).includes('version four'));
  assert.deepEqual(leaked,[],'revoked delegation sessions must not receive later source bodies');
  assert.ok(db.artifacts.some(x=>x.summary.includes('version four')&&x.evidence.length===1));
  result.checks.push('Single-sided revocation preserves safe coverage/history but blocks later body replay; the other grant reads and reports version four through the normal native worker');
  await req(`/api/delegations/${b.id}/commands`,{kind:'research_control',expectedVersion:0,action:'pause',mode:'all',reason:'Synthetic in-flight pause',idempotencyKey:'pause-b'});await host.coordinator.sync(b.id);
  await wait(async()=>{const db=await req(`/api/delegations/${b.id}`);return db.lifecycleControls.status.researchPaused&&db.technical.some(f=>f.kind==='research_interrupted');},'main interruption receipt');
  const stoppedSessions=new Set(host.store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=?').all(b.id).map(row=>JSON.parse(row.value).sessionId)),stoppedAt=new Date().toISOString();
  writeFileSync(resolve(source,'fact.txt'),'version five');await host.coordinator.sync(b.id);await new Promise(r=>setTimeout(r,1200));
  db=await req(`/api/delegations/${b.id}`);assert.equal(db.artifacts.some(x=>x.summary.includes('version five')),false,'research-only pause must not produce a worker report');assert.equal(db.sourceEvents.filter(e=>e.kind==='updated').length,4,'authorized collection must continue');
  const continuedCalls=adapter.calls.filter(call=>call.at>=stoppedAt&&stoppedSessions.has(call.sessionId)&&call.latest.includes('SENTISCOPE_WORKER'));assert.deepEqual(continuedCalls,[]);
  result.checks.push('Research-only global pause records native main interruption and worker retirement while shared collection continues; no version-five worker turn is dispatched');
  await req(`/api/delegations/${b.id}/commands`,{kind:'research_control',expectedVersion:1,action:'resume',reason:'Synthetic resume input arrived',idempotencyKey:'resume-b'});await host.coordinator.sync(b.id);
  await wait(async()=>{const db=await req(`/api/delegations/${b.id}`);return db.lifecycleSummaries.some(s=>s.kind==='resume')&&db.artifacts.some(x=>x.summary.includes('version five'));},'resume summary and catch-up research');
  db=await req(`/api/delegations/${b.id}`);const resumeSummary=db.lifecycleSummaries.find(s=>s.kind==='resume');assert.ok(resumeSummary.sections.changes.some(f=>f.kind==='source_updated'));assert.ok(resumeSummary.sections.continuations.length>=1);
  result.checks.push('Resume writes a one-time factual summary of paused-period source changes, current eligibility, continuations and waits, then the same authorized work catches up');
  const endAt=new Date(Date.now()+1400).toISOString();await req(`/api/delegations/${b.id}/commands`,{kind:'research_control',expectedVersion:2,action:'schedule_end',at:endAt,reason:'Synthetic validity ends',idempotencyKey:'scheduled-end-b'});
  await wait(async()=>{const db=await req(`/api/delegations/${b.id}`);return db.delegation.lifecycle==='ended'&&db.lifecycleSummaries.some(s=>s.kind==='end');},'native scheduled end and immutable summary');
  db=await req(`/api/delegations/${b.id}`);const frozenEnd=JSON.stringify(db.lifecycleSummaries.find(s=>s.kind==='end'));writeFileSync(resolve(source,'fact.txt'),'version six');await host.coordinator.sync(b.id);await new Promise(r=>setTimeout(r,1200));
  const ended=await req(`/api/delegations/${b.id}`);assert.equal(ended.artifacts.some(x=>x.summary.includes('version six')),false);assert.equal(JSON.stringify(ended.lifecycleSummaries.find(s=>s.kind==='end')),frozenEnd);
  result.checks.push('Native Schedule ends the delegation and writes one end summary; later source changes neither revive research nor rewrite the summary');
  result.url=host.url;result.detailA=da;result.detailB=ended;result.requests=adapter.calls.map(({messages,...call})=>call);result.status='PASS';
 }catch(error){result.error={message:error.message,stack:error.stack};if(host){result.debug=host.store.connection.prepare('SELECT delegation_id,kind,detail FROM research_facts ORDER BY seq').all();if(result.delegationIds)result.partialDetails=result.delegationIds.map(id=>host.coordinator.detail(id));result.requests=adapter.calls.map(({messages,...call})=>call);}}
 finally{if(host){try{await host.close();}catch(e){result.status='FAIL';result.cleanupError=e.message;}}}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}
