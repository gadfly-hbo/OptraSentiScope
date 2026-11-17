import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,basename,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {ScheduleId} from '@deepseek-ai/dsh-schedule';
import {startProductHost} from 'sentiscope-runtime/plugin';

export const name='sentiscope-artifact-followup-engineering';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const provider='sentiscope-artifact-followup-local',model='synthetic',maxTokens=64;
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function wait(predicate,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await pause(20);}throw Error(`Engineering check timed out: ${label}`);}
const text=message=>message?.content?.filter(block=>block.type==='text').map(block=>block.text).join('\n')??'';
const value=message=>{try{return JSON.parse(text(message));}catch{return undefined;}};
const hash=value=>createHash('sha256').update(value).digest('hex');
async function history(ctx,id){const reader=await ctx.sessionPersistence.open(SessionId(id),'read');try{return(await reader.read()).events;}finally{await reader.close();}}
function reference(revision){return{artifactId:revision.artifactId,version:revision.version};}

/** Deliberately scripted local engineering transport; not a product reasoning policy or a real model. */
class Synthetic extends LlmAdapter{
 calls=[];pending=new Map();workerPending=new Map();phase='setup';ticketId=undefined;computeChecked=false;readEvidence=undefined;readVersions=new Set();mainSession=undefined;revokedReadDenied=false;
 constructor(state){super();this.state=state;}
 plan(version){return{kind:'plan',title:`Synthetic bounded proposal v${version}`,summary:`${this.state.sentinel}: exact synthetic source V${version===3?2:1}; proposal revision ${version}`,evidence:[this.readEvidence],assumptions:['Only synthetic input is used'],unknowns:['No real research quality or business outcome is established'],applicability:'Only this isolated engineering delegation',invalidatedBy:['Source qualification, goal or contrary evidence changes'],recommendation:'Continue authorized observation before any operating action',alternatives:[{option:'Keep the current position',costs:'No operating resource allocation',risks:'An unconfirmed change can remain unknown'}],constraints:['No enterprise actions; compute remains unavailable'],observation:{baseline:'Synthetic fixture only',expectedChange:'Unknown',measure:'Exact synthetic source revision',window:'Agent-selected time or source event',source:'Authorized fixture source',check:'Read exact evidence and explicitly record a check'}};}
 ingest(options,data,last){
  const pending=this.pending.get(options.sessionId);if(last?.role!=='tool'||!pending)return;
  if(pending==='read_source'&&data?.record)this.readEvidence={ref:data.record.ref,hash:data.record.hash};
  if(pending==='read_artifact'&&data?.content)this.readVersions.add(`${data.artifactId}:${data.version}`);
  if(pending==='run_compute'){assert.equal(data?.code,'compute_unavailable');assert.equal(data?.dispatched,false);this.computeChecked=true;}
  if(pending==='decide_event'&&data?.decision?.ticketId)this.ticketId=data.decision.ticketId;
  if(pending==='revoked-read'){assert.equal(last.isError,true,'Revoked exact artifact read must be an actual native tool error');assert.equal(data?.content,undefined);this.revokedReadDenied=true;}
  this.pending.delete(options.sessionId);
 }
 choose(options){
  const users=options.messages.filter(message=>message.role==='user'),latest=text(users.at(-1)),last=options.messages.at(-1),data=last?.role==='tool'?value(last):undefined;
  const worker=users.some(message=>text(message).includes('SENTISCOPE_WORKER'));
  if(worker){
   if(this.phase==='setup'||this.phase==='revoked'||this.phase==='park')return;
   const pending=this.workerPending.get(options.sessionId);this.workerPending.delete(options.sessionId);
   if(last?.role==='tool'&&pending==='list_sources'&&data?.references?.length){const ref=data.references.at(-1);this.workerPending.set(options.sessionId,'read_source');return['read_source',{ref:ref.ref,hash:ref.hash}];}
   if(last?.role==='tool'&&pending==='read_source'&&data?.record){this.workerPending.set(options.sessionId,'report_research');return['report_research',{state:'waiting',summary:'Synthetic engineering worker checked the exact current input; no operating claim.',evidence:[{ref:data.record.ref,hash:data.record.hash}]}];}
   if(last?.role!=='tool'){this.workerPending.set(options.sessionId,'list_sources');return['list_sources',{}];}
   return;
  }
  this.mainSession=options.sessionId;this.ingest(options,data,last);
  if(this.phase==='setup'||this.phase==='park')return;
  const detail=this.state.detail();
  if(this.phase==='revoked'){
   if(!this.revokedReadDenied)return['read_artifact',reference(this.state.currentArtifact),'revoked-read'];
   return;
  }
  if(!this.ticketId){
   const candidate=data?.candidates?.find(candidate=>candidate.triggers?.length);
   let direct;if(latest.startsWith('SENTISCOPE_ASSESS\n'))try{direct=JSON.parse(latest.split('\n')[1]);}catch{}
   const selected=candidate??direct;
   if(selected?.triggers?.length)return['decide_event',{triggerId:selected.triggers[0].id,evalId:selected.evalId,kind:'accept',reason:'Explicit synthetic fixture covers one persistent research problem only',title:'Synthetic exact-version follow-up',scope:'Only this isolated synthetic source'}];
   if(last?.role!=='tool')return['research_context',{}];
   return;
  }
  if(!this.computeChecked)return['run_compute',{command:[process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(this.state.computeMarker)},'UNEXPECTED')`],timeoutMs:100,inputRefs:[]}];
  const revisions=detail.artifactRevisions??[],all=detail.followups??[];
  if(this.phase==='time'){
   const first=revisions.find(revision=>revision.version===1&&revision.qualification==='current');
   if(!first){const source=detail.sourceReferences.find(ref=>ref.hash===this.state.originalHash);if(!source)return['list_sources',{}];if(this.readEvidence?.hash!==source.hash)return['read_source',{ref:source.ref,hash:source.hash}];return['publish_artifact',{expectedVersion:0,requestId:'proposal-v1',reason:'Initial finite synthetic proposal',content:this.plan(1)}];}
   this.state.artifactId=first.artifactId;this.state.currentArtifact=first;
   const followup=all.find(record=>record.requestId==='time-v1');
   if(!followup){this.state.firstAt??=new Date(Date.now()+1500).toISOString();return['arrange_followup',{requestId:'time-v1',artifact:reference(first),reason:'Synthetic evidence is stable; review once at the selected instant',dependencies:[],trigger:{kind:'at',at:this.state.firstAt}}];}
   if(followup.status==='due'){
    if(!this.readVersions.has(`${first.artifactId}:1`))return['read_artifact',reference(first)];
    return['record_followup_observation',{id:followup.id,requestId:'observed-time-v1',summary:'The selected observation time arrived; exact original version was checked. This is not business execution or attribution.'}];
   }
   if(followup.status==='observed'){
    const second=revisions.find(revision=>revision.artifactId===first.artifactId&&revision.version===2);
    if(!second)return['publish_artifact',{artifactId:first.artifactId,expectedVersion:1,requestId:'proposal-v2',reason:'Selected observation was explicitly checked',content:this.plan(2)}];
    this.state.currentArtifact=second;this.phase='event';
   }else return;
  }
  if(this.phase==='event'){
   const second=revisions.find(revision=>revision.artifactId===this.state.artifactId&&revision.version===2);if(!second)return;
   if(!all.some(record=>record.requestId==='event-v2'))return['arrange_followup',{requestId:'event-v2',artifact:reference(second),reason:'No additional model research is useful until the authorized source changes',dependencies:['A new authorized fixture source event'],trigger:{kind:'source_event',sourceIds:['fixture']}}];
   return;
  }
  if(this.phase==='event-update'){
   const third=revisions.find(revision=>revision.artifactId===this.state.artifactId&&revision.version===3&&revision.qualification==='current');
   if(!third){const source=detail.sourceReferences.find(ref=>ref.hash===this.state.updatedHash);if(!source)return['list_sources',{}];if(this.readEvidence?.hash!==source.hash)return['read_source',{ref:source.ref,hash:source.hash}];return['publish_artifact',{artifactId:this.state.artifactId,expectedVersion:2,requestId:'proposal-v3',reason:'An actual new authorized source revision changed the current qualification',content:this.plan(3)}];}
   this.state.currentArtifact=third;
   if(!all.some(record=>record.requestId==='reopen-v3')){this.state.reopenAt??=new Date(Date.now()+2500).toISOString();return['arrange_followup',{requestId:'reopen-v3',artifact:reference(third),reason:'The next exact-version check must survive product Host reopen',dependencies:[],trigger:{kind:'at',at:this.state.reopenAt}}];}
   return;
  }
  if(this.phase==='reopen'){
   const record=all.find(record=>record.requestId==='reopen-v3');if(record?.status==='due'){
    if(!this.readVersions.has(`${this.state.artifactId}:3`))return['read_artifact',{artifactId:this.state.artifactId,version:3}];
    return['record_followup_observation',{id:record.id,requestId:'observed-reopen-v3',summary:'Current qualified proposal version 3 was read after product Host reopen; the old native generation did not authorize the read.'}];
   }
  }
 }
 async *stream(options){
  const selected=this.choose(options);this.calls.push({at:new Date().toISOString(),sessionId:options.sessionId,phase:this.phase,tool:selected?.[0],request:JSON.stringify(options)});
  writeFileSync(this.state.trace,JSON.stringify({at:new Date().toISOString(),sessionId:options.sessionId,phase:this.phase,tool:selected?.[0]??null})+'\n',{flag:'a',mode:0o600});
  if(selected){const[name,args,pending]=selected;if(!options.messages.some(message=>message.role==='user'&&text(message).includes('SENTISCOPE_WORKER')))this.pending.set(options.sessionId,pending??name);const block={type:'tool-call',id:ToolCallId(randomUUID()),name,arguments:JSON.stringify(args)};yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};return;}
  yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Synthetic engineering transport only; no operating conclusion.'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};
 }
}

export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Actual official Engine/Harness Agent/Session/Schedule plus versioned artifacts and autonomous follow-up; explicit local synthetic Provider/files only',checks:[],cases:[]};
 let host,dispose,fixtureSourceCheck;const owner={enterpriseId:'artifact-followup-engineering',principalId:'operator'};
 const source=mkdtempSync(join(tmpdir(),'sentiscope-artifact-followup-')),sourceFile=resolve(source,'fact.txt'),sourceEvidence=resolve(config.root,'source-evidence');mkdirSync(sourceEvidence,{recursive:true,mode:0o700});
 const original='Synthetic authorized fact V1; no enterprise content.',updated='Synthetic authorized fact V2; no enterprise content.';writeFileSync(sourceFile,original,{flag:'wx',mode:0o600});writeFileSync(resolve(sourceEvidence,'fact-v1.txt'),original,{flag:'wx',mode:0o600});writeFileSync(resolve(sourceEvidence,'fact-v2.txt'),updated,{flag:'wx',mode:0o600});result.syntheticSource={liveTemporaryDirectory:source,preservedDirectory:sourceEvidence,originalHash:hash(original),updatedHash:hash(updated)};
 const state={originalHash:hash(original),updatedHash:hash(updated),sentinel:`SYNTHETIC-ARTIFACT-BODY-${basename(config.root)}`,computeMarker:resolve(config.root,'UNEXPECTED_HOST_COMPUTE'),trace:resolve(config.root,'requests.jsonl'),detail:()=>host.coordinator.detail(result.delegationId)};
 const adapter=new Synthetic(state);const grant={sourceId:'fixture',directory:source,grantRevision:1,enabled:true};
 const settings={dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider,model,maxTokens},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:300,outputTokens:300*maxTokens,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider,model,maxTokens}}};
 const http=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
 const detail=()=>host.coordinator.detail(result.delegationId);
 const idle=async()=>{await wait(()=>[...new Set(adapter.calls.map(call=>call.sessionId))].every(id=>!ctx.agents.get(id)||ctx.agents.get(id).status==='idle'),'owned native sessions idle');await pause(100);};
 const heartbeat=async()=>{const rows=await ctx.schedule.catalog();const row=rows.find(row=>row.kind==='every'&&row.status==='active'&&row.target.kind==='session'&&row.target.sessionId===adapter.mainSession);assert.ok(row,'Expected the main session owned native heartbeat');return row;};
 try{
  dispose=ctx.llm.registerAdapter([provider],adapter);host=await startProductHost(ctx,settings,{localModelRoutes:[{provider,model}]});
  const created=await http('/api/delegations',{goal:'Synthetic versioned research and autonomous observation engineering check',boundary:'Use only authorized synthetic files; no business action, real model or computation.',idempotencyKey:'create'});result.delegationId=created.delegation.id;
  adapter.phase='time';host.coordinator.configureSources(result.delegationId,[grant]);await host.coordinator.sync(result.delegationId);
  await wait(()=>detail().artifactRevisions?.some(revision=>revision.version===2)&&detail().followups?.some(record=>record.requestId==='event-v2'&&record.status==='waiting'),'actual at delivery, exact original read, explicit check and version two');await idle();
  let snapshot=await http(`/api/delegations/${result.delegationId}`);const first=snapshot.artifactRevisions.find(revision=>revision.version===1),second=snapshot.artifactRevisions.find(revision=>revision.version===2),timed=snapshot.followups.find(record=>record.requestId==='time-v1');
  assert.ok(snapshot.research.length>=1,'The real official Engine must own a persistent research ticket');assert.equal(first.content.kind,'plan');assert.equal(first.content.summary,`${state.sentinel}: exact synthetic source V1; proposal revision 1`);assert.equal(second.supersedes.version,1);assert.equal(timed.status,'observed');assert.equal(timed.trigger.at,state.firstAt);assert.ok(timed.schedule.id,'One-shot native schedule identity must be retained');
  const oneShot=await ctx.schedule.view({id:ScheduleId(timed.schedule.id)});assert.equal(oneShot.kind,'at');assert.equal(oneShot.scheduledAt,state.firstAt);assert.ok(oneShot.lastDelivery,'Actual time delivery must have a durable native acknowledgment');assert.equal(adapter.readVersions.has(`${first.artifactId}:1`),true);assert.equal(adapter.computeChecked,true);assert.equal(existsSync(state.computeMarker),false);assert.equal(snapshot.hostResources.compute.status,'unavailable');
  result.checks.push('Actual official Engine ticket plus native tools publish a complete proposal v1; native at Schedule really becomes due, Agent reads exact v1, explicitly records observation, and appends v2 without replacing v1');result.cases.push({name:'native-at-and-exact-version',artifactId:first.artifactId,followup:timed,schedule:oneShot});
  const beforeQuiet=adapter.calls.length,quietHeartbeat=await heartbeat();await ctx.schedule.run({id:ScheduleId(quietHeartbeat.id)});await idle();assert.equal(adapter.calls.length,beforeQuiet,'A scheduled-only unchanged-source heartbeat must not consume a model request while event-only observation is waiting');
  result.checks.push('Event-only observation keeps native environmental checks while an unchanged-source scheduled-only heartbeat causes zero additional model requests');
  adapter.phase='event-update';writeFileSync(sourceFile,updated,{mode:0o600});let oldHeartbeatRunError,manualSourceRun;
  try{manualSourceRun=await ctx.schedule.run({id:ScheduleId(quietHeartbeat.id)});}catch(error){oldHeartbeatRunError={name:error.name,message:error.message};}
  result.cases.push({name:'same-heartbeat-delivery-floor',manualSourceRun,oldHeartbeatRunError});
  if(manualSourceRun?.code==='schedule_execution_pending'){
   // A new fixture-owned task avoids the official same-task 60s delivery floor. It
   // exercises the same native beforeWake scan, never a product-side polling loop.
   fixtureSourceCheck=await ctx.schedule.create({title:'Synthetic independent source check',prompt:'SENTISCOPE_CONTINUE: isolated engineering source refresh only',timing:{kind:'after',after_seconds:1},target:{kind:'session',sessionId:SessionId(adapter.mainSession)}},SessionId(adapter.mainSession));
   result.cases.push({name:'fixture-owned-native-source-check',schedule:fixtureSourceCheck});
  }
  await wait(()=>detail().artifactRevisions?.some(revision=>revision.version===3&&revision.qualification==='current')&&detail().followups?.some(record=>record.requestId==='reopen-v3'&&record.schedule.status==='active'),'actual source update through native beforeWake produces a fresh qualified proposal');
  snapshot=await http(`/api/delegations/${result.delegationId}`);const third=snapshot.artifactRevisions.find(revision=>revision.version===3),event=snapshot.followups.find(record=>record.requestId==='event-v2'),beforeReopen=snapshot.followups.find(record=>record.requestId==='reopen-v3');
  assert.equal(third.content.evidence[0].hash,state.updatedHash);assert.equal(third.supersedes.version,2);assert.ok(snapshot.artifactRevisions.some(revision=>revision.version===1&&revision.qualification==='historical'));assert.equal(event.dueCause?.sourceId,'fixture');assert.equal(event.status,'superseded','A new source epoch cannot silently authorize its old artifact body');
  result.checks.push('A real synthetic source update is discovered by native beforeWake; old epoch remains historical, the event cause is retained and a fresh qualified native turn appends v3 with the new exact hash');result.cases.push({name:'event-requalification',oldHeartbeatRunError,event,third:reference(third)});
  if(fixtureSourceCheck){const stopped=await ctx.schedule.edit({id:ScheduleId(fixtureSourceCheck.id),action:'update',patch:{active:false}},SessionId(fixtureSourceCheck.target.sessionId));assert.ok(stopped.status==='paused'||stopped.status==='ended');result.cases.push({name:'fixture-source-check-closed-by-exact-id',id:fixtureSourceCheck.id,status:stopped.status});fixtureSourceCheck=undefined;}
  adapter.phase='reopen';const oldNative=adapter.mainSession;await host.close();host=undefined;assert.equal(ctx.agents.get(oldNative),undefined);
  host=await startProductHost(ctx,{...settings,grants:{[result.delegationId]:[grant]}},{localModelRoutes:[{provider,model}]});
  await wait(()=>detail().followups?.find(record=>record.requestId==='reopen-v3')?.status==='observed','saved follow-up resumes under a new native generation and exact artifact read');await idle();
  snapshot=await http(`/api/delegations/${result.delegationId}`);assert.equal(snapshot.artifactRevisions.length,3);assert.equal(snapshot.artifactRevisions.find(revision=>revision.version===1).content.summary,first.content.summary);assert.notEqual(adapter.mainSession,oldNative);assert.equal(adapter.readVersions.has(`${third.artifactId}:3`),true);const afterReopen=snapshot.followups.find(record=>record.requestId==='reopen-v3');assert.equal(afterReopen.id,beforeReopen.id);assert.equal(afterReopen.status,'observed');
  result.checks.push('Graceful product Host close/reopen preserves all immutable versions and the same business follow-up; a new native generation reads exact current v3 and records the due check without granting the old generation authority');result.cases.push({name:'persisted-product-reopen',oldNative,newNative:adapter.mainSession,followup:afterReopen});
  const startRevoked=adapter.calls.length;adapter.phase='revoked';host.coordinator.configureSources(result.delegationId,[]);await host.coordinator.sync(result.delegationId);
  await wait(()=>adapter.revokedReadDenied,'native tool rejects old artifact body after withdrawal');await idle();snapshot=await http(`/api/delegations/${result.delegationId}`);
  assert.ok(snapshot.artifactRevisions.every(revision=>revision.qualification==='historical'));assert.ok(adapter.calls.slice(startRevoked).length>0);assert.ok(adapter.calls.slice(startRevoked).every(call=>!call.request.includes(state.sentinel)),'Fresh revoked-source requests must not replay prior artifact bodies');
  const revokedEvents=await history(ctx,adapter.mainSession);assert.ok(revokedEvents.some(event=>event.type==='tool/result'&&event.data.message.isError),'Actual native tool result must preserve the denied exact read');
  result.checks.push('Source withdrawal preserves historical versions but denies exact body read in a fresh native session; subsequent model requests do not replay the old derived body');
  adapter.phase='park';const current=await http(`/api/delegations/${result.delegationId}`);await http(`/api/delegations/${result.delegationId}/commands`,{kind:'end',expectedVersion:current.delegation.version,idempotencyKey:'end'});await wait(async()=> (await http(`/api/delegations/${result.delegationId}`)).delegation.lifecycle==='ended','end receipt');
  const endedCalls=adapter.calls.length;let lateRunError;try{await ctx.schedule.run({id:ScheduleId(timed.schedule.id)});}catch(error){lateRunError={name:error.name,message:error.message};}await pause(150);assert.equal(adapter.calls.length,endedCalls);assert.equal((await http(`/api/delegations/${result.delegationId}`)).delegation.lifecycle,'ended');assert.equal(existsSync(state.computeMarker),false);
  result.checks.push('Ending closes native work; a late attempt to run an old exact native Schedule does not revive the delegation or dispatch another model request; compute remains closed');result.cases.push({name:'late-native-schedule-after-end',lateRunError,newRequests:0});
  result.detail=await http(`/api/delegations/${result.delegationId}`);result.requestCount=adapter.calls.length;result.requests=adapter.calls.map(({request,...rest})=>rest);result.status='PASS';
 }catch(error){result.error={name:error.name,code:error.code,message:error.message,stack:error.stack};if(host)try{result.debug=detail();}catch{}}
 finally{if(fixtureSourceCheck)try{await ctx.schedule.edit({id:ScheduleId(fixtureSourceCheck.id),action:'update',patch:{active:false}},SessionId(fixtureSourceCheck.target.sessionId));}catch(error){result.status='FAIL';result.fixtureScheduleCleanupError={name:error.name,message:error.message};}if(host)try{await host.close();}catch(error){result.status='FAIL';result.cleanupError={name:error.name,message:error.message};}if(dispose)dispose();rmSync(source,{recursive:true,force:true});}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
}
