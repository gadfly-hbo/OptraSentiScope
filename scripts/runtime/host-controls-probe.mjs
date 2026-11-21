import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {LlmAdapter,LlmError,ToolCallId} from '@deepseek-ai/dsh-llm';
import {parseCredentialKey} from '@deepseek-ai/dsh-credentials';
import {SessionId} from '@deepseek-ai/dsh-session';
import {startProductHost} from 'sentiscope-runtime/plugin';

export const name='sentiscope-host-controls-engineering';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const provider='sentiscope-host-controls-local';
const maximum=8;
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function wait(predicate,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await pause(20);}throw Error(`Engineering check timed out: ${label}`);}
async function collect(stream){const values=[];for await(const value of stream)values.push(value);return values;}
const renderText=value=>value?.content?.filter(part=>part.type==='text').map(part=>part.text).join('\n')??'';

/** Explicit local-only engineering Provider. Never a product default or external transport. */
class LocalSynthetic extends LlmAdapter {
 constructor(marker,transportUse,makeFailure){super();this.marker=marker;this.transportUse=transportUse;this.makeFailure=makeFailure;}
 calls=[];hangAborts=0;
 async *stream(options){
  const call={model:options.model,sessionId:options.sessionId,maxTokens:options.maxTokens,request:JSON.stringify(options),at:new Date().toISOString()};this.calls.push(call);await this.transportUse?.(options);
  if(options.model==='hung'){
   await new Promise(resolve=>{if(options.signal?.aborted){this.hangAborts++;resolve();return;}options.signal?.addEventListener('abort',()=>{this.hangAborts++;resolve();},{once:true});});
   yield {type:'usage',usage:{inputTokens:3,outputTokens:2,totalTokens:5,reasoningTokens:1}};yield {type:'finish',reason:{kind:'aborted',failure:new LlmError('Synthetic native transport was cancelled after yielding only a usage receipt','ABORTED').failure}};return;
  }
  if(options.model==='retry'){
   yield {type:'finish',reason:{kind:'error',failure:this.makeFailure()}};return;
  }
  if(options.model==='worker-compute'){
   const users=options.messages.filter(message=>message.role==='user'),latest=renderText(users.at(-1)),worker=users.some(message=>renderText(message).includes('SENTISCOPE_WORKER'));
   if(options.messages.at(-1)?.role!=='tool'&&(worker||latest.includes('SENTISCOPE_ASSESS'))){
    let block;if(worker)block={type:'tool-call',id:ToolCallId(randomUUID()),name:'run_compute',arguments:JSON.stringify({command:[process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(this.marker)},'UNEXPECTED_HOST_EXECUTION')`],timeoutMs:100,inputRefs:[]})};
    else{const candidate=JSON.parse(latest.split('\n')[1]);block={type:'tool-call',id:ToolCallId(randomUUID()),name:'decide_event',arguments:JSON.stringify({triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:'Worker compute rejection',scope:'worker-compute',reason:'Synthetic worker compute check'})};}
    yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block};yield{type:'usage',usage:{inputTokens:3,outputTokens:2,totalTokens:5,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};return;
   }
  }
  if(options.model==='tool'){
   const block={type:'tool-call',id:ToolCallId(randomUUID()),name:'run_compute',arguments:JSON.stringify({command:[process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(this.marker)},'UNEXPECTED_HOST_EXECUTION')`],timeoutMs:100,inputRefs:[]})};
   yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'block-end',index:0,block};yield {type:'usage',usage:{inputTokens:3,outputTokens:2,totalTokens:5,reasoningTokens:1}};yield {type:'finish',reason:{kind:'tool-calls'}};return;
  }
  const block={type:'text',text:'Synthetic engineering native response; no professional conclusion.'};
  yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block};
  if(options.model!=='unknown')yield {type:'usage',usage:{inputTokens:3,outputTokens:2,totalTokens:5,reasoningTokens:1}};
  yield {type:'finish',reason:{kind:'stop'}};
 }
}

