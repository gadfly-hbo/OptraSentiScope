import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {ScheduleId} from '@deepseek-ai/dsh-schedule';
import {startProductHost} from 'sentiscope-runtime/plugin';

export const name='sentiscope-artifact-cold-engineering';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const owner={enterpriseId:'artifact-cold-engineering',principalId:'operator'},provider='sentiscope-artifact-cold-local',model='synthetic',maxTokens=64;
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const text=message=>message?.content?.filter(block=>block.type==='text').map(block=>block.text).join('\n')??'';
const parse=message=>{try{return JSON.parse(text(message));}catch{return undefined;}};
const ref=artifact=>({artifactId:artifact.artifactId,version:artifact.version});
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
async function wait(check,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await pause(20);}throw Error(`Engineering check timed out: ${label}`);}
function latestMain(store,id){const row=store.connection.prepare("SELECT value FROM research_runs WHERE delegation_id=? AND value->>'$.binding.role'='main' ORDER BY generation DESC LIMIT 1").get(id);assert.ok(row,'Expected owned persisted main binding');return JSON.parse(row.value);}
async function events(ctx,id){const reader=await ctx.sessionPersistence.open(SessionId(id),'read');try{return(await reader.read()).events;}finally{await reader.close();}}

/** Scripted engineering transport only; it issues actual product tools rather than fabricating their results. */
class Synthetic extends LlmAdapter{
 calls=[];pending=undefined;stage='publish';artifact=undefined;at=undefined;followupId=undefined;readObserved=false;observationObserved=false;
 constructor(phase,prior,sentinel){super();this.phase=phase;this.prior=prior;this.sentinel=sentinel;if(phase==='cold'){this.stage='read';this.artifact=ref(prior.artifact);this.followupId=prior.followup.id;}}
 content(version){return{kind:'judgment',title:`Synthetic limited judgment v${version}`,summary:`${this.sentinel}: immutable synthetic judgment revision ${version}`,evidence:[],assumptions:['No real source, operating action or computation is available'],unknowns:['No enterprise facts or business effectiveness are established'],applicability:'Only this isolated engineering delegation',invalidatedBy:['A later authorized source or goal change']};}
 choose(options){
  const last=options.messages.at(-1),data=last?.role==='tool'?parse(last):undefined;
  if(last?.role==='tool'&&this.pending){assert.equal(last.isError??false,false,'Actual engineering tool must succeed');
   if(this.pending==='publish-first'){assert.equal(data?.content?.summary,this.content(1).summary);this.artifact=ref(data);this.stage='arrange';}
   else if(this.pending==='arrange'){assert.equal(data?.status,'waiting');this.followupId=data.id;this.stage='wait';}
   else if(this.pending==='read'){assert.deepEqual(ref(data),ref(this.prior.artifact));assert.deepEqual(data.content,this.prior.artifact.content);this.readObserved=true;this.stage='observe';}
   else if(this.pending==='observe'){assert.equal(data?.id,this.prior.followup.id);assert.equal(data?.status,'observed');this.observationObserved=true;this.stage='publish-second';}
   else if(this.pending==='publish-second'){assert.equal(data?.version,2);this.stage='wait';}
   this.pending=undefined;
  }
  if(this.stage==='publish'){this.pending='publish-first';return['publish_artifact',{expectedVersion:0,requestId:'cold-judgment-v1',reason:'An explicitly limited synthetic judgment before observation',content:this.content(1)}];}
  if(this.stage==='arrange'){this.at??=new Date(Date.now()+3000).toISOString();this.pending='arrange';return['arrange_followup',{requestId:'cold-observation-v1',artifact:this.artifact,reason:'Observe once at the selected time; the original native timer must survive an ungraceful Host crash',dependencies:[],trigger:{kind:'at',at:this.at}}];}
  if(this.stage==='read'){this.pending='read';return['read_artifact',ref(this.prior.artifact)];}
  if(this.stage==='observe'){this.pending='observe';return['record_followup_observation',{id:this.prior.followup.id,requestId:'cold-observed-v1',summary:'The original native one-shot was delivered after a real OS-process crash; exact current v1 was checked under the new native generation. This is not an operating outcome.'}];}
  if(this.stage==='publish-second'){this.pending='publish-second';return['publish_artifact',{artifactId:this.prior.artifact.artifactId,expectedVersion:1,requestId:'cold-judgment-v2',reason:'The original due observation was explicitly checked after cold recovery',content:this.content(2)}];}
 }
 async *stream(options){assert.equal(options.maxTokens,maxTokens);const selected=this.choose(options);const users=options.messages.filter(message=>message.role==='user');this.calls.push({at:new Date().toISOString(),sessionId:options.sessionId,tool:selected?.[0]??null,latestUserId:users.at(-1)?.id??null});
  if(selected){const[name,args]=selected;yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:ToolCallId(randomUUID()),name,arguments:JSON.stringify(args)}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};return;}
  yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Synthetic engineering transport only; observation is not business effect.'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};
 }
}

