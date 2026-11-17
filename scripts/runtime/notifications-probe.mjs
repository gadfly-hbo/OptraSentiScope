import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,basename,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {ScheduleId} from '@deepseek-ai/dsh-schedule';
import {startProductHost} from 'sentiscope-runtime/plugin';

export const name='sentiscope-notifications-engineering';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const provider='sentiscope-notifications-local',model='synthetic',maxTokens=64;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(predicate,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await pause(20);}throw Error(`Engineering check timed out: ${label}`);}
const text=m=>m?.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
const value=m=>{try{return JSON.parse(text(m));}catch{return undefined;}};
const hash=v=>createHash('sha256').update(v).digest('hex');
const ref=v=>({artifactId:v.artifactId,version:v.version});
function preference(delay=12000){const at=new Date(Date.now()+delay);return {timeZone:'UTC',time:at.toISOString().slice(11,19),weekdays:[at.getUTCDay()||7]};}

/** Scripted local transport exercises SDK mechanisms, never product judgment quality. */
class Synthetic extends LlmAdapter{
 calls=[];pending=new Map();phase='setup';mainSession=undefined;ticketId=undefined;evidence=undefined;computeChecked=false;readNotices=new Set();work=undefined;revokedReadDenied=false;sourceContextVerified=false;
 constructor(state){super();this.state=state;}
 plan(version){return {kind:'plan',title:`Synthetic notification proposal v${version}`,summary:`${this.state.planSentinel}: bounded source version ${version}`,evidence:[this.evidence],assumptions:['Synthetic fixture only'],unknowns:['Real operating effect and language understanding are not validated'],applicability:'Only this isolated synthetic delegation',invalidatedBy:['Goal or source qualification changes'],recommendation:'Continue independent evidence checks before any operating action',alternatives:[{option:'Retain the current position',costs:'Unknown',risks:'The question may remain unresolved'}],constraints:['No business action, additional resource authority or compute'],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Exact synthetic input only',window:'Current authorized source and explicit review',source:'Synthetic fixture',check:'Continue independent research'}};}
 notification(artifact,revision=1){return {...(revision>1?{id:this.state.matter.id}:{}),expectedRevision:revision-1,requestId:`matter-v${revision}`,kind:'inform',artifact:ref(artifact),title:'One ongoing synthetic matter',summary:`${this.state.noticeSentinel}: latest bounded finding ${revision}`,changes:[revision===1?'Initial limited source finding':'A new exact source changed the same question; keep it one ongoing matter'],unknowns:['No operating effect is established'],mergeReason:'Both exact source versions concern the same ongoing synthetic question',urgency:revision===1?'brief':'immediate',...(revision===1?{}:{immediateReason:'Waiting for another brief would lose the fixture decision-attention window'})};}
 decision(artifact){const now=Date.now();return {expectedRevision:0,requestId:'window-decision',artifact:ref(artifact),title:'Synthetic operating choice remains pending',question:'Whether to adopt only the bounded synthetic scope?',options:[{id:'limited',label:'Only synthetic A',scope:'A only; exclude B',costs:'Unknown',risks:'Applicability may change'}],recommendation:{optionId:'limited',reason:'Limited source evidence'},unknowns:['No operating effect'],nondecisionImpact:'Only the dependent choice waits; independent research continues',nextActions:['Continue independent evidence checking'],window:{remindAt:new Date(now+1800).toISOString(),nextReviewAt:new Date(now+60000).toISOString(),decideBy:new Date(now+90000).toISOString(),executeBy:new Date(now+120000).toISOString(),basis:'Explicit synthetic agreed review point, not a real business deadline'},reason:'Only the operator can make this choice'};}
 ingest(options,last,data){const pending=this.pending.get(options.sessionId);if(last?.role!=='tool'||!pending)return;this.pending.delete(options.sessionId);
  if(pending==='research_context'){this.work=data?.notificationWork;if(this.phase==='important'){const historical=data?.notificationHistory?.find(m=>m.id===this.state.matter.id);assert.ok(historical,'A fresh source-qualified Agent can discover the stable old matter identity without its body');assert.ok(Object.keys(historical).every(k=>['id','revision','kind','artifact','goalRevision','epoch'].includes(k)));this.state.matter={id:historical.id,revision:historical.revision};this.sourceContextVerified=true;}}
  if(pending==='read_source'&&data?.record)this.evidence={ref:data.record.ref,hash:data.record.hash};
  if(pending==='decide_event'&&data?.decision?.ticketId)this.ticketId=data.decision.ticketId;
  if(pending==='run_compute'){assert.equal(data?.code,'compute_unavailable');assert.equal(data?.dispatched,false);this.computeChecked=true;}
  if(pending==='read_notification'&&data?.id)this.readNotices.add(`${data.id}:${data.revision}`);
  if(pending==='revoked-read'){assert.equal(last.isError,true);assert.equal(data?.summary,undefined);this.revokedReadDenied=true;}
 }
 choose(options){const users=options.messages.filter(m=>m.role==='user'),last=options.messages.at(-1),data=last?.role==='tool'?value(last):undefined,latest=text(users.at(-1));
  if(users.some(m=>text(m).includes('SENTISCOPE_WORKER')))return;
  this.mainSession=options.sessionId;this.ingest(options,last,data);
  if(this.phase==='setup'||this.phase==='park')return;
  if(this.phase==='revoked'){if(!this.revokedReadDenied)return ['read_notification',{id:this.state.matter.id,revision:this.state.matter.revision},'revoked-read'];return;}
  const detail=this.state.detail(),feed=detail.notificationFeed;
  if(this.phase==='important'&&!this.sourceContextVerified)return ['research_context',{}];
  if(this.phase==='empty'){
   if(this.work?.brief?.due&&feed?.checkState?.windowKey!==this.work.brief.key)return ['publish_brief',{requestId:`empty-${this.work.brief.key}`,windowKey:this.work.brief.key,summary:'No material change; retain a check without a workbench alert.'}];
   if(last?.role!=='tool')return ['research_context',{}];return;
  }
  let candidate=data?.candidates?.find(c=>c.triggers?.length);if(!candidate&&latest.startsWith('SENTISCOPE_ASSESS\n'))try{candidate=JSON.parse(latest.split('\n')[1]);}catch{}
  if(candidate?.evalId&&!this.state.decidedEvals.has(candidate.evalId)){
   this.state.decidedEvals.add(candidate.evalId);return ['decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:this.ticketId?'ignore':'accept',reason:'The existing synthetic matter keeps research identity; no operating permission is implied',...(this.ticketId?{}:{title:'Synthetic notification research',scope:'Only the exact authorized synthetic fixture'})}];
  }
  if(!this.ticketId){if(last?.role!=='tool')return ['research_context',{}];return;}
  if(!this.computeChecked)return ['run_compute',{command:[process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(this.state.computeMarker)},'UNEXPECTED')`],timeoutMs:100,inputRefs:[]}];
  const revisions=detail.artifactRevisions??[],version=this.phase==='prepare'?1:2;
  let artifact=revisions.find(a=>a.kind==='plan'&&a.version===version&&a.qualification==='current');
  if(!artifact){const source=detail.sourceReferences?.find(s=>s.hash===(version===1?this.state.originalHash:this.state.updatedHash));if(!source)return ['list_sources',{}];if(this.evidence?.hash!==source.hash)return ['read_source',{ref:source.ref,hash:source.hash}];return ['publish_artifact',{...(version===1?{}:{artifactId:this.state.artifact.artifactId}),expectedVersion:version-1,requestId:`plan-v${version}`,reason:'The current exact synthetic source is the bounded basis',content:this.plan(version)}];}
  this.state.artifact=artifact;
  let matter=feed?.matters?.find(m=>m.id===this.state.matter?.id&&m.revision===version)??(version===1?feed?.matters?.find(m=>m.kind==='inform'):undefined);
  if(!matter)return ['publish_notification',this.notification(artifact,version)];
  this.state.matter=matter;
  const observation=detail.followups?.find(f=>f.requestId===`observe-v${version}`);
  if(!observation)return ['arrange_followup',{requestId:`observe-v${version}`,artifact:ref(artifact),reason:'Wait for a new authorized source while business notifications remain independently due',dependencies:['An authorized synthetic source revision'],trigger:{kind:'source_event',sourceIds:['fixture']}}];
  if(this.phase==='prepare'){
   if(this.work?.brief?.due&&!feed?.briefs?.some(b=>b.windowKey===this.work.brief.key))return ['publish_brief',{requestId:`brief-${this.work.brief.key}`,windowKey:this.work.brief.key,summary:'A concise local workday brief of the current qualified synthetic matter; unknown effects remain explicit.'}];
  }else if(this.phase==='important'){
   if(!this.readNotices.has(`${matter.id}:${matter.revision}`))return ['read_notification',{id:matter.id,revision:matter.revision}];
   const delivered=feed?.notices?.some(n=>n.kind==='immediate'&&n.refs?.some(r=>r.id===matter.id&&r.revision===matter.revision));
   if(!delivered)return ['publish_important_change',{id:matter.id,revision:matter.revision,requestId:'important-v2'}];
   this.phase='window';return ['research_context',{}];
  }else if(this.phase==='window'){
   let decision=detail.decisions?.find(d=>d.qualification==='current');
   if(!decision)return ['propose_decision',this.decision(artifact)];
   this.state.decision=decision;
   let decisionMatter=feed?.matters?.find(m=>m.kind==='decision'&&m.decision?.id===decision.id);
   if(!decisionMatter)return ['publish_notification',{expectedRevision:0,requestId:'decision-matter',kind:'decision',artifact:decision.artifact,decision:{id:decision.id,revision:decision.revision},title:'A distinct scoped choice, kept separate from the ongoing finding',summary:'Operator choice is still pending; reading does not adopt the proposal.',changes:['An explicit agreed review point is approaching'],unknowns:['No adoption or execution'],mergeReason:'This separate operating choice retains its own window and scope',urgency:'brief'}];
   const due=this.work?.decisions?.find(t=>t.decision?.id===decision.id&&!detail.notificationSchedules?.some(current=>current.id===(t.id??t.taskId)&&['checked','superseded'].includes(current.status)));
   if(due)return ['review_decision_window',{taskId:due.id??due.taskId,requestId:`review-${due.id??due.taskId}`,reason:'The agreed synthetic review point arrived; independent research and the pending choice remain distinct',notify:true,matter:{id:decisionMatter.id,revision:decisionMatter.revision}}];
  }
  if(last?.role!=='tool')return ['research_context',{}];
 }
 async *stream(options){const selected=this.choose(options),entry={at:new Date().toISOString(),sessionId:options.sessionId,phase:this.phase,tool:selected?.[0]??null};this.calls.push({...entry,request:JSON.stringify(options)});writeFileSync(this.state.trace,JSON.stringify(entry)+'\n',{flag:'a',mode:0o600});
  if(selected){const[name,args,pending]=selected;this.pending.set(options.sessionId,pending??name);const block={type:'tool-call',id:ToolCallId(randomUUID()),name,arguments:JSON.stringify(args)};yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'block-end',index:0,block};yield {type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield {type:'finish',reason:{kind:'tool-calls'}};return;}
  yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'Local synthetic mechanism transport only.'}};yield {type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield {type:'finish',reason:{kind:'stop'}};
 }
}

export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Actual original Engine/Harness Agent/Session/Schedule workday brief, merged matter, important change and decision-window follow-up; local synthetic transport only',checks:[],cases:[]};
 const owner={enterpriseId:'notifications-engineering',principalId:'operator'};let host,dispose;const fixtureTasks=[];
 const source=mkdtempSync(join(tmpdir(),'sentiscope-notifications-')),sourceFile=resolve(source,'fact.txt'),original='Synthetic fact V1; no enterprise material.',updated='Synthetic fact V2; no enterprise material.';
 writeFileSync(sourceFile,original,{flag:'wx',mode:0o600});mkdirSync(resolve(config.root,'source-evidence'),{recursive:true,mode:0o700});writeFileSync(resolve(config.root,'source-evidence/fact-v1.txt'),original,{flag:'wx',mode:0o600});writeFileSync(resolve(config.root,'source-evidence/fact-v2.txt'),updated,{flag:'wx',mode:0o600});
 const state={originalHash:hash(original),updatedHash:hash(updated),planSentinel:`SYNTHETIC-PLAN-${basename(config.root)}`,noticeSentinel:`SYNTHETIC-NOTICE-${basename(config.root)}`,computeMarker:resolve(config.root,'UNEXPECTED_HOST_COMPUTE'),trace:resolve(config.root,'requests.jsonl'),decidedEvals:new Set(),detail:()=>host.coordinator.detail(result.delegationId)};
 const adapter=new Synthetic(state),grant={sourceId:'fixture',directory:source,grantRevision:1,enabled:true},prefs=preference();
 const settings={dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider,model,maxTokens},intervalSeconds:60,notificationDefaults:prefs,resourceDefaults:{budget:{limits:{modelRequests:300,outputTokens:300*maxTokens,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider,model,maxTokens}}};
 const request=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const v=await response.json();assert.ok(response.ok,JSON.stringify(v));return v;};
 const detail=()=>host.coordinator.detail(result.delegationId),feed=()=>detail().notificationFeed;
 const idle=async()=>{await wait(()=>[...new Set(adapter.calls.map(c=>c.sessionId))].every(id=>!ctx.agents.get(id)||ctx.agents.get(id).status==='idle'),'owned native sessions idle');await pause(100);};
 const fixtureWake=async(label)=>{const row=await ctx.schedule.create({title:`Synthetic ${label}`,prompt:`SENTISCOPE_CONTINUE: isolated ${label}`,timing:{kind:'after',after_seconds:1},target:{kind:'session',sessionId:SessionId(adapter.mainSession)}},SessionId(adapter.mainSession));fixtureTasks.push(row);return row;};
 const stopFixture=async(row)=>{const stopped=await ctx.schedule.edit({id:ScheduleId(row.id),action:'update',patch:{active:false}},SessionId(row.target.sessionId));assert.ok(stopped.status==='paused'||stopped.status==='ended');fixtureTasks.splice(fixtureTasks.indexOf(row),1);};
 try{
  dispose=ctx.llm.registerAdapter([provider],adapter);host=await startProductHost(ctx,settings,{localModelRoutes:[{provider,model}]});
  const created=await request('/api/delegations',{goal:'Synthetic continuous notification engineering check',boundary:'Only synthetic authorized files; no real model, operating action or compute',idempotencyKey:'create'});result.delegationId=created.delegation.id;
  adapter.phase='prepare';host.coordinator.configureSources(result.delegationId,[grant]);await host.coordinator.sync(result.delegationId);await wait(()=>feed()?.matters?.length===1&&detail().followups?.some(f=>f.requestId==='observe-v1'),'native Agent publishes one qualified matter and an event observation');await idle();
  const weeklyTask=detail().notificationSchedules.find(t=>t.kind==='brief');assert.ok(weeklyTask?.schedule?.id);const weekly=await ctx.schedule.view({id:ScheduleId(weeklyTask.schedule.id)});assert.equal(weekly.kind,'weekly');assert.equal(weekly.timeZone,'UTC');assert.deepEqual(weekly.weekdays,prefs.weekdays);result.cases.push({name:'explicit-real-clock-calendar',preferences:prefs,schedule:weekly,calendarScope:'Custom actual-day engineering preference; default Monday-Friday filtering is covered separately by product tests.'});
  const beforeQuiet=adapter.calls.length,quiet=await fixtureWake('unchanged-source quiet check');await wait(async()=>Boolean((await ctx.schedule.view({id:ScheduleId(quiet.id)})).lastDelivery),'quiet native delivery');await idle();assert.equal(adapter.calls.length,beforeQuiet,'Waiting for source changes must suppress an unneeded scheduled-only model step before the brief is due');await stopFixture(quiet);
  await wait(()=>feed()?.briefs?.some(n=>n.kind==='brief'),'natural weekly wake publishes a workday brief');await idle();const deliveredWeekly=await ctx.schedule.view({id:ScheduleId(weeklyTask.schedule.id)});assert.ok(deliveredWeekly.lastDelivery,'The weekly task must actually deliver, not merely exist in metadata');assert.equal(feed().briefs.length,1);assert.equal(feed().briefs[0].matters.length,1);assert.equal(feed().briefs[0].channel,'workbench');assert.deepEqual(feed().briefs[0].receiver,owner);assert.equal(detail().hostResources.compute.status,'unavailable');assert.equal(adapter.computeChecked,true);assert.equal(existsSync(state.computeMarker),false);
  result.checks.push('A real native weekly task using explicit current-day UTC preferences naturally delivers; due brief work bypasses the event-observation quiet gate, while the preceding unchanged-source scheduled check consumes zero model requests');result.cases.push({name:'native-weekly-brief',task:weeklyTask,schedule:deliveredWeekly,brief:feed().briefs[0]});
  adapter.phase='important';writeFileSync(sourceFile,updated,{mode:0o600});const sourceWake=await fixtureWake('authorized source refresh');await wait(()=>feed()?.matters?.some(m=>m.id===state.matter?.id&&m.revision===2)&&feed()?.notices?.some(n=>n.kind==='immediate'),'new exact source revises one ongoing matter and publishes an important change');await idle();await stopFixture(sourceWake);
  assert.equal(feed().matters.filter(m=>m.kind==='inform').length,1);assert.equal(feed().matters.find(m=>m.kind==='inform').revision,2);assert.equal(feed().notices.filter(n=>n.kind==='immediate').length,1);assert.ok(feed().notices.find(n=>n.kind==='immediate').matters[0].changes[0].includes('same question'));result.checks.push('Automatic source intake requalifies the proposal and appends revision two of the same Agent-selected matter; one current merged card and one important-change notice retain the explicit change and reason');
  assert.equal(adapter.phase,'window','The scripted main Agent autonomously continues from the important finding to its distinct operating choice');
  await wait(()=>feed()?.notices?.some(n=>n.kind==='reminder'),'actual native agreed decision-window reminder');await idle();const reminder=feed().notices.find(n=>n.kind==='reminder'),decision=detail().decisions.find(d=>d.id===reminder.reminder.decision.id),windowTask=detail().notificationSchedules.find(t=>t.kind==='decision'&&t.decision.id===decision.id&&t.point==='remindAt');assert.equal(decision.status,'pending');assert.equal(detail().operatorChoices.length,0);assert.equal(reminder.reminder.at,decision.window.remindAt);assert.ok(windowTask?.schedule?.id);const windowNative=await ctx.schedule.view({id:ScheduleId(windowTask.schedule.id)});assert.equal(windowNative.kind,'at');assert.ok(windowNative.lastDelivery);assert.equal(windowNative.scheduledAt,decision.window.remindAt);
  result.checks.push('The Agent keeps a distinct scoped decision; its actual native at task reaches the agreed window and produces one station reminder, while receipt/reminder is not adoption or execution');result.cases.push({name:'decision-window',decision:{id:decision.id,revision:decision.revision},task:windowTask,schedule:windowNative,reminder});
  const noNagCalls=adapter.calls.length,noNagCount=feed().notices.length,quietAfter=await fixtureWake('no fixed reminder nag');await wait(async()=>Boolean((await ctx.schedule.view({id:ScheduleId(quietAfter.id)})).lastDelivery),'post-review quiet native delivery');await idle();assert.equal(adapter.calls.length,noNagCalls);assert.equal(feed().notices.length,noNagCount);assert.equal(detail().operatorChoices.length,0);await stopFixture(quietAfter);result.checks.push('Once the agreed window is explicitly checked, another unchanged-source native wake produces no extra model request or repeated station reminder; silence remains pending');
  adapter.phase='park';const savedNotices=feed().notices.map(n=>n.id),savedBriefs=feed().briefs.map(n=>n.id);await host.close();host=undefined;host=await startProductHost(ctx,{...settings,grants:{[result.delegationId]:[grant]}},{localModelRoutes:[{provider,model}]});await idle();assert.deepEqual(feed().notices.map(n=>n.id),savedNotices);assert.deepEqual(feed().briefs.map(n=>n.id),savedBriefs);result.checks.push('Graceful Host reopen retains notification/brief identities and completed window facts without duplicating delivery; this is not a new OS-crash recovery claim');
  const revokedStart=adapter.calls.length;adapter.phase='revoked';host.coordinator.configureSources(result.delegationId,[]);await host.coordinator.sync(result.delegationId);await wait(()=>adapter.revokedReadDenied,'old notification body rejected under revoked qualification');await idle();assert.equal(feed().matters.length,0);assert.equal(JSON.stringify(feed()).includes(state.noticeSentinel),false);assert.ok(adapter.calls.slice(revokedStart).every(c=>!c.request.includes(state.noticeSentinel)&&!c.request.includes(state.planSentinel)));result.checks.push('Source withdrawal withholds old matter and cached brief/notice bodies from current feed and fresh native model requests; exact old-body read is rejected');
  adapter.phase='park';let d=await request(`/api/delegations/${result.delegationId}`);await request(`/api/delegations/${result.delegationId}/commands`,{kind:'end',expectedVersion:d.delegation.version,idempotencyKey:'end'});await wait(async()=>(await request(`/api/delegations/${result.delegationId}`)).delegation.lifecycle==='ended','main end receipt');result.mainFinal=await request(`/api/delegations/${result.delegationId}`);await host.close();host=undefined;
  adapter.phase='setup';adapter.work=undefined;adapter.ticketId=undefined;state.decidedEvals.clear();const emptyPrefs=preference(4000);host=await startProductHost(ctx,{...settings,dataDirectory:resolve(config.root,'empty-data'),notificationDefaults:emptyPrefs},{localModelRoutes:[{provider,model}]});const empty=await request('/api/delegations',{goal:'Synthetic no-material-change brief check',boundary:'No source or enterprise material; no operating action',idempotencyKey:'empty-create'});result.delegationId=empty.delegation.id;adapter.phase='empty';
  await wait(()=>feed()?.checkState?.status==='no_change','natural weekly empty brief records only a check');await idle();assert.equal(feed().briefs.length,0);assert.equal(feed().notices.length,0);const emptyTask=detail().notificationSchedules.find(t=>t.kind==='brief'),emptyNative=await ctx.schedule.view({id:ScheduleId(emptyTask.schedule.id)});assert.ok(emptyNative.lastDelivery,'The empty daily check must follow an actual weekly delivery');result.checks.push('An actual weekly no-change check saves a no_change record and emits no empty brief or station notice');result.cases.push({name:'empty-weekly-check',task:emptyTask,schedule:emptyNative,check:feed().checkState});
  assert.equal(existsSync(state.computeMarker),false);result.emptyFinal=await request(`/api/delegations/${result.delegationId}`);result.requestCount=adapter.calls.length;result.requests=adapter.calls.map(({request,...entry})=>entry);result.status='PASS';
 }catch(error){result.error={name:error.name,code:error.code,message:error.message,stack:error.stack};if(host)try{result.debug=detail();}catch{}}
 finally{for(const row of [...fixtureTasks])try{await stopFixture(row);}catch(error){result.status='FAIL';result.fixtureCleanupError={name:error.name,message:error.message};}if(host)try{await host.close();}catch(error){result.status='FAIL';result.cleanupError={name:error.name,message:error.message};}if(dispose)dispose();rmSync(source,{recursive:true,force:true});}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
}
