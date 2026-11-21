import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,readdirSync,statSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {startProductHost} from 'sentiscope-runtime/plugin';
const text=m=>m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
function toolValue(m){try{return JSON.parse(text(m));}catch{return{};}}
class Synthetic extends LlmAdapter{
 calls=[];reported=new Set();
 async *stream(o){
  const users=o.messages.filter(m=>m.role==='user'),u=text(users.at(-1)??{}),last=o.messages.at(-1),data=last?.role==='tool'?toolValue(last):{};this.calls.push({at:new Date().toISOString(),latest:u.slice(0,200)});
  let call;const worker=users.some(m=>text(m).includes('SENTISCOPE_WORKER'));
  if(worker&&(u.includes('SENTISCOPE_INPUTS')||u.includes('SENTISCOPE_WORKER'))){
   if(last?.role!=='tool')call=['list_sources',{}];
   else if(data.references?.length){const ref=data.references.at(-1);call=['read_source',{ref:ref.ref,hash:ref.hash}];}
   else if(data.record){const key=`${o.sessionId}:${data.record.hash}`;if(!this.reported.has(key)){call=['report_research',{state:'progress',summary:`Synthetic longstream report: ${data.text}`,evidence:[{ref:data.record.ref,hash:data.record.hash}]}];this.reported.add(key);}}
   else if(data.references)call=['report_research',{state:'waiting',summary:'No current synthetic evidence.',evidence:[]}];
  }else if(!worker&&u.includes('SENTISCOPE_ASSESS')&&(last?.role!=='tool'||data.ticketId)){
   const c=JSON.parse(u.split('\n')[1]);if(c.tickets.length&&last?.role!=='tool')call=['note_ticket',{ticketId:c.tickets[0].id,text:'Longstream source fact routes to the existing ticket.'}];else call=['decide_event',{triggerId:c.triggers[0].id,evalId:c.evalId,kind:c.tickets.length?'ignore':'accept',reason:'Synthetic longstream routing only',title:'Longstream ticket',scope:'longstream-evidence'}];
  }else if(!worker&&u.includes('SENTISCOPE_CONTINUE')){
   if(last?.role!=='tool')call=['research_context',{}];else if(data.tickets?.find(t=>!t.ended))call=['note_ticket',{ticketId:data.tickets.find(t=>!t.ended).id,text:'Longstream native continuation.'}];
  }
  if(call){yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:ToolCallId(randomUUID()),name:call[0],arguments:JSON.stringify(call[1])}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};}
  else{yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Synthetic longstream turn'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};}
 }
}
export const name='sentiscope-longstream-engineering-check';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const wait=async(fn,label,timeout=80000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error(`Timed out: ${label}`);};
function directoryBytes(directory){if(!existsSync(directory))return 0;let bytes=0;for(const entry of readdirSync(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())bytes+=directoryBytes(path);else if(entry.isFile())bytes+=statSync(path).size;}return bytes;}
function regression(samples){const xs=[],ys=[];for(let index=1;index<samples.length;index++){xs.push(samples[index].evidenceBytes-samples[index-1].evidenceBytes);ys.push(samples[index].nativeBytes-samples[index-1].nativeBytes);}assert.ok(ys.every(value=>value>0),'Native session bytes must increase for every evidence batch');const mean=x=>x.reduce((a,b)=>a+b,0)/x.length,mx=mean(xs),my=mean(ys),cov=xs.reduce((sum,x,i)=>sum+(x-mx)*(ys[i]-my),0),vx=xs.reduce((sum,x)=>sum+(x-mx)**2,0),vy=ys.reduce((sum,y)=>sum+(y-my)**2,0);assert.ok(vx>0&&vy>0);const slope=cov/vx,r2=cov*cov/(vx*vy);return{slope,r2,deltas:xs.map((x,i)=>({evidenceBytes:x,nativeBytes:ys[i]}))};}
export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Official native JSONL session files and business evidence; incremental synthetic source batches; no real model or enterprise data',checks:[]};let host,adapter;
 try{
  adapter=new Synthetic();ctx.llm.registerAdapter(['sentiscope-longstream-only'],adapter);
  const owner={enterpriseId:'longstream-engineering',principalId:'operator'};
  host=await startProductHost(ctx,{dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider:'sentiscope-longstream-only',model:'synthetic',maxTokens:256},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:5000,outputTokens:1000000,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider:'sentiscope-longstream-only',model:'synthetic',maxTokens:256}}},{localModelRoutes:[{provider:'sentiscope-longstream-only',model:'synthetic'}]});
  const source=mkdtempSync(join(tmpdir(),'sentiscope-longstream-source-')),fact=resolve(source,'fact.txt');writeFileSync(fact,'initial synthetic evidence');
  const created=await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'Longstream synthetic append and readback check',boundary:'Synthetic only',idempotencyKey:'longstream-create'})});assert.equal(created.status,201);const id=(await created.json()).delegation.id;
  host.coordinator.configureSources(id,[{sourceId:'longstream',directory:source,grantRevision:1,enabled:true}]);await host.coordinator.sync(id);await wait(()=>host.coordinator.detail(id).artifacts.length>0,'initial native evidence report');
  const flush=async()=>{const rows=host.store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=?').all(id);for(const sessionId of new Set(rows.map(row=>JSON.parse(row.value).sessionId))){const agent=ctx.agents.get(sessionId);if(agent)await ctx.sessions.flush(agent.session);}};
  const sample=async batchEvents=>{await flush();const evidence=host.store.connection.prepare("SELECT (SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) FROM source_events)+(SELECT coalesce(sum(length(CAST(value AS BLOB))),0) FROM research_reports) AS bytes").get();return{batchEvents,evidenceBytes:Number(evidence.bytes),nativeBytes:directoryBytes(resolve(config.root,'data/sessions')),storageBytes:directoryBytes(resolve(config.root,'data/storage'))};};
  const samples=[await sample(0)];let sequence=0,lastMarker='';
  for(const batch of [1,2,4,8]){
   for(let index=0;index<batch;index++){
    sequence++;lastMarker=`event-${String(sequence).padStart(2,'0')}-${'x'.repeat(96)}`;writeFileSync(fact,lastMarker);await host.coordinator.sync(id);
    await wait(()=>host.coordinator.detail(id).artifacts.some(artifact=>artifact.summary.includes(lastMarker)),`source event ${sequence}`);
   }
   samples.push(await sample(batch));
  }
  const fit=regression(samples);result.samples=samples;result.fit=fit;assert.ok(fit.r2>=0.8,`Native byte growth must remain linear with persisted evidence volume: ${JSON.stringify(fit)}`);
  const detail=host.coordinator.detail(id),documentEvents=detail.sourceEvents.filter(event=>['created','updated'].includes(event.kind));assert.equal(documentEvents.length,16);assert.equal(detail.artifacts.length,16);
  const eventCountBefore=detail.sourceEvents.length;await host.coordinator.sync(id);assert.equal(host.coordinator.detail(id).sourceEvents.length,eventCountBefore,'Repeated delivery must not append duplicate evidence');
  const runs=host.store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=?').all(id).map(row=>JSON.parse(row.value)),facts=host.store.connection.prepare("SELECT kind,detail FROM research_facts WHERE delegation_id=? AND kind IN ('native_created','native_resumed')").all(id).map(row=>({kind:row.kind,...JSON.parse(row.detail)}));
  const materialized=runs.filter(run=>facts.some(fact=>fact.role===run.binding.role&&fact.generation===run.binding.generation)),sessionIds=[...new Set(materialized.map(run=>run.sessionId))];assert.ok(sessionIds.length>=2);let nativeEventCount=0,foundLast=false;
  for(const sessionId of sessionIds){const reader=await ctx.sessionPersistence.open(sessionId,'read');try{const events=(await reader.read()).events;nativeEventCount+=events.length;if(JSON.stringify(events).includes(lastMarker))foundLast=true;}finally{await reader.close();}}
  assert.ok(nativeEventCount>sequence);assert.ok(foundLast,'The final evidence body is fully readable from an exact original native Session');
  const finalHash=createHash('sha256').update(lastMarker).digest('hex');assert.equal(detail.sourceReferences[0].hash,finalHash);
  Object.assign(result,{status:'PASS',delegationId:id,sourceDirectory:source,samples,fit,readback:{sessions:sessionIds.length,nativeEventCount,sourceDocumentEvents:documentEvents.length,researchReports:detail.artifacts.length,finalHash,unmaterializedRunIds:runs.filter(run=>!materialized.includes(run)).map(run=>run.sessionId)},checks:['1/2/4/8 event batches append native session history; byte growth is linear with persisted evidence volume (R² >= 0.8)','Every original native Session is reopened and fully read; final body, exact source hash, all 16 document events and 16 reports are present','A repeated final scan adds no source event or duplicate business effect']});
 }catch(error){result.error={message:error.message,stack:error.stack};if(host)result.debug=host.store.connection.prepare('SELECT kind,detail FROM research_facts ORDER BY seq').all();}
 finally{if(host){try{await host.close();}catch(e){result.status='FAIL';result.cleanupError=e.message;}}}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}
