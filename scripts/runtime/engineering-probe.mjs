import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {startProductHost} from 'sentiscope-runtime/plugin';
export const name='sentiscope-product-engineering-check';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const text=m=>m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
function toolValue(m) {try{return JSON.parse(text(m));}catch{return {};}}
export class Synthetic extends LlmAdapter {
 calls=[];
 async *stream(o) {
  const users=o.messages.filter(m=>m.role==='user'),u=text(users.at(-1)??{}),last=o.messages.at(-1),data=last?.role==='tool'?toolValue(last):{};
  this.calls.push({at:new Date().toISOString(),latest:u.slice(0,300),lastRole:last?.role});
  let call;
  const worker=users.some(m=>text(m).includes('SENTISCOPE_WORKER'));
  if(worker&&(u.includes('SENTISCOPE_INPUTS')||u.includes('SENTISCOPE_WORKER'))) {
   if(last?.role!=='tool')call=['list_sources',{}];
   else if(data.references?.length){const ref=data.references.at(-1);call=['read_source',{ref:ref.ref,hash:ref.hash}];}
   else if(data.record)call=['report_research',{state:'progress',summary:`Synthetic engineering transport report: ${data.text}`,evidence:[{ref:data.record.ref,hash:data.record.hash}]}];
   else if(data.references)call=['report_research',{state:'waiting',summary:'Synthetic engineering fixture: no current evidence; no business conclusion.',evidence:[]}];
  } else if(!worker&&u.includes('SENTISCOPE_ASSESS')&&(last?.role!=='tool'||data.ticketId)){
   const c=JSON.parse(u.split('\n')[1]);if(c.tickets.length&&last?.role!=='tool')call=['note_ticket',{ticketId:c.tickets[0].id,text:'Synthetic engineering new event requires checking the current exact source reference.'}];else call=['decide_event',{triggerId:c.triggers[0].id,evalId:c.evalId,kind:c.tickets.length?'ignore':'accept',reason:'Synthetic fixture routes one persistent research ticket; no professional assessment.',title:'Engineering transport ticket',scope:'Only test current authorized synthetic references.'}];
  } else if(!worker&&u.includes('SENTISCOPE_CONTINUE')) {
   if(last?.role!=='tool')call=['research_context',{}];
   else if(data.tickets?.find(t=>!t.ended))call=['note_ticket',{ticketId:data.tickets.find(t=>!t.ended).id,text:'Synthetic engineering scheduled continuation; check current authorized evidence.'}];
  }
  if(call){yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'block-end',index:0,block:{type:'tool-call',id:ToolCallId(randomUUID()),name:call[0],arguments:JSON.stringify(call[1])}};yield {type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield {type:'finish',reason:{kind:'tool-calls'}};}
  else {const block={type:'text',text:'Engineering synthetic native turn; not research quality evidence.'};yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block};yield {type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield {type:'finish',reason:{kind:'stop'}};}
 }
}
const wait=async(fn,label,timeout=80000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error(`Timed out: ${label}`);};
export async function apply(ctx,config) {
 const result={status:'FAIL',scope:'Product HTTP + actual official Engine/SQLite/native Agent/Schedule, explicit local synthetic Provider only',checks:[]};let host;
 try{
  const adapter=new Synthetic();ctx.llm.registerAdapter(['sentiscope-engineering-only'],adapter);
  host=await startProductHost(ctx,{dataDirectory:resolve(config.root,'data'),owner:{enterpriseId:'engineering',principalId:'operator'},port:0,model:{provider:'sentiscope-engineering-only',model:'synthetic',maxTokens:64},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:1000,outputTokens:1000000,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider:'sentiscope-engineering-only',model:'synthetic',maxTokens:64}}},{localModelRoutes:[{provider:'sentiscope-engineering-only',model:'synthetic'}]});
  const req=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  const created=await req('/api/delegations',{goal:'Synthetic continuous research goal; engineering transport only.',boundary:'Read only synthetic fixture; no business action.',idempotencyKey:'fixture-create'});const id=created.delegation.id;
  const source=mkdtempSync(join(tmpdir(),'sentiscope-engineering-source-'));result.sourceDirectory=source;writeFileSync(resolve(source,'fact.txt'),'engineering source version one');
  host.coordinator.configureSources(id,[{sourceId:'fixture',directory:source,grantRevision:1,enabled:true}]);await host.coordinator.sync(id);
  await wait(()=>host.coordinator.detail(id).artifacts.some(a=>a.evidence.length),'first exact evidence report');
  let d=await req(`/api/delegations/${id}`);assert.equal(d.research.length,1);assert.ok(d.technical.some(f=>f.kind==='native_read'));assert.ok(d.technical.some(f=>f.kind==='research_report'));
  result.checks.push('HTTP create -> official Engine evaluation/Decision/Ticket/Assignment -> native tools -> exact source version -> explicit saved report, with separate native read/turn facts');
  await wait(()=>host.coordinator.detail(id).technical.some(f=>f.kind==='native_read'&&!String(f.detail.messageId).startsWith('intent-')&&!String(f.detail.messageId).startsWith('context-')),'actual first native scheduled read');
  const before=d.artifacts.length;
  await wait(()=>host.coordinator.detail(id).artifacts.length>before,'no-new-data scheduled continuation');
  result.checks.push('Actual native recurring Schedule continues the goal without a new user message or new file; Agent chooses note routing to existing worker');
  writeFileSync(resolve(source,'fact.txt'),'engineering source version two');
  await wait(()=>host.coordinator.detail(id).artifacts.some(a=>a.summary.includes('version two')),'automatic file update through due wake');
  d=await req(`/api/delegations/${id}`);assert.equal(d.research.length,1);assert.ok(d.artifacts.some(a=>a.summary.includes('version one')));assert.ok(d.artifacts.some(a=>a.qualification==='historical'));
  result.checks.push('Native due wake discovers changed source automatically; same official Thread fans out to existing ticket, fresh qualified Session uses version two and preserves version-one report');
  const db=host.store;const intents=db.connection.prepare('SELECT state,kind FROM engine_intents').all();assert.ok(intents.some(x=>x.kind==='deliver'&&x.state==='sent'));
  const count=adapter.calls.length;await req(`/api/delegations/${id}/commands`,{kind:'pause',expectedVersion:d.delegation.version,idempotencyKey:'pause'});
  await wait(async()=> (await req(`/api/delegations/${id}`)).delegation.lifecycle==='paused','native pause receipt');
  const stopped=adapter.calls.length;await new Promise(r=>setTimeout(r,1300));assert.equal(adapter.calls.length,stopped);
  result.checks.push('Real lifecycle command waits for native cancellation/disposal and Schedule disable; paused goal makes no additional synthetic model requests');
  d=await req(`/api/delegations/${id}`);await req(`/api/delegations/${id}/commands`,{kind:'resume',expectedVersion:d.delegation.version,idempotencyKey:'resume'});
  await wait(async()=> (await req(`/api/delegations/${id}`)).delegation.lifecycle==='active','resume business receipt');
  await wait(()=>adapter.calls.length>stopped,'automatic native continuation after resume');
  result.checks.push('Resume receipt enables automatic continuation after persisted business eligibility, no chat trigger required');
  host.coordinator.configureSources(id,[]);await host.coordinator.sync(id);
  assert.equal(host.coordinator.detail(id).sources[0].status,'revoked');
  result.checks.push('Host-only source withdrawal revokes further reads and rotates qualified Session context; original source/report evidence is retained');
  d=await req(`/api/delegations/${id}`);await req(`/api/delegations/${id}/commands`,{kind:'end',expectedVersion:d.delegation.version,idempotencyKey:'end'});await wait(async()=> (await req(`/api/delegations/${id}`)).delegation.lifecycle==='ended','end');
  const ended=adapter.calls.length;await new Promise(r=>setTimeout(r,1200));assert.equal(adapter.calls.length,ended);
  result.checks.push('Ending retains all prior work and actually stops owned native sessions/timers');
  result.delegationId=id;result.url=host.url;result.requests=adapter.calls;result.detail=await req(`/api/delegations/${id}`);result.status='PASS';
 }catch(error){result.error={message:error.message,stack:error.stack};if(host)result.debug=host.store.connection.prepare('SELECT kind,detail FROM research_facts ORDER BY seq').all();}
 finally{if(host){try{await host.close();}catch(e){result.status='FAIL';result.cleanupError=e.message;}}}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}