async function history(ctx,id){const reader=await ctx.sessionPersistence.open(SessionId(id),'read');try{return (await reader.read()).events;}finally{await reader.close();}}
function runFact(host,id,sessionId){
 // Fixture setup reads only this fresh Host's immutable technical binding, not a business verdict.
 const records=host.store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=? ORDER BY generation DESC').all(id).map(row=>JSON.parse(row.value));
 const run=records.find(row=>row.sessionId===sessionId&&row.state==='current');
 assert.ok(run,'Expected an owned current native binding');assert.equal(host.coordinator.isCurrentBinding(run.binding),true);
 return {binding:run.binding,sessionId:run.sessionId};
}

export async function apply(ctx,config){
 const secrets=[`synthetic-host-controls-A-${basename(config.root)}`,`synthetic-host-controls-B-${basename(config.root)}`];
 const scrub=value=>{let out=String(value);for(const secret of secrets)out=out.replaceAll(secret,'[REDACTED-SYNTHETIC]');return out;};
 const result={status:'FAIL',scope:'Actual official Harness Agent/llm/stream/CredentialLocal + product HostControls; local synthetic Provider only; compute remains unavailable',checks:[],cases:[],requestCount:0,network:'No Provider network or enterprise material; only local HTTP engineering input',compute:'NOT_CONFIGURED; no isolation claim'};
 const marker=resolve(config.root,'UNEXPECTED_HOST_EXECUTION');let expectedCredential=0;const transportUses=[];let active;
 const owner={enterpriseId:'engineering-host-controls',principalId:'engineering-operator'};const adapter=new LocalSynthetic(marker,async options=>{
  if(options.model!=='tool')return;
  assert.ok(active,'Trusted transport must own a current Host');assert.ok(options.signal instanceof AbortSignal,'Official Agent must supply its operation signal');
  const row=active.store.connection.prepare('SELECT value FROM research_runs WHERE value ->> \'$.sessionId\'=? ORDER BY generation DESC LIMIT 1').get(options.sessionId);assert.ok(row,'Trusted transport must resolve its owned native binding');const run=JSON.parse(row.value);
  const binding={owner,delegationId:run.binding.delegationId,provider,purpose:'model',ref:'engineering-model',revision:1};
  await active.controls.credentials.use(binding,options.signal,async(secret,signal)=>{signal.throwIfAborted();assert.ok(secret===secrets[expectedCredential],'Registered local transport did not use the currently authorized synthetic credential');transportUses.push({sessionId:options.sessionId,model:options.model,recordGeneration:expectedCredential+1});});
 },()=>new LlmError(`Synthetic local transport failure: ${secrets[1]}`,'RATE_LIMIT',{status:429,providerRetryAfterMs:10}).failure);const registered=ctx.llm.registerAdapter([provider],adapter);let retryDisposer;
 const dataDirectories=[];
 const assertSecretFree=(value,label)=>{const raw=typeof value==='string'?value:JSON.stringify(value);for(const secret of secrets)assert.ok(!raw.includes(secret),`Synthetic credential leaked into ${label}`);};
 const http=async(host,path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assertSecretFree(value,'HTTP response');assert.ok(response.ok,'Synthetic Host HTTP request failed');return value;};
 const makeHost=async(model,{requests=8,duration=60000,credential=false}={})=>{
  const dataDirectory=resolve(config.root,`data/${model}`);dataDirectories.push(dataDirectory);
  const host=await startProductHost(ctx,{dataDirectory,owner,port:0,model:{provider,model,maxTokens:maximum},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:requests,outputTokens:requests*maximum,computeMilliseconds:0},durationMs:duration},modelEgress:{enabled:true,provider,model,maxTokens:maximum,...(credential?{credential:{ref:'engineering-model',revision:1}}:{})},...(credential?{credentials:[{provider,purpose:'model',ref:'engineering-model',revision:1,enabled:true,recordKey:'engineering/model'}]}:{})}},{localModelRoutes:[{provider,model}]});
  active=host;const start=adapter.calls.length;const created=await http(host,'/api/delegations',{goal:`Synthetic ${model} Host controls engineering check`,boundary:'Only local synthetic input; no enterprise material, no business actions.',idempotencyKey:`create-${model}`});return {host,id:created.delegation.id,start,model};
 };
 const finishHost=async entry=>{const sessions=[...new Set(adapter.calls.slice(entry.start).filter(c=>c.model===entry.model).map(c=>c.sessionId))];await entry.host.close();active=undefined;for(const id of sessions)assert.equal(ctx.agents.get(id),undefined,'Owned native Agent must be removed after closure');return sessions;};
 try{
  // Explicit fresh private CredentialLocal record only. No env references or user key source.
  const key=parseCredentialKey('engineering/model');await ctx.credentials.modifyRecord(key,async()=>({kind:'api-key',key:secrets[0]}));const stored=await ctx.credentials.readRecord(key);assert.ok(stored?.kind==='api-key'&&stored.key===secrets[0],'Official private credential record was not persisted');
  const a=await makeHost('tool',{requests:1,credential:true});
  await wait(()=>adapter.calls.length>a.start,'last legal native request');const sessionId=adapter.calls[a.start].sessionId;
  await wait(()=>a.host.controls.snapshot(a.id).block==='budget_exhausted','next stream denied before adapter');
  await wait(()=>ctx.agents.get(sessionId)===undefined,'native budget stop quiescence');
  const events=await history(ctx,sessionId);const snapshots=a.host.controls.budget(a.id).snapshot();
  assert.equal(adapter.calls.slice(a.start).filter(c=>c.model==='tool').length,1,'Only the final authorized request may reach the adapter');
  assert.equal(snapshots.used.modelRequests,1);assert.equal(snapshots.used.outputTokens,2);assert.equal(snapshots.held.modelRequests,0);assert.equal(snapshots.used.computeMilliseconds,0);assert.equal(snapshots.held.computeMilliseconds,0);assert.equal(snapshots.overrun,false);assert.ok(transportUses.some(use=>use.recordGeneration===1),'Actual registered adapter must use the original SDK record');
  assert.ok(events.some(e=>e.type==='assistant/message'&&e.data.usage?.outputTokens===2),'Last legal request must commit its actual native output usage');
  const compute=events.find(e=>e.type==='tool/result'&&renderText(e.data.message).includes('compute_unavailable'));
  assert.ok(compute,'The actual native tool call must return compute unavailable');assert.ok(!existsSync(marker),'Closed compute capability must never execute on the Host');assertSecretFree(events,'native Session/model/tool facts');
  result.checks.push('Last authorized native model request completes and settles usage; next native stream is denied before adapter dispatch');
  result.checks.push('Actual native run_compute tool returns compute_unavailable/dispatched:false; marker proves no Host fallback executed');
  const use={owner,delegationId:a.id,provider,purpose:'model',ref:'engineering-model',revision:1};
  assert.equal((await a.host.controls.credentials.describe(use)).status,'ready');
  let hostUses=0;const firstUse=await a.host.controls.credentials.use(use,new AbortController().signal,async secret=>{assert.ok(secret===secrets[0],'Host callback received an unexpected private synthetic record');hostUses++;});assertSecretFree(firstUse,'credential use receipt');
  const rotated=await a.host.controls.credentials.rotate(use,secrets[1]);assertSecretFree(rotated,'credential rotation receipt');const updated=await ctx.credentials.readRecord(key);assert.ok(updated?.kind==='api-key'&&updated.key===secrets[1],'Official SDK record rotation did not take effect');
  await a.host.controls.credentials.use(use,new AbortController().signal,async secret=>{assert.ok(secret===secrets[1],'Rotated key did not reach the trusted Host callback');hostUses++;});
  expectedCredential=1;const beforeRenewal=adapter.calls.length;a.host.controls.configureBudget(a.id,{revision:2,limits:{modelRequests:2,outputTokens:maximum*2,computeMilliseconds:0},expiresAt:new Date(Date.now()+60000).toISOString()});
  await wait(()=>adapter.calls.length>beforeRenewal,'authorized additional request after budget revision and record rotation');await wait(()=>a.host.controls.budget(a.id).snapshot().used.modelRequests===2,'rotated native transport usage settlement');await wait(()=>a.host.controls.snapshot(a.id).block==='budget_exhausted','renewed last-slot next request denied');
  assert.ok(transportUses.some(value=>value.recordGeneration===2),'Actual registered adapter must use the rotated SDK record');assert.equal(adapter.calls.slice(a.start).filter(call=>call.model==='tool').length,2,'One explicit additional resource grant must allow exactly one further adapter request');
  let callbackError;try{await a.host.controls.credentials.use(use,new AbortController().signal,async()=>{throw Error(secrets[1]);});}catch(error){callbackError={code:error.code,message:error.message,stack:error.stack};}assert.ok(callbackError,'Synthetic callback error should be observable');assert.equal(callbackError.code,'credential_use_failed');assertSecretFree(callbackError,'callback error');
  const beforeRevoke=hostUses;a.host.controls.configureCredentials([]);assert.equal((await a.host.controls.credentials.describe(use)).status,'revoked');await assert.rejects(a.host.controls.credentials.use(use,new AbortController().signal,async()=>{hostUses++;}),error=>error.code==='credential_revoked');assert.equal(hostUses,beforeRevoke);
  assertSecretFree(a.host.controls.credentials.listGrants(),'credential grant metadata');const response=await http(a.host,`/api/delegations/${a.id}`);assertSecretFree(response,'workbench response');
  result.checks.push('Official CredentialLocal readRecord/modifyRecord and registered local transport uses the SDK record before and after rotation under an explicit additional budget grant; revoked use and raw callback errors remain closed and redacted');
  result.cases.push({name:'native-last-slot-compute-and-credentials',sessionId,requests:2,budgetBeforeExplicitRenewal:snapshots,transportUses:transportUses.map(value=>({...value})),nativeEvents:events.map(e=>({seq:e.seq,type:e.type})),hostUses});await finishHost(a);

  const b=await makeHost('unknown',{requests:2});await wait(()=>adapter.calls.length>b.start,'native request with no authoritative usage');await b.host.coordinator.sync(b.id);
  await wait(()=>b.host.controls.budget(b.id).snapshot().unknownCount>=1,'unknown usage holds resources');
  await wait(()=>adapter.calls.slice(b.start).filter(c=>c.model==='unknown').every(c=>ctx.agents.get(c.sessionId)?.status==='idle'),'native unknown-usage turn idle');await pause(100);
  const unknownCalls=adapter.calls.slice(b.start).filter(c=>c.model==='unknown');const unknown=b.host.controls.budget(b.id).snapshot();assert.equal(unknown.used.outputTokens,0);assert.equal(unknown.held.modelRequests,unknownCalls.length);assert.equal(unknown.held.outputTokens,unknownCalls.length*maximum);assert.equal(unknown.unknownCount,unknownCalls.length);
  const fact=runFact(b.host,b.id,unknownCalls.at(-1).sessionId);let deniedNext=0;const callCount=adapter.calls.length;
  await assert.rejects(collect(b.host.controls.stream(fact,{provider:'unapproved-route',model:'unknown',maxTokens:maximum,sessionId:fact.sessionId,messages:[]},async function*(){deniedNext++;yield {type:'finish',reason:{kind:'stop'}};})),error=>error.code==='egress_denied');assert.equal(deniedNext,0);assert.equal(adapter.calls.length,callCount);
  result.checks.push('Actual native missing-usage responses retain full UNKNOWN holds; wrong model route is rejected before the next/adapter boundary');result.cases.push({name:'native-unknown-and-route-denial',requests:unknownCalls.length,budget:unknown});await finishHost(b);

  const c=await makeHost('plain');await wait(()=>adapter.calls.length>c.start,'revocation fixture native request');await c.host.coordinator.sync(c.id);await wait(()=>adapter.calls.slice(c.start).filter(call=>call.model==='plain').every(call=>ctx.agents.get(call.sessionId)?.status==='idle'),'plain native quiescence');await pause(100);
  const factC=runFact(c.host,c.id,adapter.calls.slice(c.start).find(call=>call.model==='plain').sessionId);const before=adapter.calls.length;let revokedNext=0;
  c.host.controls.configureModelEgress(c.id,{revision:2,enabled:false,provider,model:'plain',maxTokens:maximum});
  await assert.rejects(collect(c.host.controls.stream(factC,{provider,model:'plain',maxTokens:maximum,sessionId:factC.sessionId,messages:[]},async function*(){revokedNext++;yield {type:'finish',reason:{kind:'stop'}};})),error=>error.code==='egress_denied');assert.equal(revokedNext,0);assert.equal(adapter.calls.length,before);assert.equal(c.host.controls.egress.snapshot(c.id).model.status,'revoked');
  result.checks.push('Revoked model egress rejects the public HostControls.stream seam before next() without another adapter call');result.cases.push({name:'revoked-egress',newDispatches:0});await finishHost(c);

  const h=await makeHost('hung',{requests:3,duration:60000});await wait(()=>adapter.calls.length>h.start,'hung native provider entry');const hungId=adapter.calls[h.start].sessionId;const tightenedAt=Date.now(),revisedExpiresAt=new Date(tightenedAt+250).toISOString();h.host.controls.configureBudget(h.id,{revision:2,limits:{modelRequests:3,outputTokens:maximum*3,computeMilliseconds:0},expiresAt:revisedExpiresAt});
  await wait(()=>adapter.hangAborts>0,'shortened official budget deadline invokes native cancellation without a chunk');assert.ok(Date.now()-tightenedAt<5000,'Revised deadline must not wait for the old 60-second deadline');await wait(()=>ctx.agents.get(hungId)===undefined,'deadline native handle disposal');
  const hungEvents=await history(ctx,hungId);const aborted=hungEvents.find(e=>e.type==='turn/end'&&e.data.reason.kind==='aborted');assert.ok(aborted,'Hung request must reach a real native aborted boundary');assert.equal(aborted.data.reason.reason.kind,'hook');assert.equal(aborted.data.reason.reason.reason,'budget_expired');
  const expired=h.host.controls.budget(h.id).snapshot();assert.equal(expired.expired,true);assert.equal(expired.used.modelRequests,1);assert.equal(expired.used.outputTokens,2);assert.equal(expired.held.outputTokens,0);assert.equal(expired.unknownCount,0);assert.equal(h.host.store.get(owner,h.id).lifecycle,'active');assert.equal(adapter.calls.slice(h.start).filter(call=>call.model==='hung').length,1);
  result.checks.push('A future budget revision shortens the original 60-second deadline; official deadline is rearmed and expires while no chunk is emitted; cooperative original signal aborts, native turn is aborted with hook/budget_expired, owned registry is cleared and the late authoritative usage settles the old reservation without reviving business work');result.cases.push({name:'native-no-chunk-expiry',sessionId:hungId,reason:aborted.data.reason,budget:expired,revisedExpiresAt,elapsedMilliseconds:Date.now()-tightenedAt});await finishHost(h);

  let retryDecisions=0;retryDisposer=ctx.on('agent/request-error',async(payload,next)=>{if(payload.provider===provider&&payload.failure.code==='RATE_LIMIT'&&retryDecisions===0){assert.equal(payload.failure.status,429);assert.equal(payload.failure.providerRetryAfterMs,10);assertSecretFree(payload.failure,'native retry failure');retryDecisions++;return {kind:'retry'};}return next();});
  const r=await makeHost('retry',{requests:1});await wait(()=>adapter.calls.length>r.start,'native retry first attempt');const retryId=adapter.calls[r.start].sessionId;
  await wait(()=>retryDecisions===1,'official same-step retry hook');await wait(()=>r.host.controls.snapshot(r.id).block==='budget_exhausted','retry counted at actual stream boundary');await wait(()=>ctx.agents.get(retryId)===undefined,'native retry denied quiescence');
  assert.equal(adapter.calls.slice(r.start).filter(call=>call.model==='retry').length,1,'Retry must not bypass the consumed/held request grant');const retryEvents=await history(ctx,retryId);assert.ok(retryEvents.some(e=>e.type==='assistant/attempt'));assertSecretFree(retryEvents,'native failure stream/attempt/turn facts');assert.equal(r.host.controls.budget(r.id).snapshot().held.modelRequests,1);
  result.checks.push('A real native same-step retry decision still passes through HostControls at llm/stream; the second attempt is denied before adapter dispatch and raw provider failure text is excluded from native history');result.cases.push({name:'native-retry-reservation',retryDecisions,adapterRequests:1});await finishHost(r);retryDisposer();retryDisposer=undefined;

  const w=await makeHost('worker-compute',{requests:8});let workerSession;
  await wait(()=>{const row=w.host.store.connection.prepare("SELECT value FROM research_runs WHERE delegation_id=? AND json_extract(value,'$.binding.role')='worker' ORDER BY generation DESC LIMIT 1").get(w.id);if(!row)return false;workerSession=JSON.parse(row.value).sessionId;return adapter.calls.slice(w.start).some(call=>call.sessionId===workerSession);},'official Engine worker compute request');
  await wait(()=>ctx.agents.get(workerSession)?.status==='idle','worker compute tool result quiescence');const workerEvents=await history(ctx,workerSession);
  assert.ok(workerEvents.some(event=>event.type==='tool/result'&&renderText(event.data.message).includes('compute_unavailable')));assert.ok(!existsSync(marker),'Worker compute refusal must not execute on Host');assertSecretFree(workerEvents,'worker compute native facts');
  result.checks.push('An actual official Engine worker calls run_compute through the native tool executor and receives compute_unavailable; no Host process or marker is created');result.cases.push({name:'official-worker-compute-closed',sessionId:workerSession,role:'worker',dispatched:false});await finishHost(w);

  for(const call of adapter.calls)assertSecretFree(call.request,'model request');for(const directory of dataDirectories)for(const suffix of ['business.sqlite','business.sqlite-wal','business.sqlite-shm']){const file=resolve(directory,suffix);if(existsSync(file))for(const secret of secrets)assert.ok(!readFileSync(file).includes(Buffer.from(secret)),'Synthetic credential leaked into business SQLite');}
  assertSecretFree(result,'probe response/result');assert.ok(!existsSync(marker));result.redaction={syntheticValues:2,scanned:['actual model requests','native/tool facts','business SQLite including sidecars','HTTP/Host capability receipts','callback errors'],excluded:'Only explicitly configured fresh private CredentialLocal vault may contain synthetic values'};result.requestCount=adapter.calls.length;result.status='PASS';
 }catch(error){result.error={name:error.name,code:error.code,message:scrub(error.message),stack:scrub(error.stack)};result.caughtErrorContainedSyntheticCredential=secrets.some(secret=>String(error.message).includes(secret)||String(error.stack).includes(secret));}
 finally{if(retryDisposer)retryDisposer();if(active)try{await active.close();}catch(error){result.status='FAIL';result.cleanupError=scrub(error.message);}registered();}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
}
