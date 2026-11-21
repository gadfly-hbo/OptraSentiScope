import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,readdirSync,statSync,existsSync,readFileSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
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
function files(directory){if(!existsSync(directory))return[];const output=[];for(const entry of readdirSync(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())output.push(...files(path));else if(entry.isFile())output.push(path);}return output;}
function regression(samples){const xs=[],ys=[];for(let index=1;index<samples.length;index++){xs.push(samples[index].evidenceBytes-samples[index-1].evidenceBytes);ys.push(samples[index].writeBytes-samples[index-1].writeBytes);}assert.ok(ys.every(value=>value>0),'Actual cumulative write bytes must increase for every evidence batch');const mean=x=>x.reduce((a,b)=>a+b,0)/x.length,mx=mean(xs),my=mean(ys),cov=xs.reduce((sum,x,i)=>sum+(x-mx)*(ys[i]-my),0),vx=xs.reduce((sum,x)=>sum+(x-mx)**2,0),vy=ys.reduce((sum,y)=>sum+(y-my)**2,0);assert.ok(vx>0&&vy>0);const slope=cov/vx,r2=cov*cov/(vx*vy);return{slope,r2,deltas:xs.map((x,i)=>({evidenceBytes:x,writeBytes:ys[i]}))};}
export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Observed FileHandle.writeFile bytes, append-only Session prefixes, storage writes and exact native content readback; isolated synthetic Provider only',checks:[]};let host,adapter;
 try{
  adapter=new Synthetic();ctx.llm.registerAdapter(['sentiscope-longstream-only'],adapter);
  const owner={enterpriseId:'longstream-engineering',principalId:'operator'};
  host=await startProductHost(ctx,{dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider:'sentiscope-longstream-only',model:'synthetic',maxTokens:256},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:5000,outputTokens:1000000,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider:'sentiscope-longstream-only',model:'synthetic',maxTokens:256}}},{localModelRoutes:[{provider:'sentiscope-longstream-only',model:'synthetic'}]});
  const source=mkdtempSync(join(tmpdir(),'sentiscope-longstream-source-')),fact=resolve(source,'fact.txt');writeFileSync(fact,'initial synthetic evidence');
  const created=await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'Longstream synthetic append and readback check',boundary:'Synthetic only',idempotencyKey:'longstream-create'})});assert.equal(created.status,201);const id=(await created.json()).delegation.id;
  host.coordinator.configureSources(id,[{sourceId:'longstream',directory:source,grantRevision:1,enabled:true}]);await host.coordinator.sync(id);await wait(()=>host.coordinator.detail(id).artifacts.length>0,'initial native evidence report');
  const flush=async()=>{const rows=host.store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=?').all(id);for(const sessionId of new Set(rows.map(row=>JSON.parse(row.value).sessionId))){const agent=ctx.agents.get(sessionId);if(agent)await ctx.sessions.flush(agent.session);}};
  const readMeter=()=>existsSync(config.meter)?readFileSync(config.meter,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
  const previousFiles=new Map();let previousWriteIndex=0,prefixChecks=0,appendFlagChecks=0;const failedWrites=[];
  const verifyWrites=()=>{
   const records=readMeter(),current=new Map(files(resolve(config.root,'data/sessions')).filter(path=>basename(path).endsWith('.jsonl')).map(path=>[path,readFileSync(path)]));
   for(const record of records.slice(previousWriteIndex)){
    if(!record.success){failedWrites.push(record);continue;}
    if(record.path.includes('/sessions/')&&record.path.endsWith('.jsonl')&&previousFiles.has(record.path)){assert.equal(record.flags,'a',`Existing Session writes must be append-only: ${record.path}`);appendFlagChecks++;}
   }
   for(const [path,before] of previousFiles){const after=current.get(path);assert.ok(after,`Persisted Session must remain readable: ${path}`);assert.ok(after.length>=before.length&&after.subarray(0,before.length).equals(before),`Session prefix changed or history was rewritten: ${path}`);prefixChecks++;}
   previousFiles.clear();for(const [path,bytes] of current)previousFiles.set(path,bytes);previousWriteIndex=records.length;return records;
  };
  const sample=async batchEvents=>{await flush();const records=verifyWrites(),evidence=host.store.connection.prepare("SELECT (SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) FROM source_events)+(SELECT coalesce(sum(length(CAST(value AS BLOB))),0) FROM research_reports) AS bytes").get(),successful=records.filter(record=>record.success),sessionWriteBytes=successful.filter(record=>record.path.includes('/sessions/')).reduce((sum,record)=>sum+record.bytes,0),storageWriteBytes=successful.filter(record=>record.path.includes('/storage/')).reduce((sum,record)=>sum+record.bytes,0);return{batchEvents,evidenceBytes:Number(evidence.bytes),sessionWriteBytes,storageWriteBytes,writeBytes:sessionWriteBytes+storageWriteBytes,writeCount:successful.length};};
  const samples=[await sample(0)],expectedMarkers=['initial synthetic evidence'];let sequence=0,lastMarker='';
  for(const batch of [1,2,4,8]){
   for(let index=0;index<batch;index++){
    sequence++;lastMarker=`event-${String(sequence).padStart(2,'0')}-${'x'.repeat(96)}`;expectedMarkers.push(lastMarker);writeFileSync(fact,lastMarker);await host.coordinator.sync(id);
    await wait(()=>host.coordinator.detail(id).artifacts.some(artifact=>artifact.summary?.includes(lastMarker)),`source event ${sequence}`);
   }
   samples.push(await sample(batch));
  }
  result.samples=samples;const fit=regression(samples),storageFit=regression(samples.map(sample=>({...sample,writeBytes:sample.storageWriteBytes})));result.fit=fit;result.storageFit=storageFit;
  const perEvent=samples.slice(1).map((sample,index)=>{const prior=samples[index];return{batchEvents:sample.batchEvents,sessionBytesPerEvent:(sample.sessionWriteBytes-prior.sessionWriteBytes)/sample.batchEvents,storageBytesPerEvent:(sample.storageWriteBytes-prior.storageWriteBytes)/sample.batchEvents};});result.perEvent=perEvent;
  const storageRates=perEvent.map(item=>item.storageBytesPerEvent);assert.ok(Math.max(...storageRates)/Math.min(...storageRates)<=1.5,`Storage writes must not grow per event as history accumulates: ${JSON.stringify(perEvent)}`);
  assert.ok(fit.r2>=0.95&&storageFit.r2>=0.95,`Total and storage write bytes must remain linear with persisted evidence volume: ${JSON.stringify({fit,storageFit})}`);assert.deepEqual(failedWrites,[],'No failed or partial write attempt may be hidden in this run');
  const detail=host.coordinator.detail(id),documentEvents=detail.sourceEvents.filter(event=>['created','updated'].includes(event.kind));assert.equal(documentEvents.length,16);assert.equal(detail.artifacts.length,16);
  const eventCountBefore=detail.sourceEvents.length;await host.coordinator.sync(id);assert.equal(host.coordinator.detail(id).sourceEvents.length,eventCountBefore,'Repeated delivery must not append duplicate evidence');
  const runs=host.store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=?').all(id).map(row=>JSON.parse(row.value)),facts=host.store.connection.prepare("SELECT kind,detail FROM research_facts WHERE delegation_id=? AND kind IN ('native_created','native_resumed')").all(id).map(row=>({kind:row.kind,...JSON.parse(row.detail)}));
  const materialized=runs.filter(run=>facts.some(fact=>fact.role===run.binding.role&&fact.generation===run.binding.generation)),sessionIds=[...new Set(materialized.map(run=>run.sessionId))];assert.ok(sessionIds.length>=2);let nativeEventCount=0;const nativeReports=[];
  for(const sessionId of sessionIds){const reader=await ctx.sessionPersistence.open(sessionId,'read');try{const events=(await reader.read()).events;nativeEventCount+=events.length;for(const event of events)if(event.type==='assistant/message')for(const block of event.data.message.content)if(block.type==='tool-call'&&block.name==='report_research')nativeReports.push(JSON.parse(block.arguments));}finally{await reader.close();}}
  for(const marker of expectedMarkers){const matching=nativeReports.filter(report=>report.summary===`Synthetic longstream report: ${marker}`);assert.equal(matching.length,1,`Each expected source body must have exactly one native report: ${marker}`);assert.equal(matching[0].evidence[0].hash,createHash('sha256').update(marker).digest('hex'),`Native evidence hash must match the exact body: ${marker}`);}
  const finalHash=createHash('sha256').update(lastMarker).digest('hex');assert.equal(detail.sourceReferences[0].hash,finalHash);
  Object.assign(result,{status:'PASS',delegationId:id,sourceDirectory:source,samples,fit,readback:{sessions:sessionIds.length,nativeEventCount,nativeReports:nativeReports.length,sourceDocumentEvents:documentEvents.length,researchReports:detail.artifacts.length,finalHash,prefixChecks,appendFlagChecks,failedWrites,unmaterializedRunIds:runs.filter(run=>!materialized.includes(run)).map(run=>run.sessionId)},checks:['Observed FileHandle.writeFile calls provide cumulative actual bytes for Sessions and storage; total and storage components remain linear (R² >= 0.95) and storage bytes/event do not grow with batch size','Every pre-existing Session file keeps an unchanged prefix and existing-file writes use append mode; no failed write attempts','All 16 expected bodies have exactly one native report each with the correct SHA256; every materialized Session is fully read','Repeated final scan adds no source event or duplicate business effect']});
 }catch(error){result.error={message:error.message,stack:error.stack};if(host)result.debug=host.store.connection.prepare('SELECT kind,detail FROM research_facts ORDER BY seq').all();}
 finally{if(host){try{await host.close();}catch(e){result.status='FAIL';result.cleanupError=e.message;}}}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}