export async function apply(ctx,config){
 const result={status:'FAIL',phase:config.phase,pid:process.pid,scope:'Actual official Agent/Session/Schedule and business artifact/follow-up cold recovery; no source, model network, operating action or manual scheduled delivery',checks:[]};let host,dispose,adapter,keepRunning=false;
 try{
  assert.ok(config.phase==='first'||config.phase==='cold');const prior=config.phase==='cold'?JSON.parse(readFileSync(config.prior)):undefined;if(prior)assert.equal(prior.status,'READY');
  const sentinel=prior?.sentinel??`SYNTHETIC-COLD-ARTIFACT-${basename(config.root)}`;adapter=new Synthetic(config.phase,prior,sentinel);dispose=ctx.llm.registerAdapter([provider],adapter);
  host=await startProductHost(ctx,{dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider,model,maxTokens},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:100,outputTokens:100*maxTokens,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider,model,maxTokens}}},{localModelRoutes:[{provider,model}]});
  const http=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  if(config.phase==='first'){
   const created=await http('/api/delegations',{goal:'Synthetic immutable judgment and unassisted overdue observation recovery',boundary:'No enterprise material, real model, operating action or computation.',idempotencyKey:'create'});const id=created.delegation.id;
   await wait(()=>{const d=host.coordinator.detail(id);return d.artifactRevisions?.length===1&&d.followups?.some(followup=>followup.requestId==='cold-observation-v1'&&followup.schedule.status==='active');},'actual v1 publication and known one-shot mapping');
   const run=latestMain(host.store,id),agent=ctx.agents.get(run.sessionId);assert.ok(agent);await agent.whenIdle();assert.equal(await ctx.sessions.flush(agent.session),true);
   const detail=await http(`/api/delegations/${id}`),artifact=detail.artifactRevisions[0],followup=detail.followups.find(followup=>followup.requestId==='cold-observation-v1');assert.equal(run.state,'current');assert.equal(artifact.version,1);assert.equal(artifact.content.kind,'judgment');assert.deepEqual(artifact.content.evidence,[]);assert.equal(followup.status,'waiting');assert.ok(Date.parse(followup.trigger.at)-Date.now()>250,'Readiness must precede the selected deadline');
   const nativeSchedules=[];for(const id of run.schedules)nativeSchedules.push(await ctx.schedule.view({id:ScheduleId(id)}));
   assert.equal(nativeSchedules.filter(row=>row.kind==='at').length,1);assert.equal(nativeSchedules.filter(row=>row.kind==='every').length,1);assert.ok(nativeSchedules.every(row=>row.status==='active'&&row.target.sessionId===run.sessionId));const oneShot=nativeSchedules.find(row=>row.kind==='at');assert.equal(oneShot.id,followup.schedule.id);assert.equal(oneShot.scheduledAt,followup.trigger.at);assert.equal(oneShot.lastDelivery,undefined);
   const persisted=await events(ctx,run.sessionId);assert.ok(persisted.some(event=>event.type==='turn/end'));const budget=host.controls.budget(id).snapshot();assert.ok(budget.used.modelRequests>0);assert.equal(budget.unknownCount,0);assert.equal(detail.hostResources.compute.status,'unavailable');
   Object.assign(result,{status:'READY',sentinel,delegationId:id,artifact,followup,run,nativeSchedules,nativeEvents:persisted.length,budget,requests:adapter.calls});save(config.output,result);keepRunning=true;
   // Only the parent runner SIGKILLs this owned process; never graceful-close first.
   await new Promise(()=>{});
  }else{
   const id=prior.delegationId;assert.notEqual(process.pid,prior.pid);assert.ok(Date.now()>Date.parse(prior.followup.trigger.at),'Cold product Host starts after the original one-shot became due');
   const restored=latestMain(host.store,id);assert.equal(restored.sessionId,prior.run.sessionId);assert.ok(restored.binding.generation>prior.run.binding.generation);assert.equal(restored.binding.epoch,prior.run.binding.epoch);assert.equal(host.coordinator.isCurrentBinding(prior.run.binding),false);assert.equal(host.coordinator.isCurrentBinding(restored.binding),true);
   assert.deepEqual(host.controls.budget(id).snapshot().config,prior.budget.config);assert.ok(host.controls.budget(id).snapshot().used.modelRequests>=prior.budget.used.modelRequests);
   // No run/edit/create, tool invocation, chat, continuation prompt or source update is
   // issued here. Only the product's supported native restore integration can wake it.
   await wait(()=>{const d=host.coordinator.detail(id);return d.artifactRevisions?.some(artifact=>artifact.version===2)&&d.followups?.find(followup=>followup.id===prior.followup.id)?.status==='observed';},'unassisted original native due delivery, exact read and explicit follow-up check',12000);
   const agent=ctx.agents.get(restored.sessionId);assert.ok(agent);await agent.whenIdle();assert.equal(await ctx.sessions.flush(agent.session),true);
   const detail=await http(`/api/delegations/${id}`),oneShot=await ctx.schedule.view({id:ScheduleId(prior.followup.schedule.id)});assert.equal(oneShot.id,prior.followup.schedule.id);assert.equal(oneShot.kind,'at');assert.equal(oneShot.scheduledAt,prior.followup.trigger.at);assert.equal(oneShot.target.sessionId,prior.run.sessionId);assert.ok(oneShot.lastDelivery,'Original one-shot must acknowledge a real natural native delivery');assert.ok(Date.parse(oneShot.lastDelivery.deliveredAt)>=Date.parse(prior.followup.trigger.at));
   const catalog=await ctx.schedule.catalog(),owned=catalog.filter(row=>row.target.kind==='session'&&row.target.sessionId===prior.run.sessionId);assert.equal(owned.filter(row=>row.kind==='at').length,1,'Cold recovery must not create a replacement one-shot');assert.deepEqual(new Set(owned.map(row=>row.id)),new Set(prior.nativeSchedules.map(row=>row.id)));
   const first=detail.artifactRevisions.find(artifact=>artifact.version===1),second=detail.artifactRevisions.find(artifact=>artifact.version===2);assert.equal(detail.artifactRevisions.length,2);assert.deepEqual(first.content,prior.artifact.content);assert.equal(first.createdAt,prior.artifact.createdAt);assert.deepEqual(second.supersedes,ref(prior.artifact));assert.equal(second.actor.generation,restored.binding.generation);assert.equal(adapter.readObserved,true);assert.equal(adapter.observationObserved,true);
   const followup=detail.followups.find(record=>record.id===prior.followup.id);assert.equal(followup.observation.requestId,'cold-observed-v1');assert.equal(followup.trigger.at,prior.followup.trigger.at);assert.equal(followup.schedule.id,prior.followup.schedule.id);assert.equal(detail.hostResources.compute.status,'unavailable');assert.equal(host.controls.budget(id).snapshot().used.computeMilliseconds,0);
   const persisted=await events(ctx,restored.sessionId),delivery=persisted.find(event=>event.type==='user/message'&&event.data.id===oneShot.lastDelivery.messageId);assert.ok(delivery,'Natural native reminder must be persisted in the original Session');assert.ok(persisted.some(event=>event.seq>delivery.seq&&event.type==='tool/result'&&text(event.data.message).includes(prior.artifact.content.summary)),'Exact original artifact read must occur after natural reminder delivery');
   result.checks.push('A separate cold OS process restores the same exact Session at a higher generation; the previous binding cannot authorize Agent work and prior settled budget is preserved');result.checks.push('Without a fixture Schedule mutation or follow-up prompt, the original overdue one-shot naturally delivers with the same ID, at and target; no additional one-shot is created');result.checks.push('Actual native tools read exact v1 under the new generation, explicitly observe the same business follow-up and append v2 while preserving v1; compute remains unavailable');
   Object.assign(result,{status:'PASS',delegationId:id,run:restored,oneShot,followup,artifacts:detail.artifactRevisions,requests:adapter.calls,nativeEventCount:persisted.length,fixtureScheduleMutations:0,fixtureContinuationMessages:0});
  }
 }catch(error){result.error={name:error.name,code:error.code,message:error.message,stack:error.stack};result.requests=adapter?.calls??[];if(host)try{const id=config.phase==='cold'?JSON.parse(readFileSync(config.prior)).delegationId:host.store.list(owner)[0]?.id;if(id)result.debug=host.coordinator.detail(id);}catch{}}
 finally{if(host&&!keepRunning)try{await host.close();}catch(error){result.status='FAIL';result.cleanupError={name:error.name,message:error.message};}if(dispose&&!keepRunning)dispose();}
 if(!keepRunning)save(config.output,result);
}
